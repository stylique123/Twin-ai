import { Stack } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Body, Button, Eyebrow, Field, H1, Screen } from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'

export default function SignIn() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setErr(null); setInfo(null)
    const fn = mode === 'in' ? signIn : signUp
    const { error } = await fn(email, password)
    setBusy(false)
    if (error) { setErr(error); return }
    if (mode === 'up') setInfo('Check your email to confirm, then sign in.')
    // On success the auth listener flips the session and the gate routes home.
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <Eyebrow>TwinAI</Eyebrow>
        <H1>{mode === 'in' ? 'Welcome back' : 'Create your account'}</H1>
        <Body muted>One link in. A finished, on-brand video out.</Body>
        <View style={{ height: 8 }} />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        {err ? <Body>{`⚠ ${err}`}</Body> : null}
        {info ? <Body muted>{info}</Body> : null}
        <View style={{ height: 8 }} />
        <Button label={mode === 'in' ? 'Sign in' : 'Sign up'} onPress={submit} loading={busy} />
        <Button
          variant="ghost"
          label={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
          onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(null); setInfo(null) }}
        />
      </View>
    </Screen>
  )
}
