// WHAT TWIN LEARNED FROM HER, GROUPED FOR HER EYES (audit 2026-09-30).
//
// ⚠️ 30+ rules in one list, half of them one idea ("only use given facts",
// "never invent", "never fabricate quotes", "never state an unprovided
// detail"), in three voices ("her", "the creator", "you"). Those grounding
// rules are Twin's own and are enforced whatever she sees, so they are not
// shown as her preferences. The rest are grouped under a few headings and
// read in one voice: "you".

export interface LessonLike { id: string; kind: string; text: string; active: boolean }

export type LessonGroup = 'openings' | 'voice' | 'endings' | 'leave_out'

export const GROUP_TITLE: Record<LessonGroup, string> = {
  openings: 'How you open',
  voice: 'How you sound',
  endings: 'How you end',
  leave_out: 'What to leave out',
}
export const GROUP_ORDER: readonly LessonGroup[] = ['openings', 'voice', 'endings', 'leave_out']

/** Twin's own writing rules, not her preference: always applied, never listed. */
const SYSTEM_RULE = /\b(only use (factual )?details|make things up|fabricat\w*|invent\w*|not (been )?(given|provided)|has not given|explicitly (shared|confirmed)|unless (explicitly )?confirmed|unverified|send a draft|required details|match the opening line|answer every question the script raises|repeats? (a|the) (point|general idea)|too short to post|factual accuracy)\b/i

export function isSystemRule(text: string): boolean {
  return SYSTEM_RULE.test(String(text ?? ''))
}

/** One voice: "you". */
export function inYourVoice(text: string): string {
  return String(text ?? '')
    .replace(/\bthe creator's\b/gi, 'your')
    .replace(/\bthe creator\b/gi, 'you')
    .replace(/\bshe has\b/gi, 'you have')
    .replace(/\bshe is\b/gi, 'you are')
    .replace(/\bshe\b/gi, 'you')
    .replace(/\bfor her\b/gi, 'for you')
    .replace(/\bto her\b/gi, 'to you')
    .replace(/\bher\b/gi, 'your')
}

export function groupOf(l: { kind: string; text: string }): LessonGroup {
  const t = l.text
  if (l.kind === 'hook' || /\b(open(ing)?|hook|start the script|first line)\b/i.test(t)) return 'openings'
  if (/\b(end(ing|s)?|close|conclude|finish|link in bio|link-in-bio|call to action)\b/i.test(t)) return 'endings'
  if (l.kind === 'avoid' || /^(never|do not|don't|avoid)\b/i.test(t.trim())) return 'leave_out'
  return 'voice'
}

export function groupLessons<L extends LessonLike>(rows: readonly L[]): Array<{ group: LessonGroup; items: Array<L & { shown: string }> }> {
  const by = new Map<LessonGroup, Array<L & { shown: string }>>()
  for (const r of rows) {
    if (isSystemRule(r.text)) continue
    const g = groupOf(r)
    by.set(g, [...(by.get(g) ?? []), { ...r, shown: inYourVoice(r.text) }])
  }
  return GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({ group: g, items: by.get(g)! }))
}
