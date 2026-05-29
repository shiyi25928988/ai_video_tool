// ============================================================
// 视频生成 Provider 接口定义 — 基于开发文档 Section 5
// ============================================================

export type ProviderId = 'kling' | 'jimeng' | 'wanxiang' | string

export type VideoCapability = 'image_to_video' | 'text_to_video' | 'video_extend'

export interface ProviderModel {
  id: string
  name: string
  maxDurationSec: number
}

export interface ProviderConfig {
  id: ProviderId
  enabled: boolean
  apiKey: string
  apiSecret?: string
  model: string
  defaults: {
    resolution: string
    fps?: number
    durationSec: number
  }
}

export interface ProviderSummary {
  id: ProviderId
  displayName: string
  models: ProviderModel[]
  capabilities: VideoCapability[]
  maxDurationSec: number
  supportedResolutions: string[]
  configured: boolean
  enabled: boolean
}

// ── 请求/响应 ────────────────────────────────────────────────

export interface ImageToVideoRequest {
  imagePath: string
  prompt: string
  negativePrompt?: string
  durationSec: number
  resolution?: string
  fps?: number
  motionStrength?: number
}

export interface TextToVideoRequest {
  prompt: string
  negativePrompt?: string
  durationSec: number
  resolution?: string
  fps?: number
}

export interface VideoGenerationResult {
  taskId: string
  status: 'submitted' | 'processing' | 'done' | 'failed'
  videoUrl?: string
  videoPath?: string
  error?: string
}

export interface TaskStatus {
  taskId: string
  status: 'submitted' | 'processing' | 'done' | 'failed'
  progress?: number
  videoUrl?: string
  error?: string
}

export interface QuotaInfo {
  total: number
  used: number
  remaining: number
}

// ── Provider 接口 ────────────────────────────────────────────

export interface VideoProvider {
  readonly id: ProviderId
  readonly displayName: string
  readonly models: ProviderModel[]
  readonly capabilities: VideoCapability[]
  readonly maxDurationSec: number
  readonly supportedResolutions: string[]

  initialize(config: ProviderConfig): Promise<void>
  imageToVideo(req: ImageToVideoRequest): Promise<VideoGenerationResult>
  textToVideo?(req: TextToVideoRequest): Promise<VideoGenerationResult>
  queryTask?(taskId: string): Promise<TaskStatus>
  cancelTask?(taskId: string): Promise<void>
  queryQuota?(): Promise<QuotaInfo>
  healthCheck(): Promise<boolean>
}
