// SCHEDULE FROM THE PLAN — Phase 12a, "the user's job ends at posted".
//
// The plan screen showed `best time: 5:00 PM` as dead text: a suggestion with
// nothing to act on, next to a "Mark as posted" button that only works after
// the fact. Scheduling already existed — `schedulePost`, the calendar, the
// publish_due cron — and the plan screen was simply not wired to it.
//
// ── THE PREFILL IS A SUGGESTION AND SAYS SO ──────────────────────────────
//
// `best_time` is a model's claim about when to post, not a measurement of when
// this creator's audience is online — nothing in this system measures that. So
// it prefills a field the creator can change, the screen names where the time
// came from, and an unparseable one ("evening") prefills NOTHING rather than a
// plausible default that nothing actually chose.
//
// ── AND IT NEVER SCHEDULES INTO THE PAST ─────────────────────────────────
//
// A plan suggesting 5pm, opened at 8pm, means tomorrow at 5pm. `nextOccurrence`
// does that, and the field is still editable — this decides the prefill, not
// the post.
import { useMemo, useState } from 'react'
import { CalendarClock, Loader2, X } from 'lucide-react'
import {
  nextOccurrence, parseBestTime, schedulePost, toDateInputValue, toTimeInputValue,
} from '../lib/api'

interface Props {
  generationId: string
  platform: string
  caption: string
  /** The plan's suggestion, as written. Parsed for a prefill; never trusted as
   *  a decision, and never guessed at when it is prose. */
  bestTime: string
  onClose: () => void
  onScheduled: () => void
}

export function SchedulePostDialog({
  generationId, platform, caption, bestTime, onClose, onScheduled,
}: Props) {
  // `new Date()` once, at mount, so the prefill does not drift while the dialog
  // is open — and so "is it in the past?" is answered against one instant.
  const suggested = useMemo(() => {
    const clock = parseBestTime(bestTime)
    return clock ? nextOccurrence(clock, new Date()) : null
  }, [bestTime])

  const [date, setDate] = useState(
    suggested ? toDateInputValue(suggested) : toDateInputValue(new Date()),
  )
  // No suggestion means an EMPTY time field. A default like 18:00 would be a
  // specific time nothing chose, wearing the plan's authority.
  const [time, setTime] = useState(
    suggested ? toTimeInputValue({ hour: suggested.getHours(), minute: suggested.getMinutes() }) : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!date || !time) { setError('Pick a date and a time.'); return }
    const when = new Date(`${date}T${time}:00`)
    if (Number.isNaN(when.getTime())) { setError('That is not a valid date and time.'); return }
    // Checked at SAVE, not only at prefill: the creator can type a past time,
    // and a post scheduled for yesterday never fires.
    if (when.getTime() <= Date.now()) { setError('That time has already passed — pick a later one.'); return }
    setBusy(true); setError(null)
    try {
      await schedulePost({ generationId, platform, scheduledFor: when.toISOString(), caption })
      onScheduled()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not schedule that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Schedule for ${platform}`}
    >
      <div
        className="w-full max-w-sm rounded-card border border-white/10 bg-ink2 p-5 shadow-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold capitalize text-cream">Schedule for {platform}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-stone transition-colors hover:text-cream"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Where the prefill came from. A time that appears in a field with no
            explanation reads as a decision the product made. */}
        <p className="text-[11px] leading-relaxed text-stone">
          {suggested
            ? <>Prefilled from your plan’s suggested time ({bestTime}). It’s a suggestion, not a measurement — change it to whatever suits you.</>
            : <>Your plan suggests “{bestTime}”, which we couldn’t read as a clock time, so we haven’t filled one in.</>}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-stone">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setError(null) }}
              className="w-full rounded-xl border border-white/10 bg-ink/60 px-3 py-2 text-sm text-cream outline-none focus:border-teal"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-stone">Time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => { setTime(e.target.value); setError(null) }}
              className="w-full rounded-xl border border-white/10 bg-ink/60 px-3 py-2 text-sm text-cream outline-none focus:border-teal"
            />
          </label>
        </div>

        {error && <p className="mt-2 text-xs text-coral">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 py-2.5 text-sm font-semibold text-cream transition hover:bg-white/20 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          {busy ? 'Scheduling…' : 'Add to my calendar'}
        </button>

        {/* What scheduling actually does, stated plainly. For an unconnected
            platform this is a calendar entry with the caption ready, not an
            auto-post — claiming otherwise is how someone misses a launch. */}
        <p className="mt-2 text-[11px] leading-relaxed text-stone">
          This goes on your calendar with the caption ready. If you’ve connected
          {' '}{platform}, it posts automatically; if not, we’ll have it waiting for you.
        </p>
      </div>
    </div>
  )
}
