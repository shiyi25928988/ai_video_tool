import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { ProjectManager } from './project-manager'
import { PythonSpawner } from './python-spawner'
import { PipelineRunner } from './pipeline-runner'
import { VideoProviderRegistry } from './providers/registry'
import { FFmpegController } from './ffmpeg-controller'
import { ScriptOptimizer } from './script-optimizer/optimizer'
import { LLMClient } from './script-optimizer/llm-client'
import { AIModelConfigManager } from './ai-model-config'
import { LLMConfigManager } from './llm-config-manager'
import { logger } from './utils/logger'

let mainWindow: BrowserWindow | null = null
const projectManager = new ProjectManager()
const pythonSpawner = new PythonSpawner()
const providerRegistry = VideoProviderRegistry.getInstance()
const ffmpegController = new FFmpegController()
const aiModelConfig = AIModelConfigManager.getInstance()
const llmConfigManager = LLMConfigManager.getInstance()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Video AI Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── 启动 ─────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow()
  registerIPC()
  await providerRegistry.load()
  await aiModelConfig.load()
  await llmConfigManager.load()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  pythonSpawner.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ── IPC Handlers ─────────────────────────────────────────────

function registerIPC(): void {

  // ─ App ───────────────────────────────────────────────────

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)

  // ─ Project CRUD ──────────────────────────────────────────

  ipcMain.handle('project:list', async () => {
    return projectManager.listProjects()
  })

  ipcMain.handle('project:create', async (_e, title: string, durationSec?: number, style?: string) => {
    return projectManager.createProject(title, durationSec, style)
  })

  ipcMain.handle('project:open', async (_e, projectDir: string) => {
    return projectManager.openProject(projectDir)
  })

  ipcMain.handle('project:save', async () => {
    await projectManager.saveProject()
    return { ok: true }
  })

  ipcMain.handle('project:get', () => {
    return projectManager.getProject()
  })

  ipcMain.handle('project:update', async (_e, partial: Record<string, unknown>) => {
    await projectManager.updateProject(partial as any)
    return { ok: true }
  })

  // ─ Script Optimizer ──────────────────────────────────────

  ipcMain.handle('script:generate', async (event, userInput: string, style?: string) => {
    const llmConfig = await llmConfigManager.getActive()
    if (!llmConfig) throw new Error('LLM not configured. Please set API key in Settings.')
    const optimizer = new ScriptOptimizer(llmConfig)

    optimizer.on('progress', (p) => {
      mainWindow?.webContents.send('script:progress', p)
    })

    return optimizer.generateFullScript(userInput, style || 'anime')
  })

  ipcMain.handle('script:generate-layer', async (event, layer: number, input: unknown, style?: string) => {
    const llmConfig = await llmConfigManager.getActive()
    if (!llmConfig) throw new Error('LLM not configured.')
    const optimizer = new ScriptOptimizer(llmConfig)

    optimizer.on('progress', (p) => {
      mainWindow?.webContents.send('script:progress', p)
    })

    switch (layer) {
      case 1: return optimizer.generateOutline(input as string)
      case 2: return optimizer.generateChapters(input as any)
      case 3: return optimizer.refineShots(input as any)
      case 4: return optimizer.buildPrompts((input as any).chapters, (input as any).characters, style)
      default: throw new Error(`Unknown layer: ${layer}`)
    }
  })

  // ─ LLM Config ────────────────────────────────────────────

  ipcMain.handle('llm:list', () => {
    return llmConfigManager.list()
  })

  ipcMain.handle('llm:save', async (_e, entry: { id?: string; name: string; baseUrl: string; apiKey: string; model?: string }) => {
    const id = await llmConfigManager.save(entry)
    return { ok: true, id }
  })

  ipcMain.handle('llm:remove', async (_e, id: string) => {
    await llmConfigManager.remove(id)
    return { ok: true }
  })

  ipcMain.handle('llm:set-active', async (_e, id: string) => {
    await llmConfigManager.setActive(id)
    return { ok: true }
  })

  ipcMain.handle('llm:get', async (_e, id: string) => {
    return llmConfigManager.get(id)
  })

  ipcMain.handle('llm:list-models', async (_e, config: { apiKey: string; baseUrl?: string }) => {
    try {
      const url = (config.baseUrl || 'https://api.openai.com').replace(/\/$/, '') + '/v1/models'
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        const errText = await res.text()
        return { ok: false, error: `HTTP ${res.status}: ${errText}` }
      }
      const data = await res.json() as any
      const models = (data.data || [])
        .map((m: any) => m.id)
        .filter((id: string) => typeof id === 'string')
        .sort()
      return { ok: true, models }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('llm:test', async (_e, config: { apiKey: string; baseUrl?: string; model?: string }) => {
    try {
      const client = new LLMClient({
        provider: 'custom',
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      })
      const res = await client.chat(
        [{ role: 'user', content: '请回复"连接成功"两个字。' }],
        { maxTokens: 32 }
      )
      return { ok: true, reply: res.content.trim(), model: config.model || '(默认)' }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ─ Pipeline ──────────────────────────────────────────────

  ipcMain.handle('pipeline:start', async (_e, config?: { concurrency?: number }) => {
    const llmConfig = await llmConfigManager.getActive()
    if (!llmConfig) throw new Error('LLM not configured')
    const runner = new PipelineRunner(projectManager, pythonSpawner, llmConfig, config?.concurrency || 2)

    runner.on('phase:change', (phase) => mainWindow?.webContents.send('pipeline:phase', phase))
    runner.on('shot:start', (id) => mainWindow?.webContents.send('pipeline:shot-start', id))
    runner.on('shot:done', (id) => mainWindow?.webContents.send('pipeline:shot-done', id))
    runner.on('shot:error', (id, err) => mainWindow?.webContents.send('pipeline:shot-error', { id, error: err }))
    runner.on('shot:progress', (done, total) => mainWindow?.webContents.send('pipeline:progress', { done, total }))
    runner.on('error', (err) => mainWindow?.webContents.send('pipeline:error', err.message))
    runner.on('done', () => mainWindow?.webContents.send('pipeline:done'))

    // 非阻塞运行
    runner.run().catch(err => {
      logger.error('Pipeline run error:', err.message)
    })

    return { started: true }
  })

  ipcMain.handle('pipeline:pause', () => {
    // Pipeline pause 通过 runner 实例管理，这里简化处理
    return { paused: true }
  })

  ipcMain.handle('pipeline:resume', () => {
    return { resumed: true }
  })

  // ─ Providers ─────────────────────────────────────────────

  ipcMain.handle('provider:list', () => {
    return providerRegistry.getSupportedProviders()
  })

  ipcMain.handle('provider:configure', async (_e, config: any) => {
    await providerRegistry.configure(config)
    return { ok: true }
  })

  ipcMain.handle('provider:set-active', async (_e, id: string) => {
    await providerRegistry.setActive(id)
    return { ok: true }
  })

  ipcMain.handle('provider:remove', async (_e, id: string) => {
    await providerRegistry.remove(id)
    return { ok: true }
  })

  // ─ Sidecar ───────────────────────────────────────────────

  // 简单的 IPC 连通性测试
  ipcMain.handle('sidecar:ping', () => {
    console.log('[IPC] sidecar:ping called')
    return { pong: true, time: new Date().toISOString() }
  })

  ipcMain.handle('sidecar:start', async (_e, pythonCmd?: string) => {
    try {
      console.log('[IPC] sidecar:start called, pythonCmd=', pythonCmd)
      logger.info('Starting sidecar...')
      const info = await pythonSpawner.start(pythonCmd || 'python')
      logger.info('Sidecar started:', JSON.stringify(info))
      return info
    } catch (err) {
      logger.error('Sidecar start failed:', (err as Error).message)
      return { error: (err as Error).message, ready: false }
    }
  })

  ipcMain.handle('sidecar:health', async () => {
    return pythonSpawner.healthCheck()
  })

  ipcMain.handle('sidecar:stop', () => {
    pythonSpawner.stop()
    return { stopped: true }
  })

  // ─ AI Model Config ──────────────────────────────────────

  ipcMain.handle('ai-model:list', async () => {
    return aiModelConfig.getAll()
  })

  ipcMain.handle('ai-model:get', async (_e, id: string) => {
    return aiModelConfig.get(id as any)
  })

  ipcMain.handle('ai-model:save', async (_e, id: string, config: { provider: string; apiKey: string; baseUrl?: string; modelName?: string }) => {
    await aiModelConfig.save(id as any, config)
    return { ok: true }
  })

  /** 各 Provider 的模型列表端点 */
  const AI_MODEL_ENDPOINTS: Record<string, (apiKey: string) => Promise<string[]>> = {
    'dashscope': async (apiKey: string) => {
      const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as any
      return (data.data || []).map((m: any) => m.id).filter(Boolean).sort()
    },
    'dashscope-intl': async (apiKey: string) => {
      const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as any
      return (data.data || []).map((m: any) => m.id).filter(Boolean).sort()
    },
  }

  ipcMain.handle('ai-model:list-models', async (_e, sectionId: string, provider: string, apiKey: string) => {
    try {
      const fetcher = AI_MODEL_ENDPOINTS[provider]
      if (!fetcher) return { ok: false, error: `Provider "${provider}" 暂不支持在线检测模型` }
      const models = await fetcher(apiKey)
      // 缓存检测结果
      await aiModelConfig.saveDetectedModels(sectionId as any, models)
      return { ok: true, models }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ai-model:get-detected', (_e, sectionId: string) => {
    return aiModelConfig.getDetectedModels(sectionId as any)
  })

  // ─ FFmpeg ────────────────────────────────────────────────

  ipcMain.handle('ffmpeg:detect', async () => {
    return ffmpegController.detect()
  })

  ipcMain.handle('ffmpeg:set-path', (_e, path: string) => {
    ffmpegController.setPath(path)
    return { ok: true }
  })

  // ─ Dialog ────────────────────────────────────────────────

  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:open-file', async (_e, filters?: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
