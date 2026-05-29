import { useState } from 'react'
import { useProjectStore } from './stores/project-store'
import HomePage from './pages/HomePage'
import WorkspacePage from './pages/WorkspacePage'
import SettingsPage from './pages/SettingsPage'

type View = 'home' | 'workspace' | 'settings'

function App() {
  const [currentView, setCurrentView] = useState<View>('home')
  const { currentProject } = useProjectStore()

  return (
    <div className="h-screen w-screen flex flex-col bg-dark-900 text-dark-50">
      {/* 顶部导航栏 */}
      <header
        className="h-12 flex items-center justify-between px-4 bg-dark-800 border-b border-dark-700 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-primary-400">Video AI Studio</span>
          {currentProject && (
            <span className="text-sm text-dark-400">— {currentProject.title}</span>
          )}
        </div>
        <nav
          className="flex gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <NavButton
            label="项目"
            active={currentView === 'home'}
            onClick={() => setCurrentView('home')}
          />
          <NavButton
            label="工作区"
            active={currentView === 'workspace'}
            onClick={() => setCurrentView('workspace')}
          />
          <NavButton
            label="设置"
            active={currentView === 'settings'}
            onClick={() => setCurrentView('settings')}
          />
        </nav>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 overflow-hidden">
        {currentView === 'home' && <HomePage />}
        {currentView === 'workspace' && <WorkspacePage />}
        {currentView === 'settings' && <SettingsPage />}
      </main>

      {/* 底部状态栏 */}
      <footer className="h-7 flex items-center px-4 bg-dark-800 border-t border-dark-700 text-xs text-dark-500">
        {currentProject ? (
          <span>
            阶段: {currentProject.pipelineState.phase} ·
            分镜: {currentProject.pipelineState.completedShots}/{currentProject.pipelineState.totalShots}
          </span>
        ) : (
          <span>就绪</span>
        )}
      </footer>
    </div>
  )
}

function NavButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-sm transition-colors ${
        active
          ? 'bg-primary-600 text-white'
          : 'text-dark-300 hover:text-white hover:bg-dark-700'
      }`}
    >
      {label}
    </button>
  )
}

export default App
