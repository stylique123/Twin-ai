// THE WRITER IS HANDED A LIST OF FACTS AND ASKED FOR AN ARGUMENT.
//
// ── WHAT THE WRITER ACTUALLY RECEIVES TODAY ───────────────────────────────
//
// Ten knowledge items, ranked by relevance, each a standalone sentence:
//
//     (claim) Has run her fashion business for seven years with zero marketing spend
//     (experience) Sold a black Birkin bag for £13,500 in roughly 40 seconds
//     (opinion) Believes the secret to viral marketing is to avoid being boring
//
// ⚠️ THAT IS AN INVENTORY, NOT A POINT. The scripts it produces are accurate and
// shaped like inventories: each beat states one item, confidently, and the video
// never argues anything. Reading them is the only way this was ever visible —
// grounding is 73% and generic beats 8%, both good, and the result is still a
// list of true sentences in a row.
//
// ── WHY A PACKET RATHER THAN A BETTER PROMPT ──────────────────────────────
//
// ⚖️ EVERY MEASURED IMPROVEMENT THIS WEEK CAME FROM CHANGING WHAT REACHES THE
// WRITER; every prompt instruction measured came back inert. A beat-plan rule
// naming the top defect and quoting its own 67% rate changed the outcome by
// exactly zero scripts and zero pairs. So this is not another instruction. It
// changes the OBJECT the writer is given: from ten facts to one argument built
// out of them.
//
// ⚠️ AND IT IS A SEPARATE DECISION STEP, WHICH IS THE POINT. Choosing which fact
// is the insight, which distinction is non-obvious, and what the payoff resolves
// to is a different job from writing a sentence somebody can say out loud.
// Asking one call to do both is what produces prose that is fluent and
// pointless.
//
// ── WHAT THIS MODULE IS AND IS NOT ────────────────────────────────────────
//
// It is the SHAPE and the CONTRACT. It does not call a model — the caller does
// that, because the edge and the harness reach Gemini differently and the shape
// is the part that must not drift between them.

/** The argument a script is built from, assembled BEFORE any prose exists. */
export interface SubstancePacket {
  /** The one thing this video says. Not the topic — the assertion. */
  coreInsight: string
  /** What most people in this niche believe instead, or miss. Empty when the
   *  creator's material genuinely does not support a contrast. */
  nonObviousDistinction: string
  /** A specific case: named, dated, numbered, or done by the creator. */
  concreteExample: string
  /** A detail that proves first-hand knowledge — a figure, a mechanism, a cost. */
  usefulDetail: string
  /** Where the creator stands, in their own terms. */
  creatorPov: string
  /** What the viewer can do or decide differently, once convinced. */
  payoff: string
  /** ⚠️ WHICH SUPPLIED ITEMS THIS WAS BUILT FROM. Without this the packet is a
   *  fluent paragraph of unknown origin, and the entailment and leak checks
   *  downstream have nothing to check it against. A packet that cites nothing
   *  is a packet the model wrote from its own general knowledge. */
  builtFrom: string[]
}

export const PACKET_FIELDS = [
  'coreInsight', 'nonObviousDistinction', 'concreteExample',
  'usefulDetail', 'creatorPov', 'payoff',
] as const

/** How complete a packet is, so an empty one is visible rather than inferred.
 *
 *  ⚖️ EMPTY FIELDS ARE LEGAL AND MUST BE COUNTED. A creator whose material has
 *  no concrete example genuinely has none, and inventing one is the failure this
 *  whole layer exists to prevent. What must never happen is that absence going
 *  unrecorded — the same three-state discipline the rest of the system uses. */
export function packetShape(p: SubstancePacket | null | undefined): {
  filled: number; of: number; empty: string[]; cites: number; usable: boolean
} {
  const empty = PACKET_FIELDS.filter((f) => String(p?.[f] ?? '').trim() === '')
  const filled = PACKET_FIELDS.length - empty.length
  return {
    filled,
    of: PACKET_FIELDS.length,
    empty: [...empty],
    cites: Array.isArray(p?.builtFrom) ? p.builtFrom.length : 0,
    // ⚠️ A PACKET WITH AN INSIGHT AND NOTHING ELSE IS A HEADLINE. Three of six,
    // one of which must be the insight, is the floor at which a script has an
    // argument rather than an opening line.
    usable: filled >= 3 && String(p?.coreInsight ?? '').trim() !== '',
  }
}

/** The instruction that builds a packet from what the creator actually has.
 *
 *  ⚠️ IT IS FORBIDDEN FROM ADDING ANYTHING. The packet's whole value is that it
 *  is an argument assembled from supplied material; a packet that invents its own
 *  example has moved the invention one step earlier and made it harder to see. */
export const PACKET_SYSTEM = `You are deciding what a short video will ARGUE, before anybody writes it.

You are given everything known about a creator, and the shape of the video they
want to make. Build the argument. Do not write the script.

Return these fields:
- coreInsight: the one thing this video asserts. Not the topic. A claim someone could disagree with.
- nonObviousDistinction: what most people in this niche believe instead, or the distinction they miss. Empty string if the material does not support one.
- concreteExample: one specific case from the supplied material — named, numbered, or something the creator did.
- usefulDetail: a detail that proves first-hand knowledge. A figure, a mechanism, a cost, a duration.
- creatorPov: where this creator stands, in their own terms.
- payoff: what the viewer does or decides differently once convinced.
- builtFrom: the exact supplied items you used, quoted well enough to find them.

RULES
- Use ONLY the supplied material. Do not add a fact, a figure, an example or an outcome that is not there.
- If the material cannot fill a field, return an empty string for it. An empty field is a true answer; an invented one is not.
- Prefer what the creator SAID over what they merely covered. A position beats a topic.
- The insight must be specific enough that a different creator in the same niche could not have said it.`

/** What to hand the packet builder. Deliberately narrow: this step decides the
 *  argument and has no business seeing the whole database. */
export function packetPrompt(
  handle: string,
  videoShape: string,
  supplied: readonly { kind: string; text: string }[],
): string {
  return `CREATOR: @${handle}
THE VIDEO THEY WANT TO MAKE: ${videoShape}

EVERYTHING KNOWN ABOUT THIS CREATOR:
${supplied.map((k, i) => `${i + 1}. (${k.kind}) ${k.text}`).join('\n')}

Build the argument.`
}

/** Render a packet for the writer.
 *
 *  ⚖️ EMPTY FIELDS ARE OMITTED RATHER THAN SHOWN BLANK. A labelled empty line
 *  reads as a slot to fill, and the writer fills it — which is precisely how an
 *  unresolved container comes back invented. */
export function packetPromptLine(p: SubstancePacket | null | undefined): string {
  if (!p) return ''
  const rows: string[] = []
  const add = (label: string, v: unknown) => {
    const s = String(v ?? '').trim()
    if (s !== '') rows.push(`${label}: ${s}`)
  }
  add('THE ONE THING THIS VIDEO SAYS', p.coreInsight)
  add('WHAT MOST PEOPLE GET WRONG', p.nonObviousDistinction)
  add('THE SPECIFIC CASE', p.concreteExample)
  add('THE DETAIL THAT PROVES IT', p.usefulDetail)
  add('WHERE THIS CREATOR STANDS', p.creatorPov)
  add('WHAT THE VIEWER DOES NOW', p.payoff)
  if (!rows.length) return ''
  return `\nTHE ARGUMENT THIS SCRIPT MAKES — every section must earn its place by\n`
    + `carrying part of it. A section that carries none of it should not exist.\n`
    + rows.map((r) => `- ${r}`).join('\n')
}
