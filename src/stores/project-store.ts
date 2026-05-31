import { create } from 'zustand'

// 安全访问 electronAPI，不存在时返回 null
function getAPI() {
  return typeof window !== 'undefined' ? window.electronAPI : null
}

interface ProjectListItem {
  id: string
  title: string
  path: string
  createdAt: string
  updatedAt: string
  durationTargetSec: number
  pipelineState: {
    phase: string
    totalShots: number
    completedShots: number
    failedShots: number
    estimatedRemainingSec: number
  }
}

interface Project {
  version: number
  id: string
  title: string
  style: string
  durationTargetSec: number
  createdAt: string
  updatedAt: string
  outline?: any
  characters: any[]
  script?: { chapters: any[] }
  pipelineState: {
    phase: string
    totalShots: number
    completedShots: number
    failedShots: number
    estimatedRemainingSec: number
  }
}

interface ScriptProgress {
  layer: number
  status: string
  message?: string
  data?: Record<string, unknown>
}

interface PipelineProgress {
  phase: string
  done: number
  total: number
}

interface ProjectStore {
  projects: ProjectListItem[]
  currentProject: Project | null
  activeTab: 'script' | 'characters' | 'render' | 'preview' | 'export' | 'test'
  scriptProgress: ScriptProgress | null
  pipelineProgress: PipelineProgress | null
  loading: boolean
  error: string | null

  setActiveTab: (tab: ProjectStore['activeTab']) => void
  loadProjects: () => Promise<void>
  createProject: (title: string, durationSec?: number, style?: string) => Promise<void>
  openProject: (projectDir: string) => Promise<void>
  refreshProject: () => Promise<void>
  generateScript: (userInput: string, style?: string) => Promise<void>
  startPipeline: () => Promise<void>
  clearError: () => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProject: null,
  activeTab: 'script',
  scriptProgress: null,
  pipelineProgress: null,
  loading: false,
  error: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadProjects: async () => {
    const api = getAPI()
    if (!api) return
    try {
      const projects = await api.project.list()
      set({ projects })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  createProject: async (title, durationSec, style, refImagePaths?: string[]) => {
    const api = getAPI()
    if (!api) { set({ error: 'Electron API 不可用' }); return }
    set({ loading: true, error: null })
    try {
      const project = await api.project.create(title, durationSec, style)
      // 复制参考图到项目目录
      if (refImagePaths && refImagePaths.length > 0) {
        await api.project.update({ referenceImages: refImagePaths })
      }
      set({ currentProject: project, loading: false })
      get().loadProjects()
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  openProject: async (projectDir) => {
    const api = getAPI()
    if (!api) { set({ error: 'Electron API 不可用' }); return }
    set({ loading: true, error: null })
    try {
      const project = await api.project.open(projectDir)
      set({ currentProject: project, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  refreshProject: async () => {
    const api = getAPI()
    if (!api) return
    try {
      const project = await api.project.get()
      if (project) set({ currentProject: project })
    } catch {
      // 静默失败
    }
  },

  generateScript: async (userInput, style) => {
    const api = getAPI()
    if (!api) { set({ error: 'Electron API 不可用' }); return }
    set({ loading: true, error: null, scriptProgress: { layer: 0, status: 'start' } })

    const unsub = api.script.onProgress((p: any) => {
      set({ scriptProgress: { layer: p.layer, status: p.status, message: p.message, data: p.data } })
    })

    try {
      const result = await api.script.generate(userInput, style)
      await api.project.update({
        outline: result.outline,
        characters: result.outline.characters.map((c: any, i: number) => ({
          id: c.id || `char_${i + 1}`,
          name: c.name,
          appearanceDetail: c.appearanceDetail,
          referenceImage: '',
        })),
        script: { chapters: result.chapters }
      })
      await get().refreshProject()
      set({ loading: false, scriptProgress: { layer: 4, status: 'done' } })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    } finally {
      unsub()
    }
  },

  startPipeline: async () => {
    const api = getAPI()
    if (!api) { set({ error: 'Electron API 不可用' }); return }
    set({ loading: true, error: null })

    const unsubPhase = api.pipeline.onPhase((phase) => {
      set((s) => ({ pipelineProgress: { ...s.pipelineProgress!, phase } as PipelineProgress }))
    })
    const unsubProgress = api.pipeline.onProgress(({ done, total }) => {
      set({ pipelineProgress: { phase: 'rendering', done, total } })
    })
    const unsubDone = api.pipeline.onDone(() => {
      set({ loading: false })
      get().refreshProject()
    })
    const unsubError = api.pipeline.onError((err) => {
      set({ error: err, loading: false })
    })

    try {
      await api.pipeline.start()
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      unsubPhase(); unsubProgress(); unsubDone(); unsubError()
    }
  },

  clearError: () => set({ error: null }),
}))
