// RELEASE FLAGS (owner rule: the live script flow for real creators is production).
//
// Every new writing component sits behind one entry in this registry. A real
// creator gets a component only when its stage says so; the default for EVERY
// component is S0 (test and panel accounts only), which is exactly today's
// `trialOn` rule. Pure: no I/O, no env reads, no clock. The edge passes the
// registry in; nothing here can switch a component on for real creators.
//
// Stages (docs/release/shadow-and-flags.md):
//   S0      test + panel accounts only
//   S1      SHADOW: real requests run the new path silently (never shown)
//   S2      canary: named canary accounts get it; other real creators shadow
//   S3      rollout percentage (5 / 25 / 50 / 100) by a stable per-user bucket
//
// Generated into supabase/functions/_shared/releaseFlags.ts
// (scripts/ci/generate_shared_pilot_core.mjs --check).

export const COMPONENTS = [
  'planner',
  'hook_engine',
  'spine',
  'templates',
  'robot_phrases',
  'outside_select',
  'invention_gate',
] as const
export type Component = (typeof COMPONENTS)[number]

export type Stage = 'S0' | 'S1' | 'S2' | 'S3'
export const ROLLOUT_STEPS = [5, 25, 50, 100] as const

export interface FlagEntry {
  stage: Stage
  /** Percentage of real creators served the new path at S3 (0-100). Ignored below S3. */
  rolloutPct: number
  /** Kill switch: true serves the old path to EVERYONE, test accounts included, and stops shadow runs. */
  killed: boolean
}
export type FlagRegistry = Readonly<Record<Component, FlagEntry>>

/** Every component at S0, 0%, not killed. This is the production registry until a gate is passed. */
export const DEFAULT_REGISTRY: FlagRegistry = Object.freeze(
  Object.fromEntries(COMPONENTS.map((c) => [c, Object.freeze({ stage: 'S0' as Stage, rolloutPct: 0, killed: false })])) as Record<Component, FlagEntry>,
)

export interface ReleaseAccount {
  userId: string
  /** Heartbeat or fictional-panel account, derived from identity (never from the body). */
  isTestAccount: boolean
  /** The test account asked for the plain path on this request (`trial_off: true`). */
  trialOff?: boolean
  /** Named canary account (S2). Derived server-side, never from the request. */
  isCanary?: boolean
}

/** What this request does with a component: serve the new path, run it silently, or old path only. */
export type Serving = 'new' | 'shadow' | 'old'

/** Stable 0-99 bucket per component and user (FNV-1a), so a user keeps the same arm as the percentage grows. */
export function bucketOf(component: Component, userId: string): number {
  let h = 0x811c9dc5
  const s = `${component}:${userId}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 100
}

function entryOf(component: Component, registry: FlagRegistry | undefined): FlagEntry {
  const e = (registry ?? DEFAULT_REGISTRY)[component]
  if (!e || typeof e !== 'object') return DEFAULT_REGISTRY[component]
  const stage: Stage = e.stage === 'S1' || e.stage === 'S2' || e.stage === 'S3' ? e.stage : 'S0'
  const pct = Number.isFinite(e.rolloutPct) ? Math.max(0, Math.min(100, Math.floor(e.rolloutPct))) : 0
  return { stage, rolloutPct: pct, killed: e.killed === true }
}

/** How a component serves this account. At the default registry this is
 *  `'new'` exactly when today's `trialOn` is true, and `'old'` otherwise. */
export function stageFor(component: Component, account: ReleaseAccount, registry?: FlagRegistry): Serving {
  const e = entryOf(component, registry)
  if (e.killed) return 'old'
  if (account.isTestAccount) return account.trialOff === true ? 'old' : 'new'
  switch (e.stage) {
    case 'S0': return 'old'
    case 'S1': return 'shadow'
    case 'S2': return account.isCanary === true ? 'new' : 'shadow'
    case 'S3': return bucketOf(component, account.userId) < e.rolloutPct ? 'new' : 'shadow'
  }
}

/** True when the new path is SERVED (shown) for this account. */
export function componentOn(component: Component, account: ReleaseAccount, registry?: FlagRegistry): boolean {
  return stageFor(component, account, registry) === 'new'
}
