// Reading the plan's `best_time` well enough to PREFILL a scheduler.
//
// `publish_plan[].best_time` is a free-text string the model writes — "5:00 PM",
// "17:00", "6pm", "evening". It has been rendered as dead text on the plan
// screen ("best time: 5:00 PM") with nothing to act on it. To schedule from it,
// something has to turn it into an hour and a minute.
//
// ── IT IS A SUGGESTION, AND IT IS PARSED AS ONE ──────────────────────────
//
// This is a model's claim about when to post, not a measurement of when this
// creator's audience is online — nothing in this system measures that. So the
// parse feeds a PREFILL the creator can change, never a decision, and the
// screen says where the time came from.
//
// ── AN UNPARSEABLE TIME RETURNS NULL, NOT A DEFAULT ──────────────────────
//
// "evening" is not 6pm. Defaulting it would put a specific time in front of the
// creator that nothing chose, wearing the authority of the plan's suggestion —
// the same missing-value-read-as-a-real-one failure this codebase keeps
// finding. Null means the scheduler opens on its own neutral default and says
// so, which is honest and just as usable.

export interface ClockTime {
  /** 0–23. */
  hour: number
  /** 0–59. */
  minute: number
}

/** `5:00 PM`, `5 PM`, `5pm`, `17:00`, `17.30`. The forms the model actually
 *  writes; anything else is not guessed at. */
const CLOCK = /(\d{1,2})\s*(?::|\.)?\s*(\d{2})?\s*(am|pm)?/i

/**
 * Parse a `best_time` string, or return null.
 *
 * REFUSES rather than approximates. A word like "evening" or "after work"
 * carries a real intention and no specific time, and inventing one would be
 * presenting a guess with the plan's authority.
 */
export function parseBestTime(raw: unknown): ClockTime | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (text === '') return null
  const m = CLOCK.exec(text)
  if (!m) return null

  let hour = Number(m[1])
  const minute = m[2] === undefined ? 0 : Number(m[2])
  const meridiem = m[3]?.toLowerCase()

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (minute < 0 || minute > 59) return null

  if (meridiem === 'am') {
    if (hour < 1 || hour > 12) return null
    if (hour === 12) hour = 0 // 12am is midnight
  } else if (meridiem === 'pm') {
    if (hour < 1 || hour > 12) return null
    if (hour !== 12) hour += 12 // 12pm is noon
  } else if (hour < 0 || hour > 23) {
    // A bare number with no am/pm is a 24-hour clock. "25:00" is not a time,
    // and clamping it to 23:00 would invent one.
    return null
  }

  return { hour, minute }
}

/** `HH:MM`, the value an `<input type="time">` takes. */
export function toTimeInputValue(t: ClockTime): string {
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}

/**
 * The next occurrence of a clock time, at or after `from`.
 *
 * Scheduling into the past is never what the creator meant: a plan suggesting
 * 5pm, opened at 8pm, means tomorrow at 5pm. Returns a LOCAL date because the
 * creator is choosing a wall-clock time in their own day; the caller converts
 * once, at the point of saving.
 *
 * `from` is passed in rather than read from the clock so this stays pure and
 * testable — a function whose output depends on when the test runs is a
 * function that fails at midnight.
 */
export function nextOccurrence(t: ClockTime, from: Date): Date {
  const candidate = new Date(from)
  candidate.setHours(t.hour, t.minute, 0, 0)
  if (candidate.getTime() <= from.getTime()) candidate.setDate(candidate.getDate() + 1)
  return candidate
}

/** `YYYY-MM-DD` in LOCAL time, the value a `<input type="date">` takes.
 *  Deliberately not `toISOString().slice(0,10)`, which is UTC and lands on the
 *  wrong day for anyone west of Greenwich after their afternoon. */
export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
