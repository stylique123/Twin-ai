// THE GRAIN RULE — never smooth her own words (owner's addendum, 2026-09-26).
//
// ⚖️ THE FINDING: optimization strips the grain. Audiences for handmade and
// candid creators trust the rough edge — the wobble in the rim, "it was
// genuinely terrifying to hit publish" — and a writer that cleans that into
// "I was a bit nervous" removes the reason the content lands.
//
// ⚖️ WHAT IT DOES NOT CHANGE: this is about how she describes REAL things. It
// never licenses a messier-sounding detail that is not true; every
// fabrication rule still applies in full.

/** Tone words in her DNA that mean "the rough edge is the brand". */
const RAW_TONE = /\b(?:candid|raw|unfiltered|chaos|chaotic|messy|blunt|unpolished|honest|real|scrappy|imperfect|handmade|crafty|homemade)\b/i
/** Niches where the maker's friction is the product. */
const CRAFT_NICHE = /\b(?:ceramic|pottery|clay|handmade|craft|maker|artisan|candle|leather|woodwork|knit|sew|embroider|jewel|bak|studio)/i

export function grainWeight(tone: string | null | undefined, niche: string | null | undefined): 'strong' | 'standard' {
  return RAW_TONE.test(tone ?? '') || CRAFT_NICHE.test(niche ?? '') ? 'strong' : 'standard'
}

export function renderGrainRule(tone: string | null | undefined, niche: string | null | undefined): string {
  const strong = grainWeight(tone, niche) === 'strong'
  return [
    '',
    '',
    `KEEP THE GRAIN${strong ? ' — THIS CREATOR\'S ROUGH EDGE IS THE BRAND, SO THIS RULE OUTRANKS POLISH' : ''}:`,
    '- Never smooth, upgrade or professionalize the creator\'s own phrasing. If she describes something as messy, uncertain, imperfect or emotionally raw, the script keeps that quality — it does not resolve it into something cleaner. A rough edge in her own words is not a flaw to fix.',
    '- When her own words are supplied (her note, answers, transcripts), reuse her exact emotionally specific phrases ("genuinely terrifying", "a total mess") instead of paraphrasing them into safer prose.',
    '- For physical direction, prefer the specific, slightly imperfect real action over the generic polished one — but only from what is real about her and this product (her studio, her hands, this object). Never invent a detail to make it sound messier.',
    strong
      ? '- For this creator, a line that sounds optimized or ad-like is a defect, even if it is true.'
      : '',
    '- This never loosens any fact rule: a rough, honest sentence and an invented one are different things.',
    strong ? renderGrainExamples() : '',
  ].filter((l) => l !== '').join('\n')
}

// ── THE QUALITY BAR (addendum Part 5): two real Twin scripts, cold-read as
// "brilliant for physical makers". Shown for TEXTURE only. Every fact in them
// (shop, city, prices, counts, percentages) is replaced by a [bracket], so the
// writer cannot lift another creator's facts into this one.
export const GRAIN_EXAMPLES: ReadonlyArray<{ title: string; lines: readonly string[] }> = [
  {
    title: 'the price raise',
    lines: [
      'I raised my prices [her percentage] and it was terrifying.',
      'Hovering the mouse over the publish button was genuinely terrifying, because every small maker fears that higher prices mean nobody will show up.',
      'I threw away an entire batch and stopped making that shape.',
    ],
  },
  {
    title: 'time, not clay',
    lines: [
      'My [one piece] costs more than my [other piece] and takes less time.',
      'And this is where the math clicks.',
      'Calculate hands-on bench minutes first and add material costs last.',
    ],
  },
]

export function renderGrainExamples(): string {
  return [
    'THE BAR TO HIT — two real maker scripts, for their TEXTURE only (plain first person, the fear left in, a concrete admission, no polish).',
    'Every [bracket] is a fact that belongs to someone else: never copy a fact, number, name, place or story from these — use only this creator\'s own.',
    ...GRAIN_EXAMPLES.map((e) => `• ${e.title}: ${e.lines.map((l) => `"${l}"`).join(' / ')}`),
  ].join('\n')
}

/** Emotionally raw or imperfect words — the ones a polishing writer drops. */
const RAW_WORD = /\b(?:terrif\w*|scar\w*|mess\w*|disaster|chaos|chaotic|ugly|wonky|wobbl\w*|crack\w*|burn\w*|cried|crying|panic\w*|embarrass\w*|awkward|broke|failed|failure|hated?|obsess\w*|genuinely|honestly|literally|nervous|anxious|exhausted|stubborn|imperfect|lopsided|lumpy)\b/i

/** Her own raw phrases (the raw word with up to two words either side). */
export function rawPhrases(text: string): string[] {
  const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const out = new Set<string>()
  words.forEach((w, i) => {
    if (!RAW_WORD.test(w)) return
    out.add(words.slice(Math.max(0, i - 2), i + 3).join(' ').replace(/[^\p{L}\p{N}' ]/gu, '').toLowerCase())
  })
  return [...out].filter((p) => p.length > 3).slice(0, 12)
}

/** How many of her raw words survived into the script. Measured, not enforced. */
export function grainKept(note: string, scriptLines: readonly string[]): { raw: number; kept: number } {
  const script = scriptLines.join(' ').toLowerCase()
  const raw = rawPhrases(note)
  const kept = raw.filter((p) => {
    const core = p.split(' ').find((w) => RAW_WORD.test(w))
    return !!core && script.includes(core)
  }).length
  return { raw: raw.length, kept }
}
