import { describe, it, expect } from 'vitest'
import { syncRetentionMapToScript } from '../retentionMapSync.js'

/**
 * ⚠️ REFERENCE RUN 3 RENDERED `Hook → Re-hook → Setup`, AND "SETUP" HELD THE CTA.
 *
 * The panel was not lying about the script — it was quoting it. The writer had
 * named the last beat "Setup" and the resync copied that name faithfully. What
 * nobody checked was whether the name could be true at that position.
 *
 * ⚖️ THE PANEL'S TWO HALVES MUST AGREE. The goal line under the label was
 * already synthesized from position ("Land the ask this video was building
 * toward.") — so before this change the panel contradicted ITSELF: a beat
 * labelled Setup whose stated job was to land the ask. Both now read one string.
 */

const beat = (section: string, line = 'x') => ({ section, line })

describe('the label said Setup and the beat was the ask', () => {
  it('overrules an opening name at the closing position', () => {
    const rows = syncRetentionMapToScript([], [
      beat('Hook'), beat('Re-hook'), beat('Setup'),
    ]).retentionMap
    expect(rows.map((r) => r.beat)).toEqual(['Hook', 'Re-hook', 'Close'])
  })

  it('leaves a setup that is genuinely a setup alone', () => {
    // ⚠️ THE RULE IS ABOUT CONTRADICTION, NOT ABOUT THE WORD. A middle beat
    // named "Setup" is a real setup; renaming it would be a second defect.
    const rows = syncRetentionMapToScript([], [
      beat('Hook'), beat('Setup'), beat('Payoff'), beat('CTA'),
    ]).retentionMap
    expect(rows.map((r) => r.beat)).toEqual(['Hook', 'Setup', 'Payoff', 'CTA'])
  })

  it('a video has one hook, and the word for the second one already exists', () => {
    const rows = syncRetentionMapToScript([], [
      beat('Hook'), beat('Hook'), beat('CTA'),
    ]).retentionMap
    expect(rows.map((r) => r.beat)).toEqual(['Hook', 'Re-hook', 'CTA'])
  })

  it('a re-hook is never mistaken for an opening, even last', () => {
    // It contains the word "hook" and it is at the closing position, so it
    // would trip both rules if they were spelled by substring alone.
    const rows = syncRetentionMapToScript([], [beat('Hook'), beat('Re-hook')]).retentionMap
    expect(rows.map((r) => r.beat)).toEqual(['Hook', 'Re-hook'])
  })

  it('a one-beat script keeps the name it was given', () => {
    // It is its own opening and its own close — there is no contradiction to detect.
    expect(syncRetentionMapToScript([], [beat('Setup')]).retentionMap[0]!.beat).toBe('Setup')
  })

  it('the label and the sentence under it describe the same beat', () => {
    // ⚖️ THE PROPERTY THE FIX EXISTS FOR. Before it, the last row read
    // "Setup" over "Land the ask this video was building toward."
    const rows = syncRetentionMapToScript([], [
      beat('Hook'), beat('Re-hook'), beat('Setup'),
    ]).retentionMap
    const last = rows[rows.length - 1]!
    expect(last.beat).toBe('Close')
    expect(last.goal).toBe('Land the ask this video was building toward.')

    // And a re-hook relabelled from a bare "Hook" gets the re-hook's own job,
    // not a generic middle line — because the goal reads the label.
    const middle = syncRetentionMapToScript([], [
      beat('Hook'), beat('Hook'), beat('CTA'),
    ]).retentionMap[1]!
    expect(middle.beat).toBe('Re-hook')
    expect(middle.goal).toBe('Reset attention for anyone who started drifting.')
  })

  it('an unnamed beat is still numbered, not blanked', () => {
    expect(syncRetentionMapToScript([], [beat(''), beat('CTA')]).retentionMap[0]!.beat).toBe('Beat 1')
  })
})
