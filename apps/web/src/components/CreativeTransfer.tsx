// §1.1's trust screen, built the only way it is allowed to be built.
//
// *"A trust screen that fabricates is worse than no trust screen: it is the
// single thing that destroys the product the first time a user checks."*
//
// Every row here comes from `normalizeReferenceEvidence`, the same pure
// normalizer the server-side lineage uses — so the kinds on this screen and the
// kinds a Creative Transfer PLAN would be validated against cannot drift. There
// is no second opinion about what was observed.
//
// ── WHY IT READS THE BLUEPRINT AND NOT A PERSISTED PLAN ──────────────────
//
// `creative_transfer_plans` exists, with a contract, a semantic validator and a
// migration — and NOTHING WRITES TO IT. A page that required a plan would show
// an empty state to every creator, forever. The normalizer is pure over
// (structure, transcript), and `blueprint.reference_read` carries the structure
// half on every generation, so the rows are real today and will read a plan
// when one exists rather than waiting for it.
//
// ── WHAT IS DELIBERATELY MISSING FROM THE INPUT ──────────────────────────
//
// The client has the reference's platform and the model's reading of it. It
// does NOT have the transcript's duration, language or word timings — those
// live server-side — so the `measured` rows do not appear here. That is an
// absence, not a zero: the screen shows the rows it can back, and the nine
// never-looked-at rows appear regardless.
import { useMemo } from 'react'
import { Check, CircleDashed, Ruler, ScanLine } from 'lucide-react'
import {
  KIND_LABEL, normalizeReferenceEvidence, transferRows, transferSummary,
  type EvidenceKind, type TransferRow, readReferenceAnalysis, referenceDisclosure } from '../lib/api'
import type { Blueprint } from '../lib/types'

const KIND_STYLE: Record<EvidenceKind, { icon: typeof Check; tone: string; text: string }> = {
  observed: { icon: Check, tone: 'text-teal', text: 'text-sand' },
  measured: { icon: Ruler, tone: 'text-teal', text: 'text-sand' },
  // Visibly weaker than the two above, because it IS weaker: a model's reading
  // of a transcript is not an instrument reading, and styling them alike is how
  // the distinction stops being one.
  interpreted: { icon: ScanLine, tone: 'text-amber', text: 'text-sand' },
  // The quietest, and never styled as a problem. "We did not look at this" is
  // not a fault the creator can fix — §1.1's whole argument is that saying it
  // plainly earns more trust than a tick we cannot back.
  unknown: { icon: CircleDashed, tone: 'text-stone/50', text: 'text-stone/70' },
}

export function CreativeTransfer({ generationId, blueprint, referenceAnalysis }: {
  generationId: string
  blueprint: Blueprint
  /** REFERENCE-1: the raw `generations.reference_analysis`, read here rather
   *  than by the caller so every surface showing this card discloses the same
   *  thing. */
  referenceAnalysis?: unknown
}) {
  // WHETHER WE READ THE VIDEO AT ALL, said before anything we claim to have
  // taken from it.
  //
  // Both branches of `generate-blueprint` return a confident `reference_read`,
  // and the fallback is reached silently — ingest failure, an unsupported host,
  // a private post, a timeout. The creator sees an identical screen either way
  // and extends the trust earned by the real path to the inferred one.
  //
  // Only the fallback is disclosed. Badging the real case would turn the normal
  // outcome into a claim, and a screen covered in reassurance reads as one with
  // something to reassure about. `unknown` (pre-0110 rows) says nothing at all,
  // because "we do not know which path ran" is not a sentence a creator can use
  // and inventing "pattern" for it would slander a generation that was read
  // properly.
  const disclosure = referenceDisclosure(readReferenceAnalysis(referenceAnalysis))
  const rows = useMemo(() => {
    const rr = blueprint.reference_read
    const evidence = normalizeReferenceEvidence({
      referenceId: generationId,
      analysisId: generationId,
      structure: {
        format_label: rr?.format_label,
        why_it_works: rr?.why_it_works,
        // `retention_map` is already `{ beat, goal }` — the exact shape the
        // normalizer reads, so nothing is reshaped on the way in.
        beats: rr?.retention_map,
      },
      transcript: { platform: rr?.platform ?? null },
    })
    return transferRows(evidence)
  }, [generationId, blueprint])

  return (
    <div className="rounded-card border border-white/5 bg-ink2/85 p-6 shadow-glass backdrop-blur-md">
      <h2 className="font-heading text-xs font-semibold uppercase tracking-wide text-stone">
        What we took from the reference
      </h2>
      {disclosure && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber/20 bg-amber/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-sand">
          <ScanLine className="mt-0.5 h-3 w-3 shrink-0 text-amber" />
          {disclosure}
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-stone">{transferSummary(rows)}</p>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => <Row key={r.type} row={r} />)}
      </ul>
    </div>
  )
}

function Row({ row }: { row: TransferRow }) {
  const style = KIND_STYLE[row.kind]
  const Icon = style.icon
  return (
    <li className="flex items-start gap-3">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${style.tone}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-sm font-medium ${style.text}`}>{row.label}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.tone}`}>
            {KIND_LABEL[row.kind]}
          </span>
        </div>
        {row.value !== null && (
          <p className="mt-0.5 text-sm leading-relaxed text-cream">{String(row.value)}</p>
        )}
        {/* §1.1: every row carries its evidence. This line is that rule, and it
            is never conditional — a row without it is the fabricated row. */}
        <p className="mt-0.5 text-[11px] leading-relaxed text-stone">{row.source}</p>
      </div>
    </li>
  )
}
