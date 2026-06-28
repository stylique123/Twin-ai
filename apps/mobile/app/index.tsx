import { Stack, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, Text, View } from 'react-native'
import { getProfile, listGenerations, videosFromCredits, type Generation } from '@twinai/shared'
import { Body, Button, Card, Chip, Eyebrow, H1, Screen } from '../src/components/ui'
import { colors } from '../src/theme'

export default function Home() {
  const router = useRouter()
  const [items, setItems] = useState<Generation[] | null>(null)
  const [remixes, setRemixes] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const profile = await getProfile()
      if (profile && !profile.onboarded) { router.replace('/onboarding'); return }
      if (profile) setRemixes(videosFromCredits(profile.credits))
      const gens = await listGenerations()
      setItems(gens)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load')
    }
  }, [router])

  useFocusEffect(useCallback(() => { let alive = true; load().finally(() => { if (!alive) return }); return () => { alive = false } }, [load]))

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.stone} />}>
      <Stack.Screen
        options={{
          title: 'Library',
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={10}>
              <Text style={{ color: colors.stone }}>Settings</Text>
            </Pressable>
          ),
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>Your videos</Eyebrow>
        {remixes !== null ? <Chip label={`${remixes} remixes left`} /> : null}
      </View>
      <H1>Library</H1>
      <Button label="+ Create a video" onPress={() => router.push('/create')} />

      {error ? <Body>{`⚠ ${error}`}</Body> : null}
      {items === null && !error ? (
        <>
          <Card><Body muted>Loading…</Body></Card>
          <Card><Body muted> </Body></Card>
        </>
      ) : null}
      {items && items.length === 0 ? (
        <Card><Body muted>No videos yet. Paste a reference to make your first one.</Body></Card>
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
