// ============================================================
// 核心数据结构定义 — 基于开发文档 Section 3.3
// ============================================================

// ── 角色 ──────────────────────────────────────────────────────

export interface CharacterRelation {
  targetId: string
  relation: string // e.g. "师徒", "敌对", "朋友"
}

export interface CharacterProfile {
  id: string
  name: string
  role: 'protagonist' | 'antagonist' | 'supporting' | 'narrator'
  personality: string
  appearance: string
  appearanceDetail: {
    gender: string
    age: string
    height: string
    build: string
    face: string
    hair: string
    eyes: string
    clothing: string
    accessories: string
    distinctiveFeatures: string
  }
  voiceDescription: string
  relationships: CharacterRelation[]
}

// ── 世界观 ────────────────────────────────────────────────────

export interface WorldSetting {
  era: string
  location: string
  atmosphere: string
  rules: string
}

// ── 故事 ──────────────────────────────────────────────────────

export interface StoryBeat {
  order: number
  name: string
  description: string
  emotionalTone: string
}

export interface StoryOutline {
  logline: string
  theme: string
  visualStyle: string
  worldSetting: WorldSetting
  characters: CharacterProfile[]
  outline: StoryBeat[]
  estimatedDuration: number
}

// ── 镜头 ──────────────────────────────────────────────────────

export type ShotSize =
  | 'extreme_wide' | 'wide' | 'medium_wide' | 'medium'
  | 'medium_close' | 'close_up' | 'extreme_close_up'

export type CameraAngle =
  | 'eye_level' | 'low_angle' | 'high_angle' | 'dutch_angle' | 'birds_eye'

export type CameraMovement =
  | 'static' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down'
  | 'dolly_in' | 'dolly_out' | 'tracking' | 'crane' | 'handheld'

export type LensType = 'wide' | 'standard' | 'telephoto'

export interface CameraDirection {
  shotSize: ShotSize
  angle: CameraAngle
  movement: CameraMovement
  lens?: LensType
  description: string
}

export type ShotType =
  | 'dialogue'      // 对白 → MuseTalk 口型同步
  | 'action'        // 动作 → 图生视频 API
  | 'transition'    // 过渡 → 2.5D 深度动画
  | 'narration'     // 旁白 → 静态图序列
  | 'establishing'  // 定场 → 广角静态
  | 'reaction'      // 反应 → 轻微动态
  | 'montage'       // 蒙太奇 → 快速切换

// ── 台词 ──────────────────────────────────────────────────────

export interface DialogueLine {
  characterId: string
  text: string
  tone: string       // e.g. "calm", "angry", "excited"
  speed?: number     // 语速倍率, default 1.0
}

// ── 图像 Prompt ───────────────────────────────────────────────

export interface ImagePromptDecomposition {
  quality: string
  style: string
  scene: string
  characters: string[]
  camera: string
  lighting: string
  atmosphere: string
}

export interface ImageGenerationPrompt {
  positive: string
  negative: string
  decomposition: ImagePromptDecomposition
}

// ── 分镜 ──────────────────────────────────────────────────────

export type ShotStatus = 'pending' | 'rendering' | 'done' | 'failed'

export interface ShotAssets {
  image?: string
  audio?: string
  video?: string
}

export interface ShotScript {
  id: string
  order: number
  durationSec: number
  sceneDescription: string
  charactersInScene: CharacterInShot[]
  dialogue: DialogueLine[]
  narration?: string
  camera: CameraDirection
  emotion: string
  shotType: ShotType
  // Layer 4 生成
  imagePrompt?: ImageGenerationPrompt
  // Pipeline 状态
  status: ShotStatus
  error?: string
  assets: ShotAssets
}

export interface CharacterInShot {
  characterId: string
  action: string
  expression: string
  position: string // e.g. "left", "center", "right"
}

// ── 章节 ──────────────────────────────────────────────────────

export type MoodArc = 'rising' | 'falling' | 'tension' | 'release' | 'neutral'

export interface Chapter {
  order: number
  title: string
  summary: string
  moodArc: MoodArc
  estimatedDuration: number
  bgmSuggestion: string
  shots: ShotScript[]
}

// ── Pipeline ──────────────────────────────────────────────────

export type PipelinePhase = 'idle' | 'script' | 'characters' | 'rendering' | 'compositing' | 'done' | 'error'

export interface PipelineState {
  phase: PipelinePhase
  totalShots: number
  completedShots: number
  failedShots: number
  estimatedRemainingSec: number
  error?: string
}

// ── 项目 ──────────────────────────────────────────────────────

export interface ProjectCharacter {
  id: string
  name: string
  appearanceDetail: CharacterProfile['appearanceDetail']
  referenceImage: string
  embeddingPath?: string
}

export interface ScriptData {
  chapters: Chapter[]
}

export interface Project {
  version: number
  id: string
  title: string
  style: string
  durationTargetSec: number
  createdAt: string
  updatedAt: string

  // Layer 1 输出
  outline?: StoryOutline

  // 角色（含基准图路径）
  characters: ProjectCharacter[]

  // Layer 2-4 输出
  script?: ScriptData

  // Pipeline 状态
  pipelineState: PipelineState
}

// ── LLM ───────────────────────────────────────────────────────

export type LLMProvider = 'claude' | 'openai' | 'custom'

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  baseUrl?: string
  model?: string
}
