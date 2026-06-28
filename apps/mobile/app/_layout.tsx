import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import { colors } from '../src/theme'

// Redirect gate: unauthenticated users are pushed to /sign-in; signed-in users
// never see it. Mirrors the web AuthContext-driven routing.
function Gate() {
  const { session, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const onSignIn = segments[0] === 'sign-in'
    if (!session && !onSignIn) router.replace('/sign-in')
    else if (session && onSignIn) router.replace('/')
  }, [session, loading, segments, router])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.coral} />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.cream,
        headerTitleStyle: { color: colors.cream },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      {/* The tab group renders its own headers — hide the outer stack header for it. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Gate />
    </AuthProvider>
  )
}
