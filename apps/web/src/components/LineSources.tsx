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
      {removed.length > 0 && (
        <p className="mt-3 text-stone" data-testid="guard-removed">
          Twin removed {removed.length === 1 ? 'one sentence' : `${removed.length} sentences`} before showing you this script because {removed.length === 1 ? 'it' : 'they'} used something private or something you left out.
        </p>
      )}
    </details>
  )
}
