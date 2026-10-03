/**
 * THE ARC IS NOT ONE FIXED SHAPE (owner master blueprint, 2026-10-03, Part 1).
 *
 * Earn the hook, lean into what makes the video worth watching (a real
 * opinion, story or piece of value), and only then let the product arrive as
 * the earned answer. HOW LONG the lean-in lasts and HOW the product enters is
 * set by what the video is for. The script batch found the opposite: a flat
 * statement-then-pitch shape whatever the objective.
 *
 * ⚖️ ONE DECISION, MADE ONCE, EARLY. The objective and the angle she picked set
 * the row; the writer, the shot list and the checks read the same row — the
 * shape is never re-decided inside the writer.
 *
 * Deno and worker copies are GENERATED (scripts/ci/generate_shared_pilot_core.mjs); no imports.
 */

export type ArcRow = 'sell' | 'entertain' | 'answer' | 'story' | 'teach'

export interface Arc {
  row: ArcRow
  /** How much of the video comes before the product enters. */
  leanIn: 'short' | 'medium' | 'long'
  /** The share of spoken beats before the product's first mention, at least / at most. */
  productFirstAtLeast: number
  productFirstAtMost: number
  /** Whether the product may be absent entirely. */
  productOptional: boolean
  /** How the product enters, said to the writer. */
  entry: string
  /** Shot weight: what most beats are, and how many beats show the product. */
  shots: string
}

const ROWS: Record<ArcRow, Arc> = {
  sell: {
    row: 'sell', leanIn: 'short', productFirstAtLeast: 0, productFirstAtMost: 0.4, productOptional: false,
    entry: 'Short lean-in: one real, specific detail (a moment, a problem, a result), then the product is clearly the point — what it is, why it is different, the next step.',
    shots: 'One short lean-in beat; then a deliberate reveal/demonstration beat that shows the product; talking beats for the rest; a clear close.',
  },
  entertain: {
    row: 'entertain', leanIn: 'long', productFirstAtLeast: 0.6, productFirstAtMost: 1, productOptional: true,
    entry: 'Long lean-in: the story, the joke or the moment IS the video. The product is a light touch near the end, almost incidental, or absent. Never pitch.',
    shots: 'Most beats are the story/moment on camera; at most one brief, incidental product moment; no demonstration beat.',
  },
  answer: {
    row: 'answer', leanIn: 'short', productFirstAtLeast: 0, productFirstAtMost: 1, productOptional: true,
    entry: 'Short lean-in: the exact question, answered straight away. The product enters only if the question was about it.',
    shots: 'Mostly talking beats delivering the answer; a product or screen beat only where the answer is about it.',
  },
  story: {
    row: 'story', leanIn: 'long', productFirstAtLeast: 0.5, productFirstAtMost: 1, productOptional: false,
    entry: 'Long lean-in: the story is the point — the moment, what was missing, what she decided. The product arrives as the RESULT of the story, never pitched separately.',
    shots: 'Most beats are her telling the story to camera; the product appears once, at the result.',
  },
  teach: {
    row: 'teach', leanIn: 'medium', productFirstAtLeast: 0.2, productFirstAtMost: 0.8, productOptional: true,
    entry: 'Medium lean-in: deliver the lesson. The product appears as the tool she uses, not the subject of the video.',
    shots: 'Talking and demonstration beats for the steps; the product shown in use as the tool, not presented.',
  },
}

const ROW_OF_GOAL: Record<string, ArcRow> = {
  sell: 'sell', leads: 'sell', launch: 'sell',
  entertain: 'entertain', followers: 'entertain',
  conversations: 'answer',
  personal_brand: 'story',
  educate: 'teach', authority: 'teach',
}

// The angle she picked is the same decision made more specifically: a story
// angle is the story row whatever the objective, a question angle the answer row.
const ROW_OF_ANGLE: Partial<Record<string, ArcRow>> = {
  feeling_story: 'story',
  problem_question: 'answer',
  teach_list: 'teach',
}

export function arcFor(goal: unknown, angleKind?: unknown): Arc {
  const byAngle = ROW_OF_ANGLE[String(angleKind ?? '')]
  const byGoal = ROW_OF_GOAL[String(goal ?? '')]
  // Selling stays selling: a story angle on a sell video tells the story, but
  // the product is still clearly the point by the end.
  if (byGoal === 'sell' && byAngle === 'story') return { ...ROWS.story, productOptional: false, productFirstAtMost: 0.75 }
  return ROWS[byAngle ?? byGoal ?? 'teach']
}

/** The instruction the writer reads. */
export function arcPrompt(arc: Arc, hasProduct: boolean): string {
  return [
    `THE SHAPE OF THIS VIDEO (${arc.row}, ${arc.leanIn} lean-in) — earn the hook first, then lean into what makes it worth watching before anything is sold.`,
    hasProduct ? arc.entry : 'No product is attached: lean into the story, opinion or value for the whole video.',
    // part-1d: the product was named in the hook of every entertain and teach script.
    hasProduct && arc.leanIn !== 'short'
      ? `The hook and the next beat do NOT name the product; it first appears in the back ${arc.leanIn === 'long' ? 'half' : 'two thirds'} of the video.`
      : '',
    hasProduct ? `Shots: ${arc.shots}` : '',
  ].filter(Boolean).join('\n')
}

/**
 * Does the finished script follow its row? `productWords` are the product's
 * distinctive name words. Returns where the product first appears as a share
 * of spoken beats (null = never) and whether that fits the row.
 */
export function arcCheck(
  lines: ReadonlyArray<string>,
  productWords: ReadonlyArray<string>,
  arc: Arc,
): { firstAt: number | null; fits: boolean; reason: string | null } {
  const words = productWords.map((w) => w.toLowerCase()).filter((w) => w.length >= 4)
  const spoken = lines.filter((l) => l.trim() !== '')
  if (!words.length || !spoken.length) return { firstAt: null, fits: true, reason: null }
  const i = spoken.findIndex((l) => words.some((w) => l.toLowerCase().includes(w)))
  if (i < 0) return { firstAt: null, fits: arc.productOptional, reason: arc.productOptional ? null : 'product_never_named' }
  const firstAt = spoken.length > 1 ? i / (spoken.length - 1) : 0
  if (firstAt < arc.productFirstAtLeast) return { firstAt, fits: false, reason: 'product_too_early' }
  if (firstAt > arc.productFirstAtMost) return { firstAt, fits: false, reason: 'product_too_late' }
  return { firstAt, fits: true, reason: null }
}
