import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { getProfile, planFor, updateDisplayName, videosFromCredits, type Profile } from '@twinai/shared'
import { Body, Button, Card, Eyebrow, Field, H1, Screen } from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'

export default function Settings() {
  const { signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p)
      setName(p?.display_name ?? '')
    })
  }, [])

  const save = async () => {
    setSaving(true); setErr(null); setSaved(false)
    try {
      await updateDisplayName(name)
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const plan = profile ? planFor(profile.plan) : null

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Eyebrow>Account</Eyebrow>
      <H1>Settings</H1>

      <Card>
        <Body muted>Plan</Body>
        <Body>{plan?.name ?? '—'}</Body>
        {profile ? <Body muted>{`${videosFromCredits(profile.credits)} remixes left`}</Body> : null}
      </Card>

      <Field label="Display name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
      {err ? <Body>{`⚠ ${err}`}</Body> : null}
      {saved ? <Body muted>Saved.</Body> : null}
      <Button label="Save" onPress={save} loading={saving} />

      <View style={{ height: 16 }} />
      <Button variant="ghost" label="Sign out" onPress={signOut} />
    </Screen>
  )
}
