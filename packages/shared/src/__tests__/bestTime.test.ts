// The rule: an unparseable time returns NULL, never a plausible default.
//
// "evening" is not 6pm. Defaulting it would put a specific time in front of the
// creator that nothing chose, wearing the plan's authority.
import { describe, expect, it } from 'vitest'
import {
  nextOccurrence, parseBestTime, toDateInputValue, toTimeInputValue,
} from '../bestTime'

describe('the forms the model actually writes', () => {
  it.each([
    ['5:00 PM', 17, 0],
    ['5 PM', 17, 0],
    ['5pm', 17, 0],
    ['17:00', 17, 0],
    ['9:30 AM', 9, 30],
    ['09:30', 9, 30],
    ['17.30', 17, 30],
    ['  6:45 pm  ', 18, 45],
  ])('%s → %i:%i', (raw, hour, minute) => {
    expect(parseBestTime(raw)).toEqual({ hour, minute })
  })

  it('handles the two clock times everyone gets wrong', () => {
    expect(parseBestTime('12:00 AM')).toEqual({ hour: 0, minute: 0 })  // midnight
    expect(parseBestTime('12:00 PM')).toEqual({ hour: 12, minute: 0 }) // noon
  })
})

describe('what it refuses', () => {
  it.each([
    'evening', 'after work', 'whenever your audience is online', '', '   ',
  ])('%s is not a time, so it is null', (raw) => {
    expect(parseBestTime(raw)).toBeNull()
  })

  it('a non-string is null rather than coerced', () => {
    expect(parseBestTime(null)).toBeNull()
    expect(parseBestTime(undefined)).toBeNull()
    expect(parseBestTime(17)).toBeNull()
  })

  it('an impossible clock time is refused, not clamped', () => {
    // Clamping 25:00 to 23:00 would invent a time nothing chose.
    expect(parseBestTime('25:00')).toBeNull()
    expect(parseBestTime('13:00 PM')).toBeNull()
    expect(parseBestTime('0:00 AM')).toBeNull()
    expect(parseBestTime('10:75')).toBeNull()
  })
})

describe('the next occurrence is never in the past', () => {
  it('later today, when the time has not passed', () => {
    const from = new Date(2026, 7, 5, 9, 0, 0)
    const at = nextOccurrence({ hour: 17, minute: 0 }, from)
    expect(toDateInputValue(at)).toBe('2026-08-05')
    expect(at.getHours()).toBe(17)
  })

  it('tomorrow, when it has', () => {
    // A plan suggesting 5pm, opened at 8pm, means tomorrow at 5pm. Scheduling
    // into the past is never what the creator meant.
    const from = new Date(2026, 7, 5, 20, 0, 0)
    expect(toDateInputValue(nextOccurrence({ hour: 17, minute: 0 }, from))).toBe('2026-08-06')
  })

  it('tomorrow, when it is exactly now — a post scheduled for this instant is late', () => {
    const from = new Date(2026, 7, 5, 17, 0, 0)
    expect(toDateInputValue(nextOccurrence({ hour: 17, minute: 0 }, from))).toBe('2026-08-06')
  })

  it('rolls the month over', () => {
    const from = new Date(2026, 7, 31, 20, 0, 0)
    expect(toDateInputValue(nextOccurrence({ hour: 9, minute: 0 }, from))).toBe('2026-09-01')
  })
})

describe('input values are LOCAL, not UTC', () => {
  it('formats a date as the creator sees their own day', () => {
    // toISOString().slice(0,10) is UTC and lands on the wrong day for anyone
    // west of Greenwich after their afternoon.
    expect(toDateInputValue(new Date(2026, 0, 9, 23, 30))).toBe('2026-01-09')
  })

  it('pads the clock', () => {
    expect(toTimeInputValue({ hour: 9, minute: 5 })).toBe('09:05')
    expect(toTimeInputValue({ hour: 17, minute: 0 })).toBe('17:00')
  })
})
