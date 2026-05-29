import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type {
  VideoProvider,
  ProviderConfig,
  ProviderSummary,
  ProviderId
} from './types'
import { KlingProvider } from './kling-provider'
import { JimengProvider } from './jimeng-provider'

interface ProvidersFile {
  activeId: string
  providers: ProviderConfig[]
}

export class VideoProviderRegistry {
  private static instance: VideoProviderRegistry

  private providers = new Map<ProviderId, VideoProvider>()
  private configs = new Map<ProviderId, ProviderConfig>()
  private activeId: string = ''

  private static builtinProviders: Record<string, () => VideoProvider> = {
    'kling': () => new KlingProvider(),
    'jimeng': () => new JimengProvider(),
  }

  static getInstance(): VideoProviderRegistry {
    if (!this.instance) this.instance = new VideoProviderRegistry()
    return this.instance
  }

  /** 配置文件路径 */
  private get configPath(): string {
    return join(app.getPath('userData'), 'providers.json')
  }

  /** 启动时加载配置 */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8')
      const file = JSON.parse(data) as ProvidersFile
      this.activeId = file.activeId || ''

      for (const config of file.providers) {
        if (config.enabled) {
          await this.configure(config)
        } else {
          this.configs.set(config.id, config)
        }
      }
    } catch {
      // 文件不存在，使用默认配置
    }
  }

  /** 保存配置到文件 */
  async saveConfigs(): Promise<void> {
    const file: ProvidersFile = {
      activeId: this.activeId,
      providers: Array.from(this.configs.values())
    }
    await fs.writeFile(this.configPath, JSON.stringify(file, null, 2), 'utf-8')
  }

  /** 添加/更新 Provider */
  async configure(config: ProviderConfig): Promise<void> {
    const factory = VideoProviderRegistry.builtinProviders[config.id]
    if (!factory) throw new Error(`Unknown provider: ${config.id}`)

    const provider = factory()
    await provider.initialize(config)

    this.providers.set(config.id, provider)
    this.configs.set(config.id, config)
    await this.saveConfigs()
  }

  /** 移除 Provider */
  async remove(providerId: string): Promise<void> {
    this.providers.delete(providerId)
    this.configs.delete(providerId)
    if (this.activeId === providerId) this.activeId = ''
    await this.saveConfigs()
  }

  /** 切换激活的 Provider */
  async setActive(providerId: string): Promise<void> {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} not configured`)
    }
    this.activeId = providerId
    await this.saveConfigs()
  }

  /** 获取当前激活的 Provider */
  getActive(): VideoProvider | null {
    if (!this.activeId) return null
    return this.providers.get(this.activeId) || null
  }

  /** 获取所有已配置的 Provider 摘要 */
  getAll(): ProviderSummary[] {
    return Array.from(this.configs.values()).map(config => {
      const provider = this.providers.get(config.id)
      return {
        id: config.id,
        displayName: provider?.displayName || config.id,
        models: provider?.models || [],
        capabilities: provider?.capabilities || [],
        maxDurationSec: provider?.maxDurationSec || 0,
        supportedResolutions: provider?.supportedResolutions || [],
        configured: !!provider,
        enabled: config.enabled
      }
    })
  }

  /** 获取所有支持的 Provider（含未配置） */
  getSupportedProviders(): ProviderSummary[] {
    return Object.entries(VideoProviderRegistry.builtinProviders).map(([id, factory]) => {
      const provider = factory()
      const config = this.configs.get(id)
      return {
        id,
        displayName: provider.displayName,
        models: provider.models,
        capabilities: provider.capabilities,
        maxDurationSec: provider.maxDurationSec,
        supportedResolutions: provider.supportedResolutions,
        configured: !!config,
        enabled: config?.enabled || false
      }
    })
  }
}
