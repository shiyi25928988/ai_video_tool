import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { ProjectManager } from './project-manager'
import { PythonSpawner } from './python-spawner'
import { PipelineRunner } from './pipeline-runner'
import { VideoProviderRegistry } from './providers/registry'
import { FFmpegController } from './ffmpeg-controller'
import { ScriptOptimizer } from './script-optimizer/optimizer'
import { logger } from './utils/logger'
import type { LLMConfig } from './script-optimizer/types'

let mainWindow: BrowserWindow | null = null
const projectManager = new ProjectManager()
const pythonSpawner = new PythonSpawner()
const providerRegistry = VideoProviderRegistry.getInstance()
const ffmpegController = new FFmpegController()

// LLM 配置存储
let llmConfig: LLMConfig | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Video AI Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
    if (!llmConfig) throw new Error('LLM not configured. Please set API key in Settings.')
    const optimizer = new ScriptOptimizer(llmConfig)

    optimizer.on('progress', (p) => {
      mainWindow?.webContents.send('script:progress', p)
    })

    return optimizer.generateFullScript(userInput, style || 'anime')
  })

  ipcMain.handle('script:generate-layer', async (event, layer: number, input: unknown, style?: string) => {
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

  ipcMain.handle('llm:configure', async (_e, config: LLMConfig) => {
    llmConfig = config
    return { ok: true }
  })

  ipcMain.handle('llm:get-config', () => {
    return llmConfig
  })

  // ─ Pipeline ──────────────────────────────────────────────

  ipcMain.handle('pipeline:start', async (_e, config?: { concurrency?: number }) => {
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

  ipcMain.handle('sidecar:start', async (_e, pythonCmd?: string) => {
    try {
      const info = await pythonSpawner.start(pythonCmd || 'python')
      return info
    } catch (err) {
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
