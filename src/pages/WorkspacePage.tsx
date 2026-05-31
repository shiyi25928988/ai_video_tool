import { useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import StoryboardEditor from '../components/StoryboardEditor'
import CharacterCard from '../components/CharacterCard'
import PipelineProgress from '../components/PipelineProgress'

const TABS = [
  { id: 'script' as const, label: '剧本编辑器' },
  { id: 'characters' as const, label: '角色管理' },
  { id: 'render' as const, label: '渲染进度' },
  { id: 'preview' as const, label: '预览' },
  { id: 'export' as const, label: '导出' },
  { id: 'test' as const, label: '模型测试' },
]

export default function WorkspacePage() {
  const { currentProject, activeTab, setActiveTab } = useProjectStore()

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center text-dark-400">
        <p>请先创建或打开一个项目</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab 栏 */}
      <div className="flex border-b border-dark-700 bg-dark-800">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-dark-400 hover:text-dark-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'script' && <StoryboardEditor />}
        {activeTab === 'characters' && <CharacterManager />}
        {activeTab === 'render' && <PipelineProgress />}
        {activeTab === 'preview' && <PreviewPanel />}
        {activeTab === 'export' && <ExportPanel />}
        {activeTab === 'test' && <ModelTestPanel />}
      </div>
    </div>
  )
}

function CharacterManager() {
  const { currentProject } = useProjectStore()
  if (!currentProject) return null
  const characters = currentProject.characters || []

  return (
    <div className="h-full overflow-auto p-6">
      <h2 className="text-xl font-semibold mb-4">角色管理</h2>
      {characters.length === 0 ? (
        <p className="text-dark-400">暂无角色。请先在剧本编辑器中生成剧本。</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map(char => (
            <CharacterCard key={char.id} character={char} />
          ))}
        </div>
      )}
    </div>
  )
}

function PreviewPanel() {
  return (
    <div className="h-full flex items-center justify-center text-dark-400">
      <div className="text-center">
        <p className="text-lg mb-2">视频预览</p>
        <p className="text-sm">渲染完成后可在此预览和检查分镜</p>
      </div>
    </div>
  )
}

function ExportPanel() {
  return (
    <div className="h-full flex items-center justify-center text-dark-400">
      <div className="text-center">
        <p className="text-lg mb-2">导出设置</p>
        <p className="text-sm">渲染完成后可在此导出最终视频</p>
      </div>
    </div>
  )
}

const api = () => window.electronAPI

interface TestResult {
  ok: boolean
  msg: string
  duration?: number
  path?: string
}

const MODEL_TESTS = [
  {
    id: 'image',
    title: '文生图',
    desc: '测试文生图模型（DashScope wan2.7-image-pro）',
    placeholder: '一只橘猫坐在窗台上晒太阳',
    fields: [],
  },
  {
    id: 'i2v',
    title: '图生视频',
    desc: '测试图生视频模型（DashScope wan2.6-i2v-flash），需要先生成一张基准图',
    placeholder: '一只可爱的小猫在阳光下伸懒腰，镜头缓慢拉远',
    fields: [{ key: 'duration', label: '时长(秒)', default: 5, min: 3, max: 15 }],
  },
  {
    id: 'video',
    title: '文生视频',
    desc: '测试文生视频模型（DashScope happyhorse-1.0-t2v）',
    placeholder: '一座微型城市在夜晚焕发生机，硬纸板火车缓缓驶过',
    fields: [{ key: 'duration', label: '时长(秒)', default: 5, min: 3, max: 15 }],
  },
  {
    id: 'tts',
    title: '语音合成 (TTS)',
    desc: '测试 TTS 模型（CosyVoice）',
    placeholder: '你好，欢迎使用视频AI工作室。',
    fields: [],
  },
] as const

function ModelTestPanel() {
  const [testStates, setTestStates] = useState<Record<string, {
    prompt: string
    loading: boolean
    result: TestResult | null
    extra: Record<string, number>
    imageUrl: string
  }>>({
    image: { prompt: '一只橘猫坐在窗台上晒太阳，温暖的阳光照在毛发上', loading: false, result: null, extra: {}, imageUrl: '' },
    i2v: { prompt: '一只可爱的小猫在阳光下伸懒腰，镜头缓慢拉远', loading: false, result: null, extra: { duration: 5 }, imageUrl: '' },
    video: { prompt: '一座微型城市在夜晚焕发生机，硬纸板火车缓缓驶过', loading: false, result: null, extra: { duration: 5 }, imageUrl: '' },
    tts: { prompt: '你好，欢迎使用视频AI工作室。', loading: false, result: null, extra: {}, imageUrl: '' },
  })

  const runTest = async (testId: string) => {
    if (!api()) return
    const state = testStates[testId]
    setTestStates(prev => ({ ...prev, [testId]: { ...prev[testId], loading: true, result: null } }))

    const startTime = Date.now()
    try {
      let result: any
      if (testId === 'image') {
        result = await api()!.sidecar.generateImage({ prompt: state.prompt, characterId: `test_${Date.now()}` })
      } else if (testId === 'i2v') {
        if (!state.imageUrl) {
          setTestStates(prev => ({ ...prev, [testId]: { ...prev[testId], loading: false, result: { ok: false, msg: '请先生成一张图片作为首帧' } } }))
          return
        }
        result = await api()!.sidecar.generateI2V({ prompt: state.prompt, imageUrl: state.imageUrl, duration: state.extra.duration || 5 })
      } else if (testId === 'video') {
        result = await api()!.sidecar.generateVideo({ prompt: state.prompt, duration: state.extra.duration || 5 })
      } else if (testId === 'tts') {
        result = await api()!.sidecar.health()
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      if (result?.ok) {
        setTestStates(prev => {
          const update: any = {
            ...prev,
            [testId]: { ...prev[testId], loading: false, result: { ok: true, msg: `成功 (${elapsed}s)`, duration: Number(elapsed), path: result.path } }
          }
          // 文生图成功后，自动把图片路径填入图生视频的 imageUrl
          if (testId === 'image' && result.path) {
            update.i2v = { ...prev.i2v, imageUrl: result.path }
          }
          return update
        })
      } else {
        setTestStates(prev => ({
          ...prev,
          [testId]: { ...prev[testId], loading: false, result: { ok: false, msg: result?.error || '未知错误' } }
        }))
      }
    } catch (err) {
      setTestStates(prev => ({
        ...prev,
        [testId]: { ...prev[testId], loading: false, result: { ok: false, msg: (err as Error).message } }
      }))
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold mb-2">模型测试</h2>
        <p className="text-dark-400 text-sm mb-6">测试各模型接口是否能正常调用。请先在设置页配置好对应的 API Key 并启动 Sidecar。</p>

        <div className="space-y-6">
          {MODEL_TESTS.map(test => {
            const state = testStates[test.id]
            return (
              <div key={test.id} className="bg-dark-800 border border-dark-700 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-1">{test.title}</h3>
                <p className="text-dark-400 text-xs mb-3">{test.desc}</p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Prompt</label>
                    <textarea
                      value={state.prompt}
                      onChange={e => setTestStates(prev => ({ ...prev, [test.id]: { ...prev[test.id], prompt: e.target.value, result: null } }))}
                      rows={2}
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500 resize-none"
                    />
                  </div>

                  {/* 图生视频：显示首帧图片输入 */}
                  {test.id === 'i2v' && (
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">首帧图片路径（先在文生图测试中生成）</label>
                      <input
                        value={state.imageUrl || ''}
                        onChange={e => setTestStates(prev => ({ ...prev, [test.id]: { ...prev[test.id], imageUrl: e.target.value, result: null } }))}
                        placeholder="先运行文生图测试，自动生成后填入"
                        className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500"
                      />
                      {state.imageUrl && (
                        <img src={`file:///${state.imageUrl.replace(/^\/+/, '').replace(/\\/g, '/')}`} alt="首帧" className="w-24 h-24 mt-2 object-cover rounded border border-dark-600" />
                      )}
                    </div>
                  )}

                  {test.fields.map(field => (
                    <div key={field.key}>
                      <label className="block text-sm text-dark-400 mb-1">{field.label}</label>
                      <input
                        type="number"
                        value={state.extra[field.key] || field.default}
                        onChange={e => setTestStates(prev => ({
                          ...prev,
                          [test.id]: { ...prev[test.id], extra: { ...prev[test.id].extra, [field.key]: Number(e.target.value) }, result: null }
                        }))}
                        min={field.min}
                        max={field.max}
                        className="w-32 px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  ))}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => runTest(test.id)}
                      disabled={state.loading}
                      className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                    >
                      {state.loading ? '测试中...' : '开始测试'}
                    </button>

                    {state.result && (
                      <span className={`text-sm ${state.result.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {state.result.ok ? '✓' : '✗'} {state.result.msg}
                      </span>
                    )}
                  </div>

                  {/* 生成结果预览 */}
                  {state.result?.ok && state.result.path && test.id === 'image' && (
                    <div className="mt-2">
                      <p className="text-xs text-dark-500 mb-1">生成结果:</p>
                      <img
                        src={`file:///${state.result.path.replace(/^\/+/, '').replace(/\\/g, '/')}`}
                        alt="test result"
                        className="w-40 h-40 object-cover rounded-lg border border-dark-600"
                      />
                    </div>
                  )}
                  {state.result?.ok && state.result.path && test.id === 'video' && (
                    <div className="mt-2">
                      <p className="text-xs text-dark-500 mb-1">生成结果:</p>
                      <video
                        src={`file:///${state.result.path.replace(/^\/+/, '').replace(/\\/g, '/')}`}
                        controls
                        className="w-64 rounded-lg border border-dark-600"
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
