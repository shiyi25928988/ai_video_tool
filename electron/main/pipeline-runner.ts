import { EventEmitter } from 'events'
import { ProjectManager } from './project-manager'
import { ScriptOptimizer } from './script-optimizer/optimizer'
import { PythonSpawner } from './python-spawner'
import { Semaphore } from './utils/semaphore'
import { logger } from './utils/logger'
import type { Project, ShotScript, Chapter, LLMConfig, PipelinePhase, PipelineState } from './script-optimizer/types'

export interface PipelineEvents {
  'phase:change': (phase: PipelinePhase) => void
  'shot:start': (shotId: string) => void
  'shot:done': (shotId: string) => void
  'shot:error': (shotId: string, error: string) => void
  'shot:progress': (completed: number, total: number) => void
  'provider:fallback': (info: { from: string; to?: string; error: string }) => void
  'error': (error: Error) => void
  'done': () => void
}

export class PipelineRunner extends EventEmitter {
  private paused = false
  private abortController: AbortController | null = null
  private concurrency: number

  constructor(
    private projectManager: ProjectManager,
    private sidecar: PythonSpawner,
    private llmConfig: LLMConfig,
    concurrency: number = 2
  ) {
    super()
    this.concurrency = concurrency
  }

  /** 运行完整 Pipeline */
  async run(): Promise<void> {
    const project = this.projectManager.getProject()
    if (!project) throw new Error('No project loaded')

    this.abortController = new AbortController()
    logger.setLogFile(`${this.projectManager.getProjectPath()}/logs/pipeline.log`)

    try {
      // Phase 1: 剧本生成
      if (this.needsScriptGeneration(project)) {
        await this.generateScript()
      }

      // Phase 2: 角色生成
      await this.generateCharacters()

      // Phase 3: 分镜渲染
      await this.renderAllShots()

      // Phase 4: 组装导出
      await this.composite()

      this.emit('done')
    } catch (err) {
      const error = err as Error
      logger.error('Pipeline error:', error.message)
      await this.projectManager.updatePipelineState({ phase: 'error', error: error.message })
      this.emit('error', error)
    }
  }

  /** 暂停 */
  pause(): void {
    this.paused = true
    logger.info('Pipeline paused')
  }

  /** 继续 */
  resume(): void {
    this.paused = false
    logger.info('Pipeline resumed')
  }

  /** 取消 */
  cancel(): void {
    this.abortController?.abort()
    this.paused = false
    logger.info('Pipeline cancelled')
  }

  /** 检查是否需要生成剧本 */
  private needsScriptGeneration(project: Project): boolean {
    return !project.outline || !project.script || project.script.chapters.length === 0
  }

  // ── Phase 1: 剧本生成 ──────────────────────────────────────

  private async generateScript(): Promise<void> {
    const project = this.projectManager.getProject()!
    await this.setPhase('script')

    const optimizer = new ScriptOptimizer(this.llmConfig)

    // 转发进度事件
    optimizer.on('progress', (p) => {
      logger.info(`Script L${p.layer}: ${p.status}`)
    })

    const { outline, chapters } = await optimizer.generateFullScript(
      project.title, // 使用项目标题作为创意输入
      project.style
    )

    // 提取角色信息
    const characters = outline.characters.map(c => ({
      id: c.id,
      name: c.name,
      appearanceDetail: c.appearanceDetail,
      referenceImage: '',
      embeddingPath: undefined
    }))

    // 统计分镜数
    const totalShots = chapters.reduce((sum, ch) => sum + ch.shots.length, 0)

    await this.projectManager.updateProject({
      outline,
      characters,
      script: { chapters }
    })

    await this.projectManager.updatePipelineState({
      phase: 'characters',
      totalShots,
      completedShots: 0,
      failedShots: 0
    })

    logger.info(`Script generated: ${chapters.length} chapters, ${totalShots} shots`)
  }

  // ── Phase 2: 角色生成 ──────────────────────────────────────

  private async generateCharacters(): Promise<void> {
    const project = this.projectManager.getProject()!
    if (!project.characters.length) return

    await this.setPhase('characters')

    for (const char of project.characters) {
      await this.checkPausedOrAborted()

      const charDir = await this.projectManager.ensureCharacterDir(char.id)

      if (this.sidecar.isReady) {
        try {
          const result = await this.sidecar.call('/generate_image', {
            prompt: `portrait of ${char.name}, ${char.appearanceDetail.hair}, ${char.appearanceDetail.eyes}, ${char.appearanceDetail.clothing}`,
            output_dir: charDir
          })
          char.referenceImage = result.path as string
          logger.info(`Character ${char.name} reference image generated`)
        } catch (err) {
          logger.warn(`Character ${char.name} image generation failed: ${(err as Error).message}`)
        }
      }
    }

    await this.projectManager.updateProject({ characters: project.characters })
  }

  // ── Phase 3: 分镜渲染 ──────────────────────────────────────

  private async renderAllShots(): Promise<void> {
    const project = this.projectManager.getProject()!
    if (!project.script) return

    await this.setPhase('rendering')

    for (const chapter of project.script.chapters) {
      const pendingShots = chapter.shots.filter(s => s.status !== 'done')
      if (pendingShots.length === 0) continue

      await this.processBatch(pendingShots)
    }
  }

  private async processBatch(shots: ShotScript[]): Promise<void> {
    const semaphore = new Semaphore(this.concurrency)

    await Promise.all(shots.map(shot =>
      semaphore.run(async () => {
        await this.checkPausedOrAborted()

        shot.status = 'rendering'
        await this.projectManager.saveProject()
        this.emit('shot:start', shot.id)

        try {
          await this.renderShot(shot)
          shot.status = 'done'
        } catch (err) {
          shot.status = 'failed'
          shot.error = (err as Error).message
          this.emit('shot:error', shot.id, shot.error)
        }

        await this.projectManager.saveProject()

        if (shot.status === 'done') {
          this.emit('shot:done', shot.id)
        }

        const project = this.projectManager.getProject()!
        const total = project.pipelineState.totalShots
        const completed = this.countCompleted(project)
        const failed = this.countFailed(project)
        await this.projectManager.updatePipelineState({ completedShots: completed, failedShots: failed })
        this.emit('shot:progress', completed, total)
      })
    ))
  }

  /** 渲染单个分镜 */
  private async renderShot(shot: ShotScript): Promise<void> {
    const shotDir = await this.projectManager.ensureShotDir(shot.id)

    if (!this.sidecar.isReady) {
      logger.warn(`[${shot.id}] Sidecar not ready, skipping`)
      throw new Error('Sidecar 未启动')
    }

    logger.info(`[${shot.id}] 开始渲染 shotType=${shot.shotType}, duration=${shot.durationSec}s`)

    // 生成图片
    if (shot.imagePrompt) {
      logger.info(`[${shot.id}] 调用 /generate_image prompt=${shot.imagePrompt.positive.slice(0, 80)}...`)
      const imgResult = await this.sidecar.call('/generate_image', {
        prompt: shot.imagePrompt.positive,
        negative_prompt: shot.imagePrompt.negative,
        embedding_id: shot.charactersInScene[0]?.characterId,
        output_dir: shotDir
      })
      shot.assets.image = imgResult.path as string
      logger.info(`[${shot.id}] 图片生成完成: ${shot.assets.image}`)
    }

    // 根据镜头类型处理
    switch (shot.shotType) {
      case 'dialogue': {
        if (shot.dialogue.length > 0) {
          const text = shot.dialogue.map(d => d.text).join(' ')
          logger.info(`[${shot.id}] 调用 /generate_tts text=${text.slice(0, 50)}...`)
          const ttsResult = await this.sidecar.call('/generate_tts', {
            text,
            character_id: shot.dialogue[0].characterId,
            tone: shot.dialogue[0].tone,
            output_dir: shotDir
          })
          shot.assets.audio = ttsResult.path as string
          logger.info(`[${shot.id}] TTS 完成: ${shot.assets.audio}`)

          if (shot.assets.image) {
            logger.info(`[${shot.id}] 调用 /musetalk`)
            const lipResult = await this.sidecar.call('/musetalk', {
              image_path: shot.assets.image,
              audio_path: shot.assets.audio,
              output_dir: shotDir
            })
            shot.assets.video = lipResult.path as string
            logger.info(`[${shot.id}] 口型同步完成: ${shot.assets.video}`)
          }
        }
        break
      }

      case 'transition':
      case 'establishing': {
        if (shot.assets.image) {
          logger.info(`[${shot.id}] 调用 /depth_animate movement=${shot.camera?.movement}`)
          const depthResult = await this.sidecar.call('/depth_animate', {
            image_path: shot.assets.image,
            duration_sec: shot.durationSec,
            movement: shot.camera?.movement,
            output_dir: shotDir
          })
          shot.assets.video = depthResult.path as string
          logger.info(`[${shot.id}] 深度动画完成: ${shot.assets.video}`)
        }
        break
      }

      case 'action': {
        logger.info(`[${shot.id}] 调用 /generate_video prompt=${shot.sceneDescription.slice(0, 80)}...`)
        const videoResult = await this.sidecar.call('/generate_video', {
          prompt: shot.sceneDescription,
          duration: Math.min(shot.durationSec, 15),
          output_dir: shotDir,
          filename: shot.id,
        })
        shot.assets.video = videoResult.path as string
        logger.info(`[${shot.id}] 视频生成完成: ${shot.assets.video}`)
        break
      }

      case 'narration':
      case 'reaction':
      default:
        logger.info(`[${shot.id}] 静态镜头，无需额外处理`)
        break
    }

    logger.info(`[${shot.id}] 渲染完成 assets=${JSON.stringify(shot.assets)}`)
  }

  // ── Phase 4: 组装导出 ──────────────────────────────────────

  private async composite(): Promise<void> {
    await this.setPhase('compositing')
    logger.info('Composite phase — FFmpeg assembly (placeholder)')
    // FFmpeg 组装在 Step 7 实现
    await this.setPhase('done')
  }

  // ── Helpers ────────────────────────────────────────────────

  private async setPhase(phase: PipelinePhase): Promise<void> {
    await this.projectManager.updatePipelineState({ phase })
    this.emit('phase:change', phase)
  }

  private countCompleted(project: Project): number {
    if (!project.script) return 0
    return project.script.chapters.reduce(
      (sum, ch) => sum + ch.shots.filter(s => s.status === 'done').length, 0
    )
  }

  private countFailed(project: Project): number {
    if (!project.script) return 0
    return project.script.chapters.reduce(
      (sum, ch) => sum + ch.shots.filter(s => s.status === 'failed').length, 0
    )
  }

  private async checkPausedOrAborted(): Promise<void> {
    // 暂停等待
    while (this.paused) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    // 取消检查
    if (this.abortController?.signal.aborted) {
      throw new Error('Pipeline cancelled')
    }
  }
}
