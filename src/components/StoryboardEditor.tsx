import { useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import type { Chapter, ShotScript } from '../../electron/main/script-optimizer/types'

const api = () => window.electronAPI

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

          {scriptProgress && <ScriptProgressStepper progress={scriptProgress} />}

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
              <ChapterDetail chapter={chapters[selectedChapter]} chapterIndex={selectedChapter} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const LAYER_INFO = [
  { id: 1, label: '故事大纲', desc: '分析创意，生成角色和故事线' },
  { id: 2, label: '章节拆解', desc: '拆解章节和分镜脚本' },
  { id: 3, label: '分镜细化', desc: '细化镜头语言和台词' },
  { id: 4, label: '提示词组装', desc: '生成图像提示词' },
]

function ScriptProgressStepper({ progress }: { progress: { layer: number; status: string; message?: string; data?: Record<string, unknown> } }) {
  return (
    <div className="w-full max-w-lg mb-6">
      {LAYER_INFO.map((layer, i) => {
        const isDone = progress.layer > layer.id || (progress.layer === layer.id && progress.status === 'done')
        const isActive = progress.layer === layer.id && progress.status === 'start'
        const isError = progress.layer === layer.id && progress.status === 'error'

        return (
          <div key={layer.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                isDone ? 'bg-green-600 text-white' :
                isActive ? 'bg-primary-600 text-white animate-pulse' :
                isError ? 'bg-red-600 text-white' :
                'bg-dark-700 text-dark-500'
              }`}>
                {isDone ? '✓' : isError ? '✗' : layer.id}
              </div>
              {i < LAYER_INFO.length - 1 && (
                <div className={`w-0.5 flex-1 min-h-[24px] ${isDone ? 'bg-green-600' : 'bg-dark-700'}`} />
              )}
            </div>
            <div className="pb-4">
              <div className={`text-sm font-medium ${isDone ? 'text-green-400' : isActive ? 'text-primary-400' : isError ? 'text-red-400' : 'text-dark-500'}`}>
                {layer.label}
              </div>
              <div className={`text-xs mt-0.5 ${isActive ? 'text-dark-300' : 'text-dark-500'}`}>
                {isDone && progress.layer === layer.id && progress.message
                  ? progress.message
                  : isActive ? (progress.message || layer.desc + '...') : isError ? progress.message || '生成失败' : layer.desc}
              </div>
              {isDone && progress.layer === layer.id && progress.data && (
                <div className="mt-2 text-xs space-y-0.5">
                  {progress.data.logline && <div className="text-dark-300">📝 {String(progress.data.logline)}</div>}
                  {progress.data.characterNames && <div className="text-dark-300">👤 角色: {(progress.data.characterNames as string[]).join('、')}</div>}
                  {progress.data.chapterTitles && <div className="text-dark-300">📖 章节: {(progress.data.chapterTitles as string[]).join('、')}</div>}
                  {progress.data.totalShots && <div className="text-dark-300">🎬 共 {String(progress.data.totalShots)} 个分镜</div>}
                </div>
              )}
              {isActive && (
                <div className="flex gap-1 mt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 章节详情 ─────────────────────────────────────────────

function ChapterDetail({ chapter, chapterIndex }: { chapter: Chapter; chapterIndex: number }) {
  const { refreshProject } = useProjectStore()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(chapter.title)
  const [summaryValue, setSummaryValue] = useState(chapter.summary)

  const saveChapter = async () => {
    if (!api() || !window.electronAPI) return
    const proj = await window.electronAPI.project.get()
    const chapters = proj.script.chapters.map((ch: any, i: number) => {
      if (i !== chapterIndex) return ch
      return { ...ch, title: titleValue, summary: summaryValue }
    })
    await window.electronAPI.project.update({ script: { chapters } })
    await refreshProject()
    setEditingTitle(false)
  }

  return (
    <div>
      <div className="mb-6">
        {editingTitle ? (
          <div className="space-y-2">
            <input value={titleValue} onChange={e => setTitleValue(e.target.value)}
              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-lg font-semibold focus:outline-none focus:border-primary-500" />
            <textarea value={summaryValue} onChange={e => setSummaryValue(e.target.value)} rows={2}
              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-300 text-sm focus:outline-none focus:border-primary-500 resize-none" />
            <div className="flex gap-2">
              <button onClick={saveChapter} className="px-3 py-1 text-xs bg-primary-600 hover:bg-primary-700 rounded text-white">保存</button>
              <button onClick={() => setEditingTitle(false)} className="px-3 py-1 text-xs bg-dark-700 hover:bg-dark-600 rounded text-dark-300">取消</button>
            </div>
          </div>
        ) : (
          <div onClick={() => setEditingTitle(true)} className="cursor-pointer group">
            <h2 className="text-xl font-semibold group-hover:text-primary-400 transition-colors">{chapter.title} <span className="text-xs text-dark-500">点击编辑</span></h2>
            <p className="text-dark-400 text-sm mt-1">{chapter.summary}</p>
          </div>
        )}
        <div className="flex gap-4 mt-2 text-xs text-dark-500">
          <span>情绪弧: {chapter.moodArc}</span>
          <span>时长: {chapter.estimatedDuration}s</span>
          <span>BGM: {chapter.bgmSuggestion}</span>
        </div>
      </div>

      <div className="space-y-3">
        {chapter.shots.map((shot, i) => (
          <ShotCard key={shot.id} shot={shot} index={i} chapterIndex={chapterIndex} shotIndex={i} />
        ))}
      </div>
    </div>
  )
}

// ── 分镜卡片（可编辑）─────────────────────────────────────

function ShotCard({ shot, index, chapterIndex, shotIndex }: { shot: ShotScript; index: number; chapterIndex: number; shotIndex: number }) {
  const { refreshProject } = useProjectStore()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)

  // 编辑状态
  const [sceneDesc, setSceneDesc] = useState(shot.sceneDescription || '')
  const [duration, setDuration] = useState(shot.durationSec || 5)
  const [dialogueText, setDialogueText] = useState((shot.dialogue || []).map(d => `${d.characterId}: ${d.text}`).join('\n'))
  const [narration, setNarration] = useState(shot.narration || '')

  const statusColor: Record<string, string> = {
    pending: 'bg-dark-600 text-dark-300',
    rendering: 'bg-yellow-900/50 text-yellow-400',
    done: 'bg-green-900/50 text-green-400',
    failed: 'bg-red-900/50 text-red-400',
  }

  const typeLabel: Record<string, string> = {
    dialogue: '对白', action: '动作', transition: '过渡',
    narration: '旁白', establishing: '定场', reaction: '反应', montage: '蒙太奇',
  }

  const saveShot = async () => {
    if (!window.electronAPI) return
    const proj = await window.electronAPI.project.get()
    const chapters = proj.script.chapters.map((ch: any, ci: number) => {
      if (ci !== chapterIndex) return ch
      return {
        ...ch,
        shots: ch.shots.map((s: any, si: number) => {
          if (si !== shotIndex) return s
          // 解析台词
          const dialogue = dialogueText.split('\n').filter(l => l.trim()).map(line => {
            const colonIdx = line.indexOf(':')
            if (colonIdx > 0) {
              return { characterId: line.slice(0, colonIdx).trim(), text: line.slice(colonIdx + 1).trim(), tone: 'neutral' }
            }
            return { characterId: '', text: line.trim(), tone: 'neutral' }
          })
          return {
            ...s,
            sceneDescription: sceneDesc,
            durationSec: duration,
            narration: narration || undefined,
            dialogue,
            imagePrompt: undefined, // 重置提示词，需要重新组装
          }
        })
      }
    })
    await window.electronAPI.project.update({ script: { chapters } })
    await refreshProject()
    setEditing(false)
  }

  const uploadImage = async (imageType: 'scene' | 'prop') => {
    if (!window.electronAPI) return
    const filePath = await window.electronAPI.dialog.openFile([{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }])
    if (!filePath) return

    // 复制到项目 shots 目录
    const proj = await window.electronAPI.project.get()
    const projPath = proj.path || ''
    const destDir = `${projPath}/shots/${shot.id}`
    // 通过 sidecar 或 fs 操作复制文件（这里直接更新路径）
    const chapters = proj.script.chapters.map((ch: any, ci: number) => {
      if (ci !== chapterIndex) return ch
      return {
        ...ch,
        shots: ch.shots.map((s: any, si: number) => {
          if (si !== shotIndex) return s
          const assets = { ...s.assets }
          if (imageType === 'scene') assets.sceneImage = filePath.replace(/\\/g, '/')
          if (imageType === 'prop') assets.propImage = filePath.replace(/\\/g, '/')
          return { ...s, assets }
        })
      }
    })
    await window.electronAPI.project.update({ script: { chapters } })
    await refreshProject()
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-700/50 transition-colors"
      >
        <span className="text-dark-500 text-sm w-6">#{index + 1}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${statusColor[shot.status]}`}>{shot.status}</span>
        <span className="text-xs px-2 py-0.5 rounded bg-dark-700 text-dark-300">{typeLabel[shot.shotType] || shot.shotType}</span>
        <span className="text-sm text-dark-300 flex-1 truncate">{shot.sceneDescription}</span>
        <span className="text-xs text-dark-500">{shot.durationSec}s</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-dark-700">
          {/* 操作栏 */}
          <div className="flex gap-2 pt-3">
            {!editing ? (
              <button onClick={() => setEditing(true)} className="px-3 py-1 text-xs bg-dark-700 hover:bg-dark-600 rounded text-dark-300 transition-colors">编辑</button>
            ) : (
              <>
                <button onClick={saveShot} className="px-3 py-1 text-xs bg-primary-600 hover:bg-primary-700 rounded text-white">保存</button>
                <button onClick={() => { setEditing(false); setSceneDesc(shot.sceneDescription); setDuration(shot.durationSec) }} className="px-3 py-1 text-xs bg-dark-700 hover:bg-dark-600 rounded text-dark-300">取消</button>
              </>
            )}
          </div>

          {/* 场景描述 */}
          <div>
            <p className="text-sm text-dark-400 mb-1">场景描述</p>
            {editing ? (
              <textarea value={sceneDesc} onChange={e => setSceneDesc(e.target.value)} rows={3}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500 resize-none" />
            ) : (
              <p className="text-sm text-dark-200">{shot.sceneDescription}</p>
            )}
          </div>

          {/* 时长 */}
          {editing && (
            <div>
              <p className="text-sm text-dark-400 mb-1">时长 (秒)</p>
              <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={1} max={60}
                className="w-24 px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500" />
            </div>
          )}

          {/* 台词 */}
          <div>
            <p className="text-sm text-dark-400 mb-1">台词 <span className="text-xs text-dark-500">(格式: 角色名: 台词内容)</span></p>
            {editing ? (
              <textarea value={dialogueText} onChange={e => setDialogueText(e.target.value)} rows={3} placeholder="角色名: 台词内容"
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500 resize-none" />
            ) : (shot.dialogue || []).length > 0 ? (
              (shot.dialogue || []).map((d, i) => (
                <div key={i} className="mt-1 text-sm">
                  <span className="text-primary-400">{d.characterId}:</span>{' '}
                  <span className="text-dark-200">{d.text}</span>
                  <span className="text-dark-500 ml-2">({d.tone})</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-dark-500">无台词</p>
            )}
          </div>

          {/* 旁白 */}
          {editing && (
            <div>
              <p className="text-sm text-dark-400 mb-1">旁白</p>
              <textarea value={narration} onChange={e => setNarration(e.target.value)} rows={2}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500 resize-none" />
            </div>
          )}

          {/* 镜头信息 */}
          {shot.camera && (
            <div>
              <p className="text-sm text-dark-400">镜头</p>
              <p className="text-sm text-dark-200 mt-1">
                {shot.camera.shotSize} · {shot.camera.angle} · {shot.camera.movement}
              </p>
            </div>
          )}

          {/* SD Prompt */}
          {shot.imagePrompt && (
            <div>
              <p className="text-sm text-dark-400">SD Prompt</p>
              <p className="text-xs text-dark-300 mt-1 font-mono bg-dark-900 p-2 rounded max-h-32 overflow-auto">
                {shot.imagePrompt.positive}
              </p>
            </div>
          )}

          {/* 图片上传 */}
          <div className="flex gap-3 pt-2">
            <button onClick={() => uploadImage('scene')}
              className="px-3 py-1.5 text-xs bg-dark-700 hover:bg-dark-600 rounded text-dark-300 transition-colors">
              📷 上传场景图
            </button>
            <button onClick={() => uploadImage('prop')}
              className="px-3 py-1.5 text-xs bg-dark-700 hover:bg-dark-600 rounded text-dark-300 transition-colors">
              🎒 上传道具图
            </button>
          </div>

          {/* 已上传的图片预览 */}
          {(shot.assets as any)?.sceneImage && (
            <div>
              <p className="text-xs text-dark-500 mb-1">场景图</p>
              <img src={`file:///${(shot.assets as any).sceneImage}`} alt="scene" className="w-32 h-20 object-cover rounded border border-dark-600" />
            </div>
          )}
          {(shot.assets as any)?.propImage && (
            <div>
              <p className="text-xs text-dark-500 mb-1">道具图</p>
              <img src={`file:///${(shot.assets as any).propImage}`} alt="prop" className="w-32 h-20 object-cover rounded border border-dark-600" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
