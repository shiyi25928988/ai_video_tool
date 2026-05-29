import { useProjectStore } from '../stores/project-store'

export default function PipelineProgress() {
  const { currentProject, startPipeline, pipelineProgress, loading, error } = useProjectStore()

  if (!currentProject) return null

  const state = currentProject.pipelineState
  const total = state.totalShots
  const done = state.completedShots
  const failed = state.failedShots
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  const phaseLabel: Record<string, string> = {
    idle: '空闲',
    script: '剧本生成',
    characters: '角色生成',
    rendering: '分镜渲染',
    compositing: '视频组装',
    done: '完成',
    error: '错误',
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold mb-6">渲染进度</h2>

        {/* 状态卡片 */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-dark-400">当前阶段</p>
              <p className="text-lg font-semibold text-white">
                {phaseLabel[state.phase] || state.phase}
              </p>
            </div>
            {state.phase === 'idle' && (
              <button
                onClick={startPipeline}
                disabled={loading || !currentProject.script}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
              >
                开始渲染
              </button>
            )}
            {loading && state.phase !== 'idle' && (
              <div className="text-yellow-400 text-sm animate-pulse">运行中...</div>
            )}
          </div>

          {/* 进度条 */}
          {total > 0 && (
            <div>
              <div className="flex justify-between text-sm text-dark-400 mb-2">
                <span>分镜进度</span>
                <span>{done}/{total} ({progress}%)</span>
              </div>
              <div className="h-3 bg-dark-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {failed > 0 && (
                <p className="text-xs text-red-400 mt-2">{failed} 个分镜失败</p>
              )}
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* 分镜列表 */}
        {currentProject.script && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-dark-400 mb-3">分镜列表</h3>
            {currentProject.script.chapters.map((chapter, ci) => (
              <div key={ci}>
                <p className="text-xs text-dark-500 mb-1">{chapter.title}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {chapter.shots.map(shot => (
                    <div
                      key={shot.id}
                      className={`w-10 h-10 rounded flex items-center justify-center text-xs font-medium ${
                        shot.status === 'done' ? 'bg-green-900/50 text-green-400' :
                        shot.status === 'rendering' ? 'bg-yellow-900/50 text-yellow-400 animate-pulse' :
                        shot.status === 'failed' ? 'bg-red-900/50 text-red-400' :
                        'bg-dark-700 text-dark-400'
                      }`}
                      title={`${shot.id}: ${shot.status}`}
                    >
                      {shot.order}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
