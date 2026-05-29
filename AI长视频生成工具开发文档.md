# 长视频 AI 生成应用 — 开发文档

> **版本**: v1.0  
> **更新日期**: 2026-05-28  
> **架构类型**: 纯客户端桌面应用（Electron + Python Sidecar）

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [剧本优化引擎](#3-剧本优化引擎)
4. [角色引擎 — 跨镜头一致性](#4-角色引擎--跨镜头一致性)
5. [多厂商生视频接口层](#5-多厂商生视频接口层)
6. [音频引擎 — TTS + 口型同步](#6-音频引擎--tts--口型同步)
7. [视频生成与组装引擎](#7-视频生成与组装引擎)
8. [零依赖存储设计](#8-零依赖存储设计)
9. [进程内 Pipeline Runner](#9-进程内-pipeline-runner)
10. [Python Sidecar — GPU 能力层](#10-python-sidecar--gpu-能力层)
11. [前端交互设计](#11-前端交互设计)
12. [两种部署模式](#12-两种部署模式)
13. [技术栈清单](#13-技术栈清单)
14. [关键技术难点与对策](#14-关键技术难点与对策)
15. [实施路线图](#15-实施路线图)
16. [附录](#16-附录)

---

## 1. 项目概述

### 1.1 产品定位

一个纯客户端桌面应用，用户输入文字创意，自动生成由 AI 驱动的长视频（2-10 分钟）。零服务端依赖，所有数据和 AI 推理在本地完成，仅视频生成等资源密集型任务选择性调用云端 API。

### 1.2 核心功能

| 功能 | 说明 |
|------|------|
| 剧本生成 | 输入一句话/一段文字 → LLM 分层生成故事大纲 → 章节 → 分镜脚本 |
| 角色设计 | 自动生成角色外貌描述 + 基准图，IPAdapter 保证跨分镜一致性 |
| 配音生成 | 多角色 TTS 配音（支持情感、语速控制），MuseTalk 口型同步 |
| 视频生成 | 分镜渲染：对白用口型同步、动作调用可灵/即梦等 API、过渡用 2.5D 动态 |
| 视频组装 | FFmpeg 拼接分镜片段 + 转场 + 字幕 + BGM |
| 多厂商配置 | 支持快手可灵、字节即梦、阿里万相及扩展更多视频生成 API |

### 1.3 核心约束

- **纯客户端**：无服务端、无数据库进程、无消息队列
- **文件即存储**：JSON + 文件系统目录结构
- **GPU 可选**：有 GPU 走本地推理，无 GPU 全走云端 API
- **厂商可插拔**：视频生成 API 通过 Provider 接口统一管理

---

## 2. 系统架构

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────────┐
│                    Electron Desktop App                    │
│                                                            │
│  ┌─────────────────────┐          ┌─────────────────────┐ │
│  │   Renderer Process  │   IPC    │    Main Process     │ │
│  │                     │◄────────►│                     │ │
│  │  React 18 + Zustand │          │  ProjectManager     │ │
│  │  Storyboard Editor  │          │  PipelineRunner     │ │
│  │  Video Preview      │          │  ScriptOptimizer    │ │
│  │  Character Manager  │          │  VideoProviderReg   │ │
│  └─────────────────────┘          │  FFmpegController   │ │
│                                    └──────────┬──────────┘ │
│                                               │            │
│                           HTTP localhost:PORT │            │
│                                               │            │
│                              ┌────────────────▼──────────┐ │
│                              │    Python Sidecar         │ │
│                              │    (Flask HTTP Server)    │ │
│                              │                           │ │
│                              │  SDXL + IPAdapter FaceID  │ │
│                              │  CosyVoice 2 TTS          │ │
│                              │  MuseTalk Lip-Sync        │ │
│                              │  Depth Animator (2.5D)    │ │
│                              └───────────────────────────┘ │
│                                                            │
│            直接 HTTP 调用外部 API:                           │
│            Claude/GPT ─── 可灵/即梦/万相 ─── 火山TTS        │
└──────────────────────────────────────────────────────────┘
```

### 2.2 三层职责

| 层 | 运行时 | 技术栈 | 职责 |
|----|--------|--------|------|
| **Renderer** | Chromium | React 18 + Zustand + Tailwind | UI 渲染、用户交互、故事板编辑 |
| **Main** | Node.js 20+ | TypeScript + FFmpeg | 文件 IO、任务调度、IPC、外部 API 调用 |
| **Sidecar** | Python 3.11 | Flask + diffusers + CosyVoice | 所有 GPU 密集型 AI 任务 |

### 2.3 数据流

```
用户输入
  │
  ▼
ScriptOptimizer (Main Process)
  ├─ Layer 1: 调用 LLM API → 故事大纲 + 角色设定
  ├─ Layer 2: 调用 LLM API → 章节 + 分镜
  ├─ Layer 3: 调用 LLM API → 镜头语言 + 台词润色
  └─ Layer 4: 规则引擎 → SD Prompt 组装
  │
  ▼
PipelineRunner (Main Process)
  ├─ Phase 1: 角色基准图生成 → Python Sidecar (SDXL)
  ├─ Phase 2: 分镜并行渲染
  │   ├─ 对白镜头 → Python Sidecar (SD + MuseTalk)
  │   ├─ 动作镜头 → VideoProviderRegistry (可灵/即梦 API)
  │   └─ 过渡镜头 → Python Sidecar (Depth Animator)
  ├─ Phase 3: 配音生成 → Python Sidecar (CosyVoice)
  └─ Phase 4: 视频组装 → FFmpeg (child_process)
  │
  ▼
输出: 最终视频文件 + project.json
```

---

## 3. 剧本优化引擎

### 3.1 设计概述

`ScriptOptimizer` 是整个 Pipeline 的起点。采用**4 层递进式生成**，每层独立可回退，修改上游自动触发下游重新生成。

### 3.2 分层流程

```
Layer 1: 故事解析
  输入: 用户的一句话/一段文字
  输出: StoryOutline (梗概 + 角色档案 + 世界观 + 故事节拍)
  LLM调用: 1 次 (~2000 output tokens)
  ─────────────────────────────────────────────
Layer 2: 章节拆解
  输入: StoryOutline
  输出: Chapter[] (每个章节含分镜列表)
  LLM调用: 长剧本分段调用, 每 5 个节拍一组 (~4000 tokens/组)
  ─────────────────────────────────────────────
Layer 3: 分镜细化
  输入: Chapter[]
  输出: Chapter[] (增强镜头语言、润色台词、情绪标注)
  LLM调用: 每章 1 次 (~3000 tokens/章)
  ─────────────────────────────────────────────
Layer 4: SD Prompt 组装
  输入: Chapter[]
  输出: Chapter[] (每个 Shot 附带 ImageGenerationPrompt)
  无需 LLM: 纯规则引擎 (PromptBuilder)
```

### 3.3 核心数据结构

```typescript
// 故事大纲 (Layer 1 输出)
interface StoryOutline {
  logline: string;                           // 一句话梗概
  theme: string;                             // 故事主题
  visualStyle: string;                       // 视觉风格
  worldSetting: WorldSetting;                // 世界观设定
  characters: CharacterProfile[];            // 角色列表
  outline: StoryBeat[];                      // 故事节拍
  estimatedDuration: number;                 // 预估时长（秒）
}

// 角色档案
interface CharacterProfile {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'narrator';
  personality: string;
  appearance: string;
  appearanceDetail: {
    gender: string;    age: string;       height: string;
    build: string;     face: string;      hair: string;
    eyes: string;      clothing: string;  accessories: string;
    distinctiveFeatures: string;
  };
  voiceDescription: string;
  relationships: CharacterRelation[];
}

// 章节 (Layer 2 输出)
interface Chapter {
  order: number;
  title: string;
  summary: string;
  moodArc: 'rising' | 'falling' | 'tension' | 'release' | 'neutral';
  estimatedDuration: number;
  bgmSuggestion: string;
  shots: ShotScript[];
}

// 分镜脚本 (Layer 3 输出)
interface ShotScript {
  id: string;
  order: number;
  durationSec: number;
  sceneDescription: string;
  charactersInScene: CharacterInShot[];
  dialogue: DialogueLine[];
  narration?: string;
  camera: CameraDirection;
  emotion: string;
  shotType: ShotType;
}

// 镜头语言
interface CameraDirection {
  shotSize:  'extreme_wide' | 'wide' | 'medium' | 'close_up' | 'extreme_close_up' | ...;
  angle:     'eye_level' | 'low_angle' | 'high_angle' | 'dutch_angle' | 'birds_eye' | ...;
  movement:  'static' | 'pan_left' | 'dolly_in' | 'tracking' | 'crane' | 'handheld' | ...;
  lens?:      'wide' | 'standard' | 'telephoto';
  description: string;
}

// 镜头类型
type ShotType = 
  | 'dialogue'      // 对白 → MuseTalk 口型同步
  | 'action'        // 动作 → 图生视频 API
  | 'transition'    // 过渡 → 2.5D 深度动画
  | 'narration'     // 旁白 → 静态图序列
  | 'establishing'  // 定场 → 广角静态
  | 'reaction'      // 反应 → 轻微动态
  | 'montage';      // 蒙太奇 → 快速切换
```

### 3.4 LLM Prompt 设计

#### Layer 1: 故事解析

```markdown
## System Prompt 核心设计

你是一位资深的故事分析师和编剧。

### 关键原则
- 角色外貌描述必须足够详细，能够直接用于 AI 图像生成
  - 必须包含：性别、年龄、身高、体型、发型发色、眼睛、服装风格、配饰
  - 使用具体的视觉词汇，如"黑色长发扎成高马尾"而非"长头发"
- 故事节拍符合三幕结构，有明显的起承转合
- 预估总时长合理（中文配音约 3-4 字/秒）
- 严格输出 JSON，不要 markdown 代码块标记
```

#### Layer 2: 章节拆解

```markdown
## System Prompt 核心设计

你是一位专业的视频分镜导演。

### 章节设计原则
- 每个章节 3-8 个分镜（取决于内容密度）
- 每个分镜时长 3-15 秒（对白按 3-4 字/秒计算）
- 确保角色外貌描述的一致性
- 场景描述要注重视觉呈现，便于转换为图像生成 prompt

### 分镜类型分配
- dialogue: 角色对话 → 口型同步
- action: 动作运动 → 视频生成 API
- transition: 场景切换 → 深度动画
- narration: 旁白叙述 → 静态图序列
- establishing: 定场镜头 → 广角全景
```

#### Layer 3: 分镜细化

```markdown
## System Prompt 核心设计

你是一位经验丰富的电影摄影师和台词编剧。

### 增强内容
1. 镜头语言：精确的景别、角度和运动方式
2. 台词润色：更自然、更有表现力
3. 情绪标注：每句台词的语气和语速
4. 节奏调整：避免连续 3 个以上相同景别的镜头

### 镜头语言原则
- 对话以 medium / medium_close 为主，穿插 close_up 突出情感
- 动作多用 wide / medium_wide
- 情感高潮用 close_up + low_angle
```

### 3.5 PromptBuilder — SD 图像 Prompt 组装

纯规则引擎，不需要 LLM 调用。将分镜的结构化信息组装为 SD 可用的图像 Prompt。

```
组装公式:
[质量标签] + [风格描述] + [场景描述] + [角色1描述(含动作表情)] + 
[角色2描述] + [镜头语言关键词] + [灯光描述] + [氛围关键词]

示例输出:
masterpiece, best quality, anime style, studio ghibli inspired,
dark candlelit library, ancient bookshelves, dusty tomes,
elderly wise man with grey beard and long robes, reading ancient book, serious expression,
young male knight, 18 years old, golden short messy hair, blue eyes, silver light armor,
medium shot, eye level, static,
dramatic rim lighting, mysterious atmosphere, volumetric light rays through window
```

**关键映射表：**

| 情绪 | 灯光 Prompt |
|------|------------|
| angry | dramatic red backlighting, harsh shadows, high contrast |
| sad | soft dim lighting, blue tones, melancholy atmosphere |
| happy | warm golden sunlight, bright cheerful lighting, lens flare |
| fearful | low key lighting, deep shadows, horror atmosphere |
| calm | soft diffused natural light, peaceful atmosphere |
| determined | dramatic rim lighting, heroic atmosphere, golden hour |

| 镜头 | Prompt 关键词 |
|------|-------------|
| wide | wide shot, full environment visible |
| medium | medium shot, waist up framing |
| close_up | close-up portrait, face focused, detailed facial features |
| low_angle | low angle, looking up, heroic perspective |
| birds_eye | birds eye view, top down |

### 3.6 LLM 客户端配置

```typescript
interface LLMConfig {
  provider: 'claude' | 'openai' | 'custom';
  apiKey: string;
  baseUrl?: string;  // 自定义接口 / Ollama: http://localhost:11434/v1
}

// 支持 Claude API、OpenAI API、以及兼容 OpenAI 格式的自定义接口
```

### 3.7 成本估算（5 分钟视频剧本）

| Layer | LLM 调用次数 | Input Tokens | Output Tokens | 估算成本 (Claude Sonnet) |
|-------|------------|-------------|---------------|-------------------------|
| Layer 1 | 1 | ~2,000 | ~2,000 | ~$0.03 |
| Layer 2 | 1-2 | ~4,000 | ~4,000 | ~$0.06 |
| Layer 3 | 3-5 | ~10,000 | ~6,000 | ~$0.10 |
| **合计** | **5-8** | **~16,000** | **~12,000** | **~$0.19** |

---

## 4. 角色引擎 — 跨镜头一致性

### 4.1 问题定义

同一个角色在 40+ 分镜中每次生成图片，如何保证看起来是同一个人？

### 4.2 解决方案：IP-Adapter FaceID Plus

```
角色创建流程:
  [角色外貌描述] → SDXL 生成基准图 → IPAdapter 提取 FaceID Embedding 
  → 保存 embedding.pt → 后续所有分镜复用

分镜生成流程:
  [Shot 的 image_prompt] + [角色 FaceID Embedding] + [可选: ControlNet 姿态]
  → SDXL + IPAdapter → 角色图（面保持一致，姿态/场景可变）
```

### 4.3 方案对比

| 方案 | 一致性 | 灵活性 | 成本 | 适用场景 |
|------|--------|--------|------|----------|
| **IP-Adapter FaceID** | ★★★★ | ★★★★★ | 低 | 主角+配角，首选方案 |
| **角色 LoRA** | ★★★★★ | ★★★ | 中 | 极高一致性需求的主角 |
| **InstantID** | ★★★ | ★★★★ | 低 | 快速原型验证 |
| **Midjourney cref** | ★★★★ | ★★ | 高 | 商业级画质但不可控 |

### 4.4 关键实施细节

```python
# Python Sidecar API: 提取角色 FaceID Embedding
POST /extract_face_embedding
Request: {
  "image_path": "characters/hero/reference.png",
  "output_dir": "characters/hero/"
}
Response: {
  "path": "characters/hero/embedding.pt",
  "status": "ok"
}

# 后续生成时注入 Embedding
POST /generate_image
Request: {
  "prompt": "...",
  "embedding_id": "char_hero",  # 自动查找对应的 embedding.pt
  "output_dir": "shots/shot_003/"
}
```

**避免"角色漂移"的策略：**

1. **Embedding 只提取一次**：创建角色时提取，全局复用
2. **Prompt 模板固化**：服装/发型描述固定在 Layer 1，不允许 LLM 自由发挥
3. **面部相似度自动校验**：生成后用 ArcFace 比对基准图和分镜图，相似度 < 0.7 自动重试
4. **负面 Prompt 统一**：`different face, wrong hairstyle, wrong clothing`

---

## 5. 多厂商生视频接口层

### 5.1 设计目标

支持快手可灵、字节即梦、阿里万相等多个视频生成 API，通过统一的 Provider 接口实现可插拔。

### 5.2 Provider 接口定义

```typescript
interface VideoProvider {
  readonly id: string;                      // 'kling' | 'jimeng' | 'wanxiang'
  readonly displayName: string;             // '快手可灵' | '字节即梦'
  readonly models: ProviderModel[];         // 支持的模型列表
  readonly capabilities: VideoCapability[]; // 支持的能力
  readonly maxDurationSec: number;          // 最大视频时长
  readonly supportedResolutions: string[];

  initialize(config: ProviderConfig): Promise<void>;
  imageToVideo(req: ImageToVideoRequest): Promise<VideoGenerationResult>;
  textToVideo?(req: TextToVideoRequest): Promise<VideoGenerationResult>;
  queryTask?(taskId: string): Promise<TaskStatus>;
  cancelTask?(taskId: string): Promise<void>;
  queryQuota?(): Promise<QuotaInfo>;
  healthCheck(): Promise<boolean>;
}
```

### 5.3 各厂商关键差异

| 厂商 | API 地址 | 鉴权方式 | 最大时长 | 特有参数 |
|------|---------|---------|---------|---------|
| **快手可灵** | api.klingai.com | AK+SK → JWT Token | 120s | mode (std/pro) |
| **字节即梦** | visual.volcengineapi.com | AK+SK → HMAC-SHA256 签名 | 60s | req_key, logo_info |
| **阿里万相** | dashscope.aliyuncs.com | API Key (Bearer) | 30s | style, size |
| **智谱清影** | open.bigmodel.cn | API Key (Bearer) | 60s | — |
| **MiniMax** | platform.minimaxi.com | API Key (Bearer) | 60s | — |

### 5.4 Provider 注册中心

```typescript
class VideoProviderRegistry {
  // 单例模式
  static getInstance(): VideoProviderRegistry;

  // 生命周期
  load(): Promise<void>;                    // 启动时从 providers.json 加载配置
  saveConfigs(): Promise<void>;            // 保存配置到文件

  // Provider CRUD
  configure(config: ProviderConfig): Promise<void>;  // 添加/更新
  remove(providerId: string): Promise<void>;         // 移除
  setActive(providerId: string): Promise<void>;      // 切换激活

  // 对外接口
  getActive(): VideoProvider;               // 获取当前激活的 Provider
  getAll(): ProviderSummary[];              // 所有已配置的 Provider
  getSupportedProviders(): ProviderSummary[];  // 所有支持的（含未配置）
}
```

### 5.5 配置存储

```json
// {userData}/providers.json
{
  "activeId": "kling",
  "providers": [
    {
      "id": "kling",
      "enabled": true,
      "apiKey": "ak_xxx",
      "apiSecret": "sk_xxx",
      "model": "kling-v2",
      "defaults": { "resolution": "1080p", "fps": 25, "durationSec": 5 }
    },
    {
      "id": "jimeng",
      "enabled": true,
      "apiKey": "AKLTxxx",
      "apiSecret": "xxx",
      "model": "jimeng-v3",
      "defaults": { "resolution": "1080p", "durationSec": 5 }
    }
  ]
}
```

**API Key 安全存储：**
- macOS: Keychain
- Windows: DPAPI (Credential Manager)
- Linux: libsecret 或降级为 AES-256-GCM 加密文件

### 5.6 扩展新厂商

只需 3 步：

```typescript
// 1. 新建 Provider 文件
export class NewProvider implements VideoProvider {
  readonly id = 'new_provider';
  // ... 实现接口方法（约 150-250 行）
}

// 2. 在 registry.ts 注册
private static builtinProviders = {
  'kling': KlingProvider,
  'jimeng': JimengProvider,
  'new_provider': NewProvider,  // ← 加这一行
};

// 3. 在前端配置 UI 中添加选项
```

### 5.7 失败降级策略

```typescript
// PipelineRunner 中的降级逻辑
async renderActionShot(shot: Shot): Promise<ShotResult> {
  const providers = this.getPrioritizedProviders();
  
  for (const provider of providers) {
    try {
      return await provider.imageToVideo(request);
    } catch (err) {
      this.emit('provider:fallback', { from: provider.id, to: next?.id, error: err });
      continue;  // 尝试下一个
    }
  }
  
  // 所有都失败 → 降级为 2.5D 动态化
  return this.renderAsTransition(shot);
}
```

---

## 6. 音频引擎 — TTS + 口型同步

### 6.1 TTS 方案

| 方案 | 中文质量 | 情感控制 | 多角色 | 部署方式 | 推荐 |
|------|---------|---------|--------|---------|------|
| **CosyVoice 2** | ★★★★★ | ★★★★ | ✅ | 本地部署 | 🥇 首选 |
| **GPT-SoVITS** | ★★★★ | ★★★ | ✅ | 本地部署 | 🥈 音色克隆 |
| **火山引擎 TTS** | ★★★★★ | ★★★★ | ✅ | 云端 API | 🥉 云端降级 |
| **微软 Azure TTS** | ★★★★ | ★★★ | ✅ | 云端 API | 多语言场景 |

### 6.2 配音 Pipeline

```
分镜脚本 (含台词 + 情绪标签)
  ↓
台词分段: 按角色 + 情绪切分
  ↓
SSML 标记: 语速/停顿/重音控制
  ↓
角色声线映射: 角色A→音色X, 角色B→音色Y
  ↓
并行 TTS 调用: CosyVoice 2 本地推理
  ↓
音频片段: shot_003/audio.mp3 (含时长元数据)
```

### 6.3 口型同步 — MuseTalk

```
输入: 角色静态图 (1920x1080) + TTS 音频 (mp3/wav)
  ↓
MuseTalk Pipeline:
  1. 人脸检测 + 关键点提取
  2. 音频特征提取 (wav2vec 2.0)
  3. 面部动画生成 (UNet + GAN)
  4. 图像合成 + 后处理
  ↓
输出: 说话视频 (25fps, 与音频等长)
```

**适用条件：**
- ✅ 正面 / 半侧面（偏转 < 45°）
- ✅ 单个角色在画面中
- ❌ 纯侧面 / 背面
- ❌ 多角色同时说话
- ❌ 角色脸部被遮挡

### 6.4 音频后处理

```
BGM 匹配: 根据章节 moodArc 自动选曲
  - rising → 激昂交响
  - tension → 紧张弦乐
  - release → 舒缓钢琴
  - sad → 悲伤大提琴

音效叠加:
  - 环境音: 雨声/风声/市集嘈杂
  - 动作音: 脚步声/剑击声/龙吼

多轨混音:
  - 对白轨 (0dB, 居中)
  - BGM 轨 (-12dB, 立体声)
  - 音效轨 (-6dB, 动态 Pan)
```

---

## 7. 视频生成与组装引擎

### 7.1 分镜渲染策略矩阵

| 镜头类型 | 占比 | 渲染方案 | 工具 | 每次耗时 | 成本 |
|---------|------|---------|------|---------|------|
| **dialogue** (对白) | ~40% | 生成角色图 → TTS → MuseTalk 口型同步 | Python Sidecar | 10-30s | 0 |
| **action** (动作) | ~20% | 生成首帧图 → 图生视频 API | 可灵/即梦/万相 | 30-120s | ¥0.5-2/s |
| **transition** (过渡) | ~20% | 场景图 → 深度估计 → 视差动画 | Python Sidecar | 5-10s | 0 |
| **narration** (旁白) | ~10% | 多张静态图序列 | Python Sidecar | 3-5s | 0 |
| **establishing** (定场) | ~5% | 广角图 → Ken Burns 动画 | Python Sidecar | 5-8s | 0 |
| **other** (其他) | ~5% | 酌情处理 | — | — | — |

### 7.2 2.5D 深度动画

```
输入: 静态场景图
  ↓
Depth-Anything 深度估计 → 生成深度图
  ↓
视差位移算法:
  - 根据深度图计算每个像素的位移向量
  - 近景位移大 (1.0x), 远景位移小 (0.2x)
  ↓
运动模式:
  - zoom_in: 中心放大（适合情感递进）
  - pan_left/right: 平移（适合场景展示）
  - ken_burns: 随机缩放+平移（适合叙事过渡）
  - parallax: 多层视差（适合丰富场景）
  ↓
输出: 25fps 视频片段
```

### 7.3 视频组装

```
输入: N 个分镜视频片段 + N 个音频片段 + BGM + 音效
  ↓
FFmpeg 组装:
  1. concat: 拼接所有视频片段
  2. transition: 添加转场效果
     - fade: 黑场淡入淡出 (1s)
     - dissolve: 交叉溶解 (0.5s)
     - wipe_left: 左滑 (0.3s)
     - zoom_blur: 模糊过渡 (0.5s)
  3. audio: 合并所有音轨 + 音量均衡
  4. subtitle: 烧录 ASS 字幕 (对白 + 角色标签)
  5. encode: H.264/H.265 编码输出
  ↓
输出: exports/final_1080p.mp4
```

**FFmpeg 命令示例：**

```bash
# 拼接 + 转场 + 字幕
ffmpeg \
  -f concat -safe 0 -i concat_list.txt \
  -i bgm.mp3 -i sfx.mp3 \
  -filter_complex "
    [0:v]concat=n=N:v=1:a=0[raw];
    [raw]ass=subtitles.ass[v];
    [1:a][2:a]amix=inputs=2:duration=first[a]
  " \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset medium -crf 20 \
  -c:a aac -b:a 192k \
  final_1080p.mp4
```

---

## 8. 零依赖存储设计

### 8.1 设计原则

- **一个项目 = 一个文件夹**
- **一个 JSON 文件 = 所有元数据**
- **文件系统 = 唯一持久化层**
- **无 SQLite、无 IndexedDB、无任何数据库引擎**

### 8.2 项目目录结构

```
MyVideoProject/
├── project.json                 # 唯一数据文件（剧本 + 角色 + 分镜 + 状态）
├── characters/                  
│   └── hero/
│       ├── reference.png        # 角色基准图
│       ├── embedding.pt         # IPAdapter FaceID Embedding (二进制)
│       └── lora.safetensors     # 角色 LoRA 权重 (可选)
├── shots/                       
│   ├── shot_001/
│   │   ├── image.png            # 分镜静态图
│   │   ├── audio.mp3            # TTS 配音
│   │   └── video.mp4            # 渲染后的视频片段
│   └── shot_002/
│       └── ...
├── audio/
│   ├── bgm/                     # 背景音乐素材
│   └── sfx/                     # 音效素材
├── exports/
│   ├── preview_720p.mp4
│   └── final_1080p.mp4
├── .cache/                      # 可安全删除的缓存
│   └── thumbnails/
└── logs/
    └── pipeline.log
```

### 8.3 project.json 结构

```json
{
  "version": 1,
  "id": "uuid",
  "title": "...",
  "style": "anime",
  "duration_target_sec": 300,
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  
  "outline": { /* StoryOutline */ },
  
  "characters": [
    {
      "id": "char_hero",
      "name": "...",
      "appearanceDetail": { /* ... */ },
      "reference_image": "characters/hero/reference.png",
      "embedding_path": "characters/hero/embedding.pt"
    }
  ],
  
  "script": {
    "chapters": [
      {
        "order": 1,
        "title": "...",
        "shots": [
          {
            "id": "shot_001",
            "status": "done",
            "shot_type": "dialogue",
            "sceneDescription": "...",
            "dialogue": [{ "characterId": "char_hero", "text": "...", "tone": "calm" }],
            "camera": { "shotSize": "medium", "angle": "eye_level", "movement": "static" },
            "imagePrompt": {
              "positive": "masterpiece, ...",
              "negative": "low quality, ...",
              "decomposition": { /* ... */ }
            },
            "assets": {
              "image": "shots/shot_001/image.png",
              "audio": "shots/shot_001/audio.mp3",
              "video": "shots/shot_001/video.mp4"
            }
          }
        ]
      }
    ]
  },
  
  "pipeline_state": {
    "phase": "rendering",
    "total_shots": 40,
    "completed_shots": 12,
    "failed_shots": 1,
    "estimated_remaining_sec": 180
  }
}
```

### 8.4 为什么 JSON 文件足够

| 传统数据库能力 | 纯客户端替代方案 |
|---------------|-----------------|
| CRUD | `fs.readFile` / `fs.writeFile` |
| 索引/查询 | 读入内存（一个项目最多几百条分镜，毫秒级遍历） |
| 事务 | 写临时文件 → 原子 `rename`（POSIX 保证原子性） |
| 备份 | 复制整个项目文件夹 |
| 迁移 | 文件夹拷贝到另一台电脑，直接打开 |
| 版本控制 | `git init` 即可版本管理 |

### 8.5 原子写入

```typescript
async saveProject(): Promise<void> {
  const tmpPath = path.join(this.projectPath, '.project.json.tmp');
  const realPath = path.join(this.projectPath, 'project.json');
  
  this.project.updated_at = new Date().toISOString();
  await fs.writeFile(tmpPath, JSON.stringify(this.project, null, 2));
  await fs.rename(tmpPath, realPath); // POSIX 原子 rename
}
```

---

## 9. 进程内 Pipeline Runner

### 9.1 设计要点

`PipelineRunner` 运行在 Electron 主进程中，**没有任何外部依赖**。替代了传统服务端架构中的 Celery/Redis/RabbitMQ。

### 9.2 核心实现

```typescript
class PipelineRunner extends EventEmitter {
  private project: Project;
  private pythonPort: number;
  private concurrency: number;          // 并行数（受 GPU 显存限制）
  private paused: boolean = false;
  private abortController: AbortController;

  async run(): Promise<void> {
    // Phase 1: 剧本生成 (串行)
    if (this.needsScriptGeneration()) await this.generateScript();
    
    // Phase 2: 角色生成 (并行所有角色)
    await this.generateCharacters();
    
    // Phase 3: 分镜渲染 (章节内并行，受 Semaphore 控制)
    for (const chapter of this.project.script.chapters) {
      await this.processBatch(chapter.shots.filter(s => s.status !== 'done'));
    }
    
    // Phase 4: 组装导出
    await this.composite();
  }

  private async processBatch(shots: Shot[]): Promise<void> {
    const semaphore = new Semaphore(this.concurrency);
    
    await Promise.all(shots.map(shot =>
      semaphore.run(async () => {
        shot.status = 'rendering';
        await this.saveProject();  // 状态持久化
        
        try {
          const result = await this.renderShot(shot);
          shot.status = 'done';
          shot.assets = result.assets;
        } catch (err) {
          shot.status = 'failed';
          shot.error = err.message;
        }
        
        await this.saveProject();  // 每完成一个就存盘
        this.emit('shot:complete', shot.id);
      })
    ));
  }
}
```

### 9.3 并发控制

```typescript
// Semaphore — 自己实现的轻量并发控制
class Semaphore {
  private permits: number;
  private waiting: (() => void)[] = [];

  constructor(count: number) {
    this.permits = count;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try { return await fn(); }
    finally { this.release(); }
  }

  private async acquire(): Promise<void> {
    if (this.permits > 0) { this.permits--; return; }
    await new Promise<void>(resolve => this.waiting.push(resolve));
    this.permits--;
  }

  private release(): void {
    this.permits++;
    this.waiting.shift()?.();
  }
}
```

### 9.4 关键特性

| 特性 | 实现方式 |
|------|---------|
| **并发控制** | Semaphore 限制同时渲染的分镜数（GPU 显存自适应） |
| **崩溃恢复** | 每个 Shot 完成后立即原子存盘，重启只跑未完成的 |
| **暂停/继续** | `paused` 标志 + Promise 等待 |
| **取消** | `AbortController` 传递到所有子调用 |
| **进度推送** | EventEmitter → IPC → 渲染进程 UI 更新 |
| **失败重试** | 自动重试 3 次，仍然失败标记为 `failed` |

---

## 10. Python Sidecar — GPU 能力层

### 10.1 架构

一个独立的 Python 进程，Electron 启动时 spawn，通过 localhost HTTP 暴露 AI 能力。所有模型在启动时预热，运行时零加载延迟。

### 10.2 API 端点

| 端点 | 方法 | 功能 | 耗时 |
|------|------|------|------|
| `/health` | GET | 健康检查 + GPU 状态 | <1ms |
| `/generate_image` | POST | 生成角色/场景图片（含 IPAdapter） | 2-8s |
| `/generate_tts` | POST | 文本转语音（CosyVoice 2） | 1-3s |
| `/musetalk` | POST | 口型同步视频生成 | 5-15s |
| `/depth_animate` | POST | 2.5D 深度动画生成 | 3-8s |
| `/extract_face_embedding` | POST | 提取角色 FaceID Embedding | 2-5s |

### 10.3 启动流程

```
Electron Main Process:
  ↓
  spawn('python3', ['sidecar/main.py'])
  ↓
  stdout: {"port": 18923, "ready": true}
  ↓
  Main Process 记录端口号 → PipelineRunner 通过 localhost:18923 调用

Python Sidecar 启动时:
  1. 加载 SDXL Base → 显存 (约 6GB)
  2. 加载 IPAdapter FaceID Plus → 显存 (约 1GB)
  3. 加载 CosyVoice 2 → 显存 (约 2GB)
  4. 加载 MuseTalk → 显存 (约 3GB)
  5. 加载 Depth-Anything → 显存 (约 2GB)
  总显存占用: 约 14GB (推荐 A6000 48GB, 可并行 2-3 个任务)
```

### 10.4 与 Electron 通信

```
通信方式: HTTP (localhost only, 不对外暴露)
数据格式: JSON (元数据) + 文件路径 (大文件)
并发模型: Flask 内置多线程 (gunicorn 生产优化)

// TypeScript 侧调用
async callPython(endpoint: string, data: object): Promise<any> {
  const res = await fetch(`http://127.0.0.1:${this.pythonPort}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: this.abortController.signal
  });
  return res.json();
}

// Python 侧处理
@app.route('/generate_image', methods=['POST'])
def generate_image():
    data = request.json
    image = sd_pipeline.generate(
        prompt=data['prompt'],
        ipadapter_embedding=data.get('embedding_id')
    )
    output_path = Path(data['output_dir']) / 'image.png'
    image.save(output_path)
    return jsonify({'path': str(output_path), 'status': 'ok'})
```

### 10.5 依赖管理

```bash
# sidecar/requirements.txt
torch==2.4.0+cu121
diffusers==0.30.0
transformers==4.45.0
accelerate==0.34.0

# IPAdapter
ip-adapter==0.2.0

# CosyVoice
cosyvoice==2.0.0

# MuseTalk (需要额外配置)
# git clone + pip install -e .

# Depth-Anything
timm==0.9.16

# Web Server
flask==3.0.0
gunicorn==22.0.0  # 生产环境

# Utils
pillow==10.4.0
soundfile==0.12.1
opencv-python==4.10.0
```

---

## 11. 前端交互设计

### 11.1 页面结构

```
┌─────────────────────────────────────────┐
│  📁 项目列表                             │
│  ├─ 新建项目                             │
│  ├─ 打开项目                             │
│  └─ 最近项目                             │
├─────────────────────────────────────────┤
│  ⚙️ 设置                                 │
│  ├─ LLM API 配置                        │
│  ├─ 视频生成 Provider 配置               │
│  ├─ 语音配置                             │
│  ├─ Python Sidecar 管理                  │
│  └─ 导出设置                             │
├─────────────────────────────────────────┤
│  🎬 项目工作区 (5 个 Tab)                │
│  ├─ Tab 1: 剧本编辑器                    │
│  │   ├─ Layer 1: 大纲 (角色卡片 + 节拍图) │
│  │   ├─ Layer 2: 章节 (分镜列表)         │
│  │   ├─ Layer 3: 分镜详情 (镜头 + 台词)  │
│  │   └─ Layer 4: SD Prompt 预览         │
│  ├─ Tab 2: 角色管理                      │
│  │   ├─ 角色卡片 (基准图 + 变体)          │
│  │   └─ 角色编辑器 (外貌 + 声线)         │
│  ├─ Tab 3: 渲染进度                      │
│  │   ├─ Pipeline 可视化                  │
│  │   └─ 分镜级进度 + 预览               │
│  ├─ Tab 4: 预览                          │
│  │   ├─ 低分辨率实时预览                  │
│  │   └─ 分镜检查 + 标记重拍              │
│  └─ Tab 5: 导出                          │
│      ├─ 分辨率/格式选择                   │
│      └─ 一键导出                         │
└─────────────────────────────────────────┘
```

### 11.2 关键交互

- **故事板拖拽排序**：`react-beautiful-dnd` 实现分镜拖拽调整顺序
- **逐层审核**：每层 LLM 生成后展示结果 → 用户编辑 → 确认 → 触发下层
- **实时进度**：Electron IPC 推送 `shot:start` / `shot:done` / `shot:error` 事件
- **分镜预览**：Video.js 播放已渲染的分镜片段
- **角色一致性检查**：角色基准图 vs 分镜生成图的并排对比

### 11.3 技术栈

```
React 18 + TypeScript
Zustand (状态管理, 替代 Redux)
Tailwind CSS (样式)
react-beautiful-dnd (拖拽)
Video.js (视频预览)
```

---

## 12. 两种部署模式

### 12.1 模式对比

| | 🖥️ 本地模式 | ☁️ 云端模式 |
|---|---|---|
| **需要 GPU** | NVIDIA 8GB+ VRAM | 不需要 |
| **安装包大小** | ~30GB (含模型) | ~500MB |
| **角色一致性** | ★★★★★ (IPAdapter) | ★★★ (依赖 API 能力) |
| **5 分钟视频成本** | ~¥2-5 | ~¥50-200 |
| **数据隐私** | 全部本地 | 部分上传云端 |
| **离线可用** | 大部分离线 | 需要网络 |

### 12.2 模式自动检测

```typescript
async function bootstrap() {
  const hasGPU = await detectNvidiaGPU();

  if (hasGPU && hasEnoughVRAM(8)) {
    // 本地模式：启动 Python Sidecar
    const { port } = await spawnPythonSidecar('python3');
    app.locals.pythonPort = port;
    app.locals.mode = 'local';
  } else {
    // 云端模式：全部走第三方 API
    app.locals.mode = 'cloud';
    // 角色图 → Midjourney / 即梦 API
    // 视频 → 可灵 / 即梦 API
    // TTS → 火山引擎 API
    // 口型同步 → HeyGen API
  }
}

async function detectNvidiaGPU(): Promise<boolean> {
  try {
    const { stdout } = await exec('nvidia-smi --query-gpu=memory.total --format=csv,noheader');
    return parseInt(stdout) > 0;
  } catch {
    return false;
  }
}
```

---

## 13. 技术栈清单

```
┌─────────────────────────────────────────────────┐
│              技术栈一览                           │
├─────────────────────────────────────────────────┤
│                                                   │
│  📦 桌面框架                                      │
│     Electron 28+  (Node.js 20+, Chromium 120+)   │
│     electron-builder  (dmg/exe/AppImage 打包)     │
│                                                   │
│  🎨 前端 UI (Renderer Process)                    │
│     React 18 + TypeScript                        │
│     Zustand  (状态管理)                           │
│     Tailwind CSS  (样式)                          │
│     react-beautiful-dnd  (故事板拖拽)             │
│     Video.js  (视频预览)                          │
│                                                   │
│  🧠 AI 引擎 (Python Sidecar)                      │
│     Python 3.11 + Flask                          │
│     diffusers + SDXL (图像生成)                   │
│     IP-Adapter-FaceID-Plus (角色一致性)           │
│     CosyVoice 2 (TTS)                            │
│     MuseTalk (口型同步)                           │
│     Depth-Anything (深度估计)                     │
│                                                   │
│  ☁️ 外部 API (Main Process 直接调用)              │
│     Claude / GPT API (剧本生成)                   │
│     快手可灵 API (视频生成)                       │
│     字节即梦 API (视频生成)                       │
│     阿里万相 API (视频生成)                       │
│     火山引擎 TTS (云端降级)                       │
│                                                   │
│  🎬 视频处理 (Main Process)                       │
│     FFmpeg (child_process)                       │
│     fluent-ffmpeg (Node.js 封装)                  │
│                                                   │
│  💾 存储                                         │
│     文件系统 + JSON (零数据库)                    │
│     fs.promises (Node.js 内置)                    │
│     Electron safeStorage (API Key 加密)           │
│                                                   │
│  🔧 开发工具                                      │
│     pnpm (monorepo 包管理)                        │
│     TypeScript 5.x                                │
│     ESLint + Prettier                             │
│     electron-vite (构建工具)                       │
│                                                   │
└─────────────────────────────────────────────────┘
```

---

## 14. 关键技术难点与对策

| 难点 | 风险等级 | 根因 | 对策 |
|------|---------|------|------|
| **角色一致性漂移** | 🔴 高 | SD 生成的随机性 + Prompt 漂移 | IPAdapter FaceID embedding 固化 + ArcFace 相似度校验 + 不合格自动重试 |
| **长视频质量滑坡** | 🟡 中 | LLM 长输出质量下降 | 分层生成 + 分段 LLM 调用 + 人工审核节点 |
| **口型同步不稳定** | 🟡 中 | MuseTalk 对侧面/遮挡角度支持有限 | 正面/半正面镜头用 MuseTalk，侧面降级为画外音 + 反应镜头 |
| **视频生成 API 限速** | 🟡 中 | 各家 API QPS 限制不同 | 多 Provider 轮转 + 本地 Queue 排队 + 失败自动切换 |
| **大文件 IO 阻塞** | 🟢 低 | 视频文件读写可能阻塞 Event Loop | Worker Threads 处理 FFmpeg + 流式读写 |
| **Python 进程崩溃** | 🟢 低 | GPU OOM 或模型 bug | 主进程监控 + 自动重启 + 状态恢复 |
| **首次启动慢** | 🟢 低 | 本地模式需下载模型 | 后台下载 + 进度提示 + 云端模式作为过渡 |
| **安装包过大** | 🟢 低 | 本地模型文件 ~30GB | 按需下载模型 + 云端模式作为轻量版 |

---

## 15. 实施路线图

```
Phase 1: MVP (2-3 月)
├─ Electron 项目框架搭建 (main + renderer + preload)
├─ JSON 文件存储 + ProjectManager
├─ LLM 剧本引擎 (ScriptOptimizer 4层)
├─ Python Sidecar 核心 (SDXL + CosyVoice 2)
├─ 角色引擎 (IPAdapter FaceID)
├─ PipelineRunner (基本流程 + Semaphore)
├─ FFmpeg 组装 + 字幕
├─ 基础 UI (剧本编辑器 + 预览)
└─ 交付: 可生成 2-5 分钟故事视频

Phase 2: 增强 (3-6 月)
├─ 多厂商视频生成 Provider (可灵/即梦/万相)
├─ MuseTalk 口型同步集成
├─ 2.5D 深度动画
├─ 智能转场 + BGM 自动匹配
├─ 角色 LoRA 训练 (高一致性)
├─ AI 自动审核分镜质量
├─ 云端模式 (无 GPU 可用)
└─ 交付: 完整生产能力的视频生成工具

Phase 3: 规模化 (6-12 月)
├─ 自定义角色库 + 角色复用
├─ 视频模板系统
├─ 批量项目队列
├─ 模板市场 / 社区
├─ 多语言剧本支持 (英/日/韩)
├─ 插件系统 (自定义 Provider / Effect)
├─ 性能优化 (GPU 显存管理 / 增量渲染)
└─ 交付: 可分发产品 + 社区生态
```

---

## 16. 附录

### 16.1 API Key 申请指南

| 厂商 | 平台 | Key 类型 | 获取路径 |
|------|------|---------|---------|
| **Anthropic (Claude)** | console.anthropic.com | API Key | Settings → API Keys |
| **OpenAI (GPT)** | platform.openai.com | API Key | API Keys → Create |
| **快手可灵** | platform.klingai.com | AK + SK | 开放平台 → 创建应用 |
| **字节即梦** | console.volcengine.com | AK + SK | 视觉智能 → 即梦 → 密钥管理 |
| **阿里万相** | dashscope.aliyun.com | API Key | 灵积平台 → API-KEY 管理 |
| **智谱清影** | open.bigmodel.cn | API Key | 开发者中心 → API Keys |

### 16.2 模型下载清单（本地模式）

| 模型 | 大小 | 用途 | 下载地址 |
|------|------|------|---------|
| SDXL Base 1.0 | ~13GB | 图像生成 | huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 |
| IPAdapter FaceID Plus | ~1.5GB | 角色一致性 | huggingface.co/h94/IP-Adapter |
| CosyVoice 2 | ~3GB | TTS 中文配音 | modelscope.cn (阿里) |
| MuseTalk | ~2GB | 口型同步 | github.com/TMElyralab/MuseTalk |
| Depth-Anything Large | ~1.3GB | 深度估计 | huggingface.co/LiheYoung/depth-anything-large |

### 16.3 最低硬件要求（本地模式）

| 组件 | 最低 | 推荐 |
|------|------|------|
| GPU | NVIDIA RTX 3060 12GB | NVIDIA A6000 48GB |
| RAM | 16GB | 32GB+ |
| 磁盘 | 50GB 空闲 | 100GB+ SSD |
| CPU | 8 核 | 16 核+ |
| OS | Windows 10+ / macOS 13+ / Ubuntu 22.04+ |

### 16.4 成本对比（5 分钟视频, 40 分镜）

| 模式 | LLM 剧本 | 角色图 | 分镜图 | 视频生成 | TTS | 总计 |
|------|---------|--------|--------|---------|-----|------|
| **本地模式** | ~$0.15 | ¥0 | ¥0 | ¥8-16 (API) | ¥0 | **~¥8-16** |
| **云端模式** | ~$0.15 | ¥2-5 | ¥5-10 | ¥30-100 | ¥2-5 | **~¥40-120** |

---

## 项目文件结构（建议）

```
video-ai-studio/
├── electron/
│   ├── main/                          # Electron 主进程
│   │   ├── index.ts                   # 入口
│   │   ├── project-manager.ts         # 项目管理 + JSON 读写
│   │   ├── pipeline-runner.ts         # Pipeline 编排
│   │   ├── python-spawner.ts          # Python Sidecar 管理
│   │   ├── ffmpeg-controller.ts       # FFmpeg 封装
│   │   ├── script-optimizer/
│   │   │   ├── optimizer.ts           # ScriptOptimizer 主类
│   │   │   ├── prompts.ts             # Prompt 模板
│   │   │   ├── prompt-builder.ts      # SD Prompt 组装
│   │   │   ├── llm-client.ts          # LLM API 客户端
│   │   │   └── types.ts               # 数据结构定义
│   │   ├── providers/
│   │   │   ├── registry.ts            # VideoProviderRegistry
│   │   │   ├── types.ts               # Provider 接口定义
│   │   │   ├── kling-provider.ts      # 快手可灵
│   │   │   ├── jimeng-provider.ts     # 字节即梦
│   │   │   └── wanxiang-provider.ts   # 阿里万相
│   │   ├── secure-storage.ts          # API Key 安全存储
│   │   └── utils/
│   │       ├── semaphore.ts           # 并发控制
│   │       └── logger.ts
│   └── preload/
│       └── index.ts                   # contextBridge API
│
├── src/                               # React 渲染进程
│   ├── App.tsx
│   ├── pages/
│   │   ├── HomePage.tsx               # 项目列表
│   │   ├── WorkspacePage.tsx          # 项目工作区 (5 Tab)
│   │   └── SettingsPage.tsx           # 设置
│   ├── components/
│   │   ├── StoryboardEditor.tsx       # 故事板编辑器
│   │   ├── ShotCard.tsx               # 分镜卡片
│   │   ├── CharacterCard.tsx          # 角色卡片
│   │   ├── PipelineProgress.tsx       # Pipeline 进度
│   │   ├── ProviderConfig.tsx         # Provider 配置 UI
│   │   └── VideoPreview.tsx           # 视频预览
│   ├── stores/
│   │   └── project-store.ts           # Zustand Store
│   └── types/
│       └── electron.d.ts              # IPC 类型声明
│
├── sidecar/                           # Python AI 引擎
│   ├── main.py                        # Flask 入口
│   ├── requirements.txt
│   ├── models/                        # 模型缓存目录 (gitignored)
│   ├── workers/
│   │   ├── image_generator.py         # SDXL + IPAdapter
│   │   ├── tts_engine.py              # CosyVoice 2
│   │   ├── musetalk_pipeline.py       # 口型同步
│   │   └── depth_animator.py          # 2.5D 动画
│   └── utils/
│       └── model_loader.py
│
├── package.json
├── electron-builder.yml               # 打包配置
├── tsconfig.json
└── README.md
```
