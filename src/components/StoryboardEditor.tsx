import { useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import type { Chapter, ShotScript } from '../../electron/main/script-optimizer/types'

export default function StoryboardEditor() {
  const { currentProject, generateScript, loading, scriptProgress, error } = useProjectStore()
  const [userInput, setUserInput] = useState('')
  const [selectedChapter, setSelectedChapter] = useState(0)

  if (!currentProject) return null

  const hasScript = currentProject.script && currentProject.script.chapters.length > 0
  const chapters = currentProject.script?.chapters || []

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 剧本生成区 */}
      {!hasScript && (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <h2 className="text-xl font-semibold mb-4">生成剧本</h2>
          <p className="text-dark-400 mb-4 text-center max-w-md">
            输入你的创意描述，AI 将自动生成完整的故事大纲、章节和分镜脚本。
          </p>

          {scriptProgress && (
            <div className="mb-4 text-sm text-primary-400">
              Layer {scriptProgress.layer} — {scriptProgress.status === 'start' ? '生成中...' : '完成'}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm max-w-md">
              {error}
            </div>
          )}

          <textarea
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder={currentProject.title || '描述你的故事创意...'}
            className="w-full max-w-lg h-32 px-4 py-3 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 resize-none"
          />
          <button
            onClick={() => generateScript(userInput || currentProject.title, currentProject.style)}
            disabled={loading}
            className="mt-4 px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
          >
            {loading ? '生成中...' : '生成剧本'}
          </button>
        </div>
      )}

      {/* 剧本展示区 */}
      {hasScript && (
        <div className="flex-1 flex overflow-hidden">
          {/* 章节列表 */}
          <div className="w-56 bg-dark-800 border-r border-dark-700 overflow-auto">
            <div className="p-3 text-sm font-semibold text-dark-400 border-b border-dark-700">
              章节 ({chapters.length})
            </div>
            {chapters.map((ch, i) => (
              <button
                key={i}
                onClick={() => setSelectedChapter(i)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-l-2 ${
                  selectedChapter === i
                    ? 'bg-dark-700 border-primary-500 text-white'
                    : 'border-transparent text-dark-400 hover:text-dark-200 hover:bg-dark-700/50'
                }`}
              >
                <div className="font-medium">{ch.title}</div>
                <div className="text-xs text-dark-500 mt-0.5">
                  {ch.shots.length} 分镜 · {ch.estimatedDuration}s
                </div>
              </button>
            ))}
          </div>

          {/* 分镜详情 */}
          <div className="flex-1 overflow-auto p-6">
            {chapters[selectedChapter] && (
              <ChapterDetail chapter={chapters[selectedChapter]} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChapterDetail({ chapter }: { chapter: Chapter }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">{chapter.title}</h2>
        <p className="text-dark-400 text-sm mt-1">{chapter.summary}</p>
        <div className="flex gap-4 mt-2 text-xs text-dark-500">
          <span>情绪弧: {chapter.moodArc}</span>
          <span>时长: {chapter.estimatedDuration}s</span>
          <span>BGM: {chapter.bgmSuggestion}</span>
        </div>
      </div>

      <div className="space-y-3">
        {chapter.shots.map((shot, i) => (
          <ShotCard key={shot.id} shot={shot} index={i} />
        ))}
      </div>
    </div>
  )
}

function ShotCard({ shot, index }: { shot: ShotScript; index: number }) {
  const [expanded, setExpanded] = useState(false)

  const statusColor = {
    pending: 'bg-dark-600 text-dark-300',
    rendering: 'bg-yellow-900/50 text-yellow-400',
    done: 'bg-green-900/50 text-green-400',
    failed: 'bg-red-900/50 text-red-400',
  }

  const typeLabel = {
    dialogue: '对白',
    action: '动作',
    transition: '过渡',
    narration: '旁白',
    establishing: '定场',
    reaction: '反应',
    montage: '蒙太奇',
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-700/50 transition-colors"
      >
        <span className="text-dark-500 text-sm w-6">#{index + 1}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${statusColor[shot.status]}`}>
          {shot.status}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-dark-700 text-dark-300">
          {typeLabel[shot.shotType] || shot.shotType}
        </span>
        <span className="text-sm text-dark-300 flex-1 truncate">
          {shot.sceneDescription}
        </span>
        <span className="text-xs text-dark-500">{shot.durationSec}s</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-dark-700">
          <div className="pt-3">
            <p className="text-sm text-dark-400">场景描述</p>
            <p className="text-sm text-dark-200 mt-1">{shot.sceneDescription}</p>
          </div>

          {shot.dialogue.length > 0 && (
            <div>
              <p className="text-sm text-dark-400">台词</p>
              {shot.dialogue.map((d, i) => (
                <div key={i} className="mt-1 text-sm">
                  <span className="text-primary-400">{d.characterId}:</span>{' '}
                  <span className="text-dark-200">{d.text}</span>
                  <span className="text-dark-500 ml-2">({d.tone})</span>
                </div>
              ))}
            </div>
          )}

          {shot.camera && (
            <div>
              <p className="text-sm text-dark-400">镜头</p>
              <p className="text-sm text-dark-200 mt-1">
                {shot.camera.shotSize} · {shot.camera.angle} · {shot.camera.movement}
              </p>
            </div>
          )}

          {shot.imagePrompt && (
            <div>
              <p className="text-sm text-dark-400">SD Prompt</p>
              <p className="text-xs text-dark-300 mt-1 font-mono bg-dark-900 p-2 rounded max-h-32 overflow-auto">
                {shot.imagePrompt.positive}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
