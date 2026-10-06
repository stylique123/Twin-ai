// GENERATED FROM packages/shared/src/script/blueprintCompliance.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// BLUEPRINT COMPLIANCE, COMPUTED IN CODE (owner 2026-10-06).
//
// Set 4 by hand: the 8 scripts that followed the blueprint averaged 5.6, the 6
// that did not averaged 3.5. Five checks, each true/false, all from the
// spoken lines and the goal — no model call:
//   hookPaid     the hook's subject comes back by line 3
//   body         at least 3 spoken lines (a body, a payoff, a close)
//   oneSpine     at most one first-person story is told
//   closeFollows the last line picks up something already said
//   arcFitsGoal  the shape the goal needs (an ask on sell/leads, a question on
//                conversations, a step on educate, her moment on personal
//                brand, no pitch on entertain)

const STOP = new Set(('this that with your from have they them their there what when where which about would could should just really very will into than then also because been were here people every single most more some only like know want need make made does doing done thing things actually honestly always never right first last time today ever even still away back over down more much many such each other')
  .split(' '))

const content = (s: string): Set<string> =>
  new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(?:ing|ed|es|s)$/, '')))

const share = (a: Set<string>, b: Set<string>, min = 1): boolean => {
  let n = 0
  for (const w of a) if (b.has(w) && ++n >= min) return true
  return false
}

const STORY = /\b(?:I|we)\s+(?:\w+ly\s+)?(?:got|went|had|made|took|lost|threw|sold|bought|tossed|ordered|skipped|almost|started|tried|spent|learned|realized|priced|refused|[a-z]{3,}ed)\b|\b(?:someone|a customer|a woman|a man|my \w+) (?:told|asked|said|booked|sent)\b/i
const ASK = /\b(?:link in (?:my )?bio|book|send me|message me|dm me|grab|order|shop|get yours|check out|sign up)\b/i
const STEP = /\b(?:try|check|look|store|keep|add|build|start|test|map|squeeze|roll|brew|price|use|stop|skip|swap)\b/i
const PRICE = /(?:\$\s?\d|\b\d+\s?dollars?\b|link in (?:my )?bio)/i

export interface Compliance {
  hookPaid: boolean
  body: boolean
  oneSpine: boolean
  closeFollows: boolean
  arcFitsGoal: boolean
  passed: number
  compliant: boolean
}

/** Spoken lines from a numbered script text ("1. …\n2. …") or an array. */
export function spokenLines(script: string | readonly string[]): string[] {
  const raw = typeof script === 'string' ? script.split('\n') : [...script]
  return raw.map((l) => l.replace(/^\s*\d+\.\s*/, '').trim()).filter((l) => l.split(/\s+/).length >= 3)
}

export function blueprintCompliance(script: string | readonly string[], goal: string): Compliance {
  const lines = spokenLines(script)
  const hook = lines[0] ?? ''
  const hookWords = content(hook)
  const early = content(lines.slice(1, 3).join(' '))
  const hookPaid = lines.length >= 2 && share(hookWords, early)

  const body = lines.length >= 3

  // Stories: lines carrying a first-person event; two story lines belong to
  // the same spine when they share a content word.
  const storyLines = lines.filter((l) => STORY.test(l)).map(content)
  let spines = 0
  const seen: Array<Set<string>> = []
  for (const s of storyLines) {
    if (!seen.some((p) => share(p, s))) spines++
    seen.push(s)
  }
  const oneSpine = spines <= 1

  const last = lines[lines.length - 1] ?? ''
  const before = content(lines.slice(0, -1).join(' '))
  const closeFollows = lines.length >= 2 && share(content(last), before)

  const tail = lines.slice(-2).join(' ')
  const g = goal.toLowerCase()
  const arcFitsGoal =
    g === 'sell' || g === 'leads' ? ASK.test(tail)
    : g === 'conversations' ? /\?\s*$/.test(last) || /\bcomments?\b/i.test(last)
    : g === 'educate' ? STEP.test(lines.slice(1).join(' '))
    : g === 'personal_brand' ? storyLines.length > 0
    : g === 'entertain' ? !PRICE.test(lines.join(' '))
    : true

  const checks = [hookPaid, body, oneSpine, closeFollows, arcFitsGoal]
  const passed = checks.filter(Boolean).length
  return { hookPaid, body, oneSpine, closeFollows, arcFitsGoal, passed, compliant: passed === 5 }
}
