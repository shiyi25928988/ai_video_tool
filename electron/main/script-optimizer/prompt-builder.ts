import type {
  ShotScript,
  CharacterProfile,
  ImageGenerationPrompt,
  ImagePromptDecomposition
} from './types'

// ============================================================
// Layer 4: SD Prompt 组装 — 纯规则引擎，无需 LLM
// ============================================================

// ── 情绪 → 灯光映射 ─────────────────────────────────────────

const EMOTION_LIGHTING: Record<string, string> = {
  angry: 'dramatic red backlighting, harsh shadows, high contrast',
  sad: 'soft dim lighting, blue tones, melancholy atmosphere',
  happy: 'warm golden sunlight, bright cheerful lighting, lens flare',
  fearful: 'low key lighting, deep shadows, horror atmosphere',
  calm: 'soft diffused natural light, peaceful atmosphere',
  determined: 'dramatic rim lighting, heroic atmosphere, golden hour',
  excited: 'vibrant dynamic lighting, energetic colors, motion blur light',
  surprised: 'bright sudden flash, dramatic contrast, sharp shadows',
  neutral: 'natural ambient lighting, balanced exposure',
  mysterious: 'volumetric light rays, fog, moonlit atmosphere',
  romantic: 'warm soft golden hour lighting, bokeh background',
  tense: 'cold harsh fluorescent lighting, high contrast, noir style',
}

// ── 镜头 → Prompt 关键词 ─────────────────────────────────────

const SHOT_SIZE_KEYWORDS: Record<string, string> = {
  extreme_wide: 'extreme wide shot, vast landscape, full environment visible',
  wide: 'wide shot, full environment visible, establishing composition',
  medium_wide: 'medium wide shot, character full body in environment',
  medium: 'medium shot, waist up framing',
  medium_close: 'medium close-up, chest up, emotional framing',
  close_up: 'close-up portrait, face focused, detailed facial features',
  extreme_close_up: 'extreme close-up, eyes and expression detail',
}

const ANGLE_KEYWORDS: Record<string, string> = {
  eye_level: 'eye level perspective',
  low_angle: 'low angle, looking up, heroic perspective',
  high_angle: 'high angle, looking down, vulnerable perspective',
  dutch_angle: 'dutch angle, tilted frame, unsettling',
  birds_eye: 'birds eye view, top down',
}

const MOVEMENT_KEYWORDS: Record<string, string> = {
  static: 'static composition, still frame',
  pan_left: 'horizontal pan left',
  pan_right: 'horizontal pan right',
  tilt_up: 'vertical tilt up',
  tilt_down: 'vertical tilt down',
  dolly_in: 'dolly in, zooming closer',
  dolly_out: 'dolly out, revealing more',
  tracking: 'tracking shot, following subject',
  crane: 'crane shot, elevated movement',
  handheld: 'handheld camera, slight shake, documentary feel',
}

// ── 风格标签 ─────────────────────────────────────────────────

const STYLE_QUALITY: Record<string, string> = {
  anime: 'anime style, studio ghibli inspired, detailed illustration, vibrant colors',
  realistic: 'photorealistic, ultra detailed, 8k, cinematic',
  '3d': '3d render, octane render, ray tracing, detailed textures',
  watercolor: 'watercolor painting, soft brushstrokes, artistic',
  comic: 'comic book style, bold lines, cel shading',
  cinematic: 'cinematic color grading, anamorphic, film grain',
}

// ── 组装函数 ─────────────────────────────────────────────────

export class PromptBuilder {
  /** 为单个分镜生成 ImageGenerationPrompt */
  static build(
    shot: ShotScript,
    characters: CharacterProfile[],
    style: string = 'anime'
  ): ImageGenerationPrompt {
    const parts: string[] = []

    // 1. 质量标签
    const quality = 'masterpiece, best quality, highly detailed'
    parts.push(quality)

    // 2. 风格
    const styleDesc = STYLE_QUALITY[style] || STYLE_QUALITY.anime
    parts.push(styleDesc)

    // 3. 场景
    parts.push(shot.sceneDescription)

    // 4. 角色描述
    const charParts: string[] = []
    for (const cish of shot.charactersInScene) {
      const char = characters.find(c => c.id === cish.characterId)
      if (char) {
        const desc = [
          char.appearanceDetail.hair,
          char.appearanceDetail.eyes,
          char.appearanceDetail.clothing,
          cish.expression ? `${cish.expression} expression` : '',
          cish.action || '',
        ].filter(Boolean).join(', ')
        charParts.push(`${char.name}: ${desc}`)
      }
    }

    // 5. 镜头语言
    const cameraParts: string[] = []
    const cam = shot.camera
    if (cam?.shotSize) cameraParts.push(SHOT_SIZE_KEYWORDS[cam.shotSize] || '')
    if (cam?.angle) cameraParts.push(ANGLE_KEYWORDS[cam.angle] || '')
    if (cam?.movement) cameraParts.push(MOVEMENT_KEYWORDS[cam.movement] || '')

    // 6. 灯光
    const lighting = EMOTION_LIGHTING[shot.emotion] || EMOTION_LIGHTING.neutral

    // 7. 氛围
    const atmosphere = `${shot.emotion} atmosphere, cinematic mood`

    // 组装 positive prompt
    const positive = [
      parts.join(', '),
      charParts.join(', '),
      cameraParts.join(', '),
      lighting,
      atmosphere,
    ].filter(Boolean).join(',\n')

    // 统一 negative prompt
    const negative = 'low quality, worst quality, blurry, deformed, ugly, ' +
      'different face, wrong hairstyle, wrong clothing, bad anatomy, ' +
      'extra fingers, mutated hands, poorly drawn hands, watermark, text'

    const decomposition: ImagePromptDecomposition = {
      quality,
      style: styleDesc,
      scene: shot.sceneDescription,
      characters: charParts,
      camera: cameraParts.join(', '),
      lighting,
      atmosphere,
    }

    return { positive, negative, decomposition }
  }

  /** 批量为章节中所有分镜生成 prompt */
  static buildAll(
    shots: ShotScript[],
    characters: CharacterProfile[],
    style: string = 'anime'
  ): ShotScript[] {
    return shots.map(shot => ({
      ...shot,
      imagePrompt: this.build(shot, characters, style)
    }))
  }
}
