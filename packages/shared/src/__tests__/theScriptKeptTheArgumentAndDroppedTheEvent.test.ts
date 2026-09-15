// THE SCRIPT KEPT THE ARGUMENT AND DROPPED THE EVENT.
//
// ⚠️ THE CREATOR'S OWN PARAGRAPH AND THE SCRIPT IT PRODUCED, verbatim from the
// leather session. His note held a moment — "a factory one splits and it's
// rubbish, mine comes back and I fix it" — and the script kept the argument
// while dropping the thing that happens. Scene 3 then asked him for the story
// it had discarded.
//
// ⚖️ THE FIXTURES ARE THE REAL TEXT, not invented sentences, because the
// distinction this module draws (an argument reusing an event's nouns) only
// shows up on writing that actually does it.
import { describe, expect, it } from 'vitest'
import {
  MAX_EVENT_CHARS, MIN_EVENT_CONTENT_WORDS, eventContentWords, eventRetention,
} from '../eventRetention'

const HIS_EVENT = "a factory one splits and it's rubbish, mine comes back and I fix it"

// The argument the script actually kept. It reuses "factory" and "repaired" —
// which is exactly why word overlap cannot prove the moment survived.
const ARGUMENT_ONLY = [
  'Most factory bindings are glued, and glue gives up.',
  'Mine can be opened, repaired and rebound again.',
  'That is the difference between a book you keep and one you replace.',
]

const EVENT_KEPT = [
  'A factory one splits down the spine and it is rubbish.',
  'Mine comes back to me and I fix it.',
]

describe('eventContentWords', () => {
  it('drops stopwords and keeps the substance', () => {
    const w = eventContentWords(HIS_EVENT)
    expect(w).toContain('factory')
    expect(w).toContain('splits')
    expect(w).toContain('rubbish')
    expect(w).not.toContain('and')
    expect(w).not.toContain('the')
  })

  it('de-duplicates', () => {
    expect(eventContentWords('factory factory factory')).toEqual(['factory'])
  })

  it('survives a non-string', () => {
    expect(eventContentWords(null)).toEqual([])
    expect(eventContentWords(42)).toEqual([])
  })
})

describe('eventRetention', () => {
  it('sees most of the event missing when only the argument survived', () => {
    const r = eventRetention(HIS_EVENT, ARGUMENT_ONLY)!
    expect(r).not.toBeNull()
    // The measured point: the argument reuses "factory", so the event is NOT
    // wholly absent — and that is precisely why a "kept" verdict is unsound.
    expect(r.whollyAbsent).toBe(false)
    expect(r.absent).toContain('splits')
    expect(r.absent).toContain('rubbish')
    expect(r.absent).toContain('comes')
    expect(r.absentWords).toBeGreaterThan(r.eventWords / 2)
  })

  it('sees the event present when the script actually keeps the moment', () => {
    const r = eventRetention(HIS_EVENT, EVENT_KEPT)!
    expect(r.whollyAbsent).toBe(false)
    // Every content word lands, so nothing is absent.
    expect(r.absentWords).toBe(0)
  })

  it('states wholly-absent only when EVERY content word is gone', () => {
    const r = eventRetention(HIS_EVENT, ['Consistency is the foundation of success.'])!
    expect(r.whollyAbsent).toBe(true)
    expect(r.absentWords).toBe(r.eventWords)
  })

  it('counts an inflection as present, which is the conservative direction', () => {
    // "splits" in the note, "splitting" in the script. Calling that absent
    // would inflate every absence count, and absence is the only firm verdict.
    const r = eventRetention('the spine splits open', ['The spine is splitting open.'])!
    expect(r.absentWords).toBe(0)
  })

  it('returns null when no event was named', () => {
    // Three different causes, one honest answer — a zero would read as "the
    // event survived intact".
    expect(eventRetention('', ARGUMENT_ONLY)).toBeNull()
    expect(eventRetention('   ', ARGUMENT_ONLY)).toBeNull()
    expect(eventRetention(null, ARGUMENT_ONLY)).toBeNull()
    expect(eventRetention(undefined, ARGUMENT_ONLY)).toBeNull()
  })

  it('returns null for a fragment too short to be a moment', () => {
    expect(MIN_EVENT_CONTENT_WORDS).toBe(3)
    expect(eventRetention('it splits', ARGUMENT_ONLY)).toBeNull()
  })

  it('returns null when the script has no lines at all', () => {
    expect(eventRetention(HIS_EVENT, [])).toBeNull()
    expect(eventRetention(HIS_EVENT, ['', null, '   ', undefined])).toBeNull()
  })

  it('records truncation rather than truncating silently', () => {
    const long = `${HIS_EVENT} ${'x'.repeat(MAX_EVENT_CHARS)}`
    const r = eventRetention(long, EVENT_KEPT)!
    expect(r.truncated).toBe(true)
    expect(r.event.length).toBe(MAX_EVENT_CHARS)
  })

  it('does not truncate an event that fits', () => {
    expect(eventRetention(HIS_EVENT, EVENT_KEPT)!.truncated).toBe(false)
  })

  it('never rejects anything — it returns a measurement or null', () => {
    const r = eventRetention(HIS_EVENT, ARGUMENT_ONLY)!
    expect(Object.keys(r).sort()).toEqual(
      ['absent', 'absentWords', 'event', 'eventWords', 'truncated', 'whollyAbsent'])
  })
})
