// ⚖️ THE QUALITY PROFILE SWITCH (plan v6.8 §33, owner 26 Oct night).
//
// CHANGE OF METHOD: the FULL STACK is ON BY DEFAULT for test and panel
// accounts, and each panel compares it with the panel-10 baseline arm on the
// SAME requests; when the stack wins, levers are ablated one at a time.
// Real creators never reach this: `resolveQualityProfile` returns null for any
// account that is not a test account, and every caller then reads its flags
// exactly as before (the env, unchanged).
//
//   baseline_p10     every lever OFF and the panel-10 refill (refill arm 'baseline_p10')
//   full_stack       every lever ON (the default for test and panel accounts)
//   ablate:<LEVER>   full_stack with that one lever OFF
//
// HOOK_GATE_V2, POLISH_CHECK_V2 and VOICE_BARE_LINES belong to #1325 / #1322,
// which are not merged in this build. They are named here so the profile is
// complete, but a lever this build does not implement is OFF whatever the
// profile says (`pending` on the record). When those PRs merge, add the flag to
// IMPLEMENTED_LEVERS and read it through `qualityFlag`.
//
// A kill switch still wins: an env value of 'off' / 'false' keeps a lever off
// for every profile, and QUALITY_PROFILE=off returns every test account to the
// env flags (the pre-switch behavior).
//
// Pure, no imports. The Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs).

export const QUALITY_LEVERS = [
  'REFILL_V2', 'SPINE_COMPLETE', 'POLISH_REORDER', 'BEST_OF_N_JUDGE',
  'HOOK_GATE_V2', 'POLISH_CHECK_V2', 'VOICE_BARE_LINES', 'QUALITY_CONTROLLER',
] as const
export type QualityLever = typeof QUALITY_LEVERS[number]

/** The levers this build implements. A lever missing from here is OFF. */
export const IMPLEMENTED_LEVERS: readonly QualityLever[] = ['REFILL_V2', 'SPINE_COMPLETE', 'POLISH_REORDER', 'BEST_OF_N_JUDGE', 'QUALITY_CONTROLLER']

export type QualityProfile = 'baseline_p10' | 'full_stack' | `ablate:${QualityLever}`
export const DEFAULT_QUALITY_PROFILE: QualityProfile = 'full_stack'

const isLever = (v: string): v is QualityLever => (QUALITY_LEVERS as readonly string[]).includes(v)

/** A valid profile name, or null. `ablate:` takes a lever name in any case. */
export function qualityProfileOf(v: unknown): QualityProfile | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s === 'baseline_p10' || s === 'full_stack') return s
  const m = /^ablate:([A-Za-z0-9_]+)$/.exec(s)
  if (m && isLever(m[1]!.toUpperCase())) return `ablate:${m[1]!.toUpperCase() as QualityLever}`
  return null
}

const killed = (v: unknown) => { const f = String(v ?? '').trim().toLowerCase(); return f === 'off' || f === 'false' }

/** The profile for this request, or null (= the env flags, unchanged).
 *  - not a test account (heartbeat or fictional panel): ALWAYS null;
 *  - QUALITY_PROFILE=off|false: null (kill);
 *  - a valid requested profile wins; anything else is the default, full_stack. */
export function resolveQualityProfile(o: { testAccount: boolean; requested?: unknown; kill?: unknown }): QualityProfile | null {
  if (!o.testAccount) return null
  if (killed(o.kill)) return null
  return qualityProfileOf(o.requested) ?? DEFAULT_QUALITY_PROFILE
}

/** Which levers the profile sets ON (before the implemented / kill checks). */
export function profileLevers(p: QualityProfile): Record<QualityLever, boolean> {
  const all = p !== 'baseline_p10'
  const off = p.startsWith('ablate:') ? p.slice(7) : null
  return Object.fromEntries(QUALITY_LEVERS.map((l) => [l, all && l !== off])) as Record<QualityLever, boolean>
}

export interface QualityProfileRecord {
  profile: QualityProfile
  /** Levers in effect for this request. */
  on: QualityLever[]
  /** Levers the profile asked for that this build does not implement (OFF). */
  pending: QualityLever[]
  /** Levers the profile asked for that an env kill switch held OFF. */
  killed: QualityLever[]
}

/** The effective levers. `env` maps a lever name to its edge env value. */
export function qualityLevers(p: QualityProfile, env: Partial<Record<QualityLever, unknown>> = {}, implemented: readonly QualityLever[] = IMPLEMENTED_LEVERS): QualityProfileRecord {
  const want = profileLevers(p)
  const rec: QualityProfileRecord = { profile: p, on: [], pending: [], killed: [] }
  for (const l of QUALITY_LEVERS) {
    if (!want[l]) continue
    if (!implemented.includes(l)) rec.pending.push(l)
    else if (killed(env[l])) rec.killed.push(l)
    else rec.on.push(l)
  }
  return rec
}

/** The value a flag reader should see. With no profile (a real creator, or
 *  QUALITY_PROFILE=off) it is the env value, untouched. With a profile it is
 *  'true' (REFILL_V2) / 'on' when the lever is in effect, else 'off'. */
export function qualityFlag(p: QualityProfile | null, lever: QualityLever, envValue: string | undefined | null, implemented: readonly QualityLever[] = IMPLEMENTED_LEVERS): string | undefined {
  if (p == null) return envValue ?? undefined
  if (!implemented.includes(lever) || killed(envValue) || !profileLevers(p)[lever]) return 'off'
  return lever === 'REFILL_V2' ? 'true' : 'on'
}

/** The refill arm the profile implies. A panel request's explicit refill_arm
 *  wins (panel 12 runs keep working); baseline_p10 is the panel-10 refill. */
export function qualityRefillArm(p: QualityProfile | null, requestedArm: 'baseline_p10' | 'refill_v2' | null): 'baseline_p10' | 'refill_v2' | null {
  if (requestedArm) return requestedArm
  return p === 'baseline_p10' ? 'baseline_p10' : null
}
