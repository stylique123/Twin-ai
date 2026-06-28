import { Stack, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { getProfile, listGenerations, type Generation } from '@twinai/shared'
import { Body, Button, Card, Eyebrow, H1, Screen } from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'
import { colors } from '../src/theme'

export default function Home() {
  const router = useRouter()
  const { signOut } = useAuth()
  const [items, setItems] = useState<Generation[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      let alive = true
      ;(async () => {
        try {
          const profile = await getProfile()
          if (alive && profile && !profile.onboarded) {
            router.replace('/onboarding')
            return
          }
          const gens = await listGenerations()
          if (alive) setItems(gens)
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : 'Could not load')
        }
      })()
      return () => { alive = false }
    }, [router]),
  )

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Library',
          headerRight: () => (
            <Pressable onPress={signOut} hitSlop={10}>
              <Text style={{ color: colors.stone }}>Sign out</Text>
            </Pressable>
          ),
        }}
      />
      <Eyebrow>Your videos</Eyebrow>
      <H1>Library</H1>
      <Button label="+ Create a video" onPress={() => router.push('/create')} />

      {error ? <Body>{`⚠ ${error}`}</Body> : null}
      {items === null && !error ? <Body muted>Loading…</Body> : null}
      {items && items.length === 0 ? (
        <Body muted>No videos yet. Paste a reference to make your first one.</Body>
      ) : null}

      {items?.map((g) => (
        <Card key={g.id} onPress={() => router.push(`/blueprint/${g.id}`)}>
          <Body>{g.blueprint?.reference_read?.format_label ?? g.blueprint?.hook_options?.[0] ?? 'Blueprint'}</Body>
          <Text style={{ color: colors.stone, fontSize: 12 }}>
            {new Date(g.created_at).toLocaleDateString()} · {g.reference_url ? 'from reference' : 'from idea'}
          </Text>
        </Card>
      ))}
      <View style={{ height: 24 }} />
    </Screen>
  )
}
