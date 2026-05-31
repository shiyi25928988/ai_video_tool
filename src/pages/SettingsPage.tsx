import { useState, useEffect } from 'react'

const api = () => window.electronAPI

/** 带显隐切换的 API Key 输入框 */
function ApiKeyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'sk-...'}
        className="w-full px-3 py-2 pr-10 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-dark-400 hover:text-white transition-colors"
      >
        {visible ? (
          // 睁眼图标
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        ) : (
          // 闭眼图标
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878l4.242 4.242M21 21l-3.122-3.122" />
          </svg>
        )}
      </button>
    </div>
  )
}

interface AIModelEntry {
  provider: string
  apiKey: string
  baseUrl: string
  modelName: string
  saved: boolean
}

interface LLMSummary {
  id: string
  name: string
  baseUrl: string
  model: string
  isActive: boolean
}

interface LLMEditing {
  id?: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

/** 每类模型的可选 Provider 预设（含默认 baseUrl 和模型列表） */
interface ProviderPreset {
  value: string
  label: string
  baseUrl?: string
  models?: string[]
}

const MODEL_PROVIDERS: Record<string, ProviderPreset[]> = {
  textToImage: [
    {
      value: 'dashscope',
      label: '阿里百炼 - 北京',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      models: [
        'wan2.7-image-pro', 'wan2.7-image',
        'qwen-image-2.0-pro', 'qwen-image-2.0', 'qwen-image-max', 'qwen-image-plus',
        'qwen-image-edit-max', 'qwen-image-edit-plus',
        'z-image-turbo',
      ],
    },
    {
      value: 'dashscope-intl',
      label: '阿里百炼 - 新加坡',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      models: ['wan2.7-image-pro', 'wan2.7-image', 'qwen-image-2.0-pro', 'qwen-image-2.0'],
    },
    { value: 'comfyui', label: 'ComfyUI', baseUrl: 'http://127.0.0.1:8188' },
    { value: 'custom', label: '自定义' },
  ],
  imageToVideo: [
    {
      value: 'dashscope',
      label: '阿里百炼 - 北京',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      models: ['wan2.6-i2v-flash', 'wan2.2-kf2v-flash', 'wanx2.1-i2v-turbo', 'wanx2.1-i2v-plus'],
    },
    {
      value: 'dashscope-intl',
      label: '阿里百炼 - 新加坡',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      models: ['wan2.6-i2v-flash', 'wan2.2-kf2v-flash', 'wanx2.1-i2v-turbo', 'wanx2.1-i2v-plus'],
    },
    { value: 'kling', label: '快手可灵' },
    { value: 'jimeng', label: '字节即梦' },
    { value: 'custom', label: '自定义' },
  ],
  textToVideo: [
    {
      value: 'dashscope',
      label: '阿里百炼 - 北京',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      models: ['happyhorse-1.0-t2v', 'wanx2.1-t2v-turbo', 'wanx2.1-t2v-plus'],
    },
    {
      value: 'dashscope-intl',
      label: '阿里百炼 - 新加坡',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      models: ['happyhorse-1.0-t2v', 'wanx2.1-t2v-turbo', 'wanx2.1-t2v-plus'],
    },
    { value: 'kling', label: '快手可灵' },
    { value: 'jimeng', label: '字节即梦' },
    { value: 'custom', label: '自定义' },
  ],
  tts: [
    {
      value: 'dashscope',
      label: '阿里百炼 - 北京',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2speech/generation',
      models: [
        'qwen3-tts-flash', 'qwen3-tts-instruct-flash', 'qwen3-tts-vd', 'qwen3-tts-vc',
        'qwen-tts', 'cosyvoice-v1', 'sambert',
      ],
    },
    {
      value: 'dashscope-intl',
      label: '阿里百炼 - 新加坡',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text2speech/generation',
      models: ['qwen3-tts-flash', 'cosyvoice-v1', 'sambert'],
    },
    {
      value: 'minimax',
      label: 'MiniMax',
      models: ['speech-02-hd', 'speech-02-turbo', 'speech-2.8-hd', 'speech-2.8-turbo'],
    },
    { value: 'fishspeech', label: 'Fish Speech' },
    { value: 'custom', label: '自定义' },
  ],
}

const AI_SECTIONS = [
  { id: 'textToImage', title: '文生图', desc: '文本描述生成参考图片，如 Stable Diffusion、Midjourney 等' },
  { id: 'imageToVideo', title: '图生视频', desc: '参考图片生成动态视频，如可灵、即梦、Pika 等' },
  { id: 'textToVideo', title: '文生视频', desc: '文本描述直接生成视频，如 Sora、可灵等' },
  { id: 'tts', title: '语音合成 (TTS)', desc: '文本转语音，如 CosyVoice、Azure TTS 等' },
] as const

export default function SettingsPage() {
  const [sidecarStatus, setSidecarStatus] = useState<string>('未启动')
  const [ffmpegStatus, setFfmpegStatus] = useState<string>('检测中...')
  const [workspacePath, setWorkspacePath] = useState<string>('')
  const [workspaceIsDefault, setWorkspaceIsDefault] = useState(true)

  // LLM 多配置
  const [llmConfigs, setLlmConfigs] = useState<LLMSummary[]>([])
  const [llmEditing, setLlmEditing] = useState<LLMEditing | null>(null)
  const [llmTesting, setLlmTesting] = useState(false)
  const [llmTestResult, setLlmTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [llmModels, setLlmModels] = useState<string[]>([])
  const [llmModelsLoading, setLlmModelsLoading] = useState(false)

  // AI 模型配置 — 每个 section 独立缓存检测到的模型列表
  const [aiDetectedModels, setAiDetectedModels] = useState<Record<string, string[]>>({})
  const [aiModelsLoading, setAiModelsLoading] = useState<string | null>(null) // 正在检测的 sectionId

  const [aiConfigs, setAiConfigs] = useState<Record<string, AIModelEntry>>({
    textToImage: { provider: 'dashscope', apiKey: '', baseUrl: '', modelName: '', saved: false },
    imageToVideo: { provider: 'dashscope', apiKey: '', baseUrl: '', modelName: '', saved: false },
    textToVideo: { provider: 'dashscope', apiKey: '', baseUrl: '', modelName: '', saved: false },
    tts: { provider: 'dashscope', apiKey: '', baseUrl: '', modelName: '', saved: false },
  })

  useEffect(() => {
    if (!api()) {
      setFfmpegStatus('Electron API 不可用')
      return
    }
    checkFfmpeg()
    checkSidecar()
    loadLlmConfigs()
    loadAIModelConfigs()
    loadWorkspace()
  }, [])

  const loadWorkspace = async () => {
    if (!api()) return
    try {
      const ws = await api()!.workspace.get()
      setWorkspacePath(ws.path)
      setWorkspaceIsDefault(ws.isDefault)
    } catch {}
  }

  const changeWorkspace = async () => {
    if (!api()) return
    const dir = await api()!.dialog.openDirectory()
    if (dir) {
      await api()!.workspace.set(dir)
      setWorkspacePath(dir)
      setWorkspaceIsDefault(false)
    }
  }

  const checkFfmpeg = async () => {
    const result = await api()!.ffmpeg.detect()
    setFfmpegStatus(result.available ? (result.version || '可用') : '未安装')
  }

  const checkSidecar = async () => {
    try {
      const result = await api()!.sidecar.health()
      setSidecarStatus(result.status === 'ok' ? `运行中 (${result.mode})` : '未启动')
    } catch {
      setSidecarStatus('检测失败')
    }
  }

  // ── LLM 多配置 ──────────────────────────────────────────

  const loadLlmConfigs = async () => {
    if (!api()) return
    try {
      const list = await api()!.llm.list()
      setLlmConfigs(list)
    } catch (err) {
      console.error('[LLM] load configs failed:', err)
    }
  }

  const saveLlmConfig = async () => {
    if (!api() || !llmEditing) return
    if (!llmEditing.name.trim()) {
      setLlmTestResult({ ok: false, msg: '请填写配置名称' })
      return
    }
    await api()!.llm.save({
      id: llmEditing.id,
      name: llmEditing.name,
      baseUrl: llmEditing.baseUrl,
      apiKey: llmEditing.apiKey,
      model: llmEditing.model || undefined,
    })
    setLlmEditing(null)
    setLlmTestResult(null)
    await loadLlmConfigs()
  }

  const deleteLlmConfig = async (id: string) => {
    if (!api()) return
    await api()!.llm.remove(id)
    if (llmEditing?.id === id) setLlmEditing(null)
    await loadLlmConfigs()
  }

  const setActiveLlm = async (id: string) => {
    if (!api()) return
    await api()!.llm.setActive(id)
    await loadLlmConfigs()
  }

  const startEditLlm = async (id?: string) => {
    if (!api()) return
    setLlmTestResult(null)
    setLlmModels([])
    if (id) {
      const full = await api()!.llm.get(id)
      if (full) {
        setLlmEditing({ id: full.id, name: full.name, baseUrl: full.baseUrl, apiKey: full.apiKey, model: full.model || '' })
      }
    } else {
      setLlmEditing({ name: '', baseUrl: '', apiKey: '', model: '' })
    }
  }

  const testLlmConfig = async () => {
    if (!api() || !llmEditing) return
    if (!llmEditing.apiKey) {
      setLlmTestResult({ ok: false, msg: '请先填写 API Key' })
      return
    }
    setLlmTesting(true)
    setLlmTestResult(null)
    try {
      const res = await api()!.llm.test({
        apiKey: llmEditing.apiKey,
        baseUrl: llmEditing.baseUrl || undefined,
        model: llmEditing.model || undefined,
      })
      setLlmTestResult(res.ok
        ? { ok: true, msg: `模型: ${res.model} | 回复: ${res.reply}` }
        : { ok: false, msg: res.error }
      )
    } catch (err) {
      setLlmTestResult({ ok: false, msg: (err as Error).message })
    } finally {
      setLlmTesting(false)
    }
  }

  const fetchLlmModels = async () => {
    if (!api() || !llmEditing) return
    if (!llmEditing.apiKey || !llmEditing.baseUrl) {
      setLlmTestResult({ ok: false, msg: '请先填写 Base URL 和 API Key' })
      return
    }
    setLlmModelsLoading(true)
    setLlmTestResult(null)
    try {
      const res = await api()!.llm.listModels({ apiKey: llmEditing.apiKey, baseUrl: llmEditing.baseUrl })
      if (res.ok) {
        setLlmModels(res.models)
        if (res.models.length === 0) {
          setLlmTestResult({ ok: false, msg: '未获取到模型列表' })
        }
      } else {
        setLlmTestResult({ ok: false, msg: res.error })
      }
    } catch (err) {
      setLlmTestResult({ ok: false, msg: (err as Error).message })
    } finally {
      setLlmModelsLoading(false)
    }
  }

  // ── AI 模型配置 ──────────────────────────────────────────

  const loadAIModelConfigs = async () => {
    if (!api()) return
    try {
      const list = await api()!.aiModel.list()
      if (!list || !Array.isArray(list)) return
      for (const item of list) {
        if (item.configured) {
          const full = await api()!.aiModel.get(item.id)
          if (full) {
            setAiConfigs(prev => ({
              ...prev,
              [item.id]: { provider: full.provider || '', apiKey: full.apiKey || '', baseUrl: full.baseUrl || '', modelName: full.modelName || '', saved: true },
            }))
          }
        }
        // 加载缓存的检测模型列表
        const cached = await api()!.aiModel.getDetected(item.id)
        if (cached && cached.length > 0) {
          setAiDetectedModels(prev => ({ ...prev, [item.id]: cached }))
        }
      }
    } catch (err) {
      console.error('[AIModel] load configs failed:', err)
    }
  }

  const saveAIConfig = async (id: string) => {
    if (!api()) return
    const entry = aiConfigs[id]
    if (!entry) return
    await api()!.aiModel.save(id, { provider: entry.provider, apiKey: entry.apiKey, baseUrl: entry.baseUrl || undefined, modelName: entry.modelName || undefined })
    setAiConfigs(prev => ({ ...prev, [id]: { ...prev[id], saved: true } }))
    setTimeout(() => { setAiConfigs(prev => ({ ...prev, [id]: { ...prev[id], saved: false } })) }, 2000)
  }

  const updateAiField = (id: string, field: keyof AIModelEntry, value: string) => {
    setAiConfigs(prev => ({ ...prev, [id]: { ...prev[id], [field]: value, saved: false } }))
  }

  const fetchAIModels = async (sectionId: string) => {
    if (!api()) return
    const entry = aiConfigs[sectionId]
    if (!entry?.apiKey) {
      alert('请先填写 API Key')
      return
    }
    setAiModelsLoading(sectionId)
    try {
      const res = await api()!.aiModel.listModels(sectionId, entry.provider, entry.apiKey)
      if (res.ok && res.models.length > 0) {
        setAiDetectedModels(prev => ({ ...prev, [sectionId]: res.models }))
        // 自动选中第一个
        if (!entry.modelName || !res.models.includes(entry.modelName)) {
          updateAiField(sectionId, 'modelName', res.models[0])
        }
      } else {
        alert(res.error || '未获取到模型列表')
      }
    } catch (err) {
      alert(`检测失败: ${(err as Error).message}`)
    } finally {
      setAiModelsLoading(null)
    }
  }

  // ── Sidecar ──────────────────────────────────────────────

  const testPing = async () => {
    try {
      const result = await api()!.sidecar.health()
      if (result.status === 'ok') {
        alert(`Sidecar 运行中!\n模式: ${result.mode}\nGPU: ${result.gpu ? '是' : '否'}`)
      } else {
        alert(`Sidecar 未运行或不可达\n状态: ${result.status}`)
      }
    } catch (err) {
      alert(`连接失败: ${(err as Error).message}`)
    }
  }

  const startSidecar = async () => {
    if (!api()) return
    setSidecarStatus('启动中...')
    try {
      const result = await api()!.sidecar.start()
      setSidecarStatus(result.ready ? `运行中 (${result.mode})` : `失败: ${result.error || '未知错误'}`)
    } catch (err) {
      setSidecarStatus(`异常: ${(err as Error).message}`)
    }
  }

  const stopSidecar = async () => {
    if (!api()) return
    try {
      await api()!.sidecar.stop()
      setSidecarStatus('已停止')
    } catch (err) {
      setSidecarStatus(`停止失败: ${(err as Error).message}`)
    }
  }

  // ── 渲染 ─────────────────────────────────────────────────

  const onProviderChange = (sectionId: string, providerValue: string) => {
    const presets = MODEL_PROVIDERS[sectionId] || []
    const preset = presets.find(p => p.value === providerValue)
    setAiDetectedModels(prev => { const next = { ...prev }; delete next[sectionId]; return next }) // 切换 Provider 时清除检测结果
    setAiConfigs(prev => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        provider: providerValue,
        // 自动填充 baseUrl
        ...(preset?.baseUrl ? { baseUrl: preset.baseUrl } : {}),
        // 自动选中第一个模型
        ...(preset?.models?.length ? { modelName: preset.models[0] } : {}),
        saved: false,
      },
    }))
  }

  const [aiTestStates, setAiTestStates] = useState<Record<string, { loading: boolean; result: { ok: boolean; msg: string } | null }>>({})
  const [aiTestConfirm, setAiTestConfirm] = useState<string | null>(null)
  const [aiTestImagePath, setAiTestImagePath] = useState('')

  const confirmTestAIModel = (sectionId: string) => {
    const entry = aiConfigs[sectionId]
    if (!entry?.apiKey) {
      setAiTestStates(prev => ({ ...prev, [sectionId]: { loading: false, result: { ok: false, msg: '请先填写 API Key' } } }))
      return
    }
    setAiTestConfirm(sectionId)
    setAiTestImagePath('')
  }

  const pickTestImage = async () => {
    if (!api()) return
    const path = await api()!.dialog.openFile([{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }])
    if (path) setAiTestImagePath(path)
  }

  const testAIModel = async (sectionId: string) => {
    if (!api()) return
    setAiTestConfirm(null)
    setAiTestStates(prev => ({ ...prev, [sectionId]: { loading: true, result: null } }))
    const startTime = Date.now()
    try {
      let result: any
      if (sectionId === 'textToImage') {
        result = await api()!.sidecar.generateImage({ prompt: '一只橘猫坐在窗台上', characterId: `test_${Date.now()}` })
      } else if (sectionId === 'imageToVideo') {
        const imgPath = aiTestImagePath.replace(/\\/g, '/')
        result = await api()!.sidecar.generateI2V({ prompt: '小猫伸懒腰，镜头缓慢拉远', imageUrl: imgPath, duration: 3 })
      } else if (sectionId === 'textToVideo') {
        result = await api()!.sidecar.generateVideo({ prompt: '一座微型城市在夜晚焕发生机', duration: 3 })
      } else if (sectionId === 'tts') {
        result = await api()!.sidecar.health()
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      if (result?.ok) {
        setAiTestStates(prev => ({ ...prev, [sectionId]: { loading: false, result: { ok: true, msg: `成功 (${elapsed}s)` } } }))
      } else {
        setAiTestStates(prev => ({ ...prev, [sectionId]: { loading: false, result: { ok: false, msg: result?.error || '测试失败' } } }))
      }
    } catch (err) {
      setAiTestStates(prev => ({ ...prev, [sectionId]: { loading: false, result: { ok: false, msg: (err as Error).message } } }))
    }
  }

  const renderAISection = (section: typeof AI_SECTIONS[number]) => {
    const entry = aiConfigs[section.id]
    const providers = MODEL_PROVIDERS[section.id] || []
    const currentPreset = providers.find(p => p.value === entry.provider)
    const testState = aiTestStates[section.id]
    return (
      <section key={section.id} className="bg-dark-800 border border-dark-700 rounded-xl p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <button onClick={() => confirmTestAIModel(section.id)} disabled={testState?.loading || !entry.apiKey}
            className="px-3 py-1 text-xs bg-dark-700 hover:bg-primary-600/80 disabled:opacity-50 rounded-lg text-dark-300 hover:text-white transition-colors">
            {testState?.loading ? '测试中...' : '测试模型'}
          </button>
        </div>
        <p className="text-dark-400 text-sm mb-4">{section.desc}</p>
        {testState?.result && (
          <div className={`mb-4 text-xs px-3 py-2 rounded-lg ${testState.result.ok ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
            {testState.result.ok ? '✓' : '✗'} {testState.result.msg}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-dark-400 mb-1">Provider</label>
            <select value={entry.provider} onChange={e => onProviderChange(section.id, e.target.value)}
              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500">
              {providers.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-dark-400 mb-1">API Key</label>
            <ApiKeyInput value={entry.apiKey} onChange={v => updateAiField(section.id, 'apiKey', v)} />
          </div>
          <div>
            <label className="block text-sm text-dark-400 mb-1">API URL</label>
            <input value={entry.baseUrl} onChange={e => updateAiField(section.id, 'baseUrl', e.target.value)}
              placeholder={currentPreset?.baseUrl || 'http://localhost:8080/v1'}
              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-dark-400">模型名称</label>
              <button onClick={() => fetchAIModels(section.id)} disabled={aiModelsLoading === section.id || !entry.apiKey}
                className="text-xs text-primary-400 hover:text-primary-300 disabled:opacity-50 transition-colors">
                {aiModelsLoading === section.id ? '检测中...' : '检测模型'}
              </button>
            </div>
            {(() => {
              // 合并在线检测的模型和预设模型
              const detected = aiDetectedModels[section.id] || []
              const allModels = [...new Set([...detected, ...(currentPreset?.models || [])])]
              if (allModels.length > 0) {
                return (
                  <select value={entry.modelName} onChange={e => updateAiField(section.id, 'modelName', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500">
                    <option value="">-- 请选择模型 --</option>
                    {allModels.map(m => <option key={m} value={m}>{m}</option>)}
                    <option value="__custom__">自定义...</option>
                  </select>
                )
              }
              return (
                <input value={entry.modelName} onChange={e => updateAiField(section.id, 'modelName', e.target.value)} placeholder="默认模型"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500" />
              )
            })()}
          </div>
          <button onClick={() => saveAIConfig(section.id)}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-white font-medium transition-colors">
            {entry.saved ? '已保存' : `保存${section.title}配置`}
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="h-full overflow-auto p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold">设置</h1>

        {/* 工作空间 */}
        <section className="bg-dark-800 border border-dark-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">工作空间</h2>
          <p className="text-dark-400 text-sm mb-3">项目文件存储位置。更改后新项目将创建在新路径。</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-300 text-sm truncate">
              {workspacePath || '加载中...'}
            </div>
            <button onClick={changeWorkspace}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-white text-sm transition-colors flex-shrink-0">
              更改路径
            </button>
          </div>
          {!workspaceIsDefault && (
            <p className="text-yellow-400/70 text-xs mt-2">⚠ 已使用自定义路径，重启应用后生效</p>
          )}
        </section>

        {/* Python Sidecar */}
        <section className="bg-dark-800 border border-dark-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Python Sidecar</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-400 text-sm">状态: <span className="text-white">{sidecarStatus}</span></p>
            </div>
            <div className="flex gap-2">
              <button onClick={testPing} className="px-3 py-2 bg-dark-600 hover:bg-dark-500 rounded-lg text-white text-sm transition-colors">检测状态</button>
              <button onClick={startSidecar} className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-white text-sm transition-colors">启动 Sidecar</button>
              <button onClick={stopSidecar} className="px-4 py-2 bg-red-900/50 hover:bg-red-900/80 rounded-lg text-red-300 text-sm transition-colors">关闭 Sidecar</button>
            </div>
          </div>
        </section>

        {/* LLM 配置 — 多条记录 + 勾选激活 */}
        <section className="bg-dark-800 border border-dark-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-1">LLM API 配置</h2>
          <p className="text-dark-400 text-sm mb-4">支持多条 OpenAI 兼容端点，勾选激活要使用的一条。</p>

          {/* 配置列表 */}
          <div className="space-y-2 mb-4">
            {llmConfigs.length === 0 && (
              <p className="text-dark-500 text-sm py-2">暂无配置，请点击下方添加。</p>
            )}
            {llmConfigs.map(c => (
              <div key={c.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  c.isActive ? 'bg-primary-900/20 border-primary-600' : 'bg-dark-900 border-dark-700 hover:border-dark-500'
                }`}
                onClick={() => setActiveLlm(c.id)}
              >
                {/* Radio */}
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  c.isActive ? 'border-primary-500' : 'border-dark-500'
                }`}>
                  {c.isActive && <div className="w-2 h-2 rounded-full bg-primary-500" />}
                </div>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{c.name}</span>
                    {c.isActive && <span className="text-xs px-1.5 py-0.5 rounded bg-primary-600/30 text-primary-400">使用中</span>}
                  </div>
                  <div className="text-xs text-dark-400 truncate mt-0.5">
                    {c.baseUrl || '(默认)'} {c.model && `· ${c.model}`}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); startEditLlm(c.id) }}
                    className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 rounded text-dark-300 transition-colors">
                    编辑
                  </button>
                  <button onClick={e => { e.stopPropagation(); deleteLlmConfig(c.id) }}
                    className="px-2 py-1 text-xs bg-dark-700 hover:bg-red-900/50 rounded text-dark-300 hover:text-red-400 transition-colors">
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 添加按钮 */}
          <button onClick={() => startEditLlm()}
            className="w-full px-4 py-2 border-2 border-dashed border-dark-600 hover:border-primary-600 rounded-lg text-dark-400 hover:text-primary-400 text-sm transition-colors">
            + 添加 LLM 配置
          </button>

          {/* 编辑表单 */}
          {llmEditing && (
            <div className="mt-4 p-4 bg-dark-900 rounded-lg border border-dark-600 space-y-3">
              <div>
                <label className="block text-sm text-dark-400 mb-1">名称</label>
                <input value={llmEditing.name} onChange={e => setLlmEditing({ ...llmEditing, name: e.target.value })}
                  placeholder="如 OpenAI、DeepSeek、Ollama"
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-sm text-dark-400 mb-1">Base URL</label>
                <input value={llmEditing.baseUrl} onChange={e => setLlmEditing({ ...llmEditing, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-sm text-dark-400 mb-1">API Key</label>
                <ApiKeyInput value={llmEditing.apiKey} onChange={v => setLlmEditing({ ...llmEditing, apiKey: v })} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-dark-400">Model</label>
                  <button onClick={fetchLlmModels} disabled={llmModelsLoading}
                    className="text-xs text-primary-400 hover:text-primary-300 disabled:opacity-50 transition-colors">
                    {llmModelsLoading ? '检测中...' : '检测模型'}
                  </button>
                </div>
                {llmModels.length > 0 ? (
                  <select value={llmEditing.model} onChange={e => setLlmEditing({ ...llmEditing, model: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500">
                    <option value="">-- 请选择模型 --</option>
                    {llmModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input value={llmEditing.model} onChange={e => setLlmEditing({ ...llmEditing, model: e.target.value })}
                    placeholder="gpt-4o、deepseek-chat 等（可点击上方检测）"
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500" />
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={saveLlmConfig}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-white font-medium transition-colors text-sm">
                  保存
                </button>
                <button onClick={testLlmConfig} disabled={llmTesting}
                  className="px-4 py-2 bg-dark-700 hover:bg-dark-600 disabled:opacity-50 rounded-lg text-white font-medium transition-colors text-sm">
                  {llmTesting ? '测试中...' : '测试连接'}
                </button>
                <button onClick={() => { setLlmEditing(null); setLlmTestResult(null); setLlmModels([]) }}
                  className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-dark-300 transition-colors text-sm">
                  取消
                </button>
              </div>
              {llmTestResult && (
                <div className={`text-sm px-3 py-2 rounded-lg ${llmTestResult.ok ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                  {llmTestResult.msg}
                </div>
              )}
            </div>
          )}
        </section>

        {/* AI 模型配置 */}
        {AI_SECTIONS.map(section => renderAISection(section))}

        {/* FFmpeg */}
        <section className="bg-dark-800 border border-dark-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">FFmpeg</h2>
          <p className="text-dark-400 text-sm">状态: <span className="text-white">{ffmpegStatus}</span></p>
          {ffmpegStatus === '未安装' && (
            <p className="text-yellow-400 text-sm mt-2">请安装 FFmpeg 并加入系统 PATH，或在下方指定路径。</p>
          )}
        </section>

      </div>

      {/* 测试确认对话框 */}
      {aiTestConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAiTestConfirm(null)}>
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-2">确认测试</h3>
            <p className="text-dark-300 text-sm mb-3">测试会调用模型接口，将消耗一定的 API 额度。是否继续？</p>

            {/* 图生视频需要选择图片 */}
            {aiTestConfirm === 'imageToVideo' && (
              <div className="mb-4">
                <label className="block text-sm text-dark-400 mb-1">选择首帧图片</label>
                <div className="flex gap-2">
                  <input
                    value={aiTestImagePath}
                    readOnly
                    placeholder="点击右侧按钮选择图片"
                    className="flex-1 px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none"
                  />
                  <button onClick={pickTestImage}
                    className="px-3 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-white text-sm transition-colors">
                    选择
                  </button>
                </div>
                {aiTestImagePath && (
                  <img src={`file:///${aiTestImagePath.replace(/\\/g, '/')}`} alt="预览" className="w-20 h-20 mt-2 object-cover rounded border border-dark-600" />
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => testAIModel(aiTestConfirm)}
                disabled={aiTestConfirm === 'imageToVideo' && !aiTestImagePath}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg text-white font-medium transition-colors">
                确认测试
              </button>
              <button onClick={() => setAiTestConfirm(null)}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-dark-300 transition-colors">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

