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
  await projectManager.loadWorkspace()
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

  // ─ Workspace ──────────────────────────────────────────────

  ipcMain.handle('project:delete', async (_e, projectPath: string) => {
    const { rm } = await import('fs/promises')
    try {
      await rm(projectPath, { recursive: true, force: true })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('workspace:get', () => {
    return {
      path: projectManager.getWorkspacePath(),
      isDefault: projectManager.getWorkspacePath() === join(app.getPath('documents'), 'VideoAIStudio', 'projects'),
    }
  })

  ipcMain.handle('workspace:set', async (_e, path: string) => {
    await projectManager.setWorkspacePath(path)
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
    const runner = new PipelineRunner(projectManager, pythonSpawner, llmConfig, config?.concurrency || 2, aiModelConfig)

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

  ipcMain.handle('sidecar:generate-i2v', async (_e, params: { prompt: string; imageUrl: string; endImageUrl?: string; duration?: number }) => {
    if (!pythonSpawner.isReady) return { ok: false, error: 'Sidecar 未启动' }
    try {
      const outputDir = join(app.getPath('documents'), 'VideoAIStudio', 'projects', 'videos')

      const i2vConfig = await aiModelConfig.get('imageToVideo')
      const apiKey = i2vConfig?.apiKey || ''
      const model = i2vConfig?.modelName || 'wan2.6-i2v-flash'

      console.log(`[generate-i2v] model=${model}, hasKey=${!!apiKey}`)

      const result = await pythonSpawner.call('/generate_i2v', {
        prompt: params.prompt,
        api_key: apiKey,
        model: model,
        image_url: params.imageUrl,
        end_image_url: params.endImageUrl || '',
        duration: params.duration || 5,
        output_dir: outputDir,
        filename: `i2v_${Date.now()}`,
      })

      const videoPath = (result.path as string).replace(/\\/g, '/')
      console.log(`[generate-i2v] done, path=${videoPath}, mock=${result.mock}`)
      return { ok: true, path: videoPath, mock: result.mock }
    } catch (err) {
      console.error('[generate-i2v] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('sidecar:generate-video', async (_e, params: { prompt: string; duration?: number }) => {
    if (!pythonSpawner.isReady) return { ok: false, error: 'Sidecar 未启动' }
    try {
      const outputDir = join(app.getPath('documents'), 'VideoAIStudio', 'projects', 'videos')
      const { readFile } = await import('fs/promises')

      const videoConfig = await aiModelConfig.get('textToVideo')
      const apiKey = videoConfig?.apiKey || ''
      const model = videoConfig?.modelName || 'happyhorse-1.0-t2v'

      console.log(`[generate-video] model=${model}, hasKey=${!!apiKey}, duration=${params.duration || 5}s`)

      const result = await pythonSpawner.call('/generate_video', {
        prompt: params.prompt,
        api_key: apiKey,
        model: model,
        duration: params.duration || 5,
        output_dir: outputDir,
        filename: `video_${Date.now()}`,
      })

      const videoPath = (result.path as string).replace(/\\/g, '/')
      console.log(`[generate-video] done, path=${videoPath}, mock=${result.mock}`)
      return { ok: true, path: videoPath, mock: result.mock }
    } catch (err) {
      console.error('[generate-video] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('sidecar:generate-image', async (_e, params: { prompt: string; characterId: string }) => {
    if (!pythonSpawner.isReady) return { ok: false, error: 'Sidecar 未启动' }
    try {
      const outputDir = join(app.getPath('documents'), 'VideoAIStudio', 'projects', 'characters')
      const { readFile } = await import('fs/promises')

      const imgConfig = await aiModelConfig.get('textToImage')
      const apiKey = imgConfig?.apiKey || ''
      const model = imgConfig?.modelName || 'wan2.7-image-pro'

      console.log(`[generate-image] characterId=${params.characterId}, model=${model}, hasKey=${!!apiKey}`)

      const result = await pythonSpawner.call('/generate_image', {
        prompt: params.prompt,
        character_id: params.characterId,
        api_key: apiKey,
        model: model,
        output_dir: outputDir,
        filename: params.characterId,
      })

      const imagePath = (result.path as string).replace(/\\/g, '/')
      // 读取图片转 base64 data URL，避免 file:// 协议问题
      const imageBuffer = await readFile(imagePath)
      const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`
      console.log(`[generate-image] done, path=${imagePath}, size=${imageBuffer.length}, mock=${result.mock}`)
      return { ok: true, path: imagePath, dataUrl, mock: result.mock }
    } catch (err) {
      console.error('[generate-image] failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
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
