import type { ProjectCharacter } from '../../electron/main/script-optimizer/types'

export default function CharacterCard({ character }: { character: ProjectCharacter }) {
  const d = character.appearanceDetail

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
      {/* 头像占位 */}
      <div className="w-full aspect-square bg-dark-700 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
        {character.referenceImage ? (
          <img
            src={`file://${character.referenceImage}`}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-dark-500 text-sm">暂无基准图</div>
        )}
      </div>

      <h3 className="font-semibold text-white">{character.name}</h3>
      <p className="text-xs text-dark-400 mt-1">{character.id}</p>

      <div className="mt-3 space-y-1 text-xs text-dark-400">
        <p>性别: {d.gender} · 年龄: {d.age}</p>
        <p>发型: {d.hair}</p>
        <p>眼睛: {d.eyes}</p>
        <p>服装: {d.clothing}</p>
        {d.distinctiveFeatures && (
          <p>特征: {d.distinctiveFeatures}</p>
        )}
      </div>
    </div>
  )
}
