// Screen 3 — Video Plan + Hook + Script + Record Choice. Shows the recommended
// plan from the Scene Timeline; the user accepts or overrides any choice in one
// tap (bottom sheets), then picks how to film. Two equal CTAs: record or upload.
// Every edit writes straight back to the one timeline. See PRODUCT_VISION §7,§9.
//
// Mobile renders through the shared ScreenLayout shell (sticky bottom CTA, single
// column). Desktop renders its own two-pane layout — a scrollable content column
// (hook + scenes) and a fixed summary/CTA rail — matching the convention already
// established in V2Capture/V2Review, not the mobile shell stretched wide. Both
// trees share the same state/handlers; only the JSX differs per breakpoint.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ScreenLayout from '../../components/v2/ScreenLayout'
import { Card, PrimaryButton, RecommendedBadge, ChangeButton, Skeleton } from '../../components/v2/Primitives'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import SceneCard from '../../components/v2/SceneCard'
import { getGeneration } from '../../lib/api'
import { buildTimeline } from '../../lib/timelineAdapter'
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
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadNonce, setLoadNonce] = useState(0) // bump to retry the load

  useEffect(() => {
    let alive = true
    setLoadFailed(false)
    ;(async () => {
      try {
        const [g, t] = await Promise.all([getGeneration(id), loadTimeline(id)])
        if (!alive) return
        setGen(g)
        // If the timeline wasn't persisted (e.g. the scene_timeline UPDATE grant
        // isn't applied yet), synthesize it in memory from the blueprint — the SAME
        // fallback V2Capture uses — so the Plan renders instead of hanging on the
        // skeleton forever.
        const tl = t ?? (g ? buildTimeline({ generationId: id, blueprint: g.blueprint, selectedHook: g.selected_hook }) : null)
        if (tl) setTimeline(tl)
        else setLoadFailed(true) // generation unresolvable → error card, not eternal skeleton
      } catch {
        if (alive) setLoadFailed(true)
      }
    })()
    return () => { alive = false }
  }, [id, loadNonce])

  const pickHook = async (hook: string) => {
    if (!timeline) return
    // Hook lands once, in scene 1 — keep the timeline's invariant intact, and
    // update scene 1's on-screen caption to match the new hook so the plan, the
    // teleprompter, and the burned-in caption all agree.
    const cap = hook.trim().split(/\s+/).slice(0, 7).join(' ').replace(/[.,;:!?]+$/, '')
    const scenes = timeline.scenes.map((s) => (s.scene_number === 1 ? { ...s, dialogue: hook, caption_text: cap } : s))
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
    if (loadFailed) {
      return (
        <ScreenLayout title="Your video plan" subtitle="Something went wrong" onBack={() => nav('/v2')}>
          <Card>
            <p className="font-semibold text-cream">We couldn't load this plan</p>
            <p className="mt-1 text-sm text-sand/70">Check your connection and try again — your script is safe in your Library.</p>
            <div className="mt-4 flex gap-2">
              <PrimaryButton onClick={() => setLoadNonce((n) => n + 1)}>Retry</PrimaryButton>
              <button onClick={() => nav('/dashboard')} className="w-full rounded-2xl border border-white/20 text-cream py-4 font-semibold hover:bg-white/10">Dashboard</button>
            </div>
          </Card>
        </ScreenLayout>
      )
    }
    return (
      <ScreenLayout title="Your video plan" subtitle="Putting it together…">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </ScreenLayout>
    )
  }

  const hookOptions = gen?.blueprint?.hook_options ?? []

  // CONCEPT — the actual video idea + how to pull it off at the creator's real
  // scale. Shown first: concept, then package, then produce. Hidden for older
  // blueprints made before concept existed.
  const concept = gen?.blueprint?.concept
  const conceptCard = concept?.premise ? (
    <Card className="border border-teal/25 bg-teal/[0.06]">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal">Your concept</div>
      <p className="text-base font-semibold leading-snug text-cream">{concept.premise}</p>
      {concept.your_scale && (
        <p className="mt-2 text-sm text-sand/85"><span className="text-sand/60">Pull it off solo: </span>{concept.your_scale}</p>
      )}
      {concept.translations?.length ? (
        <div className="mt-3 space-y-1.5">
          {concept.translations.map((t, i) => (
            <div key={i} className="text-sm leading-snug">
              <span className="text-sand/60">{t.theirs}</span>
              <span className="text-teal"> → </span>
              <span className="text-cream">{t.yours}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  ) : null

  // PACKAGING — the title + thumbnail that earn the click, shown FIRST because
  // that's the order real creators work in (package, then produce). Hidden for
  // older blueprints generated before packaging existed.
  const pkg = gen?.blueprint?.packaging
  const packagingCard = pkg?.titles?.length ? (
    <Card className="border border-amber/25 bg-amber/[0.06]">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber">Title &amp; thumbnail · your package</div>
      <p className="text-[11px] text-sand/60">Recommended title</p>
      <p className="text-lg font-bold leading-snug text-cream">{pkg.titles[0]}</p>
      {pkg.titles.length > 1 && (
        <div className="mt-2 space-y-1">
          {pkg.titles.slice(1).map((t, i) => (
            <p key={i} className="text-sm text-sand/80">{t}</p>
          ))}
        </div>
      )}
      {pkg.thumbnail && (
        <div className="mt-4 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
          <p className="text-[11px] uppercase tracking-wide text-sand/60">Thumbnail to shoot</p>
          <p className="text-cream"><span className="text-sand/60">Big text: </span>“{pkg.thumbnail.text_overlay}”</p>
          <p className="text-sand/85"><span className="text-sand/60">Shot: </span>{pkg.thumbnail.concept}</p>
          <p className="text-sand/85"><span className="text-sand/60">Your face: </span>{pkg.thumbnail.expression}</p>
          <p className="text-sand/85"><span className="text-sand/60">Framing: </span>{pkg.thumbnail.composition}</p>
          <p className="text-sand/85"><span className="text-sand/60">Colours: </span>{pkg.thumbnail.colors}</p>
        </div>
      )}
    </Card>
  ) : null

  // Shared hook + scene-list content, reused by both the mobile single column and
  // the desktop scrollable pane.
  const hookCard = (
    <Card className="bg-gradient-to-br from-ink2 to-ink text-cream border border-white/10">
      <div className="text-xs text-sand/60 mb-1">Your hook</div>
      <p className="text-lg font-bold leading-snug">{timeline.hook}</p>
      <div className="mt-3 flex items-center justify-between">
        <RecommendedBadge reason="Opens with a strong first line to stop the scroll." />
        <ChangeButton onClick={() => setHookSheet(true)} />
      </div>
    </Card>
  )
  const sceneList = timeline.scenes.map((s) => (
    <SceneCard key={s.scene_number} scene={s} onChange={() => setEditScene(s)} />
  ))
  const recordCta = (
    <PrimaryButton onClick={() => nav(`/v2/capture/${id}?mode=record`)}>Record</PrimaryButton>
  )
  const uploadCta = (
    <button onClick={() => nav(`/v2/capture/${id}?mode=upload`)}
      className="w-full rounded-2xl bg-white/10 border border-white/15 text-cream font-semibold py-4 hover:bg-white/20 active:scale-[0.99] transition">
      Upload a clip
    </button>
  )

  return (
    <>
      {/* MOBILE — the shared ScreenLayout shell, unchanged. */}
      <div className="lg:hidden">
        <ScreenLayout
          title="Your video plan"
          subtitle={`${timeline.scenes.length} scenes · about ${Math.round(timeline.total_duration_sec)}s`}
          onBack={() => nav('/v2')}
          cta={<div className="grid grid-cols-2 gap-2">{recordCta}{uploadCta}</div>}
        >
          {conceptCard}
          {packagingCard}
          {hookCard}
          <div className="text-sm font-semibold text-sand/70 pt-1">Your scenes</div>
          {sceneList}
        </ScreenLayout>
      </div>

      {/* DESKTOP — a real two-pane studio: a scrollable content column (hook +
          scenes) and a fixed summary/CTA rail, not the mobile shell stretched wide. */}
      <div className="hidden min-h-[100dvh] w-full bg-ink text-cream lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-8 pt-6 pb-2">
          <button onClick={() => nav('/v2')} aria-label="Back" className="h-9 w-9 grid place-items-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 transition">←</button>
          <div>
            <h1 className="text-lg font-bold text-cream">Your video plan</h1>
            <p className="text-xs text-sand/70">{timeline.scenes.length} scenes · about {Math.round(timeline.total_duration_sec)}s</p>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-1 gap-10 px-8 pb-8 pt-4">
          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto pb-4">
            {conceptCard}
            {packagingCard}
            {hookCard}
            <div className="text-sm font-semibold text-sand/70 pt-1">Your scenes</div>
            {sceneList}
          </div>
          <div className="w-[20rem] shrink-0 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-xs text-sand/60 uppercase tracking-wide font-semibold">Ready to shoot</p>
              <p className="mt-1 text-sm text-white/80">{timeline.scenes.length} scenes · about {Math.round(timeline.total_duration_sec)}s total</p>
              <div className="mt-4 space-y-2">
                {recordCta}
                {uploadCta}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hook alternates sheet — shared by both trees. */}
      <BottomSheet open={hookSheet} title="Pick your hook" onClose={() => setHookSheet(false)}>
        {[timeline.hook, ...hookOptions.filter((h) => h !== timeline.hook)].slice(0, 4).map((h, i) => (
          <SheetOption key={i} label={h} selected={h === timeline.hook}
            reason={i === 0 ? 'Recommended — strongest opening line.' : undefined}
            onPick={() => pickHook(h)} />
        ))}
      </BottomSheet>

      {/* Scene detail / edit sheet — shared by both trees. */}
      <BottomSheet open={!!editScene} title={`Scene ${editScene?.scene_number ?? ''}`} onClose={() => setEditScene(null)}>
        {editScene && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-sand/70">What you say</label>
            <textarea
              defaultValue={editScene.dialogue ?? ''}
              rows={3}
              id="scene-dialogue"
              className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-cream outline-none focus:border-teal"
            />
            <label className="block text-xs font-semibold text-sand/70">Caption on screen</label>
            <input
              defaultValue={editScene.caption_text}
              id="scene-caption"
              className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-cream outline-none focus:border-teal"
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
    </>
  )
}
