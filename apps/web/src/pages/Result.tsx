import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Copy, Check, Quote, FileText, Clapperboard,
  Wand2, Send, Loader2, Video, ExternalLink,
  SlidersHorizontal, BadgeCheck, Link2, MessageSquare, Users,
  TrendingUp, User, Download, CalendarClock,
} from 'lucide-react'

// Phase-0 guided publishing: deep-link straight into each platform's uploader.
// (Real one-click auto-post needs per-platform OAuth + app review — staged later.)
const UPLOAD_URLS: Record<string, string> = {
  tiktok: 'https://www.tiktok.com/upload',
  youtube: 'https://studio.youtube.com/',
  instagram: 'https://www.instagram.com/',
}
import { getGeneration, markPosted, updateGenerationChoice, setGenerationApproved, createReviewLink, logEvent, signEditUrls, signTakeUrl, listPosts, getReadySourceAsset, getLatestEditProject, cancelEditProject, startEditorV2, newIdempotencyKey, EDIT_PROJECT_ACTIVE_STATUSES, editProducedVideo, editFinishedWithoutVideo, getOutputBundle, resolveFinishedOutputsResult, loadCapabilities, approvalState, approvalBlockReason } from '../lib/api'
import { explainFailure } from '../lib/api'
import { creatorPick, defaultCapture, freeformEntry } from '../lib/api'
import { CraftChecks } from '../components/CraftChecks'
import { ScriptEditor } from '../components/ScriptEditor'
import { CreatorQuestionCard } from '../components/CreatorQuestionCard'
import { ProductCaptureCard, readProductCapturePrompt } from '../components/ProductCaptureCard'
import { CreativeTransfer } from '../components/CreativeTransfer'
import { isWhollyPlaceholder } from '../lib/api'
import { UnfilledContainers } from '../components/UnfilledContainers'
import { CountPromise } from '../components/CountPromise'
import { DeclaredClips } from '../components/DeclaredClips'
import { CoverButton } from '../components/CoverDialog'
import { SchedulePostDialog } from '../components/SchedulePostDialog'
import { readTakePointer, clearTakePointer, type SavedTake } from '../lib/savedTake'
import WouldYouPostThis from '../components/WouldYouPostThis'
import type { Blueprint, EditProject, EditProjectStatus, EditorOutput, FinishedOutput, OutputBundle, RecordingScript } from '../lib/types'
import { shootingNoteAt, hookVarietyNote, isSilentBeat, lengthSentence, measureScriptLength, readVisualHook, shotLabel, stockPhraseNote, stockPhrasesIn , advisoryNote, type AdvisoryFinding, parallelTriadsIn, parallelTriadNote, craftContractNotes, sentenceUniformityNote, compareRuntime, spokenTime } from '@twinai/shared'

// Human labels for the AI-edit pipeline's stages (Phase 8). Kept next to the
// contract so a new EditProjectStatus is a compile error here, not a blank card.
const EDIT_STATUS_LABEL: Record<EditProjectStatus, string> = {
  queued: 'Queued…',
  inspecting: 'Checking your recording…',
  transcribing: 'Transcribing…',
  analyzing: 'Analyzing the footage…',
  directing: 'Directing the cut…',
  // The one status that is NOT progress. Nothing is running and nothing will
  // until the creator submits their review, so the label is an instruction
  // rather than a participle — a "…" here would promise a wait that never ends.
  awaiting_review: 'Ready for your review',
  compiling: 'Compiling the edit…',
  rendering: 'Rendering your video…',
  validating: 'Finishing up…',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

// What each StartEditorRejection means to the person who clicked. Keyed by the
// server's stable code — NOT matched on message text, which is not a contract.
// `editor_not_available` is the launch gate, not a fault: it is the expected
// answer everywhere the feature has not been switched on yet, so it reads as a
// status rather than an error.
const START_ERROR_TEXT: Record<string, string> = {
  editor_not_available: 'AI editing isn’t switched on for your account yet.',
  source_not_found: 'We couldn’t find your recording.',
  not_a_source: 'That file isn’t a recording we can edit.',
  generation_mismatch: 'That recording belongs to a different script.',
  source_rejected: 'That recording didn’t pass our checks, so it can’t be edited.',
  source_deleted: 'That recording has been deleted.',
  source_not_ready: 'Your recording is still uploading — try again in a moment.',
  source_not_editor_eligible: 'That recording can’t be edited automatically.',
  too_many_active_projects: 'You already have an edit running. Wait for it to finish first.',
  idempotency_key_conflict: 'That edit was already started — refresh to see it.',
}

// Stale-while-revalidate cache so reopening a plan is INSTANT instead of showing a
// full-screen "Loading your script…" every time (the plan page had no cache; the
// Library does). Keyed by generation id; module-scoped so it survives route changes.
const GEN_CACHE: Record<string, Generation> = {}
import { useAuth } from '../context/AuthContext'
import type { Generation } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { EASE } from '../components/motion'
import { cn } from '../lib/cn'

const MOCK_BLUEPRINT = {
  reference_read: {
    platform: 'instagram',
    format_label: 'The Hook-Switch Strategy',
    why_it_works: [
      'High-contrast pattern interrupt hooks stop scrolling immediately.',
      'Frequent frame changes and visual cues keep attention high in the middle.',
      'Strong self-relevance naming calls out the exact target audience.'
    ],
    retention_map: [
      { beat: '0-3s Hook', goal: 'Stop the scroll by calling out a specific creator problem', tactic: 'Curiosity loop + Pattern interrupt' },
      { beat: '4-10s Setup', goal: 'Deliver the core concept immediately without fluff', tactic: 'Visual change every 2 seconds' },
      { beat: '11-20s Middle Re-hook', goal: 'Re-open curiosity loop before interest sags', tactic: 'Contrarian claim' },
      { beat: '21-30s CTA / Payoff', goal: 'Drive high-conversion saves and comments', tactic: 'Comment-bait question' }
    ]
  },
  b_roll_stats: {
    original_b_roll_count: '2',
    suggested_b_roll_count: '2'
  },
  hook_options: [
    'Here is the part nobody tells you about building AI agents...',
    'Stop building AI agents like a school project. Do this instead.',
    'I built 10 AI agents this week, and this is my biggest mistake.',
    'If you are not using this specific prompt format, your agents will fail.',
    'The secret to making your AI agents look premium in under 2 minutes.'
  ],
  script: [
    {
      section: 'Hook',
      line: 'Here is the part nobody tells you about building AI agents...',
      direction: 'Zoom in slowly on creator sitting in front of a dark screen with warm backlight',
      background: 'Sleek dark room, desk with warm amber ambient strip light, monitor displaying code editor in background.',
      action_posing: 'Lean forward slightly, make direct eye contact with the camera, point finger index for emphasis.',
      cuts_info: 'Start wide, cut to a tight punchy chest-up shot exactly as the first word is spoken.'
    },
    {
      section: 'Setup',
      line: 'They tell you it is all about the model. But actually, it is about the system design.',
      direction: 'Cut to high-resolution product demo showing visual canvas editor',
      background: 'Clean desktop screen-recording showing code flows and visual builder.',
      action_posing: 'Maintain voiceover with high energy and pacing, point to screen features with cursor.',
      cuts_info: 'Slide transition to screen recording, crop and zoom in on key code blocks.'
    },
    {
      section: 'Re-hook',
      line: 'But here is the part where most creators get stuck and fail.',
      direction: 'Cut back to creator looking concerned, shaking head slightly',
      background: 'Sleek dark room, warm amber lighting.',
      action_posing: 'Shake head slowly, hands open in a posture of warning, maintain intense eye contact.',
      cuts_info: 'Jump cut to slightly tighter framing on the word "stuck".'
    },
    {
      section: 'CTA',
      line: 'Comment "AGENT" and I will send you my complete design blueprint for free.',
      direction: 'Display kinetic text overlay on screen: AGENT',
      background: 'Sleek dark room, warm lighting with a teal highlight glow.',
      action_posing: 'Smile confidently, gesture with hands bringing them together, point at the screen.',
      cuts_info: 'Slow zoom out, display big bold teal colored captions in the center.'
    }
  ],
  shot_list: [
    {
      shot: 'Cover Frame',
      framing: 'Medium close up, holding phone like a mic',
      notes: 'Creator posture: Inquisitive look. Background: Ambient studio.',
      shot_type: 'cover_frame',
      b_roll_type: 'none',
      b_roll_visual: '',
      spoken_text: ''
    },
    {
      shot: 'Talking Head A',
      framing: 'Chest-up shot',
      notes: 'Camera position: Chest-up. Creator posture: Lean forward slightly. Background: Remain same.',
      shot_type: 'talking_head',
      b_roll_type: 'none',
      b_roll_visual: '',
      spoken_text: 'Here is the part nobody tells you about building AI agents...'
    },
    {
      shot: 'B roll Insert 1',
      framing: 'B-Roll Overlay',
      notes: 'Camera position: Replaced by B-roll. Creator: Voiceover only.',
      shot_type: 'b_roll',
      b_roll_type: 'replicate',
      b_roll_visual: 'Real screen recording of system design workflow showing drag-and-drop nodes connecting.',
      spoken_text: 'They tell you it is all about the model. But actually, it is about the system design.'
    },
    {
      shot: 'Talking Head B',
      framing: 'Close-up shot',
      notes: 'Camera position: Move to Close-up. Creator posture: Concern, shake head. Background: Remain same.',
      shot_type: 'talking_head',
      b_roll_type: 'none',
      b_roll_visual: '',
      spoken_text: 'But here is the part where most creators get stuck and fail.'
    },
    {
      shot: 'B roll Insert 2',
      framing: 'B-Roll Overlay',
      notes: 'Camera position: Replaced by B-roll. Creator: Voiceover only.',
      shot_type: 'b_roll',
      b_roll_type: 'stock',
      b_roll_visual: 'Close up shot of hands typing keyboard, overlay with glowing kinetic text AGENT in teal.',
      spoken_text: ''
    },
    {
      shot: 'Talking Head C',
      framing: 'Chest-up shot',
      notes: 'Camera position: Move back to Chest-up. Creator posture: Smile confidently, gesture. Background: Remain same.',
      shot_type: 'talking_head',
      b_roll_type: 'none',
      b_roll_visual: '',
      spoken_text: 'Comment "AGENT" and I will send you my complete design blueprint for free.'
    }
  ],
  captions: ['AI Agents', 'System Design', 'Creator Blueprint', 'Coding Tips'],
  edit_checklist: [
    'Cut out all silent gaps and filler words immediately.',
    'Dampen background music to -20dB during spoken dialogue.',
    'Apply teal colored word highlights on keywords: AGENT, STUCK, FAIL.'
  ],
  caption_packet: {
    caption_style: 'Cinematic word-by-word',
    pacing: 'Fast cuts, bold emphasis',
    emphasis: 'Teal word glow',
    export: '9:16 vertical MP4, 60fps'
  },
  publish_plan: [
    { platform: 'instagram', caption: 'Stop building basic AI agents. Comment AGENT to get my blueprint.', hashtags: ['#ai', '#coding', '#build'], best_time: '12:00 PM' },
    { platform: 'tiktok', caption: 'The secret to premium AI agents.', hashtags: ['#ai', '#tech', '#developer'], best_time: '5:00 PM' }
  ],
  production_sprint: [
    { minute: '0:00 - 5:00', task: 'Setup amber/teal lighting and adjust camera framing.' },
    { minute: '5:00 - 10:00', task: 'Record 3 takes of the script with hook options.' },
    { minute: '10:00 - 20:00', task: 'Upload to Stylique and export final cut.' }
  ]
}

const MOCK_GENERATION = {
  id: 'demo',
  user_id: 'demo-user',
  reference_url: 'https://instagram.com/reel/demo',
  reference_note: 'A premium showcase script',
  fidelity: 'balanced',
  blueprint: MOCK_BLUEPRINT,
  selected_hook: 'Here is the part nobody tells you about building AI agents...',
  edit_style: 'cinematic',
  approved: false
}

export default function Result() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [gen, setGen] = useState<Generation | null>(() => (id ? GEN_CACHE[id] ?? null : null))
  // Only block on the full-screen loader when we have NOTHING cached to show.
  const [loading, setLoading] = useState(() => !(id && GEN_CACHE[id]))
  const [posted, setPosted] = useState(false)
  // A recording that was autosaved (uploaded to the takes bucket) — surface it here
  // so an accidental refresh can't make a finished recording invisible.
  const [resumeTake, setResumeTake] = useState<SavedTake | null>(null)
  const [chosenHook, setChosenHook] = useState('')
  const [approved, setApproved] = useState(false)
  // OUTPUT-1 + APPROVAL-1 on this page. `finished` answers "is there a video,
  // by EITHER authority" — the header CTA below asked `gen.edit_path`, so an
  // editor-v2 render offered "Record Script" for a video that already existed.
  // `needsApproval` is the brand's requirement, three-state: unset is not a
  // gate, see `publishAllowed`.
  const [finished, setFinished] = useState<FinishedOutput | null>(null)
  const [needsApproval, setNeedsApproval] = useState<boolean | null>(null)
  const [mobileTab, setMobileTab] = useState<'script' | 'strategy' | 'spec' | 'publish'>('script')
  const [activeTab, setActiveTab] = useState<'strategy' | 'spec' | 'publish'>('strategy')
  // On-demand AI thumbnail (parity with the V2 plan): signed URL + busy/error.
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  useEffect(() => {
    // Prefer the on-demand AI cover; otherwise fall back to the frame+hook cover the
    // worker BURNS on every edit (thumb_path). That means the poster is never blank
    // once the video exists — and the burned frame includes the creator's face, which
    // the AI cover deliberately omits (better for talking-head videos).
    const p = gen?.ai_thumb_path ?? gen?.thumb_path
    // Don't force-null when the path is absent — that would wipe a thumbnail we just
    // generated this session if a lagged gen refetch briefly returns the paths null.
    if (!p) return
    let live = true
    signEditUrls([p]).then((m) => { if (live && m[p]) setThumbUrl(m[p]) }).catch(() => {})
    return () => { live = false }
  }, [gen?.ai_thumb_path, gen?.thumb_path])
  // The FINISHED video (once recorded + edited) — sign its path so it plays right
  // here on the plan/Library screen, instead of the screen only ever offering
  // "Record / Upload" as if nothing had been made yet.
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  useEffect(() => {
    const p = gen?.edit_path
    if (!p) { setVideoUrl(null); return }
    let live = true
    signEditUrls([p]).then((m) => { if (live) setVideoUrl(m[p] ?? null) }).catch(() => {})
    return () => { live = false }
  }, [gen?.edit_path])
  const downloadVideo = () => {
    if (!videoUrl) return
    const href = videoUrl + (videoUrl.includes('?') ? '&' : '?') + 'download=twinai-video.mp4'
    const a = document.createElement('a'); a.href = href; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); a.remove()
  }

  // The AI edit (Phase 8 editor v2) — a durable, cross-device pipeline that is
  // separate from the legacy `gen.edit_path` above. Polled from `edit_projects`
  // rather than pushed, so a refresh or another device resumes watching for
  // free. Stops polling the instant the status leaves the active set.
  const [editProject, setEditProject] = useState<EditProject | null>(null)
  const [editCancelling, setEditCancelling] = useState(false)
  useEffect(() => {
    if (!id) return
    let live = true
    let timer: ReturnType<typeof setInterval> | null = null
    const tick = () => {
      getLatestEditProject(id).then((p) => {
        if (!live) return
        setEditProject(p)
        if (!p || !EDIT_PROJECT_ACTIVE_STATUSES.includes(p.status)) {
          if (timer) { clearInterval(timer); timer = null }
        }
      }).catch(() => {})
    }
    tick()
    timer = setInterval(tick, 4000)
    return () => { live = false; if (timer) clearInterval(timer) }
  }, [id])

  // The finished file — fetched ONLY once the project says `completed` with a
  // real output asset. A completed project with no asset is the scaffold
  // state (render flag off); there is deliberately nothing to fetch for it.
  // ONE FETCH, ONE ANSWER. This screen used to ask three separate questions —
  // the project row, the signed URLs, and (inside CraftChecks) the plan and
  // events — and each re-derived whether there was a video to talk about. The
  // bundle answers all of it once, and only its `ready` variant carries either
  // the output or the craft checks, so the two can no longer disagree.
  // P1-6: the script the creator is actually editing, reported up by
  // ScriptEditor so UnfilledContainers warns about THAT rather than about a
  // copy it synthesized from the blueprint. `useCallback` because ScriptEditor
  // reports through an effect keyed on this identity — an inline arrow would
  // fire it on every render of this page.
  const [liveScript, setLiveScript] = useState<RecordingScript | null>(null)
  const onScriptChange = useCallback((s: RecordingScript | null) => setLiveScript(s), [])
  const [bundle, setBundle] = useState<OutputBundle | null>(null)
  const [editOutputAttempt, setEditOutputAttempt] = useState(0)
  // The three fields the fetch actually depends on, lifted out of the row.
  // Depending on `editProject` itself would refetch on EVERY poll tick — the
  // row is a new object each time even when nothing changed — and re-signing
  // URLs every four seconds for a video already on screen is exactly the cost
  // this bundle exists to remove. Naming the fields satisfies the exhaustive-
  // deps rule honestly instead of silencing it, which matters because the
  // suppression comment is what would hide a genuinely missing dependency later.
  const projectId = editProject?.id ?? null
  const projectStatus = editProject?.status ?? null
  const projectOutputAssetId = editProject?.output_asset_id ?? null
  const hasVideo = editProducedVideo(editProject)
  useEffect(() => {
    if (!projectId || !hasVideo) { setBundle(null); return }
    let live = true
    getOutputBundle(projectId).then((b) => { if (live) setBundle(b) }).catch(() => {})
    return () => { live = false }
  }, [projectId, projectStatus, projectOutputAssetId, hasVideo, editOutputAttempt])
  const editOutput: EditorOutput | null = bundle?.state === 'ready' ? bundle.output : null
  // getEditorOutput collapses every rejection (not-ready, no-video, sign-failed)
  // into null — the UI's question is just "can I play this yet". Here the
  // project is ALREADY `completed` with an asset, so a null that never
  // resolves means the server-side signing failed, not that it's still
  // pending. Surface a retry after a few seconds instead of spinning forever.
  const [editOutputStalled, setEditOutputStalled] = useState(false)
  useEffect(() => {
    if (hasVideo && !editOutput) {
      const t = setTimeout(() => setEditOutputStalled(true), 8000)
      return () => clearTimeout(t)
    }
    setEditOutputStalled(false)
    return undefined
  }, [hasVideo, editOutput])

  const downloadEditVideo = () => {
    if (!editOutput?.videoUrl) return
    const href = editOutput.videoUrl + (editOutput.videoUrl.includes('?') ? '&' : '?') + 'download=twinai-video.mp4'
    const a = document.createElement('a'); a.href = href; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); a.remove()
  }
  const cancelEdit = async () => {
    if (!editProject) return
    setEditCancelling(true)
    try {
      await cancelEditProject(editProject.id)
      // Refresh immediately rather than waiting for the next 4s poll tick.
      setEditProject(await getLatestEditProject(editProject.generation_id))
    } catch {
      // Best-effort — the next poll tick reconciles regardless.
    } finally {
      setEditCancelling(false)
    }
  }
  // Starting an edit. The server refuses with a STABLE CODE rather than prose
  // (StartEditorRejection), so each one gets a sentence a creator can act on —
  // a raw code shown to a user is an error message that explains nothing.
  const [editStarting, setEditStarting] = useState(false)
  const [editStartErr, setEditStartErr] = useState<string | null>(null)
  const startEdit = async () => {
    if (!id || !serverSourceAssetId) return
    setEditStartErr(null)
    setEditStarting(true)
    try {
      // One key per click-intent: the database converges a retry of THIS click
      // onto one project, while a later deliberate re-edit mints a new key.
      await startEditorV2(id, serverSourceAssetId, newIdempotencyKey())
      // Adopt the new project immediately so the card switches to progress
      // without waiting for the next poll tick.
      setEditProject(await getLatestEditProject(id))
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      setEditStartErr(START_ERROR_TEXT[code] ?? 'Could not start the edit. Please try again.')
    } finally {
      setEditStarting(false)
    }
  }
  // Agency approval workflow: agencies mark a blueprint client-approved before it's
  // recorded/posted. Soft status (no hard block) so solo creators are unaffected.
  const isAgency = profile?.plan === 'agency'
  const toggleApproved = async () => {
    if (!gen) return
    const next = !approved
    setApproved(next)
    const ok = await setGenerationApproved(gen.id, next)
    if (!ok) { setApproved(!next); return } // revert on failure
    // THE ROW MOVED, SO THE ROW WE READ MUST MOVE WITH IT. `approvalState` reads
    // `gen`, and `gen` is the copy fetched on mount — updating only the separate
    // `approved` flag left the chip saying "Approved" in un-approved styling and
    // the post action blocked, because the state it derives from still showed
    // no binding. Re-reading is the honest refresh: the RPC resolves the binding
    // server-side, so the client cannot compute what it now holds.
    const fresh = await getGeneration(gen.id).catch(() => null)
    if (fresh && alive.current) { GEN_CACHE[gen.id] = fresh; setGen(fresh) }
  }
  // APPROVAL-1 read as three states, not as a boolean. `unbound` — approved
  // before 0111 recorded WHAT — is real and is not "not approved"; it is also
  // not enough at the moment of publishing, which is the whole distinction.
  const approval = approvalState(gen, finished)
  const approvalBlock = approvalBlockReason(needsApproval, approval)

  // Guards setState after the user navigates away mid-fetch.
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => {
    if (!id) return
    // Demo mock is a DEV-only convenience — production users always get real data
    // (or a real error), never a fabricated blueprint.
    if (import.meta.env.DEV && id === 'demo') {
      setGen(MOCK_GENERATION as unknown as Generation)
      setApproved(false)
      setChosenHook(MOCK_GENERATION.selected_hook)
      setLoading(false)
      return
    }
    // Know whether this video's already been posted, to swap the header CTA
    // (Post now ↔ Posted). Best-effort — never blocks the page.
    listPosts().then((posts) => {
      if (alive.current) setPosted(posts.some((p) => p.generation_id === id && p.status === 'posted'))
    }).catch(() => {})
    getGeneration(id)
      .then((g) => {
        if (!g) {
          // Real id that didn't resolve (deleted, foreign, or RLS-blocked) →
          // leave gen null so the honest "We couldn't find that script" state
          // renders. NEVER substitute the demo blueprint for a real id.
          return
        }
        GEN_CACHE[id] = g
        setGen(g)
        setApproved(!!g?.approved)
        // Both best-effort and neither blocks the page. A failed resolve leaves
        // `finished` null, which the CTA below reads as "no finished video" —
        // the safe direction here, because it offers recording rather than
        // offering to post something we could not confirm exists.
        resolveFinishedOutputsResult([g])
          .then((r) => { if (alive.current) setFinished(r.outputs.get(g.id) ?? null) })
          .catch(() => {})
        // UNSET stays null. A creator never asked whether anyone signs off has
        // not said that someone does, and a read failure is not an answer
        // either — both must leave the publish path open.
        loadCapabilities(g.id)
          .then((c) => { if (alive.current) setNeedsApproval(c.needs_approval.value) })
          .catch(() => {})
        // Default the shooting hook to the saved choice, else the recommended (1st).
        const hooks = (g?.blueprint?.hook_options ?? []) as string[]
        const initial = g?.selected_hook ?? hooks[0] ?? ''
        setChosenHook(initial)
        // Capture the default the first time, so the gallery's learning signal isn't
        // empty when a creator shoots without explicitly tapping a hook (was 1/15).
        // ⚠️ AND SAY THAT IT IS A DEFAULT. Filling the column made the signal
        // non-empty by writing something nobody picked; 14 of 23 production rows
        // equal option[0] and cannot be told apart from this write. `hook_choice`
        // is what lets a reader ask for choices and get choices (0134).
        if (id && !g?.selected_hook && initial) {
          void updateGenerationChoice(id, { selected_hook: initial, hook_choice: defaultCapture(0) })
        }
      })
      .catch(() => {
        // Load error (network / RLS) → leave gen null for the not-found state
        // rather than fabricating the demo blueprint as the user's own script.
      })
      .finally(() => setLoading(false))
  }, [id])

  // Surface an autosaved recording. If the video is already finished (edit_path
  // set), the take was consumed — drop the pointer instead of offering a stale take.
  useEffect(() => {
    if (!id) return
    const t = readTakePointer(id)
    if (!t) { setResumeTake(null); return }
    if (gen?.edit_path) { clearTakePointer(id); setResumeTake(null) }
    else setResumeTake(t)
  }, [id, gen?.edit_path])

  // Database-first recovery of the recorded take (editor-v2 source-asset flow):
  // the READY media_assets row is authoritative (survives cleared localStorage
  // and works cross-device); generations.take_path is the compatibility
  // projection (also covers historical rows); the local pointer is a same-tab
  // convenience only — never proof of a completed upload.
  const [serverSourcePath, setServerSourcePath] = useState<string | null>(null)
  // The asset's ID, not just its path. Starting an edit names the source by ID —
  // `startEditorV2` takes three IDs and never a path, deliberately (a path that
  // can be passed is a path that can be wrong). Only a READY asset has one here,
  // which is also exactly the precondition the server enforces.
  const [serverSourceAssetId, setServerSourceAssetId] = useState<string | null>(null)
  useEffect(() => {
    if (!id) { setServerSourcePath(null); setServerSourceAssetId(null); return }
    let live = true
    getReadySourceAsset(id)
      .then((a) => {
        if (!live) return
        setServerSourcePath(a?.storage_path ?? null)
        setServerSourceAssetId(a?.id ?? null)
      })
      .catch(() => {})
    return () => { live = false }
  }, [id])

  // The recorded-but-not-yet-processed take: server asset > compat column > local pointer.
  const rawTakePath = !gen?.edit_path ? (serverSourcePath ?? gen?.take_path ?? resumeTake?.takePath ?? null) : null

  // Sign the raw take so it PLAYS on this page — the recording shouldn't be
  // invisible just because no finished video exists yet.
  const [rawTakeUrl, setRawTakeUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!rawTakePath) { setRawTakeUrl(null); return }
    let live = true
    signTakeUrl(rawTakePath).then((u) => { if (live) setRawTakeUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [rawTakePath])

  // Pick which hook to shoot: persist it so the teleprompter, cover and b-roll all
  // use THIS hook. Optimistic — the UI updates immediately.
  const pickHook = (h: string) => {
    setChosenHook(h)
    // ⚖️ THE INDEX COMES FROM THE OPTIONS ON SCREEN, not from re-deriving it
    // later: only this moment knows a human tapped anything. A hook that is
    // somehow not among the options records as freeform rather than as a pick
    // at a fabricated position.
    const opts = (gen?.blueprint?.hook_options ?? []) as string[]
    const i = opts.indexOf(h)
    if (id) {
      void updateGenerationChoice(id, {
        selected_hook: h,
        hook_choice: i >= 0 ? creatorPick(i) : freeformEntry(),
      })
    }
  }
  // "Post now" → reveal the posting options (the "Where to post" tab on both layouts).
  const goPost = () => {
    setActiveTab('publish'); setMobileTab('publish')
    setTimeout(() => document.getElementById('post-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  if (loading)
    return (
      <main className="grid min-h-[60vh] place-items-center text-sand">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your script…
        </span>
      </main>
    )
  if (!gen)
    return (
      <main className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-5 text-center">
        <div>
          <p className="font-heading text-lg text-cream">We couldn’t find that script.</p>
          <p className="mt-2 text-sm text-stone">It may have been removed, or the link is out of date.</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/history" className="btn-gradient inline-flex">
              <ArrowLeft className="h-4 w-4" /> Back to Library
            </Link>
            <Link to="/app" className="btn-ghost inline-flex justify-center">
              Make a new video
            </Link>
          </div>
        </div>
      </main>
    )

  // Defensive normalization: an older or partial blueprint can be missing fields,
  // and calling .map on an undefined field would unmount the page (black screen).
  // Default every field so the result always renders something sensible.
  const raw = (gen.blueprint ?? {}) as Partial<Generation['blueprint']>
  const rr = raw.reference_read ?? ({} as NonNullable<Generation['blueprint']>['reference_read'])
  const br = raw.b_roll_stats ?? { original_b_roll_count: '0', suggested_b_roll_count: '0' }
  const b = {
    ...raw,
    reference_read: {
      format_label: rr.format_label ?? 'Your script',
      platform: rr.platform ?? '',
      why_it_works: Array.isArray(rr.why_it_works) ? rr.why_it_works : [],
      retention_map: Array.isArray(rr.retention_map) ? rr.retention_map : [],
      // ⚠️ FIX 8 (Wave 3). This normaliser rebuilds `reference_read` field by
      // field, which is exactly how `visual_hook` and `beat_plan[].proof`
      // were discarded on arrival before (see the comments below). Naming
      // this field is what keeps it from joining them.
      reference_duration_sec: rr.reference_duration_sec ?? null,
    },
    b_roll_stats: {
      original_b_roll_count: br.original_b_roll_count ?? '0',
      suggested_b_roll_count: br.suggested_b_roll_count ?? '0',
    },
    // ⚠️ CARRIED THROUGH RAW. This normaliser rebuilds the blueprint field by
    // field, which is exactly how the visual hook was discarded on arrival for
    // every generation that had one. `readVisualHook` validates it at the point
    // of use; dropping it here made that impossible.
    visual_hook: raw.visual_hook,
    // ⚠️ CARRIED THROUGH RAW, for the reason visual_hook was: this normaliser
    // rebuilds the blueprint field by field, so a field it does not name is
    // discarded on arrival. `beat_plan[].proof` was being lost here.
    beat_plan: raw.beat_plan,
    hook_options: Array.isArray(raw.hook_options) ? raw.hook_options : [],
    script: Array.isArray(raw.script) ? raw.script : [],
    shot_list: Array.isArray(raw.shot_list) ? raw.shot_list : [],
    captions: Array.isArray(raw.captions) ? raw.captions : [],
    edit_checklist: Array.isArray(raw.edit_checklist) ? raw.edit_checklist : [],
    production_sprint: Array.isArray(raw.production_sprint) ? raw.production_sprint : [],
    publish_plan: Array.isArray(raw.publish_plan) ? raw.publish_plan : [],
  } as Generation['blueprint']
  const cap = b.caption_packet ?? b.submagic_packet ?? { caption_style: '', pacing: '', emphasis: '', export: '' }

  // A script line that is just a bracket token ("[Hook Option 1]", "[Insert
  // selected hook from above]") is a broken placeholder that must never render as
  // real dialogue. Server-side normalization now prevents new ones; this repairs
  // any already stored: swap the opening hook beat for the chosen/best hook, and
  // blank any stray placeholder elsewhere rather than showing the raw token.
  const hookText = chosenHook || b.hook_options[0] || ''
  // ⚖️ THE FIRST SECOND, IF THIS GENERATION HAS ONE. 37 of 41 predate the
  // field; for those the card simply is not there, because they were never
  // promised a first-second plan and "not specified" would report a gap that
  // does not exist.
  const visualHook = readVisualHook(b.visual_hook)
  const updatedScript = b.script.map((s, i) => {
    // ⚠️ SILENCE IS NEVER OVERWRITTEN, AT ANY INDEX. `isWhollyPlaceholder` is
    // true for BOTH "[Hook Option 1]" (fill me in) and "[No spoken audio]"
    // (nobody speaks here), and this map filled every true with the hook. In
    // production that gave generation 9072552b — four beats, three of them
    // "[No spoken audio]" — the SAME HOOK LINE THREE TIMES, once as its Call
    // to Action. The hook is on the picker above regardless, so there is
    // nothing to recover by pasting it over a deliberate silence.
    if (isSilentBeat(s.line)) return s
    if (i === 0 && hookText) {
      if (isWhollyPlaceholder(s.line)) return { ...s, line: hookText }
      const sentences = s.line.split(/(?<=[.!?])\s+/)
      if (sentences.length > 1) return { ...s, line: `${hookText.trim()} ${sentences.slice(1).join(' ')}` }
      return { ...s, line: hookText }
    }
    if (isWhollyPlaceholder(s.line)) return { ...s, line: hookText || s.line }
    return s
  })

  // ⚖️ HOW LONG THIS IS, BEFORE THEY STAND IN FRONT OF A CAMERA. Measured on the
  // REPAIRED script above, because that is the one they will read. Disclosure
  // only — a creator may shoot any length they like.
  const lengthLine = lengthSentence(measureScriptLength(updatedScript))
  // ⚠️ FIX 8 (Wave 3). The SAME computed runtime `lengthLine` is built from,
  // now shown beside the reference video's own known length (when the
  // analyzer measured one) and with a warning when it clears the short-form
  // ceiling. `b.reference_read.reference_duration_sec` is absent for every
  // blueprint generated before this existed, or a reference the ingest
  // never measured a duration for — both read as "no reference length to
  // compare against", never a fabricated 0.
  const runtimeCompare = compareRuntime(updatedScript, b.reference_read.reference_duration_sec ?? null)
  // ⚖️ THE BASE SENTENCE STAYS `lengthLine` — it already covers the states
  // `runtimeComparisonSentence` does not (unwritten beats, implausibly
  // short). This is the SAME computed number, extended only with what
  // `lengthLine` cannot say: the reference's own length, and the ceiling.
  // Rendered only when it has something to add.
  const referenceCompareLine =
    runtimeCompare.referenceSec !== null
      ? `The reference runs about ${spokenTime(runtimeCompare.referenceSec)}.`
      : null
  const ceilingWarningLine = runtimeCompare.exceedsCeiling
    ? `That is longer than a short-form video normally runs (over ${spokenTime(runtimeCompare.ceilingSec)}) — worth trimming before you record.`
    : null

  return (
    <main className="relative min-h-screen overflow-clip bg-ink text-sand pb-20">
      {/* Aurora Glow */}
      <Aurora className="opacity-45 pointer-events-none" />

      {/* Hero Header */}
      <section className="relative border-b border-white/5 bg-ink2/30 backdrop-blur-sm">
        <div className="relative mx-auto max-w-7xl px-6 pb-10 pt-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link to="/history" className="inline-flex items-center gap-1.5 text-xs text-stone hover:text-cream transition-colors">
              <ArrowLeft className="h-4 w-4" /> Library
            </Link>
            
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {/* ONE clear action per stage, never mixed:
                  1. finished video → Post now (or the Posted chip). Nothing else.
                  2. otherwise → Record Script / Upload Take. */}
              {/* OUTPUT-1: `finished`, not `gen.edit_path`. This asked the
                  legacy column, so a creator whose editor-v2 render had
                  finished was offered "Record Script" for a video they had
                  just watched further down the same page. */}
              {finished ? (
                posted ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-xs font-semibold text-teal">
                    <Check className="h-3.5 w-3.5" /> Posted
                  </span>
                ) : approvalBlock ? (
                  // APPROVAL-1: the button is DISABLED rather than hidden, and
                  // the reason is on the page rather than in a tooltip. A
                  // vanished action reads as a bug; a disabled one with a
                  // sentence reads as a step they have not taken yet.
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-3.5 py-2 text-xs font-semibold text-amber"
                    title={approvalBlock}
                  >
                    <BadgeCheck className="h-3.5 w-3.5" /> Needs approval
                  </span>
                ) : (
                  <button onClick={goPost} className="btn-gradient py-2 text-xs font-semibold">
                    <Send className="h-3.5 w-3.5" /> Post now
                  </button>
                )
              ) : (
                <>
                  <Link to={`/record/${gen.id}`} className="btn-gradient py-2 text-xs font-semibold"><Video className="h-3.5 w-3.5" /> Record Script</Link>
                  <Link to={`/record/${gen.id}?mode=upload`} className="btn-ghost py-2 text-xs font-medium"><Wand2 className="h-3.5 w-3.5" /> Upload Take</Link>
                </>
              )}
            </div>
          </div>

          {/* ⚠️ ASKED ONLY WHERE THERE IS SOMETHING TO ANSWER ABOUT. A creator
              still deciding whether to film has not seen the video and cannot
              say whether they would post it; asking then collects a guess and
              teaches them to dismiss us. `finished` is the same condition the
              Post button reads, so the question appears exactly when posting
              becomes a real choice. */}
          {finished && <WouldYouPostThis generationId={gen.id} />}

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mt-8"
          >
            <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-cream sm:text-4xl">
              {b.reference_read.format_label}
            </h1>
            {chosenHook && (
              <p className="mt-4 max-w-4xl font-heading text-base leading-relaxed text-cream/90 italic pl-3 border-l border-white/10">
                “{chosenHook}”
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="chip text-xs">
                <ExternalLink className="h-3.5 w-3.5 text-stone" /> {b.reference_read.platform}
              </span>
              <span className="chip text-xs">{gen.fidelity === 'close' ? 'Close to the reference' : gen.fidelity === 'loose' ? 'Loosely inspired' : 'Balanced remix'}</span>
              {isAgency && (
                <button
                  onClick={toggleApproved}
                  className={cn(
                    'chip text-xs transition-colors',
                    approval === 'current' ? 'border-teal/50 bg-teal/5 text-teal'
                      : approval === 'none' ? 'hover:border-white/10 hover:text-cream'
                      // Amber, not teal: a stale or unverifiable approval is
                      // not a green tick, and colouring it as one is how the
                      // distinction gets lost at a glance.
                      : 'border-amber/50 bg-amber/5 text-amber'
                  )}
                  title={approval === 'superseded'
                    ? 'This video changed after it was approved'
                    : approval === 'unbound'
                      ? 'Approved before we recorded which version'
                      : 'Mark approved'}
                >
                  <BadgeCheck className={cn('h-3.5 w-3.5', approved ? 'text-teal' : 'text-stone')} />
                  {/* THE LABEL CARRIES THE STATE. "Approved" over a video that
                      was re-edited since is the exact sentence APPROVAL-1
                      exists to stop: everyone believes it was checked, and the
                      file that would go out has been seen by nobody. */}
                  {approval === 'superseded'
                    ? 'Approved · changed since'
                    : approval === 'unbound'
                      ? 'Approved · version unknown'
                      : approved ? 'Approved' : 'Mark Approved'}
                </button>
              )}
            </div>
          </motion.div>

          {/* MEDIA ROW — the finished video and its AI cover image, side by side, each
              hugging its own frame. The cover lives HERE (not inside the Title card) so
              generating one never balloons the concept/title cards. */}
          {(gen.edit_path || rawTakePath || b.packaging?.thumbnail || editProject) && (
            <div className="mt-8 flex flex-wrap items-start gap-4">
              {/* A recorded raw take — shown right here so the recording is never
                  invisible. AI editing is being rebuilt and will pick this up. */}
              {rawTakePath && (
                <div className="w-full max-w-[280px] rounded-card border border-coral/25 bg-ink2/70 p-3 backdrop-blur-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-cream"><span className="h-2 w-2 rounded-full bg-coral" /> Your recording</div>
                    <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone">Raw take</span>
                  </div>
                  <div className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
                    {rawTakeUrl
                      ? <video src={rawTakeUrl} controls playsInline className="h-full w-full object-contain" />
                      : <Loader2 className="h-6 w-6 animate-spin text-white/40" />}
                  </div>
                  {/* THE IGNITION. Offered only when the server-side asset is
                      READY — that ID is the one thing `startEditorV2` accepts, and
                      its absence means the upload hasn't finished, so a button
                      here would only ever produce `source_not_ready`. Hidden once
                      an edit exists unless that edit ended without a video, which
                      is the one case where trying again is the right move. */}
                  {serverSourceAssetId && (!editProject || editProject.status === 'failed' || editProject.status === 'cancelled') && (
                    <>
                      <button
                        onClick={startEdit}
                        disabled={editStarting}
                        className="btn-gradient mt-3 w-full justify-center py-2.5 text-xs font-semibold disabled:opacity-60"
                      >
                        {editStarting
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting…</>
                          : <><Wand2 className="h-3.5 w-3.5" /> {editProject ? 'Try the AI edit again' : 'Make my AI edit'}</>}
                      </button>
                      {editStartErr && <p className="mt-2 text-center text-xs text-coral">{editStartErr}</p>}
                    </>
                  )}
                </div>
              )}
              {/* The AI edit (Phase 8 editor v2) — independent of the legacy
                  gen.edit_path card below; a generation can have neither, either,
                  or (mid-migration) both. */}
              {editProject && (
                <div className="w-full max-w-[280px] rounded-card border border-teal/25 bg-ink2/70 p-3 backdrop-blur-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-cream">
                      <span className={cn(
                        'h-2 w-2 rounded-full',
                        editProject.status === 'failed' ? 'bg-coral' : editProject.status === 'cancelled' ? 'bg-stone' : 'bg-teal',
                      )} />
                      Your AI edit
                    </div>
                    {editOutput?.videoUrl && (
                      <button onClick={downloadEditVideo} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-cream hover:bg-white/10">
                        <Download className="h-3.5 w-3.5" /> Download
                      </button>
                    )}
                    {EDIT_PROJECT_ACTIVE_STATUSES.includes(editProject.status) && (
                      <button onClick={cancelEdit} disabled={editCancelling} className="text-xs text-stone hover:text-coral disabled:opacity-50">
                        {editCancelling ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                  <div className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
                    {editProducedVideo(editProject) ? (
                      editOutput?.videoUrl ? (
                        <video src={editOutput.videoUrl} controls playsInline className="h-full w-full object-contain" poster={editOutput.coverUrl ?? undefined} />
                      ) : bundle?.state === 'unavailable' || editOutputStalled ? (
                        // TOLD, rather than guessed after eight seconds.
                        //
                        // The spinner-then-timeout path stays as a backstop for
                        // a bundle that has not arrived at all, but when the
                        // bundle says `unavailable` the server has already
                        // answered: the row names an output and it could not be
                        // served. Waiting out a timer to say so is time the
                        // creator spends believing it is still loading.
                        <div className="text-center">
                          <p className="px-4 text-xs text-coral">Couldn’t load the video.</p>
                          <p className="mt-1 px-5 text-[11px] leading-relaxed text-stone">
                            The video is there — we just couldn’t reach it this time.
                          </p>
                          <button onClick={() => setEditOutputAttempt((n) => n + 1)} className="mt-2 text-xs text-stone underline hover:text-cream">Retry</button>
                        </div>
                      ) : (
                        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                      )
                    ) : editFinishedWithoutVideo(editProject) ? (
                      <p className="px-5 text-center text-xs text-stone">This run finished without producing a video.</p>
                    ) : editProject.status === 'failed' ? (
                      // §9's "failure at 11pm": a batch films Sunday, two renders
                      // come back broken, the user churns silently without filing
                      // a ticket. The catalogue answering the four questions they
                      // actually have — is my footage still there, must I film it
                      // again, will retry help, is this my fault — has existed
                      // since Phase 10 item 5 and served nobody. A bare code told
                      // them none of it.
                      (() => {
                        const why = explainFailure(editProject.failure_code)
                        return (
                          <div className="px-5 text-center">
                            <p className="text-xs leading-relaxed text-cream">{why.message}</p>
                            {why.footageRetained && (
                              <p className="mt-2 text-[11px] text-stone">Your recording is still saved.</p>
                            )}
                            {/* RETRY IS OFFERED ONLY WHERE IT CAN PLAUSIBLY WORK.
                                Telling someone to retry a failure that can never
                                clear is exactly how this defect hurts, so the
                                button is gated on the class rather than shown
                                always and hoped for. */}
                            {why.retryCanHelp && (
                              <button onClick={startEdit} disabled={editStarting} className="btn-gradient mt-3 w-full text-xs">
                                {editStarting ? 'Starting…' : 'Try again'}
                              </button>
                            )}
                            {/* The code stays, small: it is what a support
                                conversation needs, and hiding it helps nobody. */}
                            {editProject.failure_code && (
                              <p className="mt-3 text-[10px] text-stone/60">{editProject.failure_code}</p>
                            )}
                          </div>
                        )
                      })()
                    ) : editProject.status === 'cancelled' ? (
                      <p className="px-5 text-center text-xs text-stone">Cancelled.</p>
                    ) : editProject.status === 'awaiting_review' ? (
                      // NOT a spinner. Nothing is running: the pipeline is
                      // waiting on this person, and a spinner would tell them to
                      // wait for a step that only they can take.
                      <div className="px-5 text-center">
                        <p className="text-xs text-cream">{EDIT_STATUS_LABEL[editProject.status]}</p>
                        <p className="mt-1 text-[11px] text-stone">Edit the words, then we make the video.</p>
                        <Link
                          to={`/edit/${editProject.id}/review`}
                          className="btn-gradient mt-3 block w-full text-center text-xs"
                        >
                          Review the transcript
                        </Link>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-white/40" />
                        <p className="mt-2 px-4 text-xs text-stone">{EDIT_STATUS_LABEL[editProject.status]}</p>
                      </div>
                    )}
                  </div>
                  {/* §7c's craft checks, on the finished video only. Shown after
                      the render because every one of them is a statement about
                      what the render DID — showing them beforehand would be
                      predicting, which is the line §7c forbids crossing. */}
                  {/* ON A RUN THAT PRODUCED A VIDEO, not merely one that stopped.
                      `completed` with a null output is the scaffold state, and
                      §7c's checks are statements about what the render DID —
                      there is no render to make a statement about, so the panel
                      would be reporting on a video that does not exist. */}
                  {editProducedVideo(editProject) && (
                    <div className="mt-3">
                      <CraftChecks checks={bundle?.state === 'ready' ? bundle.craft : null} />
                    </div>
                  )}
                </div>
              )}
              {gen.edit_path && (
                <div id="your-video" className="w-full max-w-[280px] scroll-mt-24 rounded-card border border-teal/25 bg-ink2/70 p-3 backdrop-blur-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-cream"><span className="h-2 w-2 rounded-full bg-teal" /> Your video</div>
                    <div className="flex items-center gap-2">
                      {/* The cover lives behind this button now, not in a
                          permanent card. It is wanted twice — once to look at,
                          once to download on the way to posting — and it used
                          to occupy a screen the creator reads while filming. */}
                      <CoverButton
                        generationId={gen.id}
                        hasCover={!!gen?.ai_thumb_path}
                        coverPath={gen?.ai_thumb_path ?? null}
                        initialUrl={thumbUrl}
                        onCreated={(path) => {
                          setGen((prev) => (prev ? { ...prev, ai_thumb_path: path } : prev))
                          if (id) GEN_CACHE[id] = { ...(GEN_CACHE[id] ?? gen), ai_thumb_path: path }
                        }}
                      />
                      {videoUrl && <button onClick={downloadVideo} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-cream hover:bg-white/10"><Download className="h-3.5 w-3.5" /> Download</button>}
                    </div>
                  </div>
                  <div className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
                    {videoUrl
                      ? <video src={videoUrl} controls playsInline className="h-full w-full object-contain" poster={thumbUrl ?? undefined} />
                      : <Loader2 className="h-6 w-6 animate-spin text-white/40" />}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Your video idea. The old "Title & cover image" card (suggested titles +
              a shot-by-shot cover-photo brief) was removed — the app generates the
              actual cover thumbnail now, so those manual instructions were redundant. */}
          {b.concept?.premise && (
            <div className="mt-6">
              <div className="flex flex-col rounded-card border border-teal/25 bg-teal/[0.06] p-4">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal">Your video idea</div>
                <p className="text-sm font-semibold leading-snug text-cream">{b.concept.premise}</p>
                {b.concept.your_scale && <p className="mt-1.5 text-xs leading-snug text-sand/85"><span className="text-stone">Film it solo: </span>{b.concept.your_scale}</p>}
                {b.concept.translations?.length ? (
                  <div className="mt-2 space-y-1">
                    {b.concept.translations.map((t, i) => (
                      <div key={i} className="text-xs leading-snug"><span className="text-stone">{t.theirs}</span><span className="text-teal"> → </span><span className="text-cream">{t.yours}</span></div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* iOS-Style Segmented Control for Mobile Navigation */}
          <div className="mt-8 block lg:hidden">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-ink3 p-1 border border-white/5 shadow-inner">
              {(['script', 'strategy', 'spec', 'publish'] as const).map((tab) => {
                const active = mobileTab === tab
                return (
                  <button
                    key={tab}
                    onClick={() => setMobileTab(tab)}
                    className={cn(
                      'rounded-lg py-2.5 text-center text-[10px] sm:text-xs font-semibold uppercase tracking-normal sm:tracking-wider transition-all duration-200',
                      active
                        ? 'bg-ink2 text-cream shadow border border-white/5'
                        : 'text-stone hover:text-sand'
                    )}
                  >
                    {tab === 'script' ? 'Script' : tab === 'strategy' ? 'Why it works' : tab === 'spec' ? 'Film & edit' : 'Post it'}
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10">
        {isAgency && <div className="mb-8"><ClientApprovalCard gen={gen} /></div>}
        
        {/* Desktop Layout: Workspace on Left, Tabbed Inspector Panel on Right */}
        <div className="hidden lg:grid grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Script Workspace (7 cols) */}
          <div className="col-span-7 space-y-10">
            {/* Hook Selector */}
            <div className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-4 shadow-glass backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Quote className="h-4.5 w-4.5 text-amber" />
                <span className="font-heading text-xs font-semibold text-cream tracking-wide uppercase">Pick your opening line</span>
              </div>
              <p className="text-xs text-stone">Pick an opening line — it updates your script below.</p>
              {/* ⚖️ FIVE OPTIONS THAT OPEN THE SAME WAY ARE NOT FIVE OPTIONS.
                  Reports the collision only — the opening may be exactly how
                  this creator talks, and Twin does not overrule that. */}
              {hookVarietyNote(b.hook_options) && (
                <p className="text-xs text-amber/90">{hookVarietyNote(b.hook_options)}</p>
              )}
              {visualHook && (
                <div className="mt-1 rounded-lg border border-white/5 bg-ink/40 p-3 space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber">Before you say a word</div>
                  <p className="text-xs text-cream">{visualHook.openingFrame}</p>
                  <p className="text-xs text-stone">{visualHook.whyItInterrupts}</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                {b.hook_options.map((h, i) => {
                  const isChosen = h === chosenHook
                  return (
                    <button
                      key={i}
                      onClick={() => pickHook(h)}
                      className={cn(
                        'relative w-full text-left flex items-start gap-4 rounded-card p-5 text-sm sm:text-base font-medium transition-all duration-300 hover:-translate-y-0.5 shadow-sm',
                        isChosen
                          ? 'bg-ink3 text-cream shadow-glow'
                          : 'bg-ink3/45 border border-white/5 text-sand hover:border-white/10 hover:bg-ink3/75'
                      )}
                    >
                      {isChosen && <div className="absolute inset-0 rounded-card gradient-border pointer-events-none" />}
                      <span className={cn('mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors', isChosen ? 'border-coral bg-coral text-ink' : 'border-white/20')}>
                        {isChosen && <Check className="h-3 w-3 text-ink stroke-[3]" />}
                      </span>
                      <div className="flex-1 min-w-0 leading-relaxed">
                        {i === 0 && <span className="mr-2 inline-block rounded-full bg-amber/10 border border-amber/20 px-2 py-0.5 text-[9px] font-bold text-amber uppercase tracking-widest">Recommended</span>}
                        <span className="italic font-semibold text-cream">“{h}”</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Script Teleprompter */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-2">
                  <FileText className="h-4 w-4 text-stone" /> Script teleprompter
                </h2>
                <span className="text-xs text-stone">{updatedScript.length} scenes</span>
              </div>
              <p className="text-xs text-stone/80">{lengthLine}</p>
              {referenceCompareLine && <p className="text-xs text-stone/80">{referenceCompareLine}</p>}
              {ceilingWarningLine && <p className="text-xs text-amber">{ceilingWarningLine}</p>}
              
              <UnfilledContainers generationId={gen.id} blueprint={b} hook={chosenHook} script={liveScript} />
              <CountPromise blueprint={b} />
              <ScriptEditor
                onScriptChange={onScriptChange}
                generationId={gen.id}
                blueprint={b}
                selectedHook={chosenHook}
                hasTake={serverSourceAssetId != null}
                beatAudit={gen.beat_audit}
                fallback={<BlueprintScriptCards script={updatedScript} beatPlan={b.beat_plan} advisoryFindings={readAdvisoryFindings(b)} />}
              />
              {/* See the other call site: the script owns the list, so the
                  editor that changes it stays above this. */}
              <DeclaredClips generationId={gen.id} />
              {/* ⚠️ ASKED HERE BECAUSE HERE IS WHERE THE CREATOR ALREADY IS. The
                  one source better than a transcript is the creator answering a
                  question, and the measured lesson about questions in this
                  product is that placement decides whether they get answered at
                  all. One question, under a script they were just handed. */}
              <CreatorQuestionCard />
              {/* ⚠️ ONLY WHEN THIS EXACT SCRIPT WAS WRITTEN BLIND. `product_capture_prompt`
                  is this generation's own `unrecordedProduct` decision, carried from
                  the writer -- so the card appears exactly when the creator can feel
                  the cost of the gap, not on every script regardless of whether it
                  mattered here. */}
              <ProductCaptureCard shown={readProductCapturePrompt(b)} voiceId={gen.brand_voice_id ?? null} />
            </div>

            {/* Shot List */}
            <div className="space-y-4">
              <h2 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-stone" /> Shots & extra clips
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {b.shot_list.map((s, i) => {
                  const isBroll = s.shot_type === 'b_roll'
                  const isTalkingHead = s.shot_type === 'talking_head'
                  const isReplicate = s.b_roll_type === 'replicate'

                  return (
                    <div
                      key={i}
                      className={cn(
                        "relative isolate overflow-hidden rounded-card border p-5 space-y-3.5 shadow-glass backdrop-blur-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between",
                        isReplicate
                          ? "border-amber/35 bg-amber/[0.08]"
                          : isBroll
                            ? "border-coral/25 bg-ink2/85"
                            : isTalkingHead
                              ? "border-teal/25 bg-ink2/85"
                              : "border-white/10 bg-ink2/85"
                      )}
                    >
                      <div className="space-y-2">
                        {/* Title & Framing Badge */}
                        <div className="space-y-1.5">
                          <span className="font-heading text-cream text-sm font-semibold block">{shotLabel(s.shot, s.shot_type, s.framing, i)}</span>
                          <span className="inline-block rounded bg-ink3 border border-white/10 px-2 py-0.5 text-[10px] text-sand font-mono leading-snug">
                            {s.framing}
                          </span>
                        </div>

                        {/* Shot Type & B-Roll Type Badges */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {s.shot_type && (
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border",
                              isBroll
                                ? "border-coral/20 bg-coral/5 text-coral"
                                : isTalkingHead
                                  ? "border-teal/20 bg-teal/5 text-teal"
                                  : "border-stone/20 bg-stone/5 text-stone"
                            )}>
                              {isBroll ? (
                                <>
                                  <Video className="h-2.5 w-2.5" /> Extra clip
                                </>
                              ) : isTalkingHead ? (
                                <>
                                  <User className="h-2.5 w-2.5" /> You talking
                                </>
                              ) : (
                                <>
                                  <Quote className="h-2.5 w-2.5" /> Cover shot
                                </>
                              )}
                            </span>
                          )}

                          {isBroll && s.b_roll_type && (
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border",
                              isReplicate
                                ? "border-amber/20 bg-amber/5 text-amber"
                                : "border-stone/20 bg-stone/5 text-stone"
                            )}>
                              {isReplicate ? 'Copy theirs' : 'Stock clip'}
                            </span>
                          )}
                        </div>

                        {/* Shot Notes / Description */}
                        <p className="text-xs text-stone leading-relaxed pt-1">{s.notes}</p>

                        {/* B-Roll Visual Description */}
                        {isBroll && s.b_roll_visual && (
                          <div className="bg-ink3/30 border border-white/5 rounded-lg p-2.5 mt-2">
                            <span className="text-[9px] font-bold text-cream uppercase tracking-wider block mb-0.5">On-screen text & graphics</span>
                            <span className="text-xs text-sand/85 leading-relaxed">{s.b_roll_visual}</span>
                          </div>
                        )}
                      </div>

                      {/* Spoken Dialog Overlay (if B-roll has spoken words, or if it's Talking Head) */}
                      {s.spoken_text && s.spoken_text.trim() !== '' && (
                        <div className="border-t border-white/[0.04] pt-3 mt-3">
                          <span className="text-[9px] font-bold text-stone uppercase tracking-wider block mb-1">What to say</span>
                          <p className="text-xs italic text-sand pl-2 border-l border-teal/30 leading-relaxed">
                            “{s.spoken_text}”
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>

          {/* Right Column: Tabbed Inspector Panel (5 cols) */}
          <div id="post-section" className="col-span-5 space-y-6 sticky top-6 scroll-mt-6">
            
            {/* Tab Swapper */}
            <div className="rounded-xl bg-ink3 p-1 border border-white/5 shadow-inner flex">
              {(['strategy', 'spec', 'publish'] as const).map((tab) => {
                const active = activeTab === tab
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'flex-1 rounded-lg py-2 text-center text-xs font-semibold uppercase tracking-wider transition-all duration-200',
                      active
                        ? 'bg-ink2 text-cream shadow border border-white/5'
                        : 'text-stone hover:text-sand'
                    )}
                  >
                    {tab === 'strategy' ? 'Why it works' : tab === 'spec' ? 'Film & edit' : 'Post it'}
                  </button>
                )
              })}
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'strategy' && (
                <motion.div
                  key="strategy"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-6 shadow-glass backdrop-blur-md"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-stone" />
                      <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Why it works</h3>
                    </div>
                    <ul className="space-y-3">
                      {b.reference_read.why_it_works.map((w, i) => (
                        <li key={i} className="flex gap-2.5 text-xs text-sand leading-relaxed">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {w}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Retention Map Visual Timeline */}
                  <div className="border-t border-white/[0.04] pt-6 space-y-4">
                    <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Where people keep watching</h3>
                    <div className="relative pl-6 space-y-6">
                      {/* Vertical line connecting steps */}
                      <div className="absolute left-[9px] top-2 bottom-2 w-px border-l border-dashed border-white/10" />
                      {b.reference_read.retention_map.map((r, i) => (
                        <div key={i} className="relative group">
                          {/* Indicator dot */}
                          <span className="absolute left-[-23px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-ink bg-coral shadow-glow transition-transform duration-300 group-hover:scale-125" />
                          <div className="text-xs font-heading text-cream transition-colors duration-200 group-hover:text-coral">{r.beat}</div>
                          <div className="text-xs text-sand leading-relaxed mt-1">{r.goal}</div>
                          {r.tactic && (
                            <div className="mt-1 text-[10px] text-teal font-semibold uppercase tracking-wide">↳ {r.tactic}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'strategy' && (
                <div className="mt-6">
                  <CreativeTransfer generationId={gen.id} blueprint={b} referenceAnalysis={gen.reference_analysis} />
                </div>
              )}
              {activeTab === 'spec' && (
                <motion.div
                  key="spec"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-6 shadow-glass backdrop-blur-md"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-stone" />
                      <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Editing settings</h3>
                    </div>
                    <div className="grid gap-2.5 grid-cols-2">
                      <Spec label="Captions" value={cap.caption_style} />
                      <Spec label="Speed" value={cap.pacing} />
                      <Spec label="Highlights" value={cap.emphasis} />
                      <Spec label="Save" value={cap.export} />
                    </div>
                  </div>

                  {b.b_roll_stats && (
                    <div className="border-t border-white/[0.04] pt-6 space-y-3">
                      <h4 className="text-xs text-stone font-heading uppercase tracking-wider flex items-center gap-1.5">
                        <Video className="h-3.5 w-3.5" /> Extra clips
                      </h4>
                      <div className="grid gap-2.5 grid-cols-2">
                        <div className="bg-ink3/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                          <span className="text-[10px] text-stone font-heading uppercase tracking-wider">Extra clips in their video</span>
                          <span className="text-xl font-bold font-heading text-sand mt-1">{b.b_roll_stats.original_b_roll_count}</span>
                        </div>
                        <div className="bg-ink3/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                          <span className="text-[10px] text-stone font-heading uppercase tracking-wider">Extra clips to film yourself</span>
                          <span className="text-xl font-bold font-heading text-teal mt-1">{b.b_roll_stats.suggested_b_roll_count}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="border-t border-white/[0.04] pt-6 space-y-3">
                    <h4 className="text-xs text-stone font-heading uppercase tracking-wider">Editing Checklist</h4>
                    <div className="space-y-3">
                      {b.edit_checklist.map((c, i) => (
                        <div key={i} className="flex gap-2.5 text-xs text-sand leading-relaxed">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {c}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Production Sprint Timeline */}
                  <div className="border-t border-white/[0.04] pt-6 space-y-4">
                    <h4 className="text-xs text-stone font-heading uppercase tracking-wider">Filming schedule</h4>
                    <div className="relative pl-6 space-y-5">
                      <div className="absolute left-[9px] top-2 bottom-2 w-px border-l border-dashed border-white/10" />
                      {b.production_sprint.map((p, i) => (
                        <div key={i} className="relative group">
                          <span className="absolute left-[-23px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-ink bg-amber shadow-glow transition-transform duration-300 group-hover:scale-125" />
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-amber bg-amber/10 border border-amber/20 px-2 py-0.5 rounded-md uppercase tracking-wider">{p.minute}</span>
                            <span className="text-xs font-semibold text-cream leading-relaxed">{p.task}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'publish' && (
                <motion.div
                  key="publish"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-4 shadow-glass backdrop-blur-md"
                >
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-stone" />
                    <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Where to post</h3>
                  </div>
                  <p className="text-xs text-stone">Post it yourself — we open the app and copy your caption. Tap “Mark as posted” once it’s live to keep your library in sync.</p>
                  <div className="space-y-4">
                    {b.publish_plan.map((p, i) => (
                      <PublishRow key={i} generationId={gen.id} platform={p.platform} caption={p.caption} hashtags={p.hashtags} bestTime={p.best_time} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
          
        </div>

        {/* Mobile Tab-Based View (Single column) */}
        <div className="block lg:hidden space-y-6">
          {mobileTab === 'script' && (
            <div className="space-y-6">
              {/* Hook Selector */}
              <div className="rounded-card border border-white/5 bg-ink2/85 p-5 space-y-4 shadow-glass backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Quote className="h-4.5 w-4.5 text-amber" />
                  <span className="font-heading text-xs font-semibold text-cream tracking-wide uppercase">Pick your opening line</span>
                </div>
                <p className="text-xs text-stone">Pick an opening line — it updates your script below.</p>
                {/* ⚖️ FIVE OPTIONS THAT OPEN THE SAME WAY ARE NOT FIVE OPTIONS.
                    Reports the collision only — the opening may be exactly how
                    this creator talks, and Twin does not overrule that. */}
                {hookVarietyNote(b.hook_options) && (
                  <p className="text-xs text-amber/90">{hookVarietyNote(b.hook_options)}</p>
                )}
                {visualHook && (
                  <div className="mt-1 rounded-lg border border-white/5 bg-ink/40 p-3 space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber">Before you say a word</div>
                    <p className="text-xs text-cream">{visualHook.openingFrame}</p>
                    <p className="text-xs text-stone">{visualHook.whyItInterrupts}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3">
                  {b.hook_options.map((h, i) => {
                    const isChosen = h === chosenHook
                    return (
                      <button
                        key={i}
                        onClick={() => pickHook(h)}
                        className={cn(
                          'relative w-full text-left flex items-start gap-4 rounded-card p-5 text-sm sm:text-base font-medium transition-all duration-300 shadow-sm',
                          isChosen
                            ? 'bg-ink3 text-cream shadow-glow'
                            : 'bg-ink3/40 border border-white/5 text-sand hover:border-white/10 hover:bg-ink3/70'
                        )}
                      >
                        {isChosen && <div className="absolute inset-0 rounded-card gradient-border pointer-events-none" />}
                        <span className={cn('mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors', isChosen ? 'border-coral bg-coral text-ink' : 'border-white/20')}>
                          {isChosen && <Check className="h-3 w-3 text-ink stroke-[3]" />}
                        </span>
                        <div className="flex-1 min-w-0 leading-relaxed">
                          {i === 0 && <span className="mr-2 inline-block rounded-full bg-amber/10 border border-amber/20 px-2 py-0.5 text-[9px] font-bold text-amber uppercase tracking-widest">Recommended</span>}
                          <span className="italic font-semibold text-cream">“{h}”</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Script Teleprompter */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-2">
                    <FileText className="h-4 w-4 text-stone" /> Script teleprompter
                  </h2>
                  <span className="text-xs text-stone">{updatedScript.length} scenes</span>
                </div>
                <p className="text-xs text-stone/80">{lengthLine}</p>
              {referenceCompareLine && <p className="text-xs text-stone/80">{referenceCompareLine}</p>}
              {ceilingWarningLine && <p className="text-xs text-amber">{ceilingWarningLine}</p>}
                
                <UnfilledContainers generationId={gen.id} blueprint={b} hook={chosenHook} script={liveScript} />
              <CountPromise blueprint={b} />
                <ScriptEditor
                  onScriptChange={onScriptChange}
                  generationId={gen.id}
                  blueprint={b}
                  selectedHook={chosenHook}
                  hasTake={serverSourceAssetId != null}
                  beatAudit={gen.beat_audit}
                  fallback={<BlueprintScriptCards script={updatedScript} beatPlan={b.beat_plan} advisoryFindings={readAdvisoryFindings(b)} />}
                />
                {/* BELOW the editor on purpose: the slots come FROM the script,
                    so the thing that changes them sits above the thing that
                    fills them. */}
                <DeclaredClips generationId={gen.id} />
                {/* ⚠️ SAME SPOT AS THE DESKTOP COLUMN: after the last beat,
                    before the shot list — never mid-scene. Mirrors the
                    desktop CreatorQuestionCard/ProductCaptureCard placement
                    below; this tab was silently missing both. */}
                <CreatorQuestionCard />
                <ProductCaptureCard shown={readProductCapturePrompt(b)} voiceId={gen.brand_voice_id ?? null} />
              </div>

              {/* Shot List */}
              <div className="space-y-4">
                <h2 className="font-heading text-xs font-semibold tracking-wide uppercase text-stone flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-stone" /> Shots & extra clips
                </h2>
                <div className="grid grid-cols-1 gap-4">
                  {b.shot_list.map((s, i) => {
                    const isBroll = s.shot_type === 'b_roll'
                    const isTalkingHead = s.shot_type === 'talking_head'
                    const isReplicate = s.b_roll_type === 'replicate'

                    return (
                      <div
                        key={i}
                        className={cn(
                          "relative isolate overflow-hidden rounded-card border p-5 space-y-3.5 shadow-glass backdrop-blur-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between",
                          isReplicate
                            ? "border-amber/35 bg-amber/[0.08]"
                            : isBroll
                              ? "border-coral/25 bg-ink2/85"
                              : isTalkingHead
                                ? "border-teal/25 bg-ink2/85"
                                : "border-white/10 bg-ink2/85"
                        )}
                      >
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <span className="font-heading text-cream text-sm font-semibold block">{shotLabel(s.shot, s.shot_type, s.framing, i)}</span>
                            <span className="inline-block rounded bg-ink3 border border-white/10 px-2 py-0.5 text-[10px] text-sand font-mono leading-snug">
                              {s.framing}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {s.shot_type && (
                              <span className={cn(
                                "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border",
                                isBroll
                                  ? "border-coral/20 bg-coral/5 text-coral"
                                  : isTalkingHead
                                    ? "border-teal/20 bg-teal/5 text-teal"
                                    : "border-stone/20 bg-stone/5 text-stone"
                              )}>
                                {isBroll ? (
                                  <>
                                    <Video className="h-2.5 w-2.5" /> Extra clip
                                  </>
                                ) : isTalkingHead ? (
                                  <>
                                    <User className="h-2.5 w-2.5" /> You talking
                                  </>
                                ) : (
                                  <>
                                    <Quote className="h-2.5 w-2.5" /> Cover shot
                                  </>
                                )}
                              </span>
                            )}

                            {isBroll && s.b_roll_type && (
                              <span className={cn(
                                "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border",
                                isReplicate
                                  ? "border-amber/20 bg-amber/5 text-amber"
                                  : "border-stone/20 bg-stone/5 text-stone"
                              )}>
                                {isReplicate ? 'Copy theirs' : 'Stock clip'}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-stone leading-relaxed pt-1">{s.notes}</p>

                          {isBroll && s.b_roll_visual && (
                            <div className="bg-ink3/30 border border-white/5 rounded-lg p-2.5 mt-2">
                              <span className="text-[9px] font-bold text-cream uppercase tracking-wider block mb-0.5">On-screen text & graphics</span>
                              <span className="text-xs text-sand/85 leading-relaxed">{s.b_roll_visual}</span>
                            </div>
                          )}
                        </div>

                        {s.spoken_text && s.spoken_text.trim() !== '' && (
                          <div className="border-t border-white/[0.04] pt-3 mt-3">
                            <span className="text-[9px] font-bold text-stone uppercase tracking-wider block mb-1">What to say</span>
                            <p className="text-xs italic text-sand pl-2 border-l border-teal/30 leading-relaxed">
                              “{s.spoken_text}”
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {mobileTab === 'strategy' && (
            <div className="rounded-card border border-white/5 bg-ink2/85 p-5 space-y-6 shadow-glass backdrop-blur-md">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-stone" />
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Why it works</h3>
                </div>
                <ul className="space-y-2.5">
                  {b.reference_read.why_it_works.map((w, i) => (
                    <li key={i} className="flex gap-2 text-xs text-sand leading-relaxed">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" /> {w}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-white/5 pt-4 space-y-3">
                <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Where people keep watching</h3>
                <div className="relative pl-6 space-y-5">
                  <div className="absolute left-[9px] top-2 bottom-2 w-px border-l border-dashed border-white/10" />
                  {b.reference_read.retention_map.map((r, i) => (
                    <div key={i} className="relative group">
                      <span className="absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 border-ink bg-coral shadow-glow" />
                      <div className="text-xs font-heading text-cream">{r.beat}</div>
                      <div className="text-xs text-sand leading-relaxed mt-0.5">{r.goal}</div>
                      {r.tactic && (
                        <div className="mt-1 text-[10px] text-teal font-semibold uppercase tracking-wide">↳ {r.tactic}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {mobileTab === 'strategy' && (
            <div className="mt-6">
              <CreativeTransfer generationId={gen.id} blueprint={b} referenceAnalysis={gen.reference_analysis} />
            </div>
          )}

          {mobileTab === 'spec' && (
            <div className="rounded-card border border-white/5 bg-ink2/85 p-5 space-y-6 shadow-glass backdrop-blur-md">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-stone" />
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Editing settings</h3>
                </div>
                <div className="grid gap-2.5 grid-cols-2">
                  <Spec label="Captions" value={cap.caption_style} />
                  <Spec label="Speed" value={cap.pacing} />
                  <Spec label="Highlights" value={cap.emphasis} />
                  <Spec label="Save" value={cap.export} />
                </div>
              </div>
              
              <div className="border-t border-white/5 pt-4 space-y-2.5">
                <h4 className="text-xs text-stone font-heading uppercase tracking-wider">Editing Checklist</h4>
                <div className="space-y-3">
                  {b.edit_checklist.map((c, i) => (
                    <div key={i} className="flex gap-2 text-xs text-sand leading-relaxed">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" /> {c}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/5 pt-4 space-y-3">
                <h4 className="text-xs text-stone font-heading uppercase tracking-wider">Filming schedule</h4>
                <div className="relative pl-6 space-y-5">
                  <div className="absolute left-[9px] top-2 bottom-2 w-px border-l border-dashed border-white/10" />
                  {b.production_sprint.map((p, i) => (
                    <div key={i} className="relative group">
                      <span className="absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 border-ink bg-amber shadow-glow" />
                      <div className="flex items-center gap-2">
                        <span className="chip shrink-0 font-mono text-[10px] py-0.5 px-2 bg-ink3 border-white/10">{p.minute}</span>
                        <span className="text-xs font-semibold text-cream leading-relaxed">{p.task}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mobileTab === 'publish' && (
            <div className="space-y-6">
              {/* Publishing Plan Card */}
              <div className="rounded-card border border-white/5 bg-ink2/85 p-5 space-y-4 shadow-glass backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-stone" />
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-cream">Where to post</h3>
                </div>
                <p className="text-xs text-stone">Post it yourself — we open the app and copy your caption. Tap “Mark as posted” once it’s live to keep your library in sync.</p>
                <div className="space-y-4">
                  {b.publish_plan.map((p, i) => (
                    <PublishRow key={i} generationId={gen.id} platform={p.platform} caption={p.caption} hashtags={p.hashtags} bestTime={p.best_time} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

    </main>
  )
}

// Each platform's own published caption limit. A FACT about the platform, not a
// recommendation about the caption — so it is stated and never turned into
// advice about what length performs, which is a claim nobody here can back
// (§7c's honesty line, applied to the caption box).
//
// A platform not in this map shows nothing rather than a guessed number: a wrong
// limit is worse than no limit, because it would have the creator trimming a
// caption that fits.
const CAPTION_LIMIT: Record<string, number> = {
  instagram: 2200,
  tiktok: 2200,
  youtube: 5000,
  shorts: 5000,
  reels: 2200,
  linkedin: 3000,
  x: 280,
  twitter: 280,
}

function CaptionLength({ platform, length }: { platform: string; length: number }) {
  const limit = CAPTION_LIMIT[platform.toLowerCase()]
  if (limit === undefined) return null
  const over = length > limit
  return (
    <p className={cn('mt-1.5 text-[11px]', over ? 'text-amber' : 'text-stone')}>
      {length.toLocaleString()} / {limit.toLocaleString()} characters
      {over && ' — the end will be cut off on this platform.'}
    </p>
  )
}

// Per-platform publish row: copy the caption and hashtags separately, then log
// when you post it.
function PublishRow({
  generationId,
  platform,
  caption,
  hashtags,
  bestTime,
}: {
  generationId: string
  platform: string
  caption: string
  hashtags: string[]
  bestTime: string
}) {
  const full = `${caption}\n\n${hashtags.join(' ')}`.trim()
  const [copied, setCopied] = useState<'all' | 'caption' | 'tags' | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  const [posted, setPosted] = useState(false)
  const [postErr, setPostErr] = useState(false)
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduled, setScheduled] = useState(false)

  // WHAT was copied, so two buttons can report separately. `null` = nothing
  // copied just now; a shared boolean would tick both buttons at once and tell
  // the creator their hashtags are on the clipboard when the caption is.
  const copy = async (text: string, which: 'all' | 'caption' | 'tags' = 'all') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which); setCopyFailed(false)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // Clipboard is commonly blocked (incognito / Safari / permissions off).
      // Never fail silently — tell the user to copy manually.
      setCopyFailed(true)
      setTimeout(() => setCopyFailed(false), 4000)
    }
  }
  const logPosted = async () => {
    setBusy(true); setPostErr(false)
    try {
      await markPosted({ generationId, platform, caption })
      setPosted(true)
      void logEvent('post_logged', { platform, generation_id: generationId })
    } catch {
      setPostErr(true)
    } finally {
      setBusy(false)
    }
  }

  const uploadUrl = UPLOAD_URLS[platform.toLowerCase()]
  // One tap: open the platform's uploader AND copy the caption. Open first, inside
  // the click gesture, so the popup isn't blocked after the async clipboard write.
  const copyAndOpen = () => {
    if (uploadUrl) window.open(uploadUrl, '_blank', 'noopener,noreferrer')
    setOpened(true)
    void copy(full, 'all')
  }

  return (
    <div className="rounded-card border border-white/8 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="text-sm font-heading capitalize text-teal">{platform}</div>
        <span className="text-xs text-stone">best time: {bestTime}</span>
      </div>
      <div className="mt-1 text-cream">{caption}</div>
      <div className="mt-1 text-xs text-stone">{hashtags.join(' ')}</div>
      {/* The platform's own published limit, and the length of what is about to
          be pasted into it. A CHECKABLE fact about this caption, not a rating of
          it — over the limit means the end gets cut off, which is worth knowing
          before rather than after posting. */}
      <CaptionLength platform={platform} length={full.length} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {uploadUrl && (
          <button onClick={copyAndOpen} className="btn-gradient py-2 text-sm capitalize">
            <ExternalLink className="h-4 w-4" /> Open {platform} &amp; copy
          </button>
        )}
        {/* Two buttons, because the platforms take two fields: Instagram
            creators routinely put tags in the first comment, and a combined
            copy makes them hand-delete the tags every time. */}
        <button onClick={() => copy(caption, 'caption')} className="chip">
          {copied === 'caption'
            ? <><Check className="h-3.5 w-3.5 text-teal" /> Copied</>
            : <><Copy className="h-3.5 w-3.5" /> Copy caption</>}
        </button>
        {hashtags.length > 0 && (
          <button onClick={() => copy(hashtags.join(' '), 'tags')} className="chip">
            {copied === 'tags'
              ? <><Check className="h-3.5 w-3.5 text-teal" /> Copied</>
              : <><Copy className="h-3.5 w-3.5" /> Copy hashtags</>}
          </button>
        )}
        {/* `best time` was dead text until now: a suggestion with nothing to
            act on, beside a button that only worked after the fact. */}
        <button onClick={() => setScheduling(true)} className={cn('chip', scheduled && 'border-teal/50 text-teal')}>
          {scheduled
            ? <><Check className="h-3.5 w-3.5" /> Scheduled</>
            : <><CalendarClock className="h-3.5 w-3.5" /> Schedule</>}
        </button>
        <button onClick={logPosted} disabled={busy || posted} className={cn('chip', posted && 'border-teal/50 text-teal')}>
          {posted ? <><Check className="h-3.5 w-3.5" /> Posted</> : busy ? 'Saving…' : <><Send className="h-3.5 w-3.5" /> Mark as posted</>}
        </button>
      </div>
      {copyFailed && (
        <p className="mt-2 text-[11px] text-coral">Couldn’t copy automatically — select the caption above and copy it manually.</p>
      )}
      {postErr && (
        <p className="mt-2 text-[11px] text-coral">Couldn’t log that post — tap “Mark as posted” to try again.</p>
      )}
      {/* Guide them back: opening the uploader is a dead-end without this. */}
      {opened && !posted && (
        <p className="mt-2 text-[11px] text-amber">Posted it on {platform}? Hit “Mark as posted” so your streak and library stay in sync.</p>
      )}
      {scheduling && (
        <SchedulePostDialog
          generationId={generationId}
          platform={platform}
          caption={full}
          bestTime={bestTime}
          onClose={() => setScheduling(false)}
          onScheduled={() => {
            setScheduling(false); setScheduled(true)
            void logEvent('post_scheduled', { platform, generation_id: generationId })
          }}
        />
      )}
      {scheduled && (
        <p className="mt-2 text-[11px] text-teal">
          On your calendar. <Link to="/calendar" className="font-semibold underline-offset-2 hover:underline">See it →</Link>
        </p>
      )}
      {/* Close the loop — the highest-intent moment to start the next video. */}
      {posted && (
        <p className="mt-2 text-[11px] text-teal">
          Logged. <Link to="/gallery" className="font-semibold underline-offset-2 hover:underline">Remix your next one →</Link>
        </p>
      )}
      {uploadUrl && (
        <p className="mt-2 text-[11px] text-stone">
          We copy your caption to the clipboard and open the {platform} uploader — paste it there, post, then mark it here.
        </p>
      )}
    </div>
  )
}

// The model's script beats, read-only — the FALLBACK for when the recording
// script cannot be produced (an unreadable timeline, a malformed blueprint).
//
// It is the fallback rather than the main view because these are NOT the lines
// that get filmed: `buildRecordingScript` drops hook-lookalikes, moves the CTA
// beat to the end and inserts silent b-roll scenes, so `script[i]` and the
// teleprompter's scene i are different lines. Editing here would edit something
// nobody records — so this shows what the model wrote and offers no edit, and
// `ScriptEditor` owns the version that can be changed.
/**
 * The advisory findings stored on a blueprint, or none.
 *
 * ⚠️ READ, NOT CAST. `b.advisory` arrives from the database as JSON that a model
 * produced and an edge function stored; a cast would make TypeScript agree it is
 * the right shape without anything having checked. `readVerdict` already did the
 * checking server-side, so this only confirms the array survived the round trip.
 */
function readAdvisoryFindings(bp: unknown): readonly AdvisoryFinding[] {
  const f = (bp as { advisory?: { findings?: unknown } })?.advisory?.findings
  if (!Array.isArray(f)) return []
  return f.filter((x): x is AdvisoryFinding =>
    !!x && typeof (x as AdvisoryFinding).beat === 'number'
    && typeof (x as AdvisoryFinding).what === 'string')
}

function BlueprintScriptCards(
  { script, beatPlan, advisoryFindings = [] }:
  { script: Blueprint['script']; beatPlan?: unknown; advisoryFindings?: readonly AdvisoryFinding[] },
) {
  // ⚖️ VOICE CAUSE 2 — A WHOLE-SCRIPT COUNT, RENDERED ONCE. Unlike
  // stockPhraseNote (per line), a repeated triadic-list cadence is a
  // property of the SCRIPT, not any one beat — computed here once across
  // every spoken line, never per-card.
  const triadNote = parallelTriadNote(
    script.flatMap((s) => (isSilentBeat(s.line) ? [] : parallelTriadsIn(s.line))))
  // ⚖️ VOICE CAUSE 2 (PART 2) — SAME WHOLE-SCRIPT SHAPE AS triadNote, a
  // second and independent structural-cadence check.
  const uniformityNote = sentenceUniformityNote(
    script.flatMap((s) => (isSilentBeat(s.line) ? [] : [s.line ?? ''])))
  // ⚖️ WAVE 3 — THE FIVE CRAFT CONTRACTS, computed over the WHOLE script for
  // the same reason the two above are: each asks about a relationship between
  // beats (does the ending add to the opening, do the beats depend on each
  // other), which no per-card check can see. Advisory like every note here.
  const craftNotes = craftContractNotes(script)
  return (
    <div className="space-y-6">
      {triadNote && (
        <p className="text-xs text-amber/90">{triadNote}</p>
      )}
      {uniformityNote && (
        <p className="text-xs text-amber/90">{uniformityNote}</p>
      )}
      {craftNotes.map((n) => (
        <p key={n} className="text-xs text-amber/90">{n}</p>
      ))}
      {script.map((s, i) => {
        const isHook = s.section?.toLowerCase().includes('hook')
        const isRehook = s.section?.toLowerCase().includes('re-hook') || s.section?.toLowerCase().includes('rehook')
        const isCta = s.section?.toLowerCase().includes('cta')
        const tagColor = isHook ? 'border-amber/20 bg-amber/5 text-amber'
                       : isRehook ? 'border-coral/20 bg-coral/5 text-coral'
                       : isCta ? 'border-teal/20 bg-teal/5 text-teal'
                       : 'border-white/5 bg-ink2/40 text-sand'
        return (
          <div key={i} className="rounded-card border border-white/5 bg-ink2/85 p-6 space-y-5 shadow-glass backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
              <span className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide', tagColor)}>
                {plainSection(s.section, i)}
              </span>
              <span className="text-[11px] font-medium text-stone">Scene {i + 1}</span>
            </div>
            {/* ⚖️ WHAT THE CREATOR DOES IN FRONT OF THE CAMERA. Withheld
                entirely when the writer's note asks for footage this product
                does not make — a b-roll or screen-recording request is a good
                idea that is out of scope, not an instruction to hand over. */}
            {shootingNoteAt(beatPlan, i) && (
              <p className="text-xs text-sand/80">{shootingNoteAt(beatPlan, i)}</p>
            )}
            {/* ⚖️ FOUR OUTCOMES, AND EACH ONE WAS A SEPARATE DEFECT.
                SILENCE is shown as silence, in plain English and without quote
                marks — "[No spoken audio]" is a note to the writer, not a line
                anybody reads out.
                AN EMPTY LINE prints nothing: this rendered unconditionally, so
                a beat with no line showed as “”, and before that it showed the
                refusal itself as dialogue, which is how "Only you can supply
                this" reached a real teleprompter.
                OTHERWISE the spoken line, quoted.
                AND THE ASK, when only the creator can supply what goes here.

                ⚖️ READ-ONLY ON PURPOSE. This view is the FALLBACK for when the
                recording script cannot be produced, and its own contract is that
                it offers no edit — `script[i]` is not the line that gets filmed.
                So the question is SHOWN here and answered where the creator
                actually works. Putting an input here would edit something nobody
                records. */}
            {isSilentBeat(s.line)
              ? <p className="font-display text-lg leading-relaxed text-stone">No one speaks here.</p>
              : s.line && s.line.trim() !== '' && (
                <p className="font-display text-lg leading-relaxed text-cream">“{s.line}”</p>
              )}
            {/* ⚖️ A NOTE, NEVER A VERDICT. Names the words that are doing no
                work and says what to do instead — it does not block, score or
                rewrite, and the decision stays the creator's. ⚠️ NEVER ON A
                SILENT BEAT: there are no spoken words there to swap. */}
            {!isSilentBeat(s.line) && stockPhraseNote(stockPhrasesIn(s.line)) && (
              <p className="text-xs text-amber/90">{stockPhraseNote(stockPhrasesIn(s.line))}</p>
            )}
            {/* ⚖️ THE SAME VOICE, ONE STEP FURTHER OUT. `stockPhraseNote` above is
                computed from this line alone; this one comes from a model that read
                the WHOLE script, so it is the only note that can say a beat echoes
                an earlier one. Also a note and never a verdict: no grade, no count,
                and the decision stays the creator's.
                ⚠️ NEVER ON A SILENT BEAT, for the same reason as the note above —
                there are no spoken words there to double. */}
            {!isSilentBeat(s.line) && advisoryNote(advisoryFindings, i) && (
              <p className="text-xs text-amber/90">{advisoryNote(advisoryFindings, i)}</p>
            )}
            {s.ask && s.ask.trim() !== '' && (
              <div className="rounded-2xl border border-amber/25 bg-amber/[0.06] p-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-amber mb-1">
                  Only you know this one
                </span>
                <p className="font-display text-base leading-relaxed text-cream">{s.ask}</p>
              </div>
            )}
            <div className="space-y-3.5 rounded-2xl border border-white/[0.04] bg-ink/40 p-4">
              <div className="flex items-start gap-3">
                <Video className="h-4 w-4 text-amber shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="mb-0.5 block text-[11px] font-medium text-stone">Where to film</span>
                  <span className="text-sm leading-relaxed text-sand">{s.background || 'Visual context matching scene.'}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-coral shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="mb-0.5 block text-[11px] font-medium text-stone">How to stand &amp; move</span>
                  <span className="text-sm leading-relaxed text-sand">{s.action_posing || s.direction || 'Camera-facing presence.'}</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <SlidersHorizontal className="h-4 w-4 text-teal shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="mb-0.5 block text-[11px] font-medium text-stone">Camera moves &amp; cuts</span>
                  <span className="text-sm leading-relaxed text-sand">{s.cuts_info || 'Cut pacing instructions.'}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Translate the AI's script-section names (Hook / Setup / Re-hook / CTA) into plain
// words a first-timer reads once and gets. Unknown sections pass through.
function plainSection(section: string | undefined, i: number): string {
  const s = (section ?? '').toLowerCase()
  if (s.includes('re-hook') || s.includes('rehook')) return 'Grab them again'
  if (s.includes('hook')) return 'Opening line'
  if (s.includes('cta') || s.includes('call to action')) return 'Ask them to act'
  if (s.includes('setup')) return 'Set it up'
  if (s.includes('body') || s.includes('middle')) return 'Main point'
  if (s.includes('outro') || s.includes('close') || s.includes('end')) return 'Wrap up'
  return section || `Part ${i + 1}`
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-white/8 bg-white/[0.02] p-3.5">
      <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
      <div className="mt-1 text-sm text-cream">{value || '·'}</div>
    </div>
  )
}

// Agency → client approval. Mints (idempotently) a login-free /review/:token link
// the client opens to watch the finished reel and Approve / Request changes; the
// decision flows back into review_status (and the internal `approved` flag).
function ClientApprovalCard({ gen }: { gen: Generation }) {
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const status = gen.review_status ?? 'none'

  const make = async () => {
    setBusy(true)
    const url = await createReviewLink(gen.id)
    setBusy(false)
    if (!url) return
    setLink(url)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard blocked — link is shown to copy manually */ }
  }

  const badge =
    status === 'approved' ? { cls: 'border-teal/40 bg-teal/10 text-teal', icon: BadgeCheck, label: 'Client approved' }
    : status === 'changes' ? { cls: 'border-amber/40 bg-amber/10 text-amber', icon: MessageSquare, label: 'Changes requested' }
    : status === 'pending' ? { cls: 'border-white/15 bg-white/5 text-sand', icon: Loader2, label: 'Waiting on your client' }
    : null

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 font-heading text-cream">
          <Users className="h-4 w-4 text-amber" /> Client approval
        </p>
        {badge && (
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', badge.cls)}>
            <badge.icon className="h-3.5 w-3.5" /> {badge.label}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-stone">
        Send your client a private link to watch this video and sign off — no account needed. Their decision shows up right here.
      </p>

      {status === 'changes' && gen.review_note && (
        <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-sm text-sand">“{gen.review_note}”</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={make} className="btn-ghost py-2 text-sm" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {link ? 'Copy approval link' : status === 'none' ? 'Create approval link' : 'Copy approval link'}
        </button>
        {copied && <span className="inline-flex items-center gap-1 text-xs text-teal"><Check className="h-3.5 w-3.5" /> Copied to clipboard</span>}
      </div>
      {link && (
        <p className="mt-2 break-all rounded-lg border border-white/8 bg-ink/40 px-3 py-2 text-xs text-stone">{link}</p>
      )}
    </div>
  )
}


