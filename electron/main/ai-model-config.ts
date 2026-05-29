import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { SecureStorage } from './secure-storage'

export interface AIModelConfig {
  provider: string
  apiKey: string
  baseUrl?: string
  modelName?: string
}

export type AIModelId = 'textToImage' | 'imageToVideo' | 'textToVideo' | 'tts'

/** 脱敏后的配置（列表展示用） */
export interface AIModelSummary {
  id: AIModelId
  label: string
  configured: boolean
  provider: string
  modelName: string
}

/** 所有模型配置文件结构（不含 apiKey） */
interface AIModelsFile {
  models: Record<string, Omit<AIModelConfig, 'apiKey'> & { detectedModels?: string[] }>
}

const MODEL_LABELS: Record<AIModelId, string> = {
  textToImage: '文生图',
  imageToVideo: '图生视频',
  textToVideo: '文生视频',
  tts: '语音合成 (TTS)',
}

export const AI_MODEL_IDS: AIModelId[] = ['textToImage', 'imageToVideo', 'textToVideo', 'tts']

export class AIModelConfigManager {
  private static instance: AIModelConfigManager

  private secureStorage = new SecureStorage()
  private models: Record<string, Omit<AIModelConfig, 'apiKey'> & { detectedModels?: string[] }> = {}

  static getInstance(): AIModelConfigManager {
    if (!this.instance) this.instance = new AIModelConfigManager()
    return this.instance
  }

  private get configPath(): string {
    return join(app.getPath('userData'), 'ai-models.json')
  }

  /** 启动时加载配置 */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8')
      const file = JSON.parse(data) as AIModelsFile
      this.models = file.models || {}
    } catch {
      // 文件不存在，使用空配置
      this.models = {}
    }
  }

  /** 保存非敏感字段到 JSON 文件 */
  private async saveFile(): Promise<void> {
    const file: AIModelsFile = { models: this.models }
    await fs.writeFile(this.configPath, JSON.stringify(file, null, 2), 'utf-8')
  }

  /** 保存单个模型配置 */
  async save(id: AIModelId, config: AIModelConfig): Promise<void> {
    // 非敏感字段存 JSON
    this.models[id] = {
      provider: config.provider,
      baseUrl: config.baseUrl,
      modelName: config.modelName,
    }
    await this.saveFile()

    // API Key 加密存储
    if (config.apiKey) {
      await this.secureStorage.set(`ai-model:${id}:apiKey`, config.apiKey)
    } else {
      await this.secureStorage.delete(`ai-model:${id}:apiKey`)
    }
  }

  /** 获取单个模型完整配置（含解密的 apiKey） */
  async get(id: AIModelId): Promise<AIModelConfig | null> {
    const partial = this.models[id]
    if (!partial) return null

    const apiKey = (await this.secureStorage.get(`ai-model:${id}:apiKey`)) || ''
    return { ...partial, apiKey }
  }

  /** 保存检测到的模型列表 */
  async saveDetectedModels(id: AIModelId, models: string[]): Promise<void> {
    if (!this.models[id]) return
    this.models[id].detectedModels = models
    await this.saveFile()
  }

  /** 获取检测到的模型列表 */
  getDetectedModels(id: AIModelId): string[] {
    return this.models[id]?.detectedModels || []
  }

  /** 获取所有模型摘要（脱敏，用于列表展示） */
  async getAll(): Promise<AIModelSummary[]> {
    return AI_MODEL_IDS.map(id => {
      const partial = this.models[id]
      return {
        id,
        label: MODEL_LABELS[id],
        configured: !!partial?.provider,
        provider: partial?.provider || '',
        modelName: partial?.modelName || '',
      }
    })
  }
}
