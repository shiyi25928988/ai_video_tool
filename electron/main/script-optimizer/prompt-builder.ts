import type {
  ShotScript,
  CharacterProfile,
  ImageGenerationPrompt,
  ImagePromptDecomposition
} from './types'

// ============================================================
// Layer 4: SD Prompt 组装 — 增强版规则引擎
// ============================================================

// ── 情绪 → 灯光 + 色调 + 氛围 ────────────────────────────────

const EMOTION_STYLE: Record<string, { lighting: string; color: string; mood: string; extra: string }> = {
  angry: {
    lighting: 'dramatic red backlighting, harsh directional shadows, high contrast',
    color: 'red and orange color palette, warm aggressive tones',
    mood: 'intense aggressive atmosphere, tension',
    extra: 'embers, heat haze, sharp edges',
  },
  sad: {
    lighting: 'soft dim overcast lighting, cool blue tones, diffused shadows',
    color: 'desaturated blue-grey palette, muted colors',
    mood: 'melancholy lonely atmosphere, emotional weight',
    extra: 'rain, wet surfaces, reflections',
  },
  happy: {
    lighting: 'warm golden sunlight, bright cheerful fill light, soft lens flare',
    color: 'warm golden palette, vibrant saturated colors',
    mood: 'joyful uplifting atmosphere, warmth',
    extra: 'sparkles, light rays, butterflies',
  },
  fearful: {
    lighting: 'low key lighting, deep pitch black shadows, single harsh light source',
    color: 'cold dark palette, sickly green undertones',
    mood: 'horror dread atmosphere, claustrophobic',
    extra: 'fog, darkness, eerie glow',
  },
  calm: {
    lighting: 'soft diffused natural ambient light, gentle shadows, balanced exposure',
    color: 'soft pastel palette, harmonious tones',
    mood: 'peaceful serene atmosphere, tranquility',
    extra: 'gentle breeze, floating particles',
  },
  determined: {
    lighting: 'dramatic rim lighting, golden hour backlight, heroic glow',
    color: 'warm amber gold palette, strong contrast',
    mood: 'heroic epic atmosphere, resolve',
    extra: 'wind, flowing fabric, dynamic pose',
  },
  excited: {
    lighting: 'vibrant dynamic lighting, energetic color pops, motion blur streaks',
    color: 'high saturation neon palette, electric colors',
    mood: 'energetic dynamic atmosphere, excitement',
    extra: 'confetti, sparkles, motion lines',
  },
  surprised: {
    lighting: 'bright sudden flash, dramatic stark contrast, sharp defined shadows',
    color: 'high contrast palette, sudden color shift',
    mood: 'shock revelation atmosphere, sudden impact',
    extra: 'speed lines, flash effect, wide eyes',
  },
  neutral: {
    lighting: 'natural ambient daylight, even balanced lighting, soft shadows',
    color: 'natural true-to-life palette, balanced tones',
    mood: 'calm observational atmosphere, clarity',
    extra: '',
  },
  mysterious: {
    lighting: 'volumetric god rays through fog, moonlit glow, dappled shadows',
    color: 'deep purple and teal palette, ethereal glow',
    mood: 'enigmatic mystical atmosphere, wonder',
    extra: 'fog, particles, arcane symbols, glowing runes',
  },
  romantic: {
    lighting: 'warm soft golden hour bokeh lighting, gentle rim light, candle glow',
    color: 'warm pink and gold palette, soft pastels',
    mood: 'intimate tender atmosphere, warmth',
    extra: 'petals, bokeh hearts, soft focus, rose tint',
  },
  tense: {
    lighting: 'cold harsh fluorescent flickering light, noir side lighting, deep blacks',
    color: 'cold steel blue palette, high contrast monochrome hints',
    mood: 'suspenseful noir atmosphere, unease',
    extra: 'clock ticking, sweat, sharp angles',
  },
}

// ── 镜头 → Prompt 关键词（增强版）─────────────────────────────

const SHOT_SIZE_KEYWORDS: Record<string, string> = {
  extreme_wide: 'extreme wide shot, vast panoramic landscape, tiny subject in grand environment, epic scale, full environment visible, aerial perspective',
  wide: 'wide shot, full body visible in environment, establishing composition, environmental storytelling, contextual framing',
  medium_wide: 'medium wide shot, character full body, legs visible, environment context, action framing',
  medium: 'medium shot, waist up, conversational framing, character interaction focus, natural proportions',
  medium_close: 'medium close-up, chest up, emotional intimacy, facial expression readable, dramatic framing',
  close_up: 'close-up portrait, face filling frame, detailed skin texture, emotional depth, eye contact, shallow depth of field',
  extreme_close_up: 'extreme close-up, eyes and expression detail, micro-expressions visible, iris detail, emotional intensity, abstract framing',
}

const ANGLE_KEYWORDS: Record<string, string> = {
  eye_level: 'eye level perspective, natural neutral viewpoint, subject at viewer eye height',
  low_angle: 'low angle shot looking up, heroic powerful perspective, imposing stature, dramatic foreshortening',
  high_angle: 'high angle shot looking down, vulnerable small perspective, overview, observational distance',
  dutch_angle: 'dutch angle tilted frame, disorienting unsettling composition, dynamic diagonal lines',
  birds_eye: 'birds eye view directly above, top-down flat perspective, pattern recognition, map-like view',
  worm_eye: 'worm eye view from ground level, extreme low angle, towering subject, dramatic sky background',
}

const MOVEMENT_KEYWORDS: Record<string, string> = {
  static: 'static composition, perfectly still frame, tripod stability, deliberate framing',
  pan_left: 'horizontal pan left, motion blur on edges, cinematic sweep',
  pan_right: 'horizontal pan right, motion blur on edges, cinematic sweep',
  tilt_up: 'vertical tilt up, revealing height, upward motion, awe-inspiring',
  tilt_down: 'vertical tilt down, revealing ground detail, downward motion, contemplative',
  dolly_in: 'dolly in zooming closer, increasing intimacy, focusing attention, depth compression',
  dolly_out: 'dolly out revealing context, expanding frame, environmental reveal, isolation',
  tracking: 'tracking shot following subject, matched movement, dynamic framing, kinetic energy',
  crane: 'crane shot elevated movement, sweeping vertical motion, grand reveal, epic scale',
  handheld: 'handheld camera, natural shake, documentary realism, visceral immediacy, raw energy',
  steadicam: 'steadicam smooth follow, floating movement, dreamlike flow, professional cinema',
}

// ── 风格标签（增强版）─────────────────────────────────────────

const STYLE_QUALITY: Record<string, { positive: string; negative: string }> = {
  anime: {
    positive: 'anime style, studio ghibli inspired, makoto shinkai lighting, detailed illustration, vibrant cel shading, clean linework, expressive eyes, dynamic composition',
    negative: 'photorealistic, 3d render, western cartoon, ugly, deformed, bad anatomy',
  },
  realistic: {
    positive: 'photorealistic, ultra detailed, 8k uhd, DSLR quality, film grain, natural lighting, lifelike skin texture, accurate anatomy, professional photography',
    negative: 'anime, cartoon, painting, illustration, drawing, sketch, artistic',
  },
  '3d': {
    positive: '3d render, octane render, unreal engine 5, ray tracing, global illumination, detailed PBR textures, subsurface scattering, volumetric lighting',
    negative: 'flat, 2d, drawing, painting, sketch, low poly, wireframe',
  },
  watercolor: {
    positive: 'watercolor painting, soft wet brushstrokes, paint bleeding effects, artistic paper texture, fluid colors, traditional art feel, delicate gradients',
    negative: 'photorealistic, digital art, sharp edges, vector, pixel art',
  },
  comic: {
    positive: 'comic book style, bold ink outlines, dynamic panel composition, halftone dots, pop art colors, dramatic action lines, graphic novel aesthetic',
    negative: 'photorealistic, soft, blurry, watercolor, oil painting',
  },
  cinematic: {
    positive: 'cinematic film look, anamorphic lens, 2.39:1 aspect ratio, film grain, color grading, depth of field, lens flare, professional cinematography',
    negative: 'flat lighting, amateur, phone camera, surveillance, webcam',
  },
}

// ── 时间/天气推断 ─────────────────────────────────────────────

function inferTimeOfDay(desc: string): string {
  const d = desc.toLowerCase()
  if (d.includes('夜') || d.includes('night') || d.includes('moon') || d.includes('星空'))
    return 'nighttime, moonlight, stars visible, dark sky'
  if (d.includes('黄昏') || d.includes('sunset') || d.includes('dusk') || d.includes('傍晚'))
    return 'golden hour sunset, orange sky, long shadows, warm light'
  if (d.includes('黎明') || d.includes('dawn') || d.includes('sunrise') || d.includes('清晨'))
    return 'early morning dawn, soft pink sky, first light, mist'
  if (d.includes('午后') || d.includes('noon') || d.includes('中午'))
    return 'midday sun, harsh overhead light, short shadows'
  if (d.includes('阴') || d.includes('overcast') || d.includes('cloudy'))
    return 'overcast sky, diffused soft light, no harsh shadows'
  return ''
}

function inferWeather(desc: string): string {
  const d = desc.toLowerCase()
  if (d.includes('雨') || d.includes('rain')) return 'rain, wet surfaces, puddles, reflections, raindrops'
  if (d.includes('雪') || d.includes('snow')) return 'snow, frost, white landscape, cold breath, ice crystals'
  if (d.includes('雾') || d.includes('fog') || d.includes('mist')) return 'fog, mist, reduced visibility, atmospheric haze'
  if (d.includes('风') || d.includes('wind')) return 'wind, flowing hair, moving fabric, swaying trees'
  if (d.includes('雷') || d.includes('thunder') || d.includes('storm')) return 'thunderstorm, lightning, dark clouds, dramatic sky'
  return ''
}

// ── 景深推断 ──────────────────────────────────────────────────

function inferDepthOfField(shotSize: string, cam: any): string {
  if (shotSize === 'close_up' || shotSize === 'extreme_close_up')
    return 'shallow depth of field, creamy bokeh background, sharp subject focus'
  if (shotSize === 'extreme_wide' || shotSize === 'wide')
    return 'deep depth of field, everything in focus, sharp from foreground to background'
  if (cam?.movement === 'dolly_in')
    return 'rack focus, shifting depth of field, selective focus'
  return 'medium depth of field, natural focus falloff'
}

// ── 构图增强 ──────────────────────────────────────────────────

function inferComposition(shotSize: string, cam: any): string {
  const parts: string[] = []
  if (shotSize === 'extreme_wide' || shotSize === 'wide')
    parts.push('rule of thirds, leading lines, foreground interest')
  if (shotSize === 'close_up' || shotSize === 'extreme_close_up')
    parts.push('centered composition, symmetrical framing')
  if (cam?.angle === 'dutch_angle')
    parts.push('diagonal composition, dynamic tension')
  if (cam?.movement === 'tracking' || cam?.movement === 'handheld')
    parts.push('dynamic framing, kinetic composition')
  return parts.join(', ')
}

// ── 组装函数 ──────────────────────────────────────────────────

export class PromptBuilder {
  /** 为单个分镜生成 ImageGenerationPrompt */
  static build(
    shot: ShotScript,
    characters: CharacterProfile[],
    style: string = 'anime'
  ): ImageGenerationPrompt {
    const parts: string[] = []
    const negativeParts: string[] = []

    // 1. 质量标签
    const quality = 'masterpiece, best quality, highly detailed, sharp focus, high resolution, intricate details, professional'
    parts.push(quality)

    // 2. 风格
    const styleConfig = STYLE_QUALITY[style] || STYLE_QUALITY.anime
    parts.push(styleConfig.positive)
    negativeParts.push(styleConfig.negative)

    // 3. 场景描述
    parts.push(shot.sceneDescription)

    // 4. 时间/天气/环境推断
    const timeOfDay = inferTimeOfDay(shot.sceneDescription)
    if (timeOfDay) parts.push(timeOfDay)

    const weather = inferWeather(shot.sceneDescription)
    if (weather) parts.push(weather)

    // 5. 角色描述（增强版）
    const charParts: string[] = []
    for (const cish of shot.charactersInScene) {
      const char = characters.find(c => c.id === cish.characterId)
      if (char) {
        const d = char.appearanceDetail
        const charDesc = [
          // 基础外貌
          d.gender && d.age ? `${d.age} year old ${d.gender}` : '',
          d.build || '',
          d.height || '',
          d.face || '',
          // 发型发色
          d.hair || '',
          // 眼睛
          d.eyes || '',
          // 服装
          d.clothing ? `wearing ${d.clothing}` : '',
          // 配饰
          d.accessories || '',
          // 特征
          d.distinctiveFeatures || '',
          // 表情动作
          cish.expression ? `${cish.expression} expression` : '',
          cish.action || '',
          cish.position ? `positioned ${cish.position}` : '',
        ].filter(Boolean).join(', ')
        charParts.push(charDesc)
      }
    }

    // 6. 镜头语言
    const cam = shot.camera
    const cameraParts: string[] = []
    const shotSize = cam?.shotSize || 'medium'
    if (shotSize) cameraParts.push(SHOT_SIZE_KEYWORDS[shotSize] || '')
    if (cam?.angle) cameraParts.push(ANGLE_KEYWORDS[cam.angle] || '')
    if (cam?.movement) cameraParts.push(MOVEMENT_KEYWORDS[cam.movement] || '')
    if (cam?.lens) cameraParts.push(`${cam.lens} lens`)

    // 7. 景深
    const dof = inferDepthOfField(shotSize, cam)
    if (dof) cameraParts.push(dof)

    // 8. 构图
    const composition = inferComposition(shotSize, cam)
    if (composition) cameraParts.push(composition)

    // 9. 灯光 + 色调 + 氛围
    const emotion = shot.emotion || 'neutral'
    const emotionStyle = EMOTION_STYLE[emotion] || EMOTION_STYLE.neutral
    const lightingParts = [
      emotionStyle.lighting,
      emotionStyle.color,
      emotionStyle.mood,
      emotionStyle.extra,
    ].filter(Boolean)

    // 10. 情绪弧 → 额外氛围
    const moodArcKeywords: Record<string, string> = {
      rising: 'building tension, escalating energy, anticipation',
      falling: 'declining energy, resolution approaching, release',
      tension: 'peak tension, suspense, edge of seat',
      release: 'relief, catharsis, emotional release',
      neutral: 'balanced, steady, observational',
    }
    const moodArc = moodArcKeywords[shot.emotion] || ''

    // 组装 positive prompt
    const positive = [
      parts.join(', '),
      charParts.length > 0 ? `characters: ${charParts.join('; ')}` : '',
      cameraParts.join(', '),
      lightingParts.join(', '),
      moodArc,
    ].filter(Boolean).join(',\n')

    // 统一 negative prompt（增强版）
    const negative = [
      'low quality, worst quality, blurry, noisy, grainy, pixelated',
      'deformed, ugly, disfigured, mutated, malformed',
      'bad anatomy, wrong proportions, extra limbs, missing limbs, floating limbs',
      'extra fingers, mutated hands, poorly drawn hands, fused fingers, too many fingers',
      'bad hands, wrong number of fingers, extra digits, fewer digits',
      'cropped, out of frame, cut off, signature, watermark, text, logo',
      'duplicate, error, jpeg artifacts, chromatic aberration',
      style === 'anime' ? 'photorealistic, 3d render, western cartoon' : '',
      style === 'realistic' ? 'anime, cartoon, painting, illustration' : '',
      ...negativeParts,
    ].filter(Boolean).join(', ')

    const decomposition: ImagePromptDecomposition = {
      quality,
      style: styleConfig.positive,
      scene: shot.sceneDescription,
      characters: charParts,
      camera: cameraParts.join(', '),
      lighting: lightingParts.join(', '),
      atmosphere: [emotionStyle.mood, moodArc].filter(Boolean).join(', '),
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
