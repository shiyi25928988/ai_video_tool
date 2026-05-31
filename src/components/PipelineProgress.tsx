import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'
import type { ShotScript } from '../../electron/main/script-optimizer/types'

const api = () => window.electronAPI

export default function PipelineProgress() {
  const { currentProject, startPipeline, pipelineProgress, loading, error, refreshProject } = useProjectStore()
  const [previewShot, setPreviewShot] = useState<ShotScript | null>(null)
  const [confirmShot, setConfirmShot] = useState<ShotScript | null>(null)

  // 监听 shot:confirm 事件
  useEffect(() => {
    if (!api()) return
    const unsub = api()!.pipeline.onShotConfirm((shot: ShotScript) => {
      setConfirmShot(shot)
      refreshProject()
    })
    return unsub
  }, [])

  const handleConfirmNext = () => {
    setConfirmShot(null)
    api()?.pipeline.confirmNext()
  }

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

  const canStart = state.phase === 'idle' || state.phase === 'done' || state.phase === 'error' || failed > 0

  const resetAndStart = async () => {
    if (!window.electronAPI) return
    // 重置所有非 pending 的 shot 状态为 pending
    if (currentProject.script) {
      const chapters = currentProject.script.chapters.map(ch => ({
        ...ch,
        shots: ch.shots.map(s => ({ ...s, status: 'pending' as const }))
      }))
      await window.electronAPI.project.update({
        script: { chapters },
        pipelineState: { phase: 'idle', totalShots: 0, completedShots: 0, failedShots: 0, estimatedRemainingSec: 0 }
      })
      await refreshProject()
    }
    startPipeline()
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
              <p className={`text-lg font-semibold ${state.phase === 'error' ? 'text-red-400' : 'text-white'}`}>
                {phaseLabel[state.phase] || state.phase}
              </p>
            </div>
            {canStart && (
              <button
                onClick={resetAndStart}
                disabled={loading || !currentProject.script}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
              >
                {state.phase === 'idle' ? '开始渲染' : '重新渲染'}
              </button>
            )}
            {loading && !canStart && (
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
                    <button
                      key={shot.id}
                      onClick={() => setPreviewShot(shot)}
                      className={`w-10 h-10 rounded flex items-center justify-center text-xs font-medium transition-colors ${
                        shot.status === 'done' ? 'bg-green-900/50 text-green-400 hover:bg-green-800/50' :
                        shot.status === 'rendering' ? 'bg-yellow-900/50 text-yellow-400 animate-pulse' :
                        shot.status === 'failed' ? 'bg-red-900/50 text-red-400 hover:bg-red-800/50' :
                        'bg-dark-700 text-dark-400 hover:bg-dark-600'
                      }`}
                      title={`${shot.id}: ${shot.status}`}
                    >
                      {shot.order}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分镜预览弹窗 */}
        {previewShot && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setPreviewShot(null)}>
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  分镜 #{previewShot.order} <span className="text-sm text-dark-400 ml-2">{previewShot.id}</span>
                </h3>
                <button onClick={() => setPreviewShot(null)} className="text-dark-400 hover:text-white text-xl">×</button>
              </div>

              {/* 视频预览 */}
              {previewShot.assets?.video && (
                <div className="mb-4">
                  <p className="text-xs text-dark-400 mb-1">视频</p>
                  <video
                    src={`file:///${previewShot.assets.video.replace(/\\/g, '/')}`}
                    controls autoPlay
                    className="w-full rounded-lg border border-dark-600"
                  />
                </div>
              )}

              {/* 图片预览 */}
              {previewShot.assets?.image && !previewShot.assets?.video && (
                <div className="mb-4">
                  <p className="text-xs text-dark-400 mb-1">图片</p>
                  <img
                    src={`file:///${previewShot.assets.image.replace(/\\/g, '/')}`}
                    alt={previewShot.id}
                    className="w-full rounded-lg border border-dark-600"
                  />
                </div>
              )}

              {/* 无素材 */}
              {!previewShot.assets?.image && !previewShot.assets?.video && (
                <div className="py-8 text-center text-dark-500 text-sm">暂无渲染素材</div>
              )}

              {/* 分镜信息 */}
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-dark-400">状态：</span>
                  <span className={
                    previewShot.status === 'done' ? 'text-green-400' :
                    previewShot.status === 'failed' ? 'text-red-400' :
                    previewShot.status === 'rendering' ? 'text-yellow-400' : 'text-dark-300'
                  }>{previewShot.status}</span>
                </div>
                <div>
                  <span className="text-dark-400">时长：</span>
                  <span className="text-dark-200">{previewShot.durationSec}s</span>
                </div>
                <div>
                  <span className="text-dark-400">类型：</span>
                  <span className="text-dark-200">{previewShot.shotType}</span>
                </div>
                <div>
                  <span className="text-dark-400">场景：</span>
                  <span className="text-dark-200">{previewShot.sceneDescription}</span>
                </div>
                {previewShot.dialogue?.length > 0 && (
                  <div>
                    <span className="text-dark-400">台词：</span>
                    {previewShot.dialogue.map((d, i) => (
                      <div key={i} className="ml-2 text-dark-200">
                        <span className="text-primary-400">{d.characterId}:</span> {d.text}
                      </div>
                    ))}
                  </div>
                )}
                {previewShot.error && (
                  <div className="text-red-400">错误：{previewShot.error}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 渲染确认对话框 — 每个分镜完成后弹出 */}
        {confirmShot && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-auto">
              <h3 className="text-lg font-semibold text-white mb-2">
                分镜 #{confirmShot.order} 渲染{confirmShot.status === 'done' ? '完成' : '失败'}
              </h3>

              {/* 预览 */}
              {confirmShot.status === 'done' && confirmShot.assets?.video && (
                <video
                  src={`file:///${confirmShot.assets.video.replace(/\\/g, '/')}`}
                  controls autoPlay muted
                  className="w-full rounded-lg border border-dark-600 mb-3"
                />
              )}
              {confirmShot.status === 'done' && confirmShot.assets?.image && !confirmShot.assets?.video && (
                <img
                  src={`file:///${confirmShot.assets.image.replace(/\\/g, '/')}`}
                  alt={confirmShot.id}
                  className="w-full rounded-lg border border-dark-600 mb-3"
                />
              )}
              {confirmShot.status === 'failed' && (
                <div className="mb-3 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
                  {confirmShot.error || '未知错误'}
                </div>
              )}

              <p className="text-dark-400 text-sm mb-4">{confirmShot.sceneDescription}</p>

              <div className="flex gap-3">
                <button onClick={handleConfirmNext}
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-white font-medium transition-colors">
                  继续下一个
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
