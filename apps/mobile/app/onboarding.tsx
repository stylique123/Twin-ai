import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { markOnboarded, pollDna, startDna, type Platform } from '@twinai/shared'
import { Body, Button, Eyebrow, Field, H1, Screen } from '../src/components/ui'
import { colors, radius } from '../src/theme'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube']
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Onboarding() {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [platform, setPlatform] = useState<Platform>('tiktok')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    if (!handle.trim()) { setErr('Enter your handle first.'); return }
    setBusy(true); setErr(null); setStatus('Reading your recent posts…')
    try {
      const { brand_voice_id } = await startDna(handle.replace('@', '').trim(), platform)
      // Poll until the voice DNA is ready (worker scrapes + builds it).
      for (let i = 0; i < 60; i++) {
        const res = await pollDna(brand_voice_id)
        if (res.status === 'ready') {
          setStatus('Voice ready! Finishing up…')
          await markOnboarded()
          router.replace('/')
          return
        }
        if (res.status === 'failed') throw new Error(res.error || 'Could not build your voice. Try another handle.')
        setStatus('Learning your voice…')
        await sleep(3000)
      }
      throw new Error('This is taking longer than usual — try again in a moment.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false); setStatus(null)
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Set up your voice' }} />
      <Eyebrow>90-second setup</Eyebrow>
      <H1>Learn your voice</H1>
      <Body muted>Enter a handle and we'll read its recent posts to write in your style.</Body>
      <View style={{ height: 8 }} />

      <Field label="Your handle" value={handle} onChangeText={setHandle} placeholder="@yourname" autoCapitalize="none" />

      <Text style={{ color: colors.stone, fontSize: 13, marginTop: 4 }}>Platform</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PLATFORMS.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPlatform(p)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: platform === p ? colors.coral : colors.hairline,
              backgroundColor: platform === p ? 'rgba(255,91,123,0.12)' : 'transparent',
            }}
          >
            <Text style={{ color: platform === p ? colors.cream : colors.stone, textTransform: 'capitalize' }}>{p}</Text>
          </Pressable>
        ))}
      </View>

      {status ? <Body muted>{status}</Body> : null}
      {err ? <Body>{`⚠ ${err}`}</Body> : null}
      <View style={{ height: 8 }} />
      <Button label="Build my voice" onPress={run} loading={busy} />
    </Screen>
  )
}
