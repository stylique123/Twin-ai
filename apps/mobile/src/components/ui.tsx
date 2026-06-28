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
import { LinearGradient } from 'expo-linear-gradient'
import { colors, radius, space } from '../theme'

// Signature gradient — never re-order: amber → coral → teal at 135° (DESIGN.md §2).
const SIGNATURE = [colors.amber, colors.coral, colors.teal] as const

// Aurora — ONE soft ambient glow per page (DESIGN.md §6). Sits behind content.
export function Aurora() {
  return (
    <View pointerEvents="none" style={styles.auroraWrap}>
      <LinearGradient
        colors={['rgba(255,179,71,0.16)', 'rgba(255,91,123,0.12)', 'rgba(101,229,216,0.10)', 'transparent']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.aurora}
      />
    </View>
  )
}

// Screen — ink canvas + safe area + one Aurora glow + scroll. Every screen uses it.
export function Screen({
  children,
  scroll = true,
  aurora = true,
  refreshControl,
}: {
  children: ReactNode
  scroll?: boolean
  aurora?: boolean
  refreshControl?: React.ReactElement
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {aurora ? <Aurora /> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
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

// A big gradient-text number-hero / accent phrase (DESIGN.md: at most one per page).
export function GradientText({ children }: { children: ReactNode }) {
  // RN can't gradient-fill text without masking deps; use the single teal as the
  // restrained accent instead (still on-system, zero extra deps).
  return <Text style={styles.gradientText}>{children}</Text>
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const inner = <View style={styles.card}>{children}</View>
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { transform: [{ translateY: -2 }] }}>
      {inner}
    </Pressable>
  ) : (
    inner
  )
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? colors.coral : colors.hairline, backgroundColor: selected ? 'rgba(255,91,123,0.12)' : 'transparent' },
      ]}
    >
      <Text style={{ color: selected ? colors.cream : colors.stone, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
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
        !isPrimary && styles.btnGhost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ translateY: 1 }] },
      ]}
    >
      {isPrimary ? (
        <LinearGradient colors={SIGNATURE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
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
      <TextInput placeholderTextColor={colors.stone} style={styles.field} autoCapitalize="none" {...rest} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  scroll: { padding: space.lg, gap: space.md, flexGrow: 1 },
  auroraWrap: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  aurora: { flex: 1, opacity: 0.9 },
  eyebrow: { color: colors.stone, fontSize: 12, letterSpacing: 2, fontWeight: '600' },
  h1: { color: colors.cream, fontSize: 32, fontWeight: '800', letterSpacing: -0.6, lineHeight: 36 },
  body: { color: colors.sand, fontSize: 15, lineHeight: 22 },
  gradientText: { color: colors.teal, fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  label: { color: colors.stone, fontSize: 13 },
  card: {
    backgroundColor: colors.ink2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.md,
    gap: 6,
  },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1 },
  btn: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
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
