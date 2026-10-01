// WHERE EACH LINE CAME FROM (fact-scoping part 3). Reads `line_sources` and
// `guardrail_report` off the blueprint; shows nothing for scripts made before
// either existed.
import type { TracedLine, GuardRemoval } from '@twinai/shared'

const KIND_LABEL: Record<string, string> = {
  fact: 'From what Twin knows about you',
  her_words: 'Your words',
  product: 'Product',
  brand: 'Brand',
}

export function LineSources({ blueprint }: { blueprint: unknown }) {
  const bp = (blueprint ?? {}) as { line_sources?: unknown; guardrail_report?: unknown }
  const lines = Array.isArray(bp.line_sources) ? bp.line_sources as TracedLine[] : []
  const removed = Array.isArray(bp.guardrail_report) ? bp.guardrail_report as GuardRemoval[] : []
  if (!lines.length && !removed.length) return null
  const unsourced = lines.filter((l) => !l.from?.length).length
  const methodCut = removed.filter((r) => (r as { reason?: string }).reason === 'invented_method').length
  const figureCut = removed.filter((r) => (r as { reason?: string }).reason === 'unbacked_figure').length
  const roleCut = removed.filter((r) => (r as { reason?: string }).reason === 'unbacked_identity').length
  const privateCut = removed.length - methodCut - figureCut - roleCut
  return (
    <details className="rounded-xl border border-white/10 bg-ink2/40 p-3 text-xs text-sand" data-testid="line-sources">
      <summary className="cursor-pointer font-semibold text-cream">
        Where each line came from
        {unsourced > 0 && <span className="ml-2 font-normal text-amber">{unsourced} in Twin's own wording</span>}
      </summary>
      <ol className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <li key={i}>
            <p className="text-cream">“{l.sentence}”</p>
            <p className={l.from?.length ? 'text-stone' : 'text-amber'}>
              {l.from?.length
                ? l.from.map((f) => `${KIND_LABEL[f.kind] ?? f.kind}: ${f.label}`).join(' · ')
                : "Twin's own wording — not from anything you gave it. Check it before you record."}
            </p>
          </li>
        ))}
      </ol>
      {privateCut > 0 && (
        <p className="mt-3 text-stone" data-testid="guard-removed">
          Twin removed {privateCut === 1 ? 'one sentence' : `${privateCut} sentences`} before showing you this script because {privateCut === 1 ? 'it' : 'they'} used something private or something you left out.
        </p>
      )}
      {figureCut > 0 && (
        <p className="mt-2 text-stone" data-testid="figure-removed">
          Twin removed {figureCut === 1 ? 'one sentence' : `${figureCut} sentences`} with a number nothing you gave it states. Add the real number to your facts to use it.
        </p>
      )}
      {roleCut > 0 && (
        <p className="mt-2 text-stone" data-testid="role-removed">
          Twin removed {roleCut === 1 ? 'one sentence' : `${roleCut} sentences`} that said you run or own something you never told it you do. Tell Twin in your idea if it is true.
        </p>
      )}
      {methodCut > 0 && (
        <p className="mt-2 text-stone" data-testid="method-removed">
          Twin also removed {methodCut === 1 ? 'one step' : `${methodCut} steps`} that gave an exact method, amount or technique you never gave it. Add the real detail in your idea to include {methodCut === 1 ? 'it' : 'them'}.
        </p>
      )}
    </details>
  )
}
