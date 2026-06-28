import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'
import { ResizeMode, Video } from 'expo-av'
import { autoEditTake, getGeneration, getJob } from '@twinai/shared'
import { Body, Button, Screen } from '../../src/components/ui'
import { colors, radius } from '../../src/theme'

type Phase = 'idle' | 'recording' | 'uploading' | 'editing' | 'done' | 'error'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Record() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [camPerm, requestCam] = useCameraPermissions()
  const [micPerm, requestMic] = useMicrophonePermissions()
  const cameraRef = useRef<CameraView>(null)
  const recordingPromise = useRef<Promise<{ uri: string }> | undefined>(undefined)

  const [lines, setLines] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
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
  }, [id])

  const ready = camPerm?.granted && micPerm?.granted

  const start = async () => {
    try {
      setErr(null); setPhase('recording')
      // recordAsync resolves when stopRecording() is called.
      recordingPromise.current = cameraRef.current?.recordAsync() as Promise<{ uri: string }>
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start recording'); setPhase('error')
    }
  }

  const stop = async () => {
    if (!id) return
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
          setVideoUrl(job.result?.output_url ?? null)
          setStatus(null); setPhase('done')
          return
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

  // Permission gate
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

  // Finished: play the rendered vertical video
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

  // Recording / processing UI (camera fills the screen, teleprompter overlays it)
  return (
    <View style={styles.full}>
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" mode="video" />

      {/* Teleprompter overlay */}
      <View style={styles.prompter} pointerEvents="none">
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {lines.map((l, i) => (
            <Text key={i} style={[styles.line, i === 0 && styles.hook]}>{l}</Text>
          ))}
        </ScrollView>
      </View>

      <View style={styles.controls}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        {err ? <Text style={[styles.status, { color: colors.coral }]}>{`⚠ ${err}`}</Text> : null}
        {phase === 'idle' || phase === 'error' ? (
          <Pressable style={styles.recBtn} onPress={start}>
            <View style={styles.recDot} />
          </Pressable>
        ) : phase === 'recording' ? (
          <Pressable style={styles.recBtn} onPress={stop}>
            <View style={styles.stopSquare} />
          </Pressable>
        ) : (
          <View style={styles.recBtn}>
            <Text style={{ color: colors.cream }}>…</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  prompter: {
    position: 'absolute', top: 60, left: 12, right: 12, maxHeight: '45%',
    backgroundColor: 'rgba(7,7,10,0.55)', borderRadius: radius.card,
  },
  line: { color: colors.cream, fontSize: 20, lineHeight: 28, fontWeight: '600', textAlign: 'center' },
  hook: { color: colors.teal, fontSize: 24, fontWeight: '800' },
  controls: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center', gap: 10 },
  status: { color: colors.cream, backgroundColor: 'rgba(7,7,10,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  recBtn: {
    width: 76, height: 76, borderRadius: 999, borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
  },
  recDot: { width: 56, height: 56, borderRadius: 999, backgroundColor: colors.coral },
  stopSquare: { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.coral },
})
