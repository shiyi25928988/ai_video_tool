import { EventEmitter } from 'events'
import { LLMClient, type LLMMessage } from './llm-client'
import { buildLayer1Messages, buildLayer2Messages, buildLayer3Messages } from './prompts'
import { PromptBuilder } from './prompt-builder'
import type {
  LLMConfig,
  StoryOutline,
  Chapter,
  ShotScript,
  CharacterProfile
} from './types'

export interface OptimizerProgress {
  layer: 1 | 2 | 3 | 4
  status: 'start' | 'done' | 'error'
  message?: string
  data?: Record<string, unknown>
}

/** 尝试修复被截断的 JSON */
function repairTruncatedJSON(raw: string): unknown | null {
  try { return JSON.parse(raw) } catch {}

  let repaired = raw

  // 策略1: 找到最后一个完整的 }, 或 },（对象结束）
  for (let i = repaired.length - 1; i >= 0; i--) {
    if (repaired[i] === '}' || repaired[i] === ']') {
      // 从这个位置截断，保留到此为止的完整内容
      repaired = repaired.slice(0, i + 1)
      break
    }
  }

  // 补全未闭合的括号
  const stack: string[] = []
  for (const ch of repaired) {
    if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop() }
    else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop() }
  }
  // 按逆序补全
  while (stack.length > 0) {
    const open = stack.pop()!
    repaired += open === '{' ? '}' : ']'
  }

  try { return JSON.parse(repaired) } catch {}
  return null
}

/** 通用的 LLM JSON 调用 + 截断修复 + 续写 */
async function callLLMForJSON(
  client: LLMClient,
  messages: LLMMessage[],
  opts: { temperature: number; maxTokens: number },
  emitProgress: (msg: string) => void
): Promise<unknown> {
  const response = await client.chat(messages, opts)
  const cleaned = response.content
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim()

  // 直接解析
  try { return JSON.parse(cleaned) } catch {}

  // 尝试修复截断
  const repaired = repairTruncatedJSON(cleaned)
  if (repaired) return repaired

  // 修复失败 → 尝试续写（让 LLM 从断点继续）
  emitProgress('输出被截断，正在续写...')
  const continueMessages: LLMMessage[] = [
    ...messages,
    { role: 'assistant', content: response.content },
    { role: 'user', content: '你的上一条回复被截断了。请从断点处继续，输出剩余的 JSON 内容。不要重复已经输出的部分，直接从断点继续。只输出 JSON，不要其他文字。' }
  ]
  const continuation = await client.chat(continueMessages, opts)
  const contCleaned = continuation.content
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim()

  // 拼接两次输出
  const combined = cleaned + contCleaned
  try { return JSON.parse(combined) } catch {}
  return repairTruncatedJSON(combined)
}

export class ScriptOptimizer extends EventEmitter {
  private client: LLMClient

  constructor(config: LLMConfig) {
    super()
    this.client = new LLMClient(config)
  }

  /** Layer 1: 故事解析 */
  async generateOutline(userInput: string): Promise<StoryOutline> {
    this.emit('progress', { layer: 1, status: 'start', message: '正在分析故事创意，生成大纲...' } as OptimizerProgress)

    const messages = buildLayer1Messages(userInput)
    let outline: StoryOutline
    try {
      const parsed = await callLLMForJSON(
        this.client, messages,
        { temperature: 0.8, maxTokens: 8192 },
        (msg) => this.emit('progress', { layer: 1, status: 'start', message: msg } as OptimizerProgress)
      )
      outline = parsed as StoryOutline
    } catch {
      this.emit('progress', { layer: 1, status: 'error', message: '大纲 JSON 解析失败' } as OptimizerProgress)
      throw new Error('Layer 1: LLM 返回的 JSON 解析失败')
    }

    outline.characters = outline.characters.map((c, i) => ({
      ...c,
      id: c.id || `char_${i + 1}`
    }))

    this.emit('progress', {
      layer: 1, status: 'done',
      message: `大纲生成完成 — ${outline.characters.length} 个角色`,
      data: {
        logline: outline.logline,
        characterCount: outline.characters.length,
        characterNames: outline.characters.map(c => c.name),
      }
    } as OptimizerProgress)
    return outline
  }

  /** Layer 2: 章节拆解 */
  async generateChapters(outline: StoryOutline): Promise<Chapter[]> {
    this.emit('progress', { layer: 2, status: 'start', message: '正在拆解章节和分镜...' } as OptimizerProgress)

    const messages = buildLayer2Messages(outline)
    let chapters: Chapter[]
    try {
      const parsed = await callLLMForJSON(
        this.client, messages,
        { temperature: 0.7, maxTokens: 8192 },
        (msg) => this.emit('progress', { layer: 2, status: 'start', message: msg } as OptimizerProgress)
      )
      chapters = parsed as Chapter[]
    } catch {
      this.emit('progress', { layer: 2, status: 'error', message: '章节 JSON 解析失败' } as OptimizerProgress)
      throw new Error('Layer 2: LLM 返回的 JSON 解析失败')
    }

    for (const chapter of chapters) {
      for (const shot of chapter.shots) {
        shot.status = shot.status || 'pending'
        shot.assets = shot.assets || {}
      }
    }

    const totalShots = chapters.reduce((sum, ch) => sum + ch.shots.length, 0)
    this.emit('progress', {
      layer: 2, status: 'done',
      message: `章节拆解完成 — ${chapters.length} 章，共 ${totalShots} 个分镜`,
      data: {
        chapterCount: chapters.length,
        totalShots,
        chapterTitles: chapters.map(ch => ch.title),
      }
    } as OptimizerProgress)
    return chapters
  }

  /** Layer 3: 分镜细化（镜头语言 + 台词润色） */
  async refineShots(chapters: Chapter[]): Promise<Chapter[]> {
    this.emit('progress', { layer: 3, status: 'start', message: '正在细化镜头语言和台词...' } as OptimizerProgress)

    const messages = buildLayer3Messages(chapters)
    let refined: Chapter[]
    try {
      const parsed = await callLLMForJSON(
        this.client, messages,
        { temperature: 0.7, maxTokens: 8192 },
        (msg) => this.emit('progress', { layer: 3, status: 'start', message: msg } as OptimizerProgress)
      )
      refined = parsed as Chapter[]
    } catch {
      this.emit('progress', { layer: 3, status: 'error', message: '分镜细化 JSON 解析失败' } as OptimizerProgress)
      throw new Error('Layer 3: LLM 返回的 JSON 解析失败')
    }

    for (let i = 0; i < refined.length; i++) {
      for (let j = 0; j < refined[i].shots.length; j++) {
        const orig = chapters[i]?.shots[j]
        if (orig) {
          refined[i].shots[j].status = orig.status
          refined[i].shots[j].assets = orig.assets
        }
      }
    }

    this.emit('progress', {
      layer: 3, status: 'done',
      message: '分镜细化完成 — 镜头语言和台词已润色',
    } as OptimizerProgress)
    return refined
  }

  /** Layer 4: SD Prompt 组装（纯规则引擎，无需 LLM） */
  buildPrompts(chapters: Chapter[], characters: CharacterProfile[], style: string = 'anime'): Chapter[] {
    this.emit('progress', { layer: 4, status: 'start', message: '正在组装图像生成提示词...' } as OptimizerProgress)

    const result = chapters.map(chapter => ({
      ...chapter,
      shots: PromptBuilder.buildAll(chapter.shots, characters, style)
    }))

    const totalShots = result.reduce((sum, ch) => sum + ch.shots.length, 0)
    this.emit('progress', {
      layer: 4, status: 'done',
      message: `剧本生成全部完成！共 ${totalShots} 个分镜`,
      data: { totalShots }
    } as OptimizerProgress)
    return result
  }

  /** 完整 4 层生成流程 */
  async generateFullScript(
    userInput: string,
    style: string = 'anime'
  ): Promise<{ outline: StoryOutline; chapters: Chapter[] }> {
    // Layer 1
    const outline = await this.generateOutline(userInput)

    // Layer 2
    let chapters = await this.generateChapters(outline)

    // Layer 3
    chapters = await this.refineShots(chapters)

    // Layer 4
    chapters = this.buildPrompts(chapters, outline.characters, style)

    return { outline, chapters }
  }
}
