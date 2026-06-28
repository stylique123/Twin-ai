import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, Text, View } from 'react-native'
import { listGalleryItems, type GalleryItem } from '@twinai/shared'
import { Body, Button, Card, Chip, Eyebrow, H1, Screen } from '../../src/components/ui'
import { colors } from '../../src/theme'

export default function Gallery() {
  const router = useRouter()
  const [items, setItems] = useState<GalleryItem[] | null>(null)
  const [niche, setNiche] = useState<string>('All')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      setItems(await listGalleryItems())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the gallery')
    }
  }, [])

  useFocusEffect(useCallback(() => { let alive = true; if (items === null) load(); return () => { alive = false } }, [load, items]))

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

  const niches = useMemo(() => {
    const set = new Set((items ?? []).map((i) => i.niche).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [items])

  const shown = (items ?? []).filter((i) => niche === 'All' || i.niche === niche)

  // Remix = jump into Create with the reference prefilled (same engine as pasting a link).
  const remix = (url: string) => router.push({ pathname: '/create', params: { url } })

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.stone} />}>
      <Eyebrow>Proven references</Eyebrow>
      <H1>Gallery</H1>
      <Body muted>Find a viral video that fits your niche, then remix it in your voice.</Body>

      {niches.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {niches.map((n) => <Chip key={n} label={n} selected={n === niche} onPress={() => setNiche(n)} />)}
        </View>
      ) : null}

      {error ? <Body>{`⚠ ${error}`}</Body> : null}
      {items === null && !error ? <Card><Body muted>Loading…</Body></Card> : null}
      {items && shown.length === 0 ? <Card><Body muted>No references here yet.</Body></Card> : null}

      {shown.map((g) => (
        <Card key={g.id}>
          <Body>{g.title ?? `${g.creator ?? 'Creator'} · ${g.platform}`}</Body>
          <Text style={{ color: colors.stone, fontSize: 12 }}>
            {g.niche}{g.reach ? ` · ${g.reach} reach` : ''}{g.likes ? ` · ${g.likes} likes` : ''}
          </Text>
          {g.why ? <Text style={{ color: colors.sand, fontSize: 13, lineHeight: 19 }}>{g.why}</Text> : null}
          <View style={{ height: 6 }} />
          <Button label="Remix this" onPress={() => remix(g.url)} />
        </Card>
      ))}
      <View style={{ height: 24 }} />
    </Screen>
  )
}
