import type {
  VideoProvider,
  ProviderConfig,
  ProviderModel,
  VideoCapability,
  ImageToVideoRequest,
  VideoGenerationResult
} from './types'

/**
 * 字节即梦 Video Provider
 * API: visual.volcengineapi.com
 * Auth: AK+SK → HMAC-SHA256 签名
 */
export class JimengProvider implements VideoProvider {
  readonly id = 'jimeng'
  readonly displayName = '字节即梦'
  readonly models: ProviderModel[] = [
    { id: 'jimeng-v3', name: '即梦 v3', maxDurationSec: 60 },
    { id: 'jimeng-v2', name: '即梦 v2', maxDurationSec: 30 },
  ]
  readonly capabilities: VideoCapability[] = ['image_to_video', 'text_to_video']
  readonly maxDurationSec = 60
  readonly supportedResolutions = ['720p', '1080p']

  private apiKey = ''
  private apiSecret = ''
  private model = 'jimeng-v3'

  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey
    this.apiSecret = config.apiSecret || ''
    this.model = config.model || 'jimeng-v3'
  }

  async imageToVideo(req: ImageToVideoRequest): Promise<VideoGenerationResult> {
    // TODO: 实现 HMAC-SHA256 签名和 API 调用
    throw new Error('JimengProvider.imageToVideo not yet implemented')
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey || !this.apiSecret) return false
    return true
  }
}
