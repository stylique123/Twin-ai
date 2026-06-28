import { Tabs, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, Text } from 'react-native'
import { colors } from '../../src/theme'

export default function TabsLayout() {
  const router = useRouter()
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.cream,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.ink },
        tabBarStyle: { backgroundColor: colors.ink2, borderTopColor: colors.hairline },
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.stone,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" color={color} size={size} />,
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={10} style={{ paddingRight: 16 }}>
              <Text style={{ color: colors.stone }}>Settings</Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
