import { contextBridge, ipcRenderer } from "electron";
console.log("[Preload] Loading preload script...");
const electronAPI = {
  // ─ App ─────────────────────────────────────────────────
  app: {
    version: () => ipcRenderer.invoke("app:version"),
    platform: () => ipcRenderer.invoke("app:platform")
  },
  // ─ Project ─────────────────────────────────────────────
  project: {
    list: () => ipcRenderer.invoke("project:list"),
    create: (title, durationSec, style) => ipcRenderer.invoke("project:create", title, durationSec, style),
    open: (projectDir) => ipcRenderer.invoke("project:open", projectDir),
    save: () => ipcRenderer.invoke("project:save"),
    get: () => ipcRenderer.invoke("project:get"),
    update: (partial) => ipcRenderer.invoke("project:update", partial)
  },
  // ─ Script ──────────────────────────────────────────────
  script: {
    generate: (userInput, style) => ipcRenderer.invoke("script:generate", userInput, style),
    generateLayer: (layer, input, style) => ipcRenderer.invoke("script:generate-layer", layer, input, style),
    onProgress: (callback) => {
      const handler = (_e, data) => callback(data);
      ipcRenderer.on("script:progress", handler);
      return () => ipcRenderer.removeListener("script:progress", handler);
    }
  },
  // ─ LLM ─────────────────────────────────────────────────
  llm: {
    list: () => ipcRenderer.invoke("llm:list"),
    get: (id) => ipcRenderer.invoke("llm:get", id),
    save: (entry) => ipcRenderer.invoke("llm:save", entry),
    remove: (id) => ipcRenderer.invoke("llm:remove", id),
    setActive: (id) => ipcRenderer.invoke("llm:set-active", id),
    test: (config) => ipcRenderer.invoke("llm:test", config),
    listModels: (config) => ipcRenderer.invoke("llm:list-models", config)
  },
  // ─ Pipeline ────────────────────────────────────────────
  pipeline: {
    start: (config) => ipcRenderer.invoke("pipeline:start", config),
    pause: () => ipcRenderer.invoke("pipeline:pause"),
    resume: () => ipcRenderer.invoke("pipeline:resume"),
    onPhase: (callback) => {
      const handler = (_e, phase) => callback(phase);
      ipcRenderer.on("pipeline:phase", handler);
      return () => ipcRenderer.removeListener("pipeline:phase", handler);
    },
    onShotStart: (callback) => {
      const handler = (_e, id) => callback(id);
      ipcRenderer.on("pipeline:shot-start", handler);
      return () => ipcRenderer.removeListener("pipeline:shot-start", handler);
    },
    onShotDone: (callback) => {
      const handler = (_e, id) => callback(id);
      ipcRenderer.on("pipeline:shot-done", handler);
      return () => ipcRenderer.removeListener("pipeline:shot-done", handler);
    },
    onShotError: (callback) => {
      const handler = (_e, data) => callback(data);
      ipcRenderer.on("pipeline:shot-error", handler);
      return () => ipcRenderer.removeListener("pipeline:shot-error", handler);
    },
    onProgress: (callback) => {
      const handler = (_e, data) => callback(data);
      ipcRenderer.on("pipeline:progress", handler);
      return () => ipcRenderer.removeListener("pipeline:progress", handler);
    },
    onDone: (callback) => {
      ipcRenderer.on("pipeline:done", callback);
      return () => ipcRenderer.removeListener("pipeline:done", callback);
    },
    onError: (callback) => {
      const handler = (_e, err) => callback(err);
      ipcRenderer.on("pipeline:error", handler);
      return () => ipcRenderer.removeListener("pipeline:error", handler);
    }
  },
  // ─ Provider ────────────────────────────────────────────
  provider: {
    list: () => ipcRenderer.invoke("provider:list"),
    configure: (config) => ipcRenderer.invoke("provider:configure", config),
    setActive: (id) => ipcRenderer.invoke("provider:set-active", id),
    remove: (id) => ipcRenderer.invoke("provider:remove", id)
  },
  // ─ AI Model Config ────────────────────────────────────
  aiModel: {
    list: () => ipcRenderer.invoke("ai-model:list"),
    get: (id) => ipcRenderer.invoke("ai-model:get", id),
    save: (id, config) => ipcRenderer.invoke("ai-model:save", id, config),
    listModels: (sectionId, provider, apiKey) => ipcRenderer.invoke("ai-model:list-models", sectionId, provider, apiKey),
    getDetected: (sectionId) => ipcRenderer.invoke("ai-model:get-detected", sectionId)
  },
  // ─ Sidecar ─────────────────────────────────────────────
  sidecar: {
    ping: () => ipcRenderer.invoke("sidecar:ping"),
    start: (pythonCmd) => ipcRenderer.invoke("sidecar:start", pythonCmd),
    health: () => ipcRenderer.invoke("sidecar:health"),
    stop: () => ipcRenderer.invoke("sidecar:stop")
  },
  // ─ FFmpeg ──────────────────────────────────────────────
  ffmpeg: {
    detect: () => ipcRenderer.invoke("ffmpeg:detect"),
    setPath: (path) => ipcRenderer.invoke("ffmpeg:set-path", path)
  },
  // ─ Dialog ──────────────────────────────────────────────
  dialog: {
    openDirectory: () => ipcRenderer.invoke("dialog:open-directory"),
    openFile: (filters) => ipcRenderer.invoke("dialog:open-file", filters)
  }
};
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
console.log("[Preload] electronAPI exposed to main world");
