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
}

export class ScriptOptimizer extends EventEmitter {
  private client: LLMClient

  constructor(config: LLMConfig) {
    super()
    this.client = new LLMClient(config)
  }

  /** Layer 1: 故事解析 */
  async generateOutline(userInput: string): Promise<StoryOutline> {
    this.emit('progress', { layer: 1, status: 'start' } as OptimizerProgress)

    const messages = buildLayer1Messages(userInput)
    const response = await this.client.chat(messages, { temperature: 0.8, maxTokens: 4000 })

    let outline: StoryOutline
    try {
      // 尝试清理 markdown 代码块包裹
      const cleaned = response.content
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim()
      outline = JSON.parse(cleaned)
    } catch {
      throw new Error('Layer 1: LLM 返回的 JSON 解析失败。原始内容: ' + response.content.slice(0, 500))
    }

    // 给角色生成唯一 ID（如果没有）
    outline.characters = outline.characters.map((c, i) => ({
      ...c,
      id: c.id || `char_${i + 1}`
    }))

    this.emit('progress', { layer: 1, status: 'done' } as OptimizerProgress)
    return outline
  }

  /** Layer 2: 章节拆解 */
  async generateChapters(outline: StoryOutline): Promise<Chapter[]> {
    this.emit('progress', { layer: 2, status: 'start' } as OptimizerProgress)

    const messages = buildLayer2Messages(outline)
    const response = await this.client.chat(messages, { temperature: 0.7, maxTokens: 8000 })

    let chapters: Chapter[]
    try {
      const cleaned = response.content
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim()
      chapters = JSON.parse(cleaned)
    } catch {
      throw new Error('Layer 2: LLM 返回的 JSON 解析失败。原始内容: ' + response.content.slice(0, 500))
    }

    // 确保 shot 有 status 和 assets
    for (const chapter of chapters) {
      for (const shot of chapter.shots) {
        shot.status = shot.status || 'pending'
        shot.assets = shot.assets || {}
      }
    }

    this.emit('progress', { layer: 2, status: 'done' } as OptimizerProgress)
    return chapters
  }

  /** Layer 3: 分镜细化（镜头语言 + 台词润色） */
  async refineShots(chapters: Chapter[]): Promise<Chapter[]> {
    this.emit('progress', { layer: 3, status: 'start' } as OptimizerProgress)

    const messages = buildLayer3Messages(chapters)
    const response = await this.client.chat(messages, { temperature: 0.7, maxTokens: 12000 })

    let refined: Chapter[]
    try {
      const cleaned = response.content
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim()
      refined = JSON.parse(cleaned)
    } catch {
      throw new Error('Layer 3: LLM 返回的 JSON 解析失败。原始内容: ' + response.content.slice(0, 500))
    }

    // 合并状态
    for (let i = 0; i < refined.length; i++) {
      for (let j = 0; j < refined[i].shots.length; j++) {
        const orig = chapters[i]?.shots[j]
        if (orig) {
          refined[i].shots[j].status = orig.status
          refined[i].shots[j].assets = orig.assets
        }
      }
    }

    this.emit('progress', { layer: 3, status: 'done' } as OptimizerProgress)
    return refined
  }

  /** Layer 4: SD Prompt 组装（纯规则引擎，无需 LLM） */
  buildPrompts(chapters: Chapter[], characters: CharacterProfile[], style: string = 'anime'): Chapter[] {
    this.emit('progress', { layer: 4, status: 'start' } as OptimizerProgress)

    const result = chapters.map(chapter => ({
      ...chapter,
      shots: PromptBuilder.buildAll(chapter.shots, characters, style)
    }))

    this.emit('progress', { layer: 4, status: 'done' } as OptimizerProgress)
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
