// THE COUNT THE VIDEO PROMISES, CHECKED BEFORE IT IS PROMISED OUT LOUD.
//
// §5d. A reference that enumerated FIVE produced one plan carrying three
// different counts, none of them five — and a script that said "the first way",
// "the second way", then went silent and stopped. The creator walks on camera,
// promises three, delivers two, and the person who notices is the viewer, who
// was counting.
//
// ── WHY THIS IS THE ONE THE CREATOR CANNOT HIDE ──────────────────────────
//
// Every other defect on the plan screen is recoverable in the edit or simply
// reads as weak. A broken count breaks OUT LOUD: the promise is in the hook, the
// audience is tracking it, and the failure happens in the creator's own mouth.
// That is why it is surfaced beside the unfilled-container warning rather than
// filed somewhere quieter.
//
// ── SHOWS, DOES NOT BLOCK — the same argument `UnfilledContainers` makes ──
//
// The literal fix would be to refuse the record button. That strands a creator
// at the camera over a number, and stranding someone at the camera is the
// failure Phase 11 exists to prevent. It is shown HERE, on the plan screen,
// beside the editor that can fix it in one edit. The gap is named, the fix is a
// line away, and the creator decides.
//
// ── AND IT NEVER REPAIRS ─────────────────────────────────────────────────
//
// Deleting a beat to make the numbers agree would silently ship a shorter video
// than the creator was promised. Rewriting the hook would put this component in
// the writing business, which §3's ownership matrix exists to prevent. It
// reports the discrepancy and names which artifact carries it.
import { useMemo } from 'react'
import { TriangleAlert } from 'lucide-react'
import { blueprintCountIssues, breaksOnCamera } from '../lib/api'
import type { Blueprint } from '../lib/types'

/** Where the creator should go to fix each kind of fault. The issue's `detail`
 *  says what is wrong; this says what to do about it, which is the half a person
 *  standing on a plan screen actually needs. */
const FIX: Record<string, string> = {
  hook_drops_count: 'Put the number in the hook — that is where the promise is made.',
  count_disagreement: 'Make the idea and the hook agree on one number.',
  undelivered_count: 'Add the missing items, or lower the number the hook promises.',
  silent_scene_in_enumeration: 'Give that beat a line, or move it after the last item.',
}

export function CountPromise({ blueprint }: { blueprint: Blueprint }) {
  const issues = useMemo(() => {
    try {
      return blueprintCountIssues(blueprint as Parameters<typeof blueprintCountIssues>[0])
    } catch {
      // A malformed blueprint must not take the plan screen down. Reporting
      // nothing is the safe direction — a missing warning beats a crashed page,
      // and the same rule `UnfilledContainers` follows one card up.
      return []
    }
  }, [blueprint])

  // SILENT FOR EVERY UNENUMERATED REFERENCE, which is most of them, and silent
  // for every blueprint generated before the mechanism was extracted. An absent
  // mechanism means "we never measured it", never "this reference does not
  // enumerate", and neither may produce a complaint.
  if (issues.length === 0) return null

  const onCamera = breaksOnCamera(issues)
  return (
    <div
      className={
        onCamera
          ? 'rounded-card border border-coral/30 bg-coral/[0.06] p-4'
          : 'rounded-card border border-amber/25 bg-amber/[0.05] p-4'
      }
    >
      <div className="flex items-start gap-2">
        <TriangleAlert
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${onCamera ? 'text-coral' : 'text-amber'}`}
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-cream">
            {onCamera
              // Named as what it costs, not as what it is. "Count mismatch" is a
              // developer's sentence; this is the creator's.
              ? 'This video promises a number it does not deliver'
              : 'The count is not carried all the way through'}
          </p>
          <ul className="mt-2 space-y-1.5">
            {issues.map((issue, i) => (
              <li key={`${issue.code}-${i}`} className="text-[11px] leading-relaxed text-sand">
                {issue.detail}
                {FIX[issue.code] && (
                  <span className="block text-stone">{FIX[issue.code]}</span>
                )}
              </li>
            ))}
          </ul>
          {onCamera && (
            <p className="mt-2 text-[11px] leading-relaxed text-stone">
              An enumerated list is the format, not a detail of it. A video that
              announces a count and abandons it breaks in front of the audience —
              they are the ones counting.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
