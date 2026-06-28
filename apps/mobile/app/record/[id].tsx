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
  getJob,
  loadTimeline,
  teleprompterScenes,
  WPM_LABEL,
  WPM_PRESETS,
  type Scene,
  type SceneTimeline,
  type WpmPreset,
} from '@twinai/shared'
import { Body, Button, Screen } from '../../src/components/ui'
import { colors, radius } from '../../src/theme'

type Phase = 'idle' | 'countdown' | 'recording' | 'between' | 'uploading' | 'editing' | 'done' | 'error'
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

  const [cameraReady, setCameraReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [count, setCount] = useState(3)
  const [status, setStatus] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const lastUri = useRef<string | null>(null)   // recorded take, kept so a failed upload can retry without re-recording
  const lastJobId = useRef<string | null>(null)  // once enqueued, retry resumes polling this job (never re-charges)

  // Finished-video player (expo-video). Created once at top level (hook rules);
  // the source is set when the render completes.
  const player = useVideoPlayer(null, (p) => { p.loop = false })
  useEffect(() => {
    if (videoUrl) { player.replace(videoUrl); player.play() }
  }, [videoUrl, player])

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
      recordingPromise.current = cameraRef.current.recordAsync() as Promise<{ uri: string }>
      setPhase('recording')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start recording'); setPhase('error')
    }
  }

  // Mark the current scene's boundary (cumulative recording seconds) + its line.
  const markBoundary = () => {
    boundsRef.current.push(Math.round(((Date.now() - startTs.current) / 1000) * 1000) / 1000)
    linesRef.current.push((scene?.dialogue || scene?.caption_text || '').trim())
  }

  const nextScene = () => {
    markBoundary()
    if (last) { void finish(); return }
    setPhase('between')
  }

  const continueNext = () => { setI((v) => v + 1); setPhase('recording') }

  const finish = async () => {
    if (!id) return
    try {
      setPhase('uploading'); setStatus('Uploading your take…')
      cameraRef.current?.stopRecording()
      const video = await recordingPromise.current
      if (!video?.uri) throw new Error('No recording captured')
      lastUri.current = video.uri
      await runUpload(video.uri)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong'); setPhase('error')
    }
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
        // Per-scene cut bounds + spoken line → the worker captions/cuts per scene
        // (Scene Timeline contract). Falls back to scene-detection if <2 segments.
        const shots = total > 1 ? { bounds, total, lines } : undefined
        const r = await autoEditTake(id, { uri, contentType: 'video/mp4' }, shots, undefined, (f) => setUploadPct(f < 0 ? null : f))
        jobId = r.jobId
        lastJobId.current = jobId
      }

      setUploadPct(null); setPhase('editing'); setStatus('Auto-editing — captions, cuts, vertical…')
      for (let n = 0; n < 120; n++) {
        const job = await getJob(jobId)
        if (job?.status === 'done') { setVideoUrl(job.result?.output_url ?? null); setStatus(null); setPhase('done'); return }
        if (job?.status === 'failed') { lastJobId.current = null; throw new Error(job.error || 'The edit failed') }
        if (job?.result?.progress?.label) setStatus(job.result.progress.label)
        await sleep(3000)
      }
      throw new Error('The edit is taking longer than usual — check your Library shortly.')
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
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text style={styles.complete}>Scene complete ✓</Text>
            <Text style={styles.nextLabel}>Next: {sceneLabel(next?.scene_type)}</Text>
            <Text style={styles.nextSecs}>about {Math.round(estimateDurationSec(next?.dialogue ?? null, wpm))}s</Text>
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
          <Pressable style={styles.cta} onPress={continueNext}><Text style={styles.ctaText}>Continue</Text></Pressable>
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
  complete: { color: colors.teal, fontSize: 20, fontWeight: '800' },
  nextLabel: { color: '#fff', fontSize: 15 },
  nextSecs: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { color: '#fff', fontSize: 96, fontWeight: '800' },
  controls: { position: 'absolute', bottom: 44, left: 24, right: 24, alignItems: 'center', gap: 10 },
  status: { color: colors.cream, backgroundColor: 'rgba(7,7,10,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  cta: { width: '100%', height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  ctaRec: { backgroundColor: colors.coral },
  ctaText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
})
