import { useState, useEffect } from 'react'

const api = () => window.electronAPI

export default function SettingsPage() {
  const [llmProvider, setLlmProvider] = useState('claude')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [sidecarStatus, setSidecarStatus] = useState<string>('未启动')
  const [ffmpegStatus, setFfmpegStatus] = useState<string>('检测中...')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!api()) {
      setFfmpegStatus('Electron API 不可用')
      return
    }
    checkFfmpeg()
    checkSidecar()
    loadLlmConfig()
  }, [])

  const checkFfmpeg = async () => {
    const result = await api()!.ffmpeg.detect()
    setFfmpegStatus(result.available ? (result.version || '可用') : '未安装')
  }

  const checkSidecar = async () => {
    const result = await api()!.sidecar.health()
    setSidecarStatus(result.status === 'ok' ? `运行中 (${result.mode})` : '未启动')
  }

  const loadLlmConfig = async () => {
    const config = await api()!.llm.getConfig()
    if (config) {
      setLlmProvider(config.provider)
      setLlmApiKey(config.apiKey || '')
      setLlmBaseUrl(config.baseUrl || '')
      setLlmModel(config.model || '')
    }
  }

  const saveLlmConfig = async () => {
    if (!api()) return
    await api()!.llm.configure({
      provider: llmProvider,
      apiKey: llmApiKey,
      baseUrl: llmBaseUrl || undefined,
      model: llmModel || undefined,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const startSidecar = async () => {
    if (!api()) return
    setSidecarStatus('启动中...')
    const result = await api()!.sidecar.start()
    setSidecarStatus(result.ready ? `运行中 (${result.mode})` : `失败: ${result.error || '未知错误'}`)
  }

  return (
    <div className="h-full overflow-auto p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold">设置</h1>

        {/* LLM 配置 */}
        <section className="bg-dark-800 border border-dark-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">LLM API 配置</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-dark-400 mb-1">Provider</label>
              <select
                value={llmProvider}
                onChange={e => setLlmProvider(e.target.value)}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="claude">Anthropic Claude</option>
                <option value="openai">OpenAI GPT</option>
                <option value="custom">自定义 (OpenAI 兼容)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-dark-400 mb-1">API Key</label>
              <input
                type="password"
                value={llmApiKey}
                onChange={e => setLlmApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
            </div>
            {llmProvider === 'custom' && (
              <div>
                <label className="block text-sm text-dark-400 mb-1">Base URL</label>
                <input
                  value={llmBaseUrl}
                  onChange={e => setLlmBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-dark-400 mb-1">Model (可选)</label>
              <input
                value={llmModel}
                onChange={e => setLlmModel(e.target.value)}
                placeholder="默认模型"
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
            </div>
            <button
              onClick={saveLlmConfig}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-white font-medium transition-colors"
            >
              {saved ? '已保存' : '保存 LLM 配置'}
            </button>
          </div>
        </section>

        {/* Python Sidecar */}
        <section className="bg-dark-800 border border-dark-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Python Sidecar</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-400 text-sm">状态: <span className="text-white">{sidecarStatus}</span></p>
            </div>
            <button
              onClick={startSidecar}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-white text-sm transition-colors"
            >
              启动 Sidecar
            </button>
          </div>
        </section>

        {/* FFmpeg */}
        <section className="bg-dark-800 border border-dark-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">FFmpeg</h2>
          <p className="text-dark-400 text-sm">状态: <span className="text-white">{ffmpegStatus}</span></p>
          {ffmpegStatus === '未安装' && (
            <p className="text-yellow-400 text-sm mt-2">
              请安装 FFmpeg 并加入系统 PATH，或在下方指定路径。
            </p>
          )}
        </section>

        {/* 视频 Provider */}
        <section className="bg-dark-800 border border-dark-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">视频生成 Provider</h2>
          <ProviderList />
        </section>
      </div>
    </div>
  )
}

function ProviderList() {
  const [providers, setProviders] = useState<any[]>([])

  useEffect(() => {
    if (!api()) return
    api()!.provider.list().then(setProviders)
  }, [])

  return (
    <div className="space-y-3">
      {providers.map(p => (
        <div key={p.id} className="flex items-center justify-between p-3 bg-dark-900 rounded-lg">
          <div>
            <span className="font-medium text-white">{p.displayName}</span>
            <span className="ml-2 text-xs text-dark-400">{p.id}</span>
          </div>
          <span className={`text-xs px-2 py-1 rounded ${p.configured ? 'bg-green-900/50 text-green-400' : 'bg-dark-700 text-dark-400'}`}>
            {p.configured ? '已配置' : '未配置'}
          </span>
        </div>
      ))}
    </div>
  )
}
