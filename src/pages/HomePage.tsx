import { useEffect, useState } from 'react'
import { useProjectStore } from '../stores/project-store'

export default function HomePage() {
  const { projects, loadProjects, createProject, openProject, loading, error } = useProjectStore()
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [style, setStyle] = useState('anime')
  const [duration, setDuration] = useState(300)

  useEffect(() => {
    loadProjects()
  }, [])

  const handleCreate = async () => {
    if (!title.trim()) return
    await createProject(title.trim(), duration, style)
    setShowNew(false)
    setTitle('')
  }

  const handleOpen = async () => {
    if (!window.electronAPI) return
    const dir = await window.electronAPI.dialog.openDirectory()
    if (dir) await openProject(dir)
  }

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="h-full flex flex-col items-center p-8 overflow-auto">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-primary-400 mb-3">Video AI Studio</h1>
        <p className="text-dark-400 max-w-lg">
          输入你的创意，AI 自动生成长视频。零服务端依赖，所有数据和推理在本地完成。
        </p>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-4 mb-10">
        <button
          onClick={() => setShowNew(true)}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg text-white font-medium transition-colors"
        >
          新建项目
        </button>
        <button
          onClick={handleOpen}
          className="px-6 py-3 bg-dark-700 hover:bg-dark-600 rounded-lg text-white font-medium transition-colors border border-dark-600"
        >
          打开项目
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="w-full max-w-2xl mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* 新建项目对话框 */}
      {showNew && (
        <div className="w-full max-w-md bg-dark-800 border border-dark-600 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">新建项目</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-dark-400 mb-1">项目标题 / 创意</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：一个少年意外穿越到异世界..."
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-dark-400 mb-1">视觉风格</label>
                <select
                  value={style}
                  onChange={e => setStyle(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="anime">动漫 / 日系</option>
                  <option value="realistic">写实</option>
                  <option value="3d">3D 渲染</option>
                  <option value="watercolor">水彩</option>
                  <option value="comic">漫画</option>
                  <option value="cinematic">电影感</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-dark-400 mb-1">目标时长 (秒)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  min={60}
                  max={600}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={loading || !title.trim()}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
              >
                {loading ? '创建中...' : '创建'}
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-dark-300 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 最近项目列表 */}
      {projects.length > 0 && (
        <div className="w-full max-w-2xl">
          <h2 className="text-lg font-semibold mb-3 text-dark-300">最近项目</h2>
          <div className="space-y-2">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => openProject(p.path)}
                className="w-full flex items-center justify-between p-4 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-left transition-colors"
              >
                <div>
                  <div className="font-medium text-white">{p.title}</div>
                  <div className="text-sm text-dark-400">
                    {p.pipelineState.phase === 'done' ? '已完成' : p.pipelineState.phase} · {formatDate(p.updatedAt)}
                  </div>
                </div>
                <div className="text-dark-500 text-sm">
                  {Math.floor(p.durationTargetSec / 60)} 分钟
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
