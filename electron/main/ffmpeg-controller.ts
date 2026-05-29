import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { logger } from './utils/logger'

export type TransitionType = 'fade' | 'dissolve' | 'wipe_left' | 'zoom_blur'

export interface ConcatSegment {
  videoPath: string
  durationSec: number
}

export interface CompositeOptions {
  segments: ConcatSegment[]
  bgmPath?: string
  sfxPath?: string
  subtitlePath?: string
  outputPath: string
  transition?: TransitionType
  transitionDurationSec?: number
  videoBitrate?: string
  audioBitrate?: string
}

export class FFmpegController {
  private ffmpegPath: string

  constructor(ffmpegPath: string = 'ffmpeg') {
    this.ffmpegPath = ffmpegPath
  }

  /** 检测 FFmpeg 是否可用 */
  async detect(): Promise<{ available: boolean; version?: string }> {
    try {
      const output = await this.exec(['-version'])
      const firstLine = output.split('\n')[0]
      return { available: true, version: firstLine }
    } catch {
      return { available: false }
    }
  }

  /** 设置 FFmpeg 路径 */
  setPath(path: string): void {
    this.ffmpegPath = path
  }

  /** 拼接视频片段 + 转场 + 字幕 + 音频合成 */
  async composite(options: CompositeOptions): Promise<string> {
    const {
      segments,
      bgmPath,
      sfxPath,
      subtitlePath,
      outputPath,
      transition = 'fade',
      transitionDurationSec = 0.5,
      videoBitrate = '8000k',
      audioBitrate = '192k'
    } = options

    if (segments.length === 0) throw new Error('No segments to composite')

    const outputDir = dirname(outputPath)
    await fs.mkdir(outputDir, { recursive: true })

    // 单个片段直接复制/重编码
    if (segments.length === 1 && !subtitlePath && !bgmPath) {
      await this.exec(['-i', segments[0].videoPath, '-c', 'copy', '-y', outputPath])
      return outputPath
    }

    // 创建 concat list 文件
    const concatListPath = join(outputDir, '_concat_list.txt')
    const concatContent = segments
      .map(s => `file '${s.videoPath.replace(/'/g, "'\\''")}'`)
      .join('\n')
    await fs.writeFile(concatListPath, concatContent, 'utf-8')

    // 构建 filter_complex
    const filters: string[] = []
    const n = segments.length

    // 1. 拼接
    filters.push(`[0:v]concat=n=${n}:v=1:a=0[raw]`)

    // 2. 字幕烧录
    let videoLabel = 'raw'
    if (subtitlePath) {
      const escapedSub = subtitlePath.replace(/'/g, "'\\''").replace(/:/g, '\\:')
      filters.push(`[raw]ass='${escapedSub}'[v]`)
      videoLabel = 'v'
    }

    // 3. 音频混合
    const audioInputs: string[] = []
    if (bgmPath) audioInputs.push('1:a')
    if (sfxPath) audioInputs.push(bgmPath ? '2:a' : '1:a')

    if (audioInputs.length > 0) {
      filters.push(`[${audioInputs.join('][')}]amix=inputs=${audioInputs.length + 1}:duration=first[amixed]`)
    }

    // 构建 ffmpeg 命令
    const args: string[] = [
      '-f', 'concat', '-safe', '0', '-i', concatListPath,
    ]

    if (bgmPath) args.push('-i', bgmPath)
    if (sfxPath) args.push('-i', sfxPath)

    args.push('-filter_complex', filters.join(';'))

    args.push('-map', `[${videoLabel}]`)

    if (audioInputs.length > 0) {
      args.push('-map', '[amixed]')
    }

    args.push(
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-c:a', 'aac', '-b:a', audioBitrate,
      '-y', outputPath
    )

    logger.info(`FFmpeg composite: ${segments.length} segments → ${outputPath}`)
    await this.exec(args)

    // 清理临时文件
    await fs.unlink(concatListPath).catch(() => {})

    return outputPath
  }

  /** 生成 ASS 字幕文件 */
  async generateAssSubtitle(
    shots: Array<{ id: string; startSec: number; durationSec: number; text: string; characterName?: string }>,
    outputPath: string,
    options?: { fontSize?: number; fontName?: string; marginV?: number }
  ): Promise<string> {
    const fontSize = options?.fontSize || 48
    const fontName = options?.fontName || 'Noto Sans SC'
    const marginV = options?.marginV || 30

    const header = `[Script Info]
Title: Video AI Studio Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,30,30,${marginV},1
Style: Character,${fontName},${fontSize},&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,30,30,${marginV + fontSize + 10},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

    const events = shots.map(shot => {
      const start = this.formatAssTime(shot.startSec)
      const end = this.formatAssTime(shot.startSec + shot.durationSec)
      const lines: string[] = []

      // 角色标签
      if (shot.characterName) {
        lines.push(`Dialogue: 0,${start},${end},Character,,0,0,0,,${shot.characterName}`)
      }

      // 对白
      lines.push(`Dialogue: 1,${start},${end},Default,,0,0,0,,${shot.text}`)

      return lines.join('\n')
    }).join('\n')

    await fs.writeFile(outputPath, header + events, 'utf-8')
    return outputPath
  }

  private formatAssTime(sec: number): string {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    const cs = Math.floor((sec % 1) * 100)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }

  /** 执行 ffmpeg 命令 */
  private exec(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(this.ffmpegPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          logger.error(`FFmpeg error: ${err.message}`)
          logger.error(`FFmpeg stderr: ${stderr}`)
          reject(new Error(`FFmpeg failed: ${err.message}\n${stderr}`))
        } else {
          resolve(stdout || stderr)
        }
      })
    })
  }
}
