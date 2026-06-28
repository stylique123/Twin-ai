// Screen 3 — Video Plan + Hook + Script + Record Choice. Shows the recommended
// plan from the Scene Timeline; the user accepts or overrides any choice in one
// tap (bottom sheets), then picks how to film. Two equal CTAs: record or upload.
// Every edit writes straight back to the one timeline. See PRODUCT_VISION §7,§9.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ScreenLayout from '../../components/v2/ScreenLayout'
import { Card, PrimaryButton, RecommendedBadge, ChangeButton, Skeleton } from '../../components/v2/Primitives'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import SceneCard from '../../components/v2/SceneCard'
import { getGeneration } from '../../lib/api'
import { loadTimeline, patchScene, saveTimeline } from '../../lib/timelineApi'
import type { SceneTimeline, Scene } from '../../lib/timeline'
import type { Generation } from '../../lib/types'

export default function V2Plan() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [gen, setGen] = useState<Generation | null>(null)
  const [timeline, setTimeline] = useState<SceneTimeline | null>(null)
  const [hookSheet, setHookSheet] = useState(false)
  const [editScene, setEditScene] = useState<Scene | null>(null)

  useEffect(() => {
    ;(async () => {
      const [g, t] = await Promise.all([getGeneration(id), loadTimeline(id)])
      setGen(g)
      setTimeline(t)
    })()
  }, [id])

  const pickHook = async (hook: string) => {
    if (!timeline) return
    // Hook lands once, in scene 1 — keep the timeline's invariant intact.
    const scenes = timeline.scenes.map((s) => (s.scene_number === 1 ? { ...s, dialogue: hook } : s))
    const next = { ...timeline, hook, scenes }
    setTimeline(next)
    setHookSheet(false)
    await saveTimeline(next)
  }

  const saveScene = async (patch: Partial<Scene>) => {
    if (!timeline || !editScene) return
    const next = await patchScene(timeline, editScene.scene_number, patch)
    setTimeline(next)
    setEditScene(null)
  }

  if (!timeline) {
    return (
      <ScreenLayout title="Your video plan" subtitle="Putting it together…">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </ScreenLayout>
    )
  }

  const hookOptions = gen?.blueprint?.hook_options ?? []

  return (
    <ScreenLayout
      title="Your video plan"
      subtitle={`${timeline.scenes.length} scenes · about ${Math.round(timeline.total_duration_sec)}s`}
      onBack={() => nav('/v2')}
      cta={
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton onClick={() => nav(`/v2/capture/${id}?mode=record`)}>Record</PrimaryButton>
          <button onClick={() => nav(`/v2/capture/${id}?mode=upload`)}
            className="w-full rounded-2xl bg-white border border-stone-300 text-stone-800 font-semibold py-4 active:scale-[0.99] transition">
            Upload a clip
          </button>
        </div>
      }
    >
      {/* Hero: the hook */}
      <Card className="bg-gradient-to-br from-stone-900 to-stone-700 text-white border-none">
        <div className="text-xs text-white/60 mb-1">Your hook</div>
        <p className="text-lg font-bold leading-snug">{timeline.hook}</p>
        <div className="mt-3 flex items-center justify-between">
          <RecommendedBadge reason="Opens with a strong first line to stop the scroll." />
          <ChangeButton onClick={() => setHookSheet(true)} />
        </div>
      </Card>

      <div className="text-sm font-semibold text-stone-500 pt-1">Your scenes</div>
      {timeline.scenes.map((s) => (
        <SceneCard key={s.scene_number} scene={s} onChange={() => setEditScene(s)} />
      ))}

      {/* Hook alternates sheet */}
      <BottomSheet open={hookSheet} title="Pick your hook" onClose={() => setHookSheet(false)}>
        {[timeline.hook, ...hookOptions.filter((h) => h !== timeline.hook)].slice(0, 4).map((h, i) => (
          <SheetOption key={i} label={h} selected={h === timeline.hook}
            reason={i === 0 ? 'Recommended — strongest opening line.' : undefined}
            onPick={() => pickHook(h)} />
        ))}
      </BottomSheet>

      {/* Scene detail / edit sheet */}
      <BottomSheet open={!!editScene} title={`Scene ${editScene?.scene_number ?? ''}`} onClose={() => setEditScene(null)}>
        {editScene && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-stone-500">What you say</label>
            <textarea
              defaultValue={editScene.dialogue ?? ''}
              rows={3}
              id="scene-dialogue"
              className="w-full rounded-xl border border-stone-200 p-3 text-stone-900 outline-none"
            />
            <label className="block text-xs font-semibold text-stone-500">Caption on screen</label>
            <input
              defaultValue={editScene.caption_text}
              id="scene-caption"
              className="w-full rounded-xl border border-stone-200 p-3 text-stone-900 outline-none"
            />
            <PrimaryButton onClick={() => {
              const d = (document.getElementById('scene-dialogue') as HTMLTextAreaElement)?.value ?? ''
              const c = (document.getElementById('scene-caption') as HTMLInputElement)?.value ?? ''
              const isBroll = editScene.scene_type === 'b_roll'
              saveScene({ dialogue: d || null, caption_text: c, show_in_teleprompter: isBroll ? !!d : editScene.show_in_teleprompter })
            }}>
              Save scene
            </PrimaryButton>
          </div>
        )}
      </BottomSheet>
    </ScreenLayout>
  )
}
