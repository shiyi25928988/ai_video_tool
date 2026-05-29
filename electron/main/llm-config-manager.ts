import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { SecureStorage } from './secure-storage'
import type { LLMConfig } from './script-optimizer/types'

export interface LLMConfigEntry {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model?: string
  isActive: boolean
}

/** 脱敏后的配置（列表展示用，不含 apiKey） */
export interface LLMConfigSummary {
  id: string
  name: string
  baseUrl: string
  model: string
  isActive: boolean
}

/** 持久化文件结构（不含 apiKey） */
interface LLMConfigsFile {
  configs: Array<Omit<LLMConfigEntry, 'apiKey'> & { hasApiKey: boolean }>
}

export class LLMConfigManager {
  private static instance: LLMConfigManager

  private secureStorage = new SecureStorage()
  private configs: Map<string, Omit<LLMConfigEntry, 'apiKey'> & { hasApiKey: boolean }> = new Map()
  private activeId: string = ''

  static getInstance(): LLMConfigManager {
    if (!this.instance) this.instance = new LLMConfigManager()
    return this.instance
  }

  private get configPath(): string {
    return join(app.getPath('userData'), 'llm-configs.json')
  }

  /** 启动时加载配置 */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8')
      const file = JSON.parse(data) as LLMConfigsFile
      this.configs.clear()
      for (const c of file.configs || []) {
        this.configs.set(c.id, c)
        if (c.isActive) this.activeId = c.id
      }
    } catch {
      // 文件不存在，使用空配置
    }
  }

  /** 保存到文件 */
  private async saveFile(): Promise<void> {
    const file: LLMConfigsFile = {
      configs: Array.from(this.configs.values())
    }
    await fs.writeFile(this.configPath, JSON.stringify(file, null, 2), 'utf-8')
  }

  /** 获取所有配置摘要（脱敏） */
  list(): LLMConfigSummary[] {
    return Array.from(this.configs.values()).map(c => ({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      model: c.model || '',
      isActive: c.id === this.activeId,
    }))
  }

  /** 获取单个配置（含解密的 apiKey） */
  async get(id: string): Promise<LLMConfigEntry | null> {
    const c = this.configs.get(id)
    if (!c) return null
    const apiKey = (await this.secureStorage.get(`llm:${id}:apiKey`)) || ''
    return { ...c, apiKey }
  }

  /** 获取当前激活的配置（供管线使用） */
  async getActive(): Promise<LLMConfig | null> {
    if (!this.activeId) return null
    const entry = await this.get(this.activeId)
    if (!entry) return null
    return {
      provider: 'custom',
      apiKey: entry.apiKey,
      baseUrl: entry.baseUrl || undefined,
      model: entry.model || undefined,
    }
  }

  /** 新增/更新配置 */
  async save(entry: { id?: string; name: string; baseUrl: string; apiKey: string; model?: string }): Promise<string> {
    const id = entry.id || randomUUID()
    const isFirst = this.configs.size === 0

    this.configs.set(id, {
      id,
      name: entry.name,
      baseUrl: entry.baseUrl,
      model: entry.model,
      hasApiKey: !!entry.apiKey,
      isActive: isFirst, // 第一条自动激活
    })

    // API Key 加密存储
    if (entry.apiKey) {
      await this.secureStorage.set(`llm:${id}:apiKey`, entry.apiKey)
    }

    if (isFirst) this.activeId = id
    await this.saveFile()
    return id
  }

  /** 删除配置 */
  async remove(id: string): Promise<void> {
    this.configs.delete(id)
    await this.secureStorage.delete(`llm:${id}:apiKey`)
    if (this.activeId === id) {
      // 切换到第一条
      const first = this.configs.keys().next().value
      this.activeId = first || ''
      if (first) {
        const c = this.configs.get(first)!
        this.configs.set(first, { ...c, isActive: true })
      }
    }
    await this.saveFile()
  }

  /** 设置激活配置 */
  async setActive(id: string): Promise<void> {
    if (!this.configs.has(id)) throw new Error(`LLM config ${id} not found`)

    // 取消旧的激活
    if (this.activeId && this.configs.has(this.activeId)) {
      const old = this.configs.get(this.activeId)!
      this.configs.set(this.activeId, { ...old, isActive: false })
    }

    this.activeId = id
    const c = this.configs.get(id)!
    this.configs.set(id, { ...c, isActive: true })
    await this.saveFile()
  }
}
