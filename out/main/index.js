import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join, dirname } from "path";
import { is } from "@electron-toolkit/utils";
import { promises, existsSync, mkdirSync, appendFileSync } from "fs";
import { randomUUID } from "crypto";
import { spawn, execFile } from "child_process";
import { EventEmitter } from "events";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
class ProjectManager {
  project = null;
  projectPath = null;
  /** 默认项目存储目录 */
  get projectsDir() {
    return join(app.getPath("documents"), "VideoAIStudio", "projects");
  }
  /** 确保项目目录存在 */
  async ensureDir(dir) {
    await promises.mkdir(dir, { recursive: true });
  }
  /** 列出所有项目 */
  async listProjects() {
    const dir = this.projectsDir;
    try {
      await promises.access(dir);
    } catch {
      return [];
    }
    const entries = await promises.readdir(dir, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectFile = join(dir, entry.name, "project.json");
      try {
        const data = await promises.readFile(projectFile, "utf-8");
        const proj = JSON.parse(data);
        items.push({
          id: proj.id,
          title: proj.title,
          path: join(dir, entry.name),
          createdAt: proj.createdAt,
          updatedAt: proj.updatedAt,
          durationTargetSec: proj.durationTargetSec,
          pipelineState: proj.pipelineState
        });
      } catch {
      }
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  /** 创建新项目 */
  async createProject(title, durationTargetSec = 300, style = "anime") {
    const id = randomUUID();
    const dirName = `${this.sanitize(title)}_${id.slice(0, 8)}`;
    const projectDir = join(this.projectsDir, dirName);
    await this.ensureDir(join(projectDir, "characters"));
    await this.ensureDir(join(projectDir, "shots"));
    await this.ensureDir(join(projectDir, "audio", "bgm"));
    await this.ensureDir(join(projectDir, "audio", "sfx"));
    await this.ensureDir(join(projectDir, "exports"));
    await this.ensureDir(join(projectDir, ".cache", "thumbnails"));
    await this.ensureDir(join(projectDir, "logs"));
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const project = {
      version: 1,
      id,
      title,
      style,
      durationTargetSec,
      createdAt: now,
      updatedAt: now,
      characters: [],
      pipelineState: {
        phase: "idle",
        totalShots: 0,
        completedShots: 0,
        failedShots: 0,
        estimatedRemainingSec: 0
      }
    };
    this.project = project;
    this.projectPath = projectDir;
    await this.saveProject();
    return project;
  }
  /** 打开已有项目 */
  async openProject(projectDir) {
    const projectFile = join(projectDir, "project.json");
    const data = await promises.readFile(projectFile, "utf-8");
    const project = JSON.parse(data);
    this.project = project;
    this.projectPath = projectDir;
    return project;
  }
  /** 获取当前项目 */
  getProject() {
    return this.project;
  }
  /** 获取当前项目路径 */
  getProjectPath() {
    return this.projectPath;
  }
  /** 原子写入 project.json */
  async saveProject() {
    if (!this.project || !this.projectPath) {
      throw new Error("No project loaded");
    }
    this.project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const tmpPath = join(this.projectPath, ".project.json.tmp");
    const realPath = join(this.projectPath, "project.json");
    const content = JSON.stringify(this.project, null, 2);
    await promises.writeFile(tmpPath, content, "utf-8");
    await promises.rename(tmpPath, realPath);
  }
  /** 更新项目（合并部分数据） */
  async updateProject(partial) {
    if (!this.project) throw new Error("No project loaded");
    Object.assign(this.project, partial);
    await this.saveProject();
  }
  /** 更新 Pipeline 状态 */
  async updatePipelineState(state) {
    if (!this.project) throw new Error("No project loaded");
    Object.assign(this.project.pipelineState, state);
    await this.saveProject();
  }
  /** 确保分镜目录存在 */
  async ensureShotDir(shotId) {
    if (!this.projectPath) throw new Error("No project loaded");
    const dir = join(this.projectPath, "shots", shotId);
    await this.ensureDir(dir);
    return dir;
  }
  /** 确保角色目录存在 */
  async ensureCharacterDir(characterId) {
    if (!this.projectPath) throw new Error("No project loaded");
    const dir = join(this.projectPath, "characters", characterId);
    await this.ensureDir(dir);
    return dir;
  }
  /** 文件名安全化 */
  sanitize(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 50);
  }
}
class PythonSpawner extends EventEmitter {
  process = null;
  port = 18923;
  ready = false;
  /** 启动 Python Sidecar */
  async start(pythonCmd = "python") {
    const sidecarDir = join(__dirname, "..", "..", "sidecar");
    const script = join(sidecarDir, "main.py");
    return new Promise((resolve, reject) => {
      this.process = spawn(pythonCmd, [script], {
        env: {
          ...process.env,
          SIDECAR_PORT: String(this.port)
        },
        stdio: ["pipe", "pipe", "pipe"]
      });
      let stdoutBuf = "";
      this.process.stdout?.on("data", (data) => {
        stdoutBuf += data.toString();
        if (!this.ready && stdoutBuf.includes('"ready"')) {
          try {
            const line = stdoutBuf.split("\n").find((l) => l.includes('"ready"'));
            if (line) {
              const info = JSON.parse(line);
              this.port = info.port || this.port;
              this.ready = true;
              this.emit("ready", info);
              resolve({
                port: this.port,
                mode: info.mode || "mock",
                ready: true
              });
            }
          } catch {
          }
        }
      });
      this.process.stderr?.on("data", (data) => {
        console.error("[Sidecar stderr]", data.toString());
      });
      this.process.on("error", (err) => {
        this.emit("error", err);
        if (!this.ready) reject(err);
      });
      this.process.on("exit", (code) => {
        this.ready = false;
        this.emit("exit", code);
      });
      setTimeout(() => {
        if (!this.ready) {
          reject(new Error("Python sidecar 启动超时 (15s)"));
        }
      }, 15e3);
    });
  }
  /** 调用 Sidecar API */
  async call(endpoint, data) {
    if (!this.ready) throw new Error("Sidecar not ready");
    const res = await fetch(`http://127.0.0.1:${this.port}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Sidecar ${endpoint} error ${res.status}: ${errText}`);
    }
    return res.json();
  }
  /** 健康检查 */
  async healthCheck() {
    if (!this.ready) return { status: "not_ready" };
    const res = await fetch(`http://127.0.0.1:${this.port}/health`);
    return res.json();
  }
  /** 停止 Sidecar */
  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.ready = false;
    }
  }
  get isReady() {
    return this.ready;
  }
  get sidecarPort() {
    return this.port;
  }
}
class LLMClient {
  constructor(config) {
    this.config = config;
  }
  /** 发送聊天请求 */
  async chat(messages, options) {
    const { provider, apiKey, baseUrl, model } = this.config;
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;
    switch (provider) {
      case "claude":
        return this.callClaude(messages, apiKey, model, temperature, maxTokens);
      case "openai":
        return this.callOpenAI(messages, apiKey, baseUrl, model, temperature, maxTokens);
      case "custom":
        return this.callOpenAI(messages, apiKey, baseUrl, model, temperature, maxTokens);
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }
  /** Claude API */
  async callClaude(messages, apiKey, model, temperature, maxTokens) {
    const sysMsg = messages.find((m) => m.role === "system");
    const nonSysMsgs = messages.filter((m) => m.role !== "system");
    const body = {
      model: model || "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      temperature,
      messages: nonSysMsgs.map((m) => ({ role: m.role, content: m.content }))
    };
    if (sysMsg) body.system = sysMsg.content;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return {
      content: data.content[0]?.text || "",
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0
    };
  }
  /** OpenAI / 兼容 API */
  async callOpenAI(messages, apiKey, baseUrl, model, temperature, maxTokens) {
    const url = (baseUrl || "https://api.openai.com").replace(/\/$/, "") + "/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens: maxTokens
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return {
      content: data.choices[0]?.message?.content || "",
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0
    };
  }
}
const LAYER1_SYSTEM = `你是一位资深的故事分析师和编剧。

### 关键原则
- 角色外貌描述必须足够详细，能够直接用于 AI 图像生成
  - 必须包含：性别、年龄、身高、体型、发型发色、眼睛、服装风格、配饰
  - 使用具体的视觉词汇，如"黑色长发扎成高马尾"而非"长头发"
- 故事节拍符合三幕结构，有明显的起承转合
- 预估总时长合理（中文配音约 3-4 字/秒）
- 严格输出 JSON，不要 markdown 代码块标记

### 输出格式 (JSON)
{
  "logline": "一句话梗概",
  "theme": "故事主题",
  "visualStyle": "视觉风格描述",
  "worldSetting": {
    "era": "时代",
    "location": "地点",
    "atmosphere": "氛围",
    "rules": "世界观规则"
  },
  "characters": [
    {
      "id": "char_1",
      "name": "角色名",
      "role": "protagonist|antagonist|supporting|narrator",
      "personality": "性格描述",
      "appearance": "简要外貌描述",
      "appearanceDetail": {
        "gender": "", "age": "", "height": "", "build": "",
        "face": "", "hair": "", "eyes": "", "clothing": "",
        "accessories": "", "distinctiveFeatures": ""
      },
      "voiceDescription": "声线描述",
      "relationships": []
    }
  ],
  "outline": [
    { "order": 1, "name": "节拍名称", "description": "节拍描述", "emotionalTone": "情绪" }
  ],
  "estimatedDuration": 300
}`;
function buildLayer1Messages(userInput) {
  return [
    { role: "system", content: LAYER1_SYSTEM },
    { role: "user", content: `请根据以下创意生成完整的故事大纲：

${userInput}` }
  ];
}
const LAYER2_SYSTEM = `你是一位专业的视频分镜导演。

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

### 输出格式 (JSON Array)
[
  {
    "order": 1,
    "title": "章节标题",
    "summary": "章节概要",
    "moodArc": "rising|falling|tension|release|neutral",
    "estimatedDuration": 60,
    "bgmSuggestion": "BGM 建议",
    "shots": [
      {
        "id": "shot_001",
        "order": 1,
        "durationSec": 5,
        "sceneDescription": "场景描述",
        "charactersInScene": [
          { "characterId": "char_1", "action": "动作", "expression": "表情", "position": "center" }
        ],
        "dialogue": [
          { "characterId": "char_1", "text": "台词", "tone": "calm" }
        ],
        "narration": "旁白（可选）",
        "shotType": "dialogue",
        "emotion": "情绪标签"
      }
    ]
  }
]`;
function buildLayer2Messages(outline) {
  return [
    { role: "system", content: LAYER2_SYSTEM },
    { role: "user", content: `请根据以下故事大纲拆解为章节和分镜：

${JSON.stringify(outline, null, 2)}` }
  ];
}
const LAYER3_SYSTEM = `你是一位经验丰富的电影摄影师和台词编剧。

### 增强内容
1. 镜头语言：精确的景别、角度和运动方式
2. 台词润色：更自然、更有表现力
3. 情绪标注：每句台词的语气和语速
4. 节奏调整：避免连续 3 个以上相同景别的镜头

### 镜头语言原则
- 对话以 medium / medium_close 为主，穿插 close_up 突出情感
- 动作多用 wide / medium_wide
- 情感高潮用 close_up + low_angle

### 输出要求
- 返回完整的 chapters JSON，每个 shot 需要补充 camera 和润色后的 dialogue
- camera 格式: { "shotSize": "...", "angle": "...", "movement": "...", "description": "..." }`;
function buildLayer3Messages(chapters) {
  return [
    { role: "system", content: LAYER3_SYSTEM },
    { role: "user", content: `请对以下分镜进行镜头语言增强和台词润色：

${JSON.stringify(chapters, null, 2)}` }
  ];
}
const EMOTION_LIGHTING = {
  angry: "dramatic red backlighting, harsh shadows, high contrast",
  sad: "soft dim lighting, blue tones, melancholy atmosphere",
  happy: "warm golden sunlight, bright cheerful lighting, lens flare",
  fearful: "low key lighting, deep shadows, horror atmosphere",
  calm: "soft diffused natural light, peaceful atmosphere",
  determined: "dramatic rim lighting, heroic atmosphere, golden hour",
  excited: "vibrant dynamic lighting, energetic colors, motion blur light",
  surprised: "bright sudden flash, dramatic contrast, sharp shadows",
  neutral: "natural ambient lighting, balanced exposure",
  mysterious: "volumetric light rays, fog, moonlit atmosphere",
  romantic: "warm soft golden hour lighting, bokeh background",
  tense: "cold harsh fluorescent lighting, high contrast, noir style"
};
const SHOT_SIZE_KEYWORDS = {
  extreme_wide: "extreme wide shot, vast landscape, full environment visible",
  wide: "wide shot, full environment visible, establishing composition",
  medium_wide: "medium wide shot, character full body in environment",
  medium: "medium shot, waist up framing",
  medium_close: "medium close-up, chest up, emotional framing",
  close_up: "close-up portrait, face focused, detailed facial features",
  extreme_close_up: "extreme close-up, eyes and expression detail"
};
const ANGLE_KEYWORDS = {
  eye_level: "eye level perspective",
  low_angle: "low angle, looking up, heroic perspective",
  high_angle: "high angle, looking down, vulnerable perspective",
  dutch_angle: "dutch angle, tilted frame, unsettling",
  birds_eye: "birds eye view, top down"
};
const MOVEMENT_KEYWORDS = {
  static: "static composition, still frame",
  pan_left: "horizontal pan left",
  pan_right: "horizontal pan right",
  tilt_up: "vertical tilt up",
  tilt_down: "vertical tilt down",
  dolly_in: "dolly in, zooming closer",
  dolly_out: "dolly out, revealing more",
  tracking: "tracking shot, following subject",
  crane: "crane shot, elevated movement",
  handheld: "handheld camera, slight shake, documentary feel"
};
const STYLE_QUALITY = {
  anime: "anime style, studio ghibli inspired, detailed illustration, vibrant colors",
  realistic: "photorealistic, ultra detailed, 8k, cinematic",
  "3d": "3d render, octane render, ray tracing, detailed textures",
  watercolor: "watercolor painting, soft brushstrokes, artistic",
  comic: "comic book style, bold lines, cel shading",
  cinematic: "cinematic color grading, anamorphic, film grain"
};
class PromptBuilder {
  /** 为单个分镜生成 ImageGenerationPrompt */
  static build(shot, characters, style = "anime") {
    const parts = [];
    const quality = "masterpiece, best quality, highly detailed";
    parts.push(quality);
    const styleDesc = STYLE_QUALITY[style] || STYLE_QUALITY.anime;
    parts.push(styleDesc);
    parts.push(shot.sceneDescription);
    const charParts = [];
    for (const cish of shot.charactersInScene) {
      const char = characters.find((c) => c.id === cish.characterId);
      if (char) {
        const desc = [
          char.appearanceDetail.hair,
          char.appearanceDetail.eyes,
          char.appearanceDetail.clothing,
          cish.expression ? `${cish.expression} expression` : "",
          cish.action || ""
        ].filter(Boolean).join(", ");
        charParts.push(`${char.name}: ${desc}`);
      }
    }
    const cameraParts = [];
    if (shot.camera.shotSize) cameraParts.push(SHOT_SIZE_KEYWORDS[shot.camera.shotSize] || "");
    if (shot.camera.angle) cameraParts.push(ANGLE_KEYWORDS[shot.camera.angle] || "");
    if (shot.camera.movement) cameraParts.push(MOVEMENT_KEYWORDS[shot.camera.movement] || "");
    const lighting = EMOTION_LIGHTING[shot.emotion] || EMOTION_LIGHTING.neutral;
    const atmosphere = `${shot.emotion} atmosphere, cinematic mood`;
    const positive = [
      parts.join(", "),
      charParts.join(", "),
      cameraParts.join(", "),
      lighting,
      atmosphere
    ].filter(Boolean).join(",\n");
    const negative = "low quality, worst quality, blurry, deformed, ugly, different face, wrong hairstyle, wrong clothing, bad anatomy, extra fingers, mutated hands, poorly drawn hands, watermark, text";
    const decomposition = {
      quality,
      style: styleDesc,
      scene: shot.sceneDescription,
      characters: charParts,
      camera: cameraParts.join(", "),
      lighting,
      atmosphere
    };
    return { positive, negative, decomposition };
  }
  /** 批量为章节中所有分镜生成 prompt */
  static buildAll(shots, characters, style = "anime") {
    return shots.map((shot) => ({
      ...shot,
      imagePrompt: this.build(shot, characters, style)
    }));
  }
}
class ScriptOptimizer extends EventEmitter {
  client;
  constructor(config) {
    super();
    this.client = new LLMClient(config);
  }
  /** Layer 1: 故事解析 */
  async generateOutline(userInput) {
    this.emit("progress", { layer: 1, status: "start" });
    const messages = buildLayer1Messages(userInput);
    const response = await this.client.chat(messages, { temperature: 0.8, maxTokens: 4e3 });
    let outline;
    try {
      const cleaned = response.content.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
      outline = JSON.parse(cleaned);
    } catch {
      throw new Error("Layer 1: LLM 返回的 JSON 解析失败。原始内容: " + response.content.slice(0, 500));
    }
    outline.characters = outline.characters.map((c, i) => ({
      ...c,
      id: c.id || `char_${i + 1}`
    }));
    this.emit("progress", { layer: 1, status: "done" });
    return outline;
  }
  /** Layer 2: 章节拆解 */
  async generateChapters(outline) {
    this.emit("progress", { layer: 2, status: "start" });
    const messages = buildLayer2Messages(outline);
    const response = await this.client.chat(messages, { temperature: 0.7, maxTokens: 8e3 });
    let chapters;
    try {
      const cleaned = response.content.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
      chapters = JSON.parse(cleaned);
    } catch {
      throw new Error("Layer 2: LLM 返回的 JSON 解析失败。原始内容: " + response.content.slice(0, 500));
    }
    for (const chapter of chapters) {
      for (const shot of chapter.shots) {
        shot.status = shot.status || "pending";
        shot.assets = shot.assets || {};
      }
    }
    this.emit("progress", { layer: 2, status: "done" });
    return chapters;
  }
  /** Layer 3: 分镜细化（镜头语言 + 台词润色） */
  async refineShots(chapters) {
    this.emit("progress", { layer: 3, status: "start" });
    const messages = buildLayer3Messages(chapters);
    const response = await this.client.chat(messages, { temperature: 0.7, maxTokens: 12e3 });
    let refined;
    try {
      const cleaned = response.content.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
      refined = JSON.parse(cleaned);
    } catch {
      throw new Error("Layer 3: LLM 返回的 JSON 解析失败。原始内容: " + response.content.slice(0, 500));
    }
    for (let i = 0; i < refined.length; i++) {
      for (let j = 0; j < refined[i].shots.length; j++) {
        const orig = chapters[i]?.shots[j];
        if (orig) {
          refined[i].shots[j].status = orig.status;
          refined[i].shots[j].assets = orig.assets;
        }
      }
    }
    this.emit("progress", { layer: 3, status: "done" });
    return refined;
  }
  /** Layer 4: SD Prompt 组装（纯规则引擎，无需 LLM） */
  buildPrompts(chapters, characters, style = "anime") {
    this.emit("progress", { layer: 4, status: "start" });
    const result = chapters.map((chapter) => ({
      ...chapter,
      shots: PromptBuilder.buildAll(chapter.shots, characters, style)
    }));
    this.emit("progress", { layer: 4, status: "done" });
    return result;
  }
  /** 完整 4 层生成流程 */
  async generateFullScript(userInput, style = "anime") {
    const outline = await this.generateOutline(userInput);
    let chapters = await this.generateChapters(outline);
    chapters = await this.refineShots(chapters);
    chapters = this.buildPrompts(chapters, outline.characters, style);
    return { outline, chapters };
  }
}
class Semaphore {
  permits;
  waiting = [];
  constructor(count) {
    if (count < 1) throw new Error("Semaphore count must be >= 1");
    this.permits = count;
  }
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
  acquire() {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  release() {
    this.permits++;
    const next = this.waiting.shift();
    if (next) {
      this.permits--;
      next();
    }
  }
  get available() {
    return this.permits;
  }
  get pending() {
    return this.waiting.length;
  }
}
const LEVEL_ORDER = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
class Logger {
  minLevel = "info";
  logFile = null;
  /** 设置日志文件路径 */
  setLogFile(filePath) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.logFile = filePath;
  }
  setLevel(level) {
    this.minLevel = level;
  }
  debug(msg, ...args) {
    this.log("debug", msg, ...args);
  }
  info(msg, ...args) {
    this.log("info", msg, ...args);
  }
  warn(msg, ...args) {
    this.log("warn", msg, ...args);
  }
  error(msg, ...args) {
    this.log("error", msg, ...args);
  }
  log(level, msg, ...args) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${msg}`;
    const extra = args.length ? " " + args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ") : "";
    const line = formatted + extra;
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
    if (this.logFile) {
      try {
        appendFileSync(this.logFile, line + "\n", "utf-8");
      } catch {
      }
    }
  }
}
const logger = new Logger();
class PipelineRunner extends EventEmitter {
  constructor(projectManager2, sidecar, llmConfig2, concurrency = 2) {
    super();
    this.projectManager = projectManager2;
    this.sidecar = sidecar;
    this.llmConfig = llmConfig2;
    this.concurrency = concurrency;
  }
  paused = false;
  abortController = null;
  concurrency;
  /** 运行完整 Pipeline */
  async run() {
    const project = this.projectManager.getProject();
    if (!project) throw new Error("No project loaded");
    this.abortController = new AbortController();
    logger.setLogFile(`${this.projectManager.getProjectPath()}/logs/pipeline.log`);
    try {
      if (this.needsScriptGeneration(project)) {
        await this.generateScript();
      }
      await this.generateCharacters();
      await this.renderAllShots();
      await this.composite();
      this.emit("done");
    } catch (err) {
      const error = err;
      logger.error("Pipeline error:", error.message);
      await this.projectManager.updatePipelineState({ phase: "error", error: error.message });
      this.emit("error", error);
    }
  }
  /** 暂停 */
  pause() {
    this.paused = true;
    logger.info("Pipeline paused");
  }
  /** 继续 */
  resume() {
    this.paused = false;
    logger.info("Pipeline resumed");
  }
  /** 取消 */
  cancel() {
    this.abortController?.abort();
    this.paused = false;
    logger.info("Pipeline cancelled");
  }
  /** 检查是否需要生成剧本 */
  needsScriptGeneration(project) {
    return !project.outline || !project.script || project.script.chapters.length === 0;
  }
  // ── Phase 1: 剧本生成 ──────────────────────────────────────
  async generateScript() {
    const project = this.projectManager.getProject();
    await this.setPhase("script");
    const optimizer = new ScriptOptimizer(this.llmConfig);
    optimizer.on("progress", (p) => {
      logger.info(`Script L${p.layer}: ${p.status}`);
    });
    const { outline, chapters } = await optimizer.generateFullScript(
      project.title,
      // 使用项目标题作为创意输入
      project.style
    );
    const characters = outline.characters.map((c) => ({
      id: c.id,
      name: c.name,
      appearanceDetail: c.appearanceDetail,
      referenceImage: "",
      embeddingPath: void 0
    }));
    const totalShots = chapters.reduce((sum, ch) => sum + ch.shots.length, 0);
    await this.projectManager.updateProject({
      outline,
      characters,
      script: { chapters }
    });
    await this.projectManager.updatePipelineState({
      phase: "characters",
      totalShots,
      completedShots: 0,
      failedShots: 0
    });
    logger.info(`Script generated: ${chapters.length} chapters, ${totalShots} shots`);
  }
  // ── Phase 2: 角色生成 ──────────────────────────────────────
  async generateCharacters() {
    const project = this.projectManager.getProject();
    if (!project.characters.length) return;
    await this.setPhase("characters");
    for (const char of project.characters) {
      await this.checkPausedOrAborted();
      const charDir = await this.projectManager.ensureCharacterDir(char.id);
      if (this.sidecar.isReady) {
        try {
          const result = await this.sidecar.call("/generate_image", {
            prompt: `portrait of ${char.name}, ${char.appearanceDetail.hair}, ${char.appearanceDetail.eyes}, ${char.appearanceDetail.clothing}`,
            output_dir: charDir
          });
          char.referenceImage = result.path;
          logger.info(`Character ${char.name} reference image generated`);
        } catch (err) {
          logger.warn(`Character ${char.name} image generation failed: ${err.message}`);
        }
      }
    }
    await this.projectManager.updateProject({ characters: project.characters });
  }
  // ── Phase 3: 分镜渲染 ──────────────────────────────────────
  async renderAllShots() {
    const project = this.projectManager.getProject();
    if (!project.script) return;
    await this.setPhase("rendering");
    for (const chapter of project.script.chapters) {
      const pendingShots = chapter.shots.filter((s) => s.status !== "done");
      if (pendingShots.length === 0) continue;
      await this.processBatch(pendingShots);
    }
  }
  async processBatch(shots) {
    const semaphore = new Semaphore(this.concurrency);
    await Promise.all(shots.map(
      (shot) => semaphore.run(async () => {
        await this.checkPausedOrAborted();
        shot.status = "rendering";
        await this.projectManager.saveProject();
        this.emit("shot:start", shot.id);
        try {
          await this.renderShot(shot);
          shot.status = "done";
        } catch (err) {
          shot.status = "failed";
          shot.error = err.message;
          this.emit("shot:error", shot.id, shot.error);
        }
        await this.projectManager.saveProject();
        if (shot.status === "done") {
          this.emit("shot:done", shot.id);
        }
        const project = this.projectManager.getProject();
        const total = project.pipelineState.totalShots;
        const completed = this.countCompleted(project);
        const failed = this.countFailed(project);
        await this.projectManager.updatePipelineState({ completedShots: completed, failedShots: failed });
        this.emit("shot:progress", completed, total);
      })
    ));
  }
  /** 渲染单个分镜 */
  async renderShot(shot) {
    this.projectManager.getProjectPath();
    const shotDir = await this.projectManager.ensureShotDir(shot.id);
    if (!this.sidecar.isReady) {
      logger.warn(`Sidecar not ready, skipping shot ${shot.id}`);
      return;
    }
    if (shot.imagePrompt) {
      const imgResult = await this.sidecar.call("/generate_image", {
        prompt: shot.imagePrompt.positive,
        negative_prompt: shot.imagePrompt.negative,
        embedding_id: shot.charactersInScene[0]?.characterId,
        output_dir: shotDir
      });
      shot.assets.image = imgResult.path;
    }
    switch (shot.shotType) {
      case "dialogue": {
        if (shot.dialogue.length > 0) {
          const text = shot.dialogue.map((d) => d.text).join(" ");
          const ttsResult = await this.sidecar.call("/generate_tts", {
            text,
            character_id: shot.dialogue[0].characterId,
            tone: shot.dialogue[0].tone,
            output_dir: shotDir
          });
          shot.assets.audio = ttsResult.path;
          if (shot.assets.image) {
            const lipResult = await this.sidecar.call("/musetalk", {
              image_path: shot.assets.image,
              audio_path: shot.assets.audio,
              output_dir: shotDir
            });
            shot.assets.video = lipResult.path;
          }
        }
        break;
      }
      case "transition":
      case "establishing": {
        if (shot.assets.image) {
          const depthResult = await this.sidecar.call("/depth_animate", {
            image_path: shot.assets.image,
            duration_sec: shot.durationSec,
            movement: shot.camera.movement,
            output_dir: shotDir
          });
          shot.assets.video = depthResult.path;
        }
        break;
      }
      case "action": {
        logger.info(`Action shot ${shot.id} — video provider not yet implemented`);
        break;
      }
    }
  }
  // ── Phase 4: 组装导出 ──────────────────────────────────────
  async composite() {
    await this.setPhase("compositing");
    logger.info("Composite phase — FFmpeg assembly (placeholder)");
    await this.setPhase("done");
  }
  // ── Helpers ────────────────────────────────────────────────
  async setPhase(phase) {
    await this.projectManager.updatePipelineState({ phase });
    this.emit("phase:change", phase);
  }
  countCompleted(project) {
    if (!project.script) return 0;
    return project.script.chapters.reduce(
      (sum, ch) => sum + ch.shots.filter((s) => s.status === "done").length,
      0
    );
  }
  countFailed(project) {
    if (!project.script) return 0;
    return project.script.chapters.reduce(
      (sum, ch) => sum + ch.shots.filter((s) => s.status === "failed").length,
      0
    );
  }
  async checkPausedOrAborted() {
    while (this.paused) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (this.abortController?.signal.aborted) {
      throw new Error("Pipeline cancelled");
    }
  }
}
class KlingProvider {
  id = "kling";
  displayName = "快手可灵";
  models = [
    { id: "kling-v2", name: "可灵 v2", maxDurationSec: 120 },
    { id: "kling-v1", name: "可灵 v1", maxDurationSec: 60 }
  ];
  capabilities = ["image_to_video", "text_to_video"];
  maxDurationSec = 120;
  supportedResolutions = ["720p", "1080p"];
  apiKey = "";
  apiSecret = "";
  model = "kling-v2";
  async initialize(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret || "";
    this.model = config.model || "kling-v2";
  }
  async imageToVideo(req) {
    throw new Error("KlingProvider.imageToVideo not yet implemented");
  }
  async healthCheck() {
    if (!this.apiKey || !this.apiSecret) return false;
    return true;
  }
}
class JimengProvider {
  id = "jimeng";
  displayName = "字节即梦";
  models = [
    { id: "jimeng-v3", name: "即梦 v3", maxDurationSec: 60 },
    { id: "jimeng-v2", name: "即梦 v2", maxDurationSec: 30 }
  ];
  capabilities = ["image_to_video", "text_to_video"];
  maxDurationSec = 60;
  supportedResolutions = ["720p", "1080p"];
  apiKey = "";
  apiSecret = "";
  model = "jimeng-v3";
  async initialize(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret || "";
    this.model = config.model || "jimeng-v3";
  }
  async imageToVideo(req) {
    throw new Error("JimengProvider.imageToVideo not yet implemented");
  }
  async healthCheck() {
    if (!this.apiKey || !this.apiSecret) return false;
    return true;
  }
}
class VideoProviderRegistry {
  static instance;
  providers = /* @__PURE__ */ new Map();
  configs = /* @__PURE__ */ new Map();
  activeId = "";
  static builtinProviders = {
    "kling": () => new KlingProvider(),
    "jimeng": () => new JimengProvider()
  };
  static getInstance() {
    if (!this.instance) this.instance = new VideoProviderRegistry();
    return this.instance;
  }
  /** 配置文件路径 */
  get configPath() {
    return join(app.getPath("userData"), "providers.json");
  }
  /** 启动时加载配置 */
  async load() {
    try {
      const data = await promises.readFile(this.configPath, "utf-8");
      const file = JSON.parse(data);
      this.activeId = file.activeId || "";
      for (const config of file.providers) {
        if (config.enabled) {
          await this.configure(config);
        } else {
          this.configs.set(config.id, config);
        }
      }
    } catch {
    }
  }
  /** 保存配置到文件 */
  async saveConfigs() {
    const file = {
      activeId: this.activeId,
      providers: Array.from(this.configs.values())
    };
    await promises.writeFile(this.configPath, JSON.stringify(file, null, 2), "utf-8");
  }
  /** 添加/更新 Provider */
  async configure(config) {
    const factory = VideoProviderRegistry.builtinProviders[config.id];
    if (!factory) throw new Error(`Unknown provider: ${config.id}`);
    const provider = factory();
    await provider.initialize(config);
    this.providers.set(config.id, provider);
    this.configs.set(config.id, config);
    await this.saveConfigs();
  }
  /** 移除 Provider */
  async remove(providerId) {
    this.providers.delete(providerId);
    this.configs.delete(providerId);
    if (this.activeId === providerId) this.activeId = "";
    await this.saveConfigs();
  }
  /** 切换激活的 Provider */
  async setActive(providerId) {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} not configured`);
    }
    this.activeId = providerId;
    await this.saveConfigs();
  }
  /** 获取当前激活的 Provider */
  getActive() {
    if (!this.activeId) return null;
    return this.providers.get(this.activeId) || null;
  }
  /** 获取所有已配置的 Provider 摘要 */
  getAll() {
    return Array.from(this.configs.values()).map((config) => {
      const provider = this.providers.get(config.id);
      return {
        id: config.id,
        displayName: provider?.displayName || config.id,
        models: provider?.models || [],
        capabilities: provider?.capabilities || [],
        maxDurationSec: provider?.maxDurationSec || 0,
        supportedResolutions: provider?.supportedResolutions || [],
        configured: !!provider,
        enabled: config.enabled
      };
    });
  }
  /** 获取所有支持的 Provider（含未配置） */
  getSupportedProviders() {
    return Object.entries(VideoProviderRegistry.builtinProviders).map(([id, factory]) => {
      const provider = factory();
      const config = this.configs.get(id);
      return {
        id,
        displayName: provider.displayName,
        models: provider.models,
        capabilities: provider.capabilities,
        maxDurationSec: provider.maxDurationSec,
        supportedResolutions: provider.supportedResolutions,
        configured: !!config,
        enabled: config?.enabled || false
      };
    });
  }
}
class FFmpegController {
  ffmpegPath;
  constructor(ffmpegPath = "ffmpeg") {
    this.ffmpegPath = ffmpegPath;
  }
  /** 检测 FFmpeg 是否可用 */
  async detect() {
    try {
      const output = await this.exec(["-version"]);
      const firstLine = output.split("\n")[0];
      return { available: true, version: firstLine };
    } catch {
      return { available: false };
    }
  }
  /** 设置 FFmpeg 路径 */
  setPath(path) {
    this.ffmpegPath = path;
  }
  /** 拼接视频片段 + 转场 + 字幕 + 音频合成 */
  async composite(options) {
    const {
      segments,
      bgmPath,
      sfxPath,
      subtitlePath,
      outputPath,
      transition = "fade",
      transitionDurationSec = 0.5,
      videoBitrate = "8000k",
      audioBitrate = "192k"
    } = options;
    if (segments.length === 0) throw new Error("No segments to composite");
    const outputDir = dirname(outputPath);
    await promises.mkdir(outputDir, { recursive: true });
    if (segments.length === 1 && !subtitlePath && !bgmPath) {
      await this.exec(["-i", segments[0].videoPath, "-c", "copy", "-y", outputPath]);
      return outputPath;
    }
    const concatListPath = join(outputDir, "_concat_list.txt");
    const concatContent = segments.map((s) => `file '${s.videoPath.replace(/'/g, "'\\''")}'`).join("\n");
    await promises.writeFile(concatListPath, concatContent, "utf-8");
    const filters = [];
    const n = segments.length;
    filters.push(`[0:v]concat=n=${n}:v=1:a=0[raw]`);
    let videoLabel = "raw";
    if (subtitlePath) {
      const escapedSub = subtitlePath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
      filters.push(`[raw]ass='${escapedSub}'[v]`);
      videoLabel = "v";
    }
    const audioInputs = [];
    if (bgmPath) audioInputs.push("1:a");
    if (sfxPath) audioInputs.push(bgmPath ? "2:a" : "1:a");
    if (audioInputs.length > 0) {
      filters.push(`[${audioInputs.join("][")}]amix=inputs=${audioInputs.length + 1}:duration=first[amixed]`);
    }
    const args = [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath
    ];
    if (bgmPath) args.push("-i", bgmPath);
    if (sfxPath) args.push("-i", sfxPath);
    args.push("-filter_complex", filters.join(";"));
    args.push("-map", `[${videoLabel}]`);
    if (audioInputs.length > 0) {
      args.push("-map", "[amixed]");
    }
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      audioBitrate,
      "-y",
      outputPath
    );
    logger.info(`FFmpeg composite: ${segments.length} segments → ${outputPath}`);
    await this.exec(args);
    await promises.unlink(concatListPath).catch(() => {
    });
    return outputPath;
  }
  /** 生成 ASS 字幕文件 */
  async generateAssSubtitle(shots, outputPath, options) {
    const fontSize = options?.fontSize || 48;
    const fontName = options?.fontName || "Noto Sans SC";
    const marginV = options?.marginV || 30;
    const header = `[Script Info]
Title: Video AI Studio Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,30,30,${marginV},1
Style: Character,${fontName},${fontSize},&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,30,30,${marginV + fontSize + 10},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
    const events = shots.map((shot) => {
      const start = this.formatAssTime(shot.startSec);
      const end = this.formatAssTime(shot.startSec + shot.durationSec);
      const lines = [];
      if (shot.characterName) {
        lines.push(`Dialogue: 0,${start},${end},Character,,0,0,0,,${shot.characterName}`);
      }
      lines.push(`Dialogue: 1,${start},${end},Default,,0,0,0,,${shot.text}`);
      return lines.join("\n");
    }).join("\n");
    await promises.writeFile(outputPath, header + events, "utf-8");
    return outputPath;
  }
  formatAssTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor(sec % 3600 / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.floor(sec % 1 * 100);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }
  /** 执行 ffmpeg 命令 */
  exec(args) {
    return new Promise((resolve, reject) => {
      execFile(this.ffmpegPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          logger.error(`FFmpeg error: ${err.message}`);
          logger.error(`FFmpeg stderr: ${stderr}`);
          reject(new Error(`FFmpeg failed: ${err.message}
${stderr}`));
        } else {
          resolve(stdout || stderr);
        }
      });
    });
  }
}
let mainWindow = null;
const projectManager = new ProjectManager();
const pythonSpawner = new PythonSpawner();
const providerRegistry = VideoProviderRegistry.getInstance();
const ffmpegController = new FFmpegController();
let llmConfig = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: "Video AI Studio",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(async () => {
  createWindow();
  registerIPC();
  await providerRegistry.load();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  pythonSpawner.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
function registerIPC() {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:platform", () => process.platform);
  ipcMain.handle("project:list", async () => {
    return projectManager.listProjects();
  });
  ipcMain.handle("project:create", async (_e, title, durationSec, style) => {
    return projectManager.createProject(title, durationSec, style);
  });
  ipcMain.handle("project:open", async (_e, projectDir) => {
    return projectManager.openProject(projectDir);
  });
  ipcMain.handle("project:save", async () => {
    await projectManager.saveProject();
    return { ok: true };
  });
  ipcMain.handle("project:get", () => {
    return projectManager.getProject();
  });
  ipcMain.handle("project:update", async (_e, partial) => {
    await projectManager.updateProject(partial);
    return { ok: true };
  });
  ipcMain.handle("script:generate", async (event, userInput, style) => {
    if (!llmConfig) throw new Error("LLM not configured. Please set API key in Settings.");
    const optimizer = new ScriptOptimizer(llmConfig);
    optimizer.on("progress", (p) => {
      mainWindow?.webContents.send("script:progress", p);
    });
    return optimizer.generateFullScript(userInput, style || "anime");
  });
  ipcMain.handle("script:generate-layer", async (event, layer, input, style) => {
    if (!llmConfig) throw new Error("LLM not configured.");
    const optimizer = new ScriptOptimizer(llmConfig);
    optimizer.on("progress", (p) => {
      mainWindow?.webContents.send("script:progress", p);
    });
    switch (layer) {
      case 1:
        return optimizer.generateOutline(input);
      case 2:
        return optimizer.generateChapters(input);
      case 3:
        return optimizer.refineShots(input);
      case 4:
        return optimizer.buildPrompts(input.chapters, input.characters, style);
      default:
        throw new Error(`Unknown layer: ${layer}`);
    }
  });
  ipcMain.handle("llm:configure", async (_e, config) => {
    llmConfig = config;
    return { ok: true };
  });
  ipcMain.handle("llm:get-config", () => {
    return llmConfig;
  });
  ipcMain.handle("pipeline:start", async (_e, config) => {
    if (!llmConfig) throw new Error("LLM not configured");
    const runner = new PipelineRunner(projectManager, pythonSpawner, llmConfig, config?.concurrency || 2);
    runner.on("phase:change", (phase) => mainWindow?.webContents.send("pipeline:phase", phase));
    runner.on("shot:start", (id) => mainWindow?.webContents.send("pipeline:shot-start", id));
    runner.on("shot:done", (id) => mainWindow?.webContents.send("pipeline:shot-done", id));
    runner.on("shot:error", (id, err) => mainWindow?.webContents.send("pipeline:shot-error", { id, error: err }));
    runner.on("shot:progress", (done, total) => mainWindow?.webContents.send("pipeline:progress", { done, total }));
    runner.on("error", (err) => mainWindow?.webContents.send("pipeline:error", err.message));
    runner.on("done", () => mainWindow?.webContents.send("pipeline:done"));
    runner.run().catch((err) => {
      logger.error("Pipeline run error:", err.message);
    });
    return { started: true };
  });
  ipcMain.handle("pipeline:pause", () => {
    return { paused: true };
  });
  ipcMain.handle("pipeline:resume", () => {
    return { resumed: true };
  });
  ipcMain.handle("provider:list", () => {
    return providerRegistry.getSupportedProviders();
  });
  ipcMain.handle("provider:configure", async (_e, config) => {
    await providerRegistry.configure(config);
    return { ok: true };
  });
  ipcMain.handle("provider:set-active", async (_e, id) => {
    await providerRegistry.setActive(id);
    return { ok: true };
  });
  ipcMain.handle("provider:remove", async (_e, id) => {
    await providerRegistry.remove(id);
    return { ok: true };
  });
  ipcMain.handle("sidecar:start", async (_e, pythonCmd) => {
    try {
      const info = await pythonSpawner.start(pythonCmd || "python");
      return info;
    } catch (err) {
      return { error: err.message, ready: false };
    }
  });
  ipcMain.handle("sidecar:health", async () => {
    return pythonSpawner.healthCheck();
  });
  ipcMain.handle("sidecar:stop", () => {
    pythonSpawner.stop();
    return { stopped: true };
  });
  ipcMain.handle("ffmpeg:detect", async () => {
    return ffmpegController.detect();
  });
  ipcMain.handle("ffmpeg:set-path", (_e, path) => {
    ffmpegController.setPath(path);
    return { ok: true };
  });
  ipcMain.handle("dialog:open-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("dialog:open-file", async (_e, filters) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: filters || [{ name: "All Files", extensions: ["*"] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
