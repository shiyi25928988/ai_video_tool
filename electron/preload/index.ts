import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // ─ App ─────────────────────────────────────────────────
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    platform: () => ipcRenderer.invoke('app:platform'),
  },

  // ─ Project ─────────────────────────────────────────────
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    create: (title: string, durationSec?: number, style?: string) =>
      ipcRenderer.invoke('project:create', title, durationSec, style),
    open: (projectDir: string) => ipcRenderer.invoke('project:open', projectDir),
    save: () => ipcRenderer.invoke('project:save'),
    get: () => ipcRenderer.invoke('project:get'),
    update: (partial: Record<string, unknown>) =>
      ipcRenderer.invoke('project:update', partial),
  },

  // ─ Script ──────────────────────────────────────────────
  script: {
    generate: (userInput: string, style?: string) =>
      ipcRenderer.invoke('script:generate', userInput, style),
    generateLayer: (layer: number, input: unknown, style?: string) =>
      ipcRenderer.invoke('script:generate-layer', layer, input, style),
    onProgress: (callback: (progress: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('script:progress', handler)
      return () => ipcRenderer.removeListener('script:progress', handler)
    },
  },

  // ─ LLM ─────────────────────────────────────────────────
  llm: {
    configure: (config: { provider: string; apiKey: string; baseUrl?: string; model?: string }) =>
      ipcRenderer.invoke('llm:configure', config),
    getConfig: () => ipcRenderer.invoke('llm:get-config'),
  },

  // ─ Pipeline ────────────────────────────────────────────
  pipeline: {
    start: (config?: { concurrency?: number }) =>
      ipcRenderer.invoke('pipeline:start', config),
    pause: () => ipcRenderer.invoke('pipeline:pause'),
    resume: () => ipcRenderer.invoke('pipeline:resume'),
    onPhase: (callback: (phase: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, phase: string) => callback(phase)
      ipcRenderer.on('pipeline:phase', handler)
      return () => ipcRenderer.removeListener('pipeline:phase', handler)
    },
    onShotStart: (callback: (shotId: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, id: string) => callback(id)
      ipcRenderer.on('pipeline:shot-start', handler)
      return () => ipcRenderer.removeListener('pipeline:shot-start', handler)
    },
    onShotDone: (callback: (shotId: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, id: string) => callback(id)
      ipcRenderer.on('pipeline:shot-done', handler)
      return () => ipcRenderer.removeListener('pipeline:shot-done', handler)
    },
    onShotError: (callback: (info: { id: string; error: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { id: string; error: string }) => callback(data)
      ipcRenderer.on('pipeline:shot-error', handler)
      return () => ipcRenderer.removeListener('pipeline:shot-error', handler)
    },
    onProgress: (callback: (info: { done: number; total: number }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { done: number; total: number }) => callback(data)
      ipcRenderer.on('pipeline:progress', handler)
      return () => ipcRenderer.removeListener('pipeline:progress', handler)
    },
    onDone: (callback: () => void) => {
      ipcRenderer.on('pipeline:done', callback)
      return () => ipcRenderer.removeListener('pipeline:done', callback)
    },
    onError: (callback: (error: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, err: string) => callback(err)
      ipcRenderer.on('pipeline:error', handler)
      return () => ipcRenderer.removeListener('pipeline:error', handler)
    },
  },

  // ─ Provider ────────────────────────────────────────────
  provider: {
    list: () => ipcRenderer.invoke('provider:list'),
    configure: (config: unknown) => ipcRenderer.invoke('provider:configure', config),
    setActive: (id: string) => ipcRenderer.invoke('provider:set-active', id),
    remove: (id: string) => ipcRenderer.invoke('provider:remove', id),
  },

  // ─ Sidecar ─────────────────────────────────────────────
  sidecar: {
    start: (pythonCmd?: string) => ipcRenderer.invoke('sidecar:start', pythonCmd),
    health: () => ipcRenderer.invoke('sidecar:health'),
    stop: () => ipcRenderer.invoke('sidecar:stop'),
  },

  // ─ FFmpeg ──────────────────────────────────────────────
  ffmpeg: {
    detect: () => ipcRenderer.invoke('ffmpeg:detect'),
    setPath: (path: string) => ipcRenderer.invoke('ffmpeg:set-path', path),
  },

  // ─ Dialog ──────────────────────────────────────────────
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
    openFile: (filters?: Electron.FileFilter[]) =>
      ipcRenderer.invoke('dialog:open-file', filters),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
