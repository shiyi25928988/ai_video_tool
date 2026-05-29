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
      <div className="flex-1 overflow-hidden">
        {activeTab === 'script' && <StoryboardEditor />}
        {activeTab === 'characters' && <CharacterManager />}
        {activeTab === 'render' && <PipelineProgress />}
        {activeTab === 'preview' && <PreviewPanel />}
        {activeTab === 'export' && <ExportPanel />}
      </div>
    </div>
  )
}

function CharacterManager() {
  const { currentProject } = useProjectStore()
  if (!currentProject) return null

  return (
    <div className="h-full overflow-auto p-6">
      <h2 className="text-xl font-semibold mb-4">角色管理</h2>
      {currentProject.characters.length === 0 ? (
        <p className="text-dark-400">暂无角色。请先在剧本编辑器中生成剧本。</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {currentProject.characters.map(char => (
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
