import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { getGeneration, updateGenerationChoice, type Generation } from '@twinai/shared'
import { Body, Button, Card, Eyebrow, H1, Screen } from '../../src/components/ui'
import { colors, radius } from '../../src/theme'

export default function BlueprintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [gen, setGen] = useState<Generation | null>(null)
  const [hook, setHook] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getGeneration(id)
      .then((g) => {
        setGen(g)
        setHook(g?.selected_hook ?? g?.blueprint?.hook_options?.[0] ?? null)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load'))
  }, [id])

  const pickHook = (h: string) => {
    setHook(h)
    if (id) updateGenerationChoice(id, { selected_hook: h })
  }

  if (err) return <Screen><Body>{`⚠ ${err}`}</Body></Screen>
  if (!gen) return <Screen><Body muted>Loading…</Body></Screen>

  const bp = gen.blueprint

  return (
    <Screen>
      <Stack.Screen options={{ title: bp?.reference_read?.format_label ?? 'Blueprint' }} />
      <Eyebrow>{bp?.reference_read?.format_label ?? 'Your blueprint'}</Eyebrow>
      <H1>Pick your hook</H1>
      {bp?.hook_options?.map((h, i) => (
        <Pressable
          key={i}
          onPress={() => pickHook(h)}
          style={{
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: hook === h ? colors.coral : colors.hairline,
            backgroundColor: hook === h ? 'rgba(255,91,123,0.10)' : colors.ink2,
            padding: 14,
          }}
        >
          <Text style={{ color: colors.cream, fontSize: 15, lineHeight: 21 }}>{h}</Text>
        </Pressable>
      ))}

      <View style={{ height: 12 }} />
      <Eyebrow>Script</Eyebrow>
      {bp?.script?.map((s, i) => (
        <Card key={i}>
          <Text style={{ color: colors.stone, fontSize: 11, letterSpacing: 1 }}>{s.section?.toUpperCase()}</Text>
          <Text style={{ color: colors.cream, fontSize: 15, lineHeight: 22 }}>{s.line}</Text>
          {s.direction ? <Text style={{ color: colors.stone, fontSize: 13, fontStyle: 'italic' }}>{s.direction}</Text> : null}
        </Card>
      ))}

      <View style={{ height: 16 }} />
      <Button label="Record this" onPress={() => router.push(`/record/${gen.id}`)} />
      <View style={{ height: 32 }} />
    </Screen>
  )
}
