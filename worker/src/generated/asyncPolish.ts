// GENERATED FROM packages/shared/src/script/asyncPolish.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// ASYNC POLISH (owner decision 2, RELIABILITY FIRST; trial only, panel-current-8).
//
// Pure: no I/O. Under the trial the request path ends after the writer plus the
// mandatory deterministic clean-up and guards; the quality-only model passes
// (late extend, extension, payoff repair, advisory read, self-review) are
// deferred. The edge saves the draft with `blueprint.polish_pending` and
// `check_status = 'unchecked'`; the worker's `invention_recheck` job runs the
// self-review here BEFORE the honesty gate (so the gate checks the polished
// lines), and the gate's own refill (LENGTH_REFILL, word_budget) replaces the
// request-path lengthen passes. ASYNC_POLISH=off is the kill switch.
//
// Step-time map (panel-current-7/-8, script_attempts + edge logs, 4 days):
// writer attempt 0 ok p50 43 s / p90 62 s, timeout at 65-75 s (26 of 76);
// fallback ok p50 42 s, timeout 49-55 s (11 of 26); self-review editor p50
// 24 s / p90 55 s (+ compare p50 6 s); payoff repair p50 14 s / p90 27 s;
// claim-strip p50 6 s / p90 21 s; request total p50 92 s / p90 126 s,
// 21 of 70 requests over 110 s.

/** Writer attempt 0 is capped here on the async path. */
export const ASYNC_WRITER_PRIMARY_MS = 60_000
/** Every writer attempt must end by this much of the request (~75-80 s of writer after setup). */
export const ASYNC_WRITER_END_MS = 84_000
/** The first draft is returned by about this much of the request. */
export const ASYNC_REQUEST_TARGET_MS = 90_000
export const ASYNC_MIN_ATTEMPT_MS = 15_000
/** The worker's whole polish step (editor + compare) is cut off here; the draft stands. */
export const ASYNC_POLISH_BUDGET_MS = 45_000

/** Optional request-path passes the async path defers (never runs inline). */
export const ASYNC_DEFERRED_STEPS = ['late_extend', 'extension', 'payoff_repair', 'advisory_read', 'self_review'] as const
export type DeferredStep = typeof ASYNC_DEFERRED_STEPS[number]

/** Trial only; ASYNC_POLISH=off is the kill switch. */
export function asyncPolishOn(trialOn: boolean, flag: string | undefined | null): boolean {
  return trialOn && String(flag ?? 'on').trim().toLowerCase() !== 'off'
}

export function isDeferredStep(step: string): step is DeferredStep {
  return (ASYNC_DEFERRED_STEPS as readonly string[]).includes(step)
}

/** Per-attempt writer timeout on the async path. Null = skip the attempt. */
export function asyncDeadlineTimeout(i: number, base: number, startedAt: number, now: number): number | null {
  const left = ASYNC_WRITER_END_MS - (now - startedAt)
  const cap = i === 0 ? Math.min(base, ASYNC_WRITER_PRIMARY_MS) : base
  const t = Math.min(cap, left)
  return t >= ASYNC_MIN_ATTEMPT_MS ? t : null
}

export interface PolishBeat { section?: unknown; line?: unknown; [k: string]: unknown }

export const POLISH_EDITOR_SYSTEM = 'You are her editor. You fix at most TWO lines of a short video script so it sounds like her talking and holds together from hook to close. You never add a fact, number, name, product detail or experience that is not in her material. You return JSON only.'
export const POLISH_COMPARE_SYSTEM = 'You compare two versions of one short video script for a creator. You return JSON only.'
export const POLISH_REWRITE_SCHEMA = {
  type: 'OBJECT',
  properties: { rewrites: { type: 'ARRAY', items: { type: 'OBJECT', properties: { index: { type: 'STRING' }, line: { type: 'STRING' } }, required: ['index', 'line'] } } },
  required: ['rewrites'],
}
export const POLISH_COMPARE_SCHEMA = {
  type: 'OBJECT',
  properties: { best: { type: 'STRING' }, why: { type: 'STRING' } },
  required: ['best'],
}

const strip = (s: string) => s.split('<<<UNTRUSTED_DATA').join('').split('END_UNTRUSTED_DATA>>>').join('')

/** The editor prompt (same rules as the edge's trial self-review, incl. the payoff rule). */
export function polishEditorPrompt(beats: PolishBeat[], material: string, opts: { goal?: string; subject?: string } = {}): string {
  const numbered = beats.map((b, i) => `${i}. [${String(b.section ?? '')}] ${String(b.line ?? '')}`).join('\n')
  return [
    'Find the (at most two) weakest lines, in this order of priority:',
    '-2. the hook promises or asks something (a detail, a reason, "what happens when", "who it is for") that no line by the third delivers in plain words: rewrite line 1 or 2 so it delivers it from her material;',
    `-1. a middle line about a different product or topic than this video (${String(opts.subject ?? 'the subject').slice(0, 80)}): rewrite it from her material about THIS subject;`,
    '0. no line between the hook and the close gives HER know-how (the mistake people make, the step that matters, what she learned): rewrite the weakest middle line into one, from her material;',
    '1. a line that reads like a profile, bio, product page or keyword list instead of a person talking;',
    '2. a line any creator in her niche could say word for word (nothing of hers in it);',
    '3. a line that breaks the thread: the close does not answer or act on what the hook opened.',
    'Rewrite each in first person, short and spoken, using only her material below. Keep exact numbers exactly. If every line is already good, return no rewrites.',
    `\nTHE VIDEO'S GOAL: ${String(opts.goal ?? 'not set')}.`,
    `\nTHE SCRIPT (index. [section] line):\n${numbered}`,
    `\nHER MATERIAL (the only source of facts):\n<<<UNTRUSTED_DATA her material\n${strip(material.slice(0, 6000))}\nEND_UNTRUSTED_DATA>>>`,
    '\nReturn {"rewrites":[{"index":"<line index>","line":"<new line>"}]}.',
  ].join('\n')
}

const NUM = /\d+(?:[.,]\d+)?/g
/** Numbers in `line` found neither in the line it replaces nor in her material. */
export function newNumbersIn(line: string, original: string, material: string): string[] {
  const known = new Set([...(original.match(NUM) ?? []), ...(material.match(NUM) ?? [])])
  return (line.match(NUM) ?? []).filter((n) => !known.has(n))
}

export interface PolishApply { next: PolishBeat[]; kept: number; rejected: string[] }

/** Applies at most two editor rewrites: never the hook or the close, never a new number. */
export function applyPolishRewrites(beats: PolishBeat[], raw: string, material: string): PolishApply {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return { next: beats, kept: 0, rejected: ['bad_json'] } }
  const list = Array.isArray((parsed as { rewrites?: unknown })?.rewrites) ? (parsed as { rewrites: unknown[] }).rewrites : []
  const spoken = beats.map((b, i) => (typeof b?.line === 'string' && b.line.trim() ? i : -1)).filter((i) => i >= 0)
  const first = spoken[0] ?? -1
  const last = spoken[spoken.length - 1] ?? -1
  const next = beats.map((b) => ({ ...b }))
  const rejected: string[] = []
  let kept = 0
  for (const r of list.slice(0, 2) as Array<{ index?: unknown; line?: unknown }>) {
    const at = Number(r?.index)
    const line = typeof r?.line === 'string' ? r.line.trim() : ''
    if (!Number.isInteger(at) || at < 0 || at >= next.length || line.split(/\s+/).length < 4) { rejected.push('bad_index'); continue }
    if (at === first || at === last) { rejected.push('hook_or_close'); continue }
    if (newNumbersIn(line, String(next[at].line ?? ''), material).length) { rejected.push('new_number'); continue }
    next[at] = { ...next[at], line }
    kept += 1
  }
  return { next, kept, rejected }
}

/** The blind side-by-side prompt; `flip` puts the edited version first. */
export function polishComparePrompt(original: PolishBeat[], edited: PolishBeat[], flip: boolean): string {
  const say = (b: PolishBeat[]) => b.map((x) => String(x.line ?? '').trim()).filter(Boolean).map((l, i) => `${i + 1}. ${l}`).join('\n')
  const [a, c] = flip ? [edited, original] : [original, edited]
  return `Which version would a real viewer of her audience watch to the end and act on? The hook must be paid off, every line must follow from the one before, it must sound like a person talking. If they are equal, answer A.\n\nVERSION A:\n${say(a)}\n\nVERSION B:\n${say(c)}\n\nReturn {"best":"A" or "B","why":"<one sentence>"}.`
}

/** Only better, never worse: the edit ships only when the blind read prefers it. */
export function editedWins(raw: string, flip: boolean): boolean {
  let best = ''
  try { best = String((JSON.parse(raw) as { best?: unknown }).best ?? '').trim().toUpperCase().slice(0, 1) } catch { return false }
  return flip ? best === 'A' : best === 'B'
}
