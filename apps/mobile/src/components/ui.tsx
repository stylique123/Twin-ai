import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, radius, space } from '../theme'

// Screen — ink canvas + safe area + scroll. One primitive every screen uses.
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={styles.scroll}>{children}</View>
      )}
    </SafeAreaView>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{String(children).toUpperCase()}</Text>
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.stone }]}>{children}</Text>
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const inner = <View style={styles.card}>{children}</View>
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner
}

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'ghost'
}) {
  const isPrimary = variant === 'primary'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isPrimary ? styles.btnPrimary : styles.btnGhost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ translateY: 1 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.ink : colors.cream} />
      ) : (
        <Text style={[styles.btnText, { color: isPrimary ? colors.ink : colors.cream }]}>{label}</Text>
      )}
    </Pressable>
  )
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, ...rest } = props
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.stone}
        style={styles.field}
        autoCapitalize="none"
        {...rest}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  scroll: { padding: space.lg, gap: space.md, flexGrow: 1 },
  eyebrow: { color: colors.stone, fontSize: 12, letterSpacing: 2, fontWeight: '600' },
  h1: { color: colors.cream, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, lineHeight: 34 },
  body: { color: colors.sand, fontSize: 15, lineHeight: 22 },
  label: { color: colors.stone, fontSize: 13 },
  card: {
    backgroundColor: colors.ink2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.md,
    gap: 6,
  },
  btn: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  btnPrimary: { backgroundColor: colors.coral },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.hairline },
  btnText: { fontSize: 16, fontWeight: '700' },
  field: {
    backgroundColor: colors.ink3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    color: colors.cream,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 16,
  },
})
