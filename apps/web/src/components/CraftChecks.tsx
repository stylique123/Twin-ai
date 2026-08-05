// §7c's craft checks, shown.
//
// "These are stated as CHECKS WITH REASONS, never as scores." So this renders
// one line per check with its sentence, and nothing anywhere aggregates them
// into a number. The summary counts what was examined; it does not grade it.
//
// THE `not_checked` LINES ARE SHOWN, NOT HIDDEN. That is the whole reason the
// checker returns all seven: a report that quietly dropped the unmeasurable
// ones would let a clean list imply everything had been looked at. One of them
// — "ends on a reason to act" — can never be checked, because it is a claim
// about meaning and nothing in this pipeline measures meaning. It appears every
// time, saying so.
import { useEffect, useState } from 'react'
import { Check, CircleDashed, Loader2, TriangleAlert } from 'lucide-react'
import {
  craftFactsFromPlan, getEditEvents, getEditPlanDocument, runCraftChecks,
  summarizeCraftChecks, type CraftCheck,
} from '../lib/api'

export function CraftChecks({ projectId }: { projectId: string }) {
  const [checks, setChecks] = useState<CraftCheck[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [plan, events] = await Promise.all([
          getEditPlanDocument(projectId),
          getEditEvents(projectId),
        ])
        if (!alive) return
        // A project with no plan yields seven `not_checked` lines, which is the
        // honest answer to "how is this video doing?" before it exists — so it
        // is rendered rather than special-cased into an empty state.
        setChecks(runCraftChecks(craftFactsFromPlan(plan, events)))
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => { alive = false }
  }, [projectId])

  if (failed) return null
  if (!checks) {
    return (
      <div className="flex items-center gap-2 text-xs text-stone">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your video…
      </div>
    )
  }

  return (
    <div className="rounded-card border border-white/8 bg-white/[0.02] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-sand/70">
        What we checked
      </p>
      <p className="mt-1 text-xs text-stone">{summarizeCraftChecks(checks)}</p>
      <ul className="mt-3 space-y-2">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">
              {c.status === 'pass' && <Check className="h-3.5 w-3.5 text-teal" />}
              {c.status === 'attention' && <TriangleAlert className="h-3.5 w-3.5 text-amber" />}
              {/* Deliberately the quietest of the three. `not_checked` is not a
                  problem to fix — it is a thing we did not measure, and styling
                  it like a warning would invite the creator to try to "fix" it. */}
              {c.status === 'not_checked' && <CircleDashed className="h-3.5 w-3.5 text-stone/50" />}
            </span>
            <span className={`text-xs leading-relaxed ${
              c.status === 'not_checked' ? 'text-stone/70' : 'text-sand'
            }`}>
              {c.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
