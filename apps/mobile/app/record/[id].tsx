import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'
import { ResizeMode, Video } from 'expo-av'
import {
  autoEditTake,
  DEFAULT_WPM,
  estimateDurationSec,
  getGeneration,
  getJob,
  WPM_LABEL,
  WPM_PRESETS,
  type WpmPreset,
} from '@twinai/shared'
import { Body, Button, Screen } from '../../src/components/ui'
import { colors, radius } from '../../src/theme'

type Phase = 'idle' | 'countdown' | 'recording' | 'uploading' | 'editing' | 'done' | 'error'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Record() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [camPerm, requestCam] = useCameraPermissions()
  const [micPerm, requestMic] = useMicrophonePermissions()
  const cameraRef = useRef<CameraView>(null)
  const recordingPromise = useRef<Promise<{ uri: string }> | undefined>(undefined)

  // Teleprompter
  const scrollRef = useRef<ScrollView>(null)
  const contentH = useRef(0)
  const viewH = useRef(0)
  const raf = useRef<number | undefined>(undefined)
  const [lines, setLines] = useState<string[]>([])
  const [wpm, setWpm] = useState<WpmPreset>(DEFAULT_WPM)
  const [mirror, setMirror] = useState(false)

  const [cameraReady, setCameraReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [count, setCount] = useState(3)
  const [status, setStatus] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getGeneration(id).then((g) => {
      if (!g) return
      const hook = g.selected_hook ?? g.blueprint?.hook_options?.[0]
      const scriptLines = g.blueprint?.script?.map((s) => s.line) ?? []
      setLines([hook, ...scriptLines].filter(Boolean) as string[])
    })
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [id])

  const ready = camPerm?.granted && micPerm?.granted

  // Auto-scroll the script over its estimated spoken duration at the chosen WPM.
  const startAutoScroll = () => {
    const totalSec = Math.max(4, lines.reduce((a, l) => a + estimateDurationSec(l, wpm), 0))
    const distance = Math.max(0, contentH.current - viewH.current)
    const startTs = Date.now()
    const tick = () => {
      const t = (Date.now() - startTs) / 1000
      const p = Math.min(1, t / totalSec)
      scrollRef.current?.scrollTo({ y: distance * p, animated: false })
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  const start = async () => {
    try {
      setErr(null); setPhase('countdown')
      for (let c = 3; c >= 1; c--) { setCount(c); await sleep(800) }
      if (!cameraRef.current) throw new Error('Camera not ready — try again')
      setPhase('recording')
      recordingPromise.current = cameraRef.current.recordAsync() as Promise<{ uri: string }>
      startAutoScroll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start recording'); setPhase('error')
    }
  }

  const stop = async () => {
    if (!id) return
    if (raf.current) cancelAnimationFrame(raf.current)
    try {
      cameraRef.current?.stopRecording()
      const video = await recordingPromise.current
      if (!video?.uri) throw new Error('No recording captured')

      setPhase('uploading'); setStatus('Uploading your take…')
      const { jobId } = await autoEditTake(id, { uri: video.uri, contentType: 'video/mp4' })

      setPhase('editing'); setStatus('Auto-editing — captions, cuts, vertical…')
      for (let i = 0; i < 120; i++) {
        const job = await getJob(jobId)
        if (job?.status === 'done') {
          setVideoUrl(job.result?.output_url ?? null); setStatus(null); setPhase('done'); return
        }
        if (job?.status === 'failed') throw new Error(job.error || 'The edit failed')
        if (job?.result?.progress?.label) setStatus(job.result.progress.label)
        await sleep(3000)
      }
      throw new Error('The edit is taking longer than usual — check your Library shortly.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong'); setPhase('error')
    }
  }

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
          <Video
            source={{ uri: videoUrl }}
            style={{ width: '100%', aspectRatio: 9 / 16, borderRadius: radius.card, backgroundColor: '#000' }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
          />
        ) : (
          <Body muted>Rendered — find it in your Library.</Body>
        )}
      </Screen>
    )
  }

  const recording = phase === 'recording'
  const processing = phase === 'uploading' || phase === 'editing'

  return (
    <View style={styles.full}>
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" mode="video" onCameraReady={() => setCameraReady(true)} />

      {/* WPM + mirror controls (hidden once processing) */}
      {!processing ? (
        <View style={styles.topBar}>
          {(Object.keys(WPM_PRESETS) as WpmPreset[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => setWpm(p)}
              style={[styles.miniChip, { borderColor: wpm === p ? colors.teal : 'rgba(255,255,255,0.25)' }]}
            >
              <Text style={{ color: wpm === p ? colors.teal : '#fff', fontSize: 12, fontWeight: '600' }}>{WPM_LABEL[p]}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setMirror((m) => !m)} style={[styles.miniChip, { borderColor: mirror ? colors.teal : 'rgba(255,255,255,0.25)' }]}>
            <Text style={{ color: mirror ? colors.teal : '#fff', fontSize: 12, fontWeight: '600' }}>Mirror</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Teleprompter */}
      <View style={styles.prompter}>
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!recording}
          onContentSizeChange={(_w, h) => (contentH.current = h)}
          onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
          contentContainerStyle={{ padding: 16, gap: 12, transform: [{ scaleX: mirror ? -1 : 1 }] }}
        >
          {lines.map((l, i) => (
            <Text key={i} style={[styles.line, i === 0 && styles.hook]}>{l}</Text>
          ))}
        </ScrollView>
      </View>

      {/* Countdown overlay */}
      {phase === 'countdown' ? (
        <View style={styles.countWrap} pointerEvents="none">
          <Text style={styles.count}>{count}</Text>
        </View>
      ) : null}

      <View style={styles.controls}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        {err ? <Text style={[styles.status, { color: colors.coral }]}>{`⚠ ${err}`}</Text> : null}
        {phase === 'idle' || phase === 'error' ? (
          <Pressable style={[styles.recBtn, !cameraReady && { opacity: 0.4 }]} disabled={!cameraReady} onPress={start}>
            <View style={styles.recDot} />
          </Pressable>
        ) : recording ? (
          <Pressable style={styles.recBtn} onPress={stop}><View style={styles.stopSquare} /></Pressable>
        ) : (
          <View style={styles.recBtn}><Text style={{ color: '#fff' }}>…</Text></View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', top: 56, left: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
  },
  miniChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1,
    backgroundColor: 'rgba(7,7,10,0.55)',
  },
  prompter: {
    position: 'absolute', top: 104, left: 12, right: 12, maxHeight: '42%',
    backgroundColor: 'rgba(7,7,10,0.6)', borderRadius: radius.card,
  },
  line: { color: colors.cream, fontSize: 22, lineHeight: 30, fontWeight: '600', textAlign: 'center' },
  hook: { color: colors.teal, fontSize: 26, fontWeight: '800' },
  countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { color: '#fff', fontSize: 96, fontWeight: '800' },
  controls: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center', gap: 10 },
  status: { color: colors.cream, backgroundColor: 'rgba(7,7,10,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  recBtn: {
    width: 76, height: 76, borderRadius: 999, borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
  },
  recDot: { width: 56, height: 56, borderRadius: 999, backgroundColor: colors.coral },
  stopSquare: { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.coral },
})
