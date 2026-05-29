import type {
  VideoProvider,
  ProviderConfig,
  ProviderModel,
  VideoCapability,
  ImageToVideoRequest,
  VideoGenerationResult,
  TaskStatus
} from './types'

/**
 * 快手可灵 Video Provider
 * API: api.klingai.com
 * Auth: AK+SK → JWT Token
 */
export class KlingProvider implements VideoProvider {
  readonly id = 'kling'
  readonly displayName = '快手可灵'
  readonly models: ProviderModel[] = [
    { id: 'kling-v2', name: '可灵 v2', maxDurationSec: 120 },
    { id: 'kling-v1', name: '可灵 v1', maxDurationSec: 60 },
  ]
  readonly capabilities: VideoCapability[] = ['image_to_video', 'text_to_video']
  readonly maxDurationSec = 120
  readonly supportedResolutions = ['720p', '1080p']

  private apiKey = ''
  private apiSecret = ''
  private model = 'kling-v2'

  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey
    this.apiSecret = config.apiSecret || ''
    this.model = config.model || 'kling-v2'
  }

  async imageToVideo(req: ImageToVideoRequest): Promise<VideoGenerationResult> {
    // TODO: 实现 JWT 签名和 API 调用
    throw new Error('KlingProvider.imageToVideo not yet implemented')
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey || !this.apiSecret) return false
    // TODO: 实现真实健康检查
    return true
  }
}
