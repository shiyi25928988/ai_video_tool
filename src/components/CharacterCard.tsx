import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'
import type { ProjectCharacter } from '../../electron/main/script-optimizer/types'

const api = () => window.electronAPI

export default function CharacterCard({ character }: { character: ProjectCharacter }) {
  const d = character.appearanceDetail
  const { refreshProject } = useProjectStore()
  const [generating, setGenerating] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)

  // 加载已有图片为 dataUrl
  useEffect(() => {
    if (character.referenceImage && api()) {
      api()!.project.get().then((proj: any) => {
        // 如果项目中存了 dataUrl 就直接用
        const char = proj?.characters?.find((c: any) => c.id === character.id)
        if (char?.imageDataUrl) {
          setImageSrc(char.imageDataUrl)
        }
      })
    }
  }, [character.referenceImage, character.id])

  const buildPrompt = () => {
    const parts: string[] = []
    if (d.gender) parts.push(d.gender)
    if (d.age) parts.push(`${d.age} years old`)
    if (d.build) parts.push(d.build)
    if (d.face) parts.push(d.face)
    if (d.hair) parts.push(d.hair)
    if (d.eyes) parts.push(d.eyes)
    if (d.clothing) parts.push(`wearing ${d.clothing}`)
    if (d.distinctiveFeatures) parts.push(d.distinctiveFeatures)
    return `portrait of ${parts.join(', ')}, high quality, detailed face, anime style`
  }

  const generateImage = async () => {
    if (!api()) return
    setGenerating(true)
    try {
      const prompt = buildPrompt()
      const result = await api()!.sidecar.generateImage({
        prompt,
        characterId: character.id,
      })
      if (result.ok) {
        // 用 dataUrl 立即显示
        if (result.dataUrl) {
          setImageSrc(result.dataUrl)
        }
        // 更新项目数据（存储路径 + dataUrl）
        const proj = await api()!.project.get()
        await api()!.project.update({
          characters: proj.characters.map((c: any) =>
            c.id === character.id
              ? { ...c, referenceImage: result.path, imageDataUrl: result.dataUrl }
              : c
          )
        })
        await refreshProject()
      } else {
        alert(`生成失败: ${result.error}`)
      }
    } catch (err) {
      alert(`生成异常: ${(err as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
      {/* 头像区域 */}
      <div className="w-full aspect-square bg-dark-700 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
        {imageSrc && !generating ? (
          <img src={imageSrc} alt={character.name} className="w-full h-full object-cover" />
        ) : generating ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-primary-400">正在生成...</span>
          </div>
        ) : (
          <div className="text-dark-500 text-sm">暂无基准图</div>
        )}
        <button
          onClick={generateImage}
          disabled={generating}
          className="absolute bottom-2 right-2 px-3 py-1.5 bg-primary-600/90 hover:bg-primary-700 disabled:opacity-50 rounded-lg text-white text-xs font-medium transition-colors backdrop-blur-sm"
        >
          {generating ? '生成中...' : imageSrc ? '重新生成' : '生成基准图'}
        </button>
      </div>

      <h3 className="font-semibold text-white">{character.name}</h3>
      <p className="text-xs text-dark-400 mt-1">{character.id}</p>

      <div className="mt-3 space-y-1 text-xs text-dark-400">
        <p>性别: {d.gender} · 年龄: {d.age}</p>
        <p>发型: {d.hair}</p>
        <p>眼睛: {d.eyes}</p>
        <p>服装: {d.clothing}</p>
        {d.distinctiveFeatures && <p>特征: {d.distinctiveFeatures}</p>}
      </div>
    </div>
  )
}
