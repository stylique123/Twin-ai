// WRITER TIMEOUT FALLBACK (panel-current-9; trial only, async polish path).
//
// Panel 9 lost 6 of 24 to GENERATION_FAILED at 85-88 s: both hedged writer
// calls were cut by the 84 s all-attempts end (attempt 0 at 71-76 s of its own
// time, the fallback at its 55 s base), while the edge allows ~150 s. Polish is
// async now, so the request still returns as soon as the writer plus clean-up
// finish: the writer may run to WRITER_TOTAL_END_MS of the request, and the
// hedged fallback may run to that end too (the hedge still starts at 30 s).
//
// If no writer result exists by then, the request returns a DEGRADED but valid
// blueprint instead of a 500: the code-assembled Plan B body (planBAssembly)
// from her items when she has material, else the general version below. It is
// marked (`degraded`) and counted (ops log `writer_degraded`). A request never
// 500s just because the writer was slow. WRITER_TIMEOUT_FALLBACK=off is the
// kill switch (and the whole path is trialOn + ASYNC_POLISH only).
//
// Pure, no I/O. Deno/worker copies are GENERATED (scripts/ci/generate_shared_pilot_core.mjs).

/** Every writer attempt ends by this much of the request (edge wall clock ~150 s). */
export const WRITER_TOTAL_END_MS = 125_000

/** Trial + async only; WRITER_TIMEOUT_FALLBACK=off is the kill switch. */
export function writerTimeoutFallbackOn(asyncOn: boolean, flag: string | undefined | null): boolean {
  return asyncOn && String(flag ?? 'on').trim().toLowerCase() !== 'off'
}

export type DegradedSource = 'plan_b' | 'general'
export interface DegradedRecord { reason: 'writer_timeout'; source: DegradedSource; lines: number }

export interface DegradedInput {
  /** Plan B lines (already assembled from her items), or empty for the general version. */
  planB?: ReadonlyArray<{ section: string; line: string; source_ids?: readonly string[] }>
  /** What the video is about (her product name or her note); may be empty. */
  subject?: string | null
  /** Her offer, verbatim, when on file. */
  offer?: string | null
  platforms?: readonly string[]
}

const clean = (s: unknown, n = 80) => String(s ?? '').replace(/[[\]{}<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n)

/** The general version: three plain spoken lines with no claim in them. */
export function generalScript(subject: string | null | undefined, offer: string | null | undefined): Array<{ section: string; line: string }> {
  const s = clean(subject)
  const o = clean(offer, 140)
  return [
    { section: 'hook', line: s ? `Here is the one thing I want you to know about ${s}.` : 'Here is the one thing I want you to know today.' },
    { section: 'body', line: 'I will keep this short and only say what I can stand behind.' },
    { section: 'cta', line: o ? `If you want the details, ${o.replace(/[.!?]+$/, '')}.` : 'Save this, and tell me in the comments what you want me to cover next.' },
  ]
}

/** A complete blueprint (concept + packaging, so blueprintComplete holds) around the degraded lines. */
export function degradedBlueprint(input: DegradedInput): { blueprint: Record<string, unknown>; record: DegradedRecord } {
  const usePlanB = (input.planB ?? []).filter((l) => clean(l.line, 1000)).length >= 3
  const source: DegradedSource = usePlanB ? 'plan_b' : 'general'
  const script = usePlanB
    ? input.planB!.filter((l) => clean(l.line, 1000)).map((l) => ({ section: l.section, line: clean(l.line, 1000), ...(l.source_ids ? { source_ids: [...l.source_ids] } : {}) }))
    : generalScript(input.subject, input.offer)
  const hook = script[0]!.line
  const subject = clean(input.subject) || 'this'
  const record: DegradedRecord = { reason: 'writer_timeout', source, lines: script.length }
  return {
    record,
    blueprint: {
      concept: { premise: `A short, plain take on ${subject}, in her own words.` },
      packaging: { titles: [hook.slice(0, 90)], thumbnail: { concept: 'Her face, straight to camera', text_overlay: subject.slice(0, 40), composition: 'Straight to camera' } },
      hook_options: [hook],
      beat_plan: script.map((b) => ({ beat: b.section, target_sec: Math.max(3, Math.round(b.line.split(/\s+/).length / 2.5)), proof: 'Straight to camera' })),
      script,
      shot_list: script.map((b, i) => ({ shot: i === 0 ? 'Opening line, straight to camera' : 'Straight to camera', spoken_text: b.line })),
      publish_plan: (input.platforms ?? []).map((p) => ({ platform: p, caption: hook })),
      degraded: record,
    },
  }
}

// ── SIMULATION (panels 8 + 9, script_attempts durations; counts only) ──────

/** One observed attempt: seconds, and whether it was cut (censored) before finishing. */
export interface AttemptObs { s: number; cut: boolean }
export interface LogNormal { mu: number; sigma: number }

/** Censored maximum-likelihood lognormal fit (grid search; deterministic). */
export function fitLogNormal(obs: readonly AttemptObs[]): LogNormal {
  const sf = (z: number) => 0.5 * erfc(z / Math.SQRT2)
  let best = { ll: -Infinity, mu: 0, sigma: 1 }
  for (let mu = 3; mu <= 5.6; mu += 0.01) {
    for (let sigma = 0.05; sigma <= 1.5; sigma += 0.01) {
      let ll = 0
      for (const o of obs) {
        const z = (Math.log(o.s) - mu) / sigma
        ll += o.cut ? Math.log(Math.max(1e-300, sf(z))) : -0.5 * z * z - Math.log(sigma * o.s)
      }
      if (ll > best.ll) best = { ll, mu, sigma }
    }
  }
  return { mu: best.mu, sigma: best.sigma }
}

function erfc(x: number): number {
  // Numerical Recipes erfc (fractional error < 1.2e-7).
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? r : 2 - r
}

/** Seeded PRNG (mulberry32) so the simulation is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export interface SimOptions {
  /** Writer end, ms of the request. */
  endMs: number
  /** The fallback's own cap (ms); Infinity = runs to the end. */
  fallbackCapMs: number
  /** Request time before the writer starts (ms). */
  setupMs?: number
  hedgeAtMs?: number
  n?: number
  seed?: number
}

/** Expected writer failures per 24 requests under a hedged ladder. */
export function simulateWriterFailuresPer24(primary: LogNormal, fallback: LogNormal, o: SimOptions): number {
  const r = rng(o.seed ?? 9009)
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  const n = o.n ?? 50_000
  const setup = o.setupMs ?? 10_000
  const hedge = o.hedgeAtMs ?? 30_000
  let fail = 0
  for (let k = 0; k < n; k++) {
    const d0 = Math.exp(primary.mu + primary.sigma * gauss()) * 1000
    const d1 = Math.exp(fallback.mu + fallback.sigma * gauss()) * 1000
    const ok0 = setup + d0 <= o.endMs
    const ok1 = d1 <= o.fallbackCapMs && hedge + d1 <= o.endMs
    if (!ok0 && !ok1) fail++
  }
  return (24 * fail) / n
}
