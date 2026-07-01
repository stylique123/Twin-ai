import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'
import { useVideoPlayer, VideoView } from 'expo-video'
import {
  autoEditTake,
  buildTimeline,
  estimateDurationSec,
  getGeneration,
  pollEditJob,
  loadTimeline,
  sceneTimeCapSec,
  teleprompterScenes,
  WPM_LABEL,
  WPM_PRESETS,
  type Scene,
  type SceneTimeline,
  type WpmPreset,
} from '@twinai/shared'
import { Body, Button, Screen } from '../../src/components/ui'
import { colors, radius } from '../../src/theme'

type Phase = 'idle' | 'countdown' | 'recording' | 'between' | 'review' | 'uploading' | 'editing' | 'done' | 'error'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function sceneLabel(t?: Scene['scene_type']) {
  switch (t) {
    case 'talking_head': return 'Talking'
    case 'cta': return 'Final action'
    case 'product_demo': return 'Show the product'
    case 'screen_recording': return 'Screen recording'
    default: return 'Scene'
  }
}

export default function Record() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [camPerm, requestCam] = useCameraPermissions()
  const [micPerm, requestMic] = useMicrophonePermissions()
  const cameraRef = useRef<CameraView>(null)
  const recordingPromise = useRef<Promise<{ uri: string }> | undefined>(undefined)

  // Scene Timeline (loaded or synthesized from the blueprint)
  const [timeline, setTimeline] = useState<SceneTimeline | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [i, setI] = useState(0)
  const [wpm, setWpm] = useState<WpmPreset>('natural')
  const [mirror, setMirror] = useState(false)

  // Boundaries: continuous recording, marked by cumulative wall-clock seconds.
  const startTs = useRef(0)
  const boundsRef = useRef<number[]>([])
  const linesRef = useRef<string[]>([])
  // Per-scene keep-windows [{start,end,line}] in recording seconds. Each accepted
  // scene appends one window; Retake pops the last window and re-reads from now, so
  // the flubbed footage falls into the dropped gap between windows. The worker
  // trims+concats these (dropping flubs + between-scene dead air) and captions each.
  const segmentsRef = useRef<{ start: number; end: number; line: string }[]>([])
  const sceneStartRef = useRef(0) // current scene's window start (recording seconds)
  const liveRef = useRef(false)   // true ONLY while a scene is actively recording (race guard)
  const nextSceneRef = useRef<() => void>(() => {}) // latest nextScene, callable from the cap timer
  const nowSec = () => Math.round(((Date.now() - startTs.current) / 1000) * 1000) / 1000

  const [cameraReady, setCameraReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [count, setCount] = useState(3)
  const [status, setStatus] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [reviewUri, setReviewUri] = useState<string | null>(null) // raw take shown for review before editing
  const [err, setErr] = useState<string | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const lastUri = useRef<string | null>(null)   // recorded take, kept so a failed upload can retry without re-recording
  const lastJobId = useRef<string | null>(null)  // once enqueued, retry resumes polling this job (never re-charges)

  // Finished-video player (expo-video). Created once at top level (hook rules);
  // the source is set when the render completes.
  const player = useVideoPlayer(null, (p) => { p.loop = false })
  useEffect(() => {
    // Review plays the RAW take; done plays the finished edit. One player, two sources.
    const src = phase === 'review' ? reviewUri : phase === 'done' ? videoUrl : null
    if (src) { player.loop = phase === 'review'; player.replace(src); player.play() }
  }, [phase, reviewUri, videoUrl, player])

  // Safety: if the screen unmounts while still recording (the creator navigates
  // away mid-take), stop the camera so it never keeps recording in the background.
  useEffect(() => {
    return () => { try { cameraRef.current?.stopRecording() } catch { /* already stopped */ } }
  }, [])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      let tl = await loadTimeline(id)
      if (!tl) {
        // Mobile generations (made via V1 generateBlueprint) have no persisted
        // scene_timeline — synthesize one in-memory from the blueprint.
        const g = await getGeneration(id)
        if (g) tl = buildTimeline({ generationId: id, blueprint: g.blueprint, selectedHook: g.selected_hook })
      }
      if (tl) { setTimeline(tl); setScenes(teleprompterScenes(tl)); setWpm(tl.wpm) }
    })()
  }, [id])

  const ready = camPerm?.granted && micPerm?.granted
  const scene = scenes[i]
  const last = i >= scenes.length - 1
  const next = scenes[i + 1]

  const start = async () => {
    try {
      setErr(null); setPhase('countdown')
      for (let c = 3; c >= 1; c--) { setCount(c); await sleep(800) }
      if (!cameraRef.current) throw new Error('Camera not ready — try again')
      startTs.current = Date.now()
      sceneStartRef.current = 0 // scene 1's window opens at recording start
      recordingPromise.current = cameraRef.current.recordAsync() as Promise<{ uri: string }>
      liveRef.current = true
      setPhase('recording')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start recording'); setPhase('error')
    }
  }

  // Close the current scene: append its kept window [start,end] + line, and a
  // cumulative cut point (back-compat for the bounds path).
  const closeScene = () => {
    const end = nowSec()
    const line = (scene?.dialogue || scene?.caption_text || '').trim()
    segmentsRef.current.push({ start: sceneStartRef.current, end, line })
    boundsRef.current.push(end)
    linesRef.current.push(line)
  }

  // Close the current scene. The liveRef guard makes a manual Stop + the cap timer
  // firing together safe (only the first one advances).
  const nextScene = () => {
    if (!liveRef.current) return
    liveRef.current = false
    closeScene()
    if (last) { void finish(); return }
    setPhase('between')
  }
  // keep the cap timer pointing at the latest closure
  useEffect(() => { nextSceneRef.current = nextScene })

  // Auto-stop the scene when it hits its time cap (shared with web — @twinai/shared)
  // so a read can never run forever.
  useEffect(() => {
    if (phase !== 'recording') return
    const limit = sceneTimeCapSec(Math.round(estimateDurationSec(scene?.dialogue ?? null, wpm)))
    const h = setTimeout(() => nextSceneRef.current(), limit * 1000)
    return () => clearTimeout(h)
  }, [phase, i, scene, wpm])

  // Advance to the next scene — its window opens now, so the time spent reading
  // this card is dropped (it's outside every kept window).
  const continueNext = () => { sceneStartRef.current = nowSec(); liveRef.current = true; setI((v) => v + 1); setPhase('recording') }

  // Retake this scene: discard the read we just closed and re-open the scene from
  // now. The flubbed take + card time fall into the dropped gap before the new window.
  const retakeScene = () => {
    segmentsRef.current.pop()
    boundsRef.current.pop()
    linesRef.current.pop()
    sceneStartRef.current = nowSec()
    liveRef.current = true
    setPhase('recording')
  }

  // Last scene done → stop the camera and show the RAW take for review. We don't
  // auto-upload/edit; the creator sees their clip first and picks what to do next.
  const finish = async () => {
    if (!id) return
    try {
      cameraRef.current?.stopRecording()
      const video = await recordingPromise.current
      if (!video?.uri) throw new Error('No recording captured')
      lastUri.current = video.uri
      setReviewUri(video.uri)
      setPhase('review')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong'); setPhase('error')
    }
  }

  // Review action: hand the raw take to the auto-editor (the edit starts only now).
  const startAiEdit = () => { if (lastUri.current) void runUpload(lastUri.current) }

  // Review action: discard the take and re-record from scene 1.
  const reRecord = () => {
    boundsRef.current = []
    linesRef.current = []
    segmentsRef.current = []
    sceneStartRef.current = 0
    lastUri.current = null
    lastJobId.current = null
    setReviewUri(null)
    setErr(null)
    setI(0)
    setPhase('idle')
  }

  // Upload the recorded take + run the auto-edit. Separated so a flaky-network
  // failure can be RETRIED without re-recording. Once the job is enqueued we cache
  // its id, so a retry after a polling timeout resumes that job instead of
  // enqueueing again (which would charge a second remix).
  const runUpload = async (uri: string) => {
    if (!id) return
    try {
      setErr(null)
      let jobId = lastJobId.current
      if (!jobId) {
        setPhase('uploading'); setUploadPct(0); setStatus('Uploading your take…')
        const bounds = boundsRef.current
        const total = bounds.length
        const lines = linesRef.current
        const segments = segmentsRef.current.filter((s) => s.end > s.start)
        // Per-scene keep-windows + spoken line → the worker trims+concats the kept
        // windows (dropping flubs/dead air) and captions each per scene (Scene
        // Timeline contract). bounds/total/lines kept for back-compat. Single-scene
        // (<2 windows) → no shots, the worker transcribes normally.
        const shots = total > 1
          ? { bounds, total, lines, ...(segments.length > 1 ? { segments } : {}) }
          : undefined
        const r = await autoEditTake(id, { uri, contentType: 'video/mp4' }, shots, undefined, (f) => setUploadPct(f < 0 ? null : f))
        jobId = r.jobId
        lastJobId.current = jobId
      }

      setUploadPct(null); setPhase('editing'); setStatus('Auto-editing — captions, cuts, vertical…')
      // The worker's own hard timeout is 35 min (maxJobMs) — a first edit runs
      // whisper + the Gemini director + b-roll fetch + an up-to-8-min Revideo
      // premium pass, which can exceed a short client cap. Poll for ~35 min so a
      // real, still-in-progress render isn't mistaken for a failure. Safe either
      // way: lastJobId stays set on a timeout, so Retry resumes THIS job rather
      // than re-uploading/re-charging.
      const job = await pollEditJob(jobId, (label) => { if (label) setStatus(label) }, { attempts: 700, intervalMs: 3000 })
      if (!job) throw new Error('This is taking longer than usual. Your video may still be processing — check your Library, or tap Retry to keep waiting.')
      if (job.status === 'failed') { lastJobId.current = null; throw new Error(job.error || 'The edit failed') }
      setVideoUrl(job.result?.output_url ?? null); setStatus(null); setPhase('done')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong'); setPhase('error')
    }
  }

  const retry = () => { if (lastUri.current) void runUpload(lastUri.current) }

  if (!camPerm || !micPerm) return <Screen><Body muted>Checking camera…</Body></Screen>
  if (!ready) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Record' }} />
        <Body>TwinAI needs camera + microphone access to record your take.</Body>
        <View style={{ height: 12 }} />
        <Button label="Allow camera" onPress={requestCam} />
        <Button variant="ghost" label="Allow microphone" onPress={requestMic} />
      </Screen>
    )
  }

  if (phase === 'done') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Your video' }} />
        <Body>Done — here's your finished, captioned vertical.</Body>
        {videoUrl ? (
          <VideoView
            player={player}
            style={{ width: '100%', aspectRatio: 9 / 16, borderRadius: radius.card, backgroundColor: '#000' }}
            contentFit="contain"
            nativeControls
            allowsFullscreen
          />
        ) : (
          <Body muted>Rendered — find it in your Library.</Body>
        )}
      </Screen>
    )
  }

  if (phase === 'review') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Your take' }} />
        <Body>Happy with it? Send it to the AI editor for captions, cuts &amp; b-roll — or re-record.</Body>
        {reviewUri ? (
          <VideoView
            player={player}
            style={{ width: '100%', aspectRatio: 9 / 16, borderRadius: radius.card, backgroundColor: '#000' }}
            contentFit="contain"
            nativeControls
            allowsFullscreen
          />
        ) : null}
        <View style={{ height: 12 }} />
        <Button label="✨ AI edit — captions, cuts & b-roll" onPress={startAiEdit} />
        <Button variant="ghost" label="Re-record" onPress={reRecord} />
      </Screen>
    )
  }

  if (!timeline || !scene) return <Screen><Body muted>Loading your scenes…</Body></Screen>

  const recording = phase === 'recording'
  const processing = phase === 'uploading' || phase === 'editing'
  const between = phase === 'between'

  return (
    <View style={styles.full}>
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" mode="video" onCameraReady={() => setCameraReady(true)} />

      {/* Top: scene counter + WPM/mirror (hidden while processing) */}
      {!processing ? (
        <View style={styles.top}>
          <Text style={styles.counter}>Scene {i + 1} of {scenes.length} · {sceneLabel(scene.scene_type)}</Text>
          <View style={styles.chips}>
            {(Object.keys(WPM_PRESETS) as WpmPreset[]).map((p) => (
              <Pressable key={p} onPress={() => setWpm(p)} style={[styles.miniChip, { borderColor: wpm === p ? colors.teal : 'rgba(255,255,255,0.25)' }]}>
                <Text style={{ color: wpm === p ? colors.teal : '#fff', fontSize: 12, fontWeight: '600' }}>{WPM_LABEL[p]}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setMirror((m) => !m)} style={[styles.miniChip, { borderColor: mirror ? colors.teal : 'rgba(255,255,255,0.25)' }]}>
              <Text style={{ color: mirror ? colors.teal : '#fff', fontSize: 12, fontWeight: '600' }}>Mirror</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Center: current scene line, or the between-scene beat */}
      <View style={styles.center} pointerEvents="none">
        {between ? (
          <View style={styles.card}>
            <Text style={styles.complete}>Scene {i + 1} complete ✓</Text>
            <Text style={styles.cardTitle}>
              Next · Scene {i + 2} of {scenes.length} — {sceneLabel(next?.scene_type)}
            </Text>
            <Text style={styles.nextSecs}>about {Math.round(estimateDurationSec(next?.dialogue ?? null, wpm))}s</Text>
            {next?.camera_framing ? (
              <Text style={styles.cardRow}><Text style={styles.cardKey}>Positioning  </Text>{next.camera_framing}</Text>
            ) : null}
            {next?.background ? (
              <Text style={styles.cardRow}><Text style={styles.cardKey}>Background  </Text>{next.background}</Text>
            ) : null}
            {next?.purpose ? (
              <Text style={styles.cardRow}><Text style={styles.cardKey}>This scene  </Text>{next.purpose}</Text>
            ) : null}
            {next?.movement ? (
              <Text style={styles.cardRow}><Text style={styles.cardKey}>Movement  </Text>{next.movement}</Text>
            ) : null}
            <Text style={styles.retakeHint}>Flubbed it? Retake re-reads the scene you just finished.</Text>
          </View>
        ) : (
          <View style={{ transform: [{ scaleX: mirror ? -1 : 1 }] }}>
            <Text style={[styles.line, scene.scene_type === 'cta' && { color: colors.teal }]}>{scene.dialogue}</Text>
            <Text style={styles.framing}>{scene.camera_framing} · {WPM_LABEL[wpm]} {WPM_PRESETS[wpm]} WPM</Text>
          </View>
        )}
      </View>

      {phase === 'countdown' ? (
        <View style={styles.countWrap} pointerEvents="none"><Text style={styles.count}>{count}</Text></View>
      ) : null}

      <View style={styles.controls}>
        {status ? (
          <Text style={styles.status}>
            {status}{phase === 'uploading' && uploadPct !== null ? ` ${Math.round(uploadPct * 100)}%` : ''}
          </Text>
        ) : null}
        {err ? <Text style={[styles.status, { color: colors.coral }]}>{`⚠ ${err}`}</Text> : null}

        {between ? (
          <View style={styles.row}>
            <Pressable style={[styles.cta, styles.ctaHalf, styles.ctaGhost]} onPress={retakeScene}>
              <Text style={[styles.ctaText, { color: '#fff' }]}>Retake scene</Text>
            </Pressable>
            <Pressable style={[styles.cta, styles.ctaHalf]} onPress={continueNext}>
              <Text style={styles.ctaText}>Next scene</Text>
            </Pressable>
          </View>
        ) : phase === 'error' ? (
          lastUri.current ? (
            <Pressable style={styles.cta} onPress={retry}><Text style={styles.ctaText}>Retry</Text></Pressable>
          ) : (
            <Pressable style={[styles.cta, !cameraReady && { opacity: 0.4 }]} disabled={!cameraReady} onPress={start}>
              <Text style={styles.ctaText}>Record this scene</Text>
            </Pressable>
          )
        ) : phase === 'idle' ? (
          <Pressable style={[styles.cta, !cameraReady && { opacity: 0.4 }]} disabled={!cameraReady} onPress={start}>
            <Text style={styles.ctaText}>Record this scene</Text>
          </Pressable>
        ) : recording ? (
          <Pressable style={[styles.cta, styles.ctaRec]} onPress={nextScene}>
            <Text style={styles.ctaText}>{last ? 'Stop & finish' : 'Stop & next scene'}</Text>
          </Pressable>
        ) : (
          <View style={[styles.cta, { opacity: 0.5 }]}><Text style={styles.ctaText}>…</Text></View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 56, left: 12, right: 12, gap: 8, alignItems: 'center' },
  counter: { color: '#fff', fontSize: 13, backgroundColor: 'rgba(7,7,10,0.6)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  miniChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(7,7,10,0.55)' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  line: { color: colors.cream, fontSize: 26, lineHeight: 34, fontWeight: '700', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  framing: { color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', marginTop: 16 },
  complete: { color: colors.teal, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  card: { width: '100%', maxWidth: 420, gap: 8, backgroundColor: 'rgba(7,7,10,0.72)', borderRadius: radius.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 18 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  cardRow: { color: 'rgba(255,255,255,0.92)', fontSize: 14, lineHeight: 20 },
  cardKey: { color: colors.teal, fontSize: 12, fontWeight: '700' },
  retakeHint: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 4, textAlign: 'center' },
  nextSecs: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center' },
  countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { color: '#fff', fontSize: 96, fontWeight: '800' },
  controls: { position: 'absolute', bottom: 44, left: 24, right: 24, alignItems: 'center', gap: 10 },
  status: { color: colors.cream, backgroundColor: 'rgba(7,7,10,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  cta: { width: '100%', height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  ctaHalf: { flex: 1, width: undefined },
  ctaGhost: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  ctaRec: { backgroundColor: colors.coral },
  ctaText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
})
