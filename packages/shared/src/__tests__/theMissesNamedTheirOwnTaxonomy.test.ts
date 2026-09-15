// THE FOUR SHAPES THE MISSES NAMED, AND THE RULE THAT NULL IS AN ANSWER.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14 BEFORE ANY SHAPE WAS INVENTED. Of 6,276
// gallery_items only 596 carry a caption_shape; 4,112 are `no_pattern_match`.
// Sampling THOSE: 1,811 have 3+ hashtag/handle marks, 1,451 are majority-tag by
// length, 1,003 are non-latin script, 491 are pipe/dash byline titles, leaving a
// 2,491 "clean residue" -- and a hand-read of 70 of that residue found ~54%
// still not a hook.
//
// ⚖️ SO NULL IS THE MAJORITY ANSWER AND MOST OF THIS FILE IS ABOUT SILENCE.
import { describe, expect, it } from 'vitest'
import { CAPTION_SHAPES } from '../corpus/captionShape'
import {
  ALL_CAPTION_SHAPES, MODEL_EVIDENCE_MAX, MODEL_ONLY_SHAPES, MODEL_SHAPE_VERSION,
  assessedModelShape, buildClassifyPrompt, firstClause, parseVerdictLine,
  worthAModelRead,
} from '../corpus/captionShapeModel'
import { applyReplies, planSql, split, tallyOf } from '../../../../scripts/classify-caption-shapes-model'

const AT = '2026-09-14T00:00:00.000Z'

describe('the first clause, not the caption', () => {
  it('cuts at the sentence end and drops the tag pile after it', () => {
    expect(firstClause('Most people are not missing information. Follow me #fyp #ai'))
      .toBe('Most people are not missing information')
  })

  it('cuts a YouTube byline at the dash rather than refusing the row', () => {
    // ⚠️ 491 ROWS ARE THIS SHAPE. "- Mia Nacamulli" is a credit, not a hook, and
    // the clause before it is a real one. Refusing these would discard a whole
    // class of genuine hooks; cutting keeps the hook and drops the credit.
    expect(firstClause('How the food you eat affects your brain - Mia Nacamulli'))
      .toBe('How the food you eat affects your brain')
    expect(firstClause("Hailey Bieber's Routine | Beauty Secrets | Vogue"))
      .toBe("Hailey Bieber's Routine")
  })

  it('strips tags BEFORE cutting, so a URL cannot end the clause', () => {
    // ⚠️ A URL CONTAINS DOTS. Cutting first would hand a model "https://example"
    // as a hook. This is the ordering bug the module comment names.
    expect(firstClause('See https://example.com/a for more. Real clause here'))
      .toBe('See for more')
  })

  it('keeps a trailing question mark, which is the strongest signal a caption has', () => {
    expect(firstClause('What would happen if you did not drink water?'))
      .toBe('What would happen if you did not drink water?')
  })

  it('returns empty for a caption that is nothing but tags', () => {
    expect(firstClause('#fy #fyp #mindset #creator #hustle')).toBe('')
    expect(firstClause(null)).toBe('')
    expect(firstClause(42)).toBe('')
  })
})

describe('the pre-filter spends only where it is certain', () => {
  it('refuses a CTA-only caption without paying for it', () => {
    const v = worthAModelRead('Check my profile for the full guide')
    expect(v.send).toBe(false)
    expect(v.send === false && v.reason).toBe('not_a_hook')
  })

  it('refuses a legal disclaimer', () => {
    const v = worthAModelRead('This video is for educational and awareness purposes only')
    expect(v.send === false && v.reason).toBe('not_a_hook')
  })

  it('tells "too short" from "not English", because folding them stores a false fact', () => {
    // ⚠️ THE PATTERN PATH ALREADY PAID FOR THIS. `isLikelyEnglish` folds "too
    // short to judge" into its false, which once recorded a 10-character
    // ENGLISH caption as `not_english` -- a false fact in the column whose whole
    // purpose is to be trustworthy.
    expect(worthAModelRead('How to win') ).toEqual({ send: false, reason: 'too_short' })
    const ru = worthAModelRead('Эта крутая бизнес идея взорвала продажи полностью')
    expect(ru.send === false && ru.reason).toBe('not_english')
  })

  it('⚠️ CANNOT detect latin-script non-English, and that is stated not hidden', () => {
    // ⚠️⚠️ `isLikelyEnglish` MEASURES SCRIPT, NOT LANGUAGE. It asks what share of
    // letters are [a-z], so German, Polish and Indonesian sail through: "Das
    // wird dir jeder gesunde Mensch bestätigen" is 42 of 43 latin characters.
    // My own sample of the clean residue found exactly this -- rows the
    // `not_english` gate missed -- and the first version of the test above
    // asserted the gate caught them. THE TEST WAS WRONG, NOT THE CODE.
    //
    // ⚖️ SO THESE ROWS DO REACH THE MODEL, and that is the third reason `none`
    // must be free: a model handed a German clause and twelve English labels
    // must be able to decline rather than pick the nearest. Pinned here so the
    // limitation is a known property instead of a surprise in the yield.
    for (const foreign of [
      'Das wird dir jeder gesunde Mensch bestätigen',
      'Napisz na IG i powiem Ci jak zaczac dzisiaj',
      'Cara GAMPANG Bikin Video TikTok Affiliate Produk Fashion',
    ]) expect(worthAModelRead(foreign).send, foreign).toBe(true)
  })

  it('does NOT guess at a bare label, even though the sample is full of them', () => {
    // ⚠️⚠️ THE FILTER IS FOR CERTAINTY, NOT FOR SAVINGS. "Portugal beautiful
    // view" is not a hook, and a heuristic confident enough to say so would also
    // remove borderline REAL hooks from the model's view. If those skew toward
    // one shape, the yield that comes back is a biased sample presented as a
    // measurement -- the objection that put the `used` classifier on hold. The
    // model is asked, and may answer `model_found_no_shape`, which is RECORDED.
    for (const label of [
      'Portugal beautiful view of the coast',
      'Millionaire Lifestyle and cars',
      'Draw beautiful girl sketching',
    ]) expect(worthAModelRead(label).send, label).toBe(true)
  })

  it('sends a real clause, stripped of its tags', () => {
    const v = worthAModelRead('Most people are not missing information. #fyp #ai')
    expect(v.send).toBe(true)
    expect(v.send === true && v.clause).toBe('Most people are not missing information')
  })
})

describe('the taxonomy is four shapes, kept apart from the eight', () => {
  it('names exactly the four the misses named', () => {
    expect([...MODEL_ONLY_SHAPES]).toEqual([
      'flat_declarative_claim', 'personal_result', 'relatable_moment', 'topic_announcement',
    ])
  })

  it('keeps the pattern-reachable set separate, so "could a regex have done this?" stays answerable', () => {
    for (const s of MODEL_ONLY_SHAPES) expect(CAPTION_SHAPES).not.toContain(s)
    expect(ALL_CAPTION_SHAPES.length).toBe(CAPTION_SHAPES.length + MODEL_ONLY_SHAPES.length)
  })

  it('bumps the version, because a stored row must say which vocabulary produced it', () => {
    expect(MODEL_SHAPE_VERSION).toBeGreaterThan(2)
  })
})

describe('the prompt says that nothing is the usual answer', () => {
  const p = buildClassifyPrompt(['A Plan Is Not a Strategy'])

  it('says so before it lists any label', () => {
    // ⚠️ A LIST OF TWELVE LABELS WITH "or none" APPENDED reads as twelve options
    // and one excuse. The measured truth is that most of this pool has no shape.
    expect(p.indexOf('MOST OF THESE HAVE NO SHAPE')).toBeLessThan(p.indexOf('flat_declarative_claim'))
  })

  it('says plainly that none is never a failure', () => {
    expect(p).toMatch(/never a failure/)
    expect(p).toMatch(/Do not reach for the closest label/)
  })

  it('offers every shape the database accepts, and no others', () => {
    for (const s of ALL_CAPTION_SHAPES) expect(p).toContain(s)
  })

  it('numbers the items, so a reply can be joined by number rather than position', () => {
    expect(buildClassifyPrompt(['a', 'b'])).toMatch(/1\. a\n2\. b/)
  })
})

describe('an honest unknown is told apart from every other silence', () => {
  it('reads "none" as the model having found no shape', () => {
    expect(parseVerdictLine('1|none|-')).toEqual({ refusal: 'model_found_no_shape' })
  })

  it('reads an INVENTED label as unreadable, never as no shape', () => {
    // ⚠️ AN INVENTED LABEL IS OUR BUG, NOT THE CORPUS SPEAKING. A model that
    // answers `question_hook` has told us the prompt or the parser is wrong --
    // a different fix from an outage, and folding it into `model_found_no_shape`
    // would hide a prompt defect inside a number that looks like honest silence.
    expect(parseVerdictLine('1|question_hook|why')).toEqual({ refusal: 'model_reply_unreadable' })
    expect(parseVerdictLine('1||')).toEqual({ refusal: 'model_reply_unreadable' })
    expect(parseVerdictLine('garbage')).toEqual({ refusal: 'model_reply_unreadable' })
    expect(parseVerdictLine(null)).toEqual({ refusal: 'model_reply_unreadable' })
  })

  it('accepts a real label and caps its evidence', () => {
    const v = parseVerdictLine(`1|flat_declarative_claim|${'x'.repeat(200)}`)
    expect('shape' in v && v.shape).toBe('flat_declarative_claim')
    expect('shape' in v && v.evidence.length).toBe(MODEL_EVIDENCE_MAX)
  })

  it('never produces a basis other than inferred', () => {
    // ⚖️ A model reading a caption is still guessing at a hook it has not heard.
    // 0213's CHECK is the third party that refuses anything else.
    const a = assessedModelShape({ shape: 'personal_result', evidence: 'Day 5' }, AT)
    expect(a?.basis).toBe('inferred')
    expect(assessedModelShape({ refusal: 'model_found_no_shape' }, AT)).toBeNull()
  })
})

describe('the script joins replies by number, never by position', () => {
  const manifest = [{ id: 'x', clause: 'a' }, { id: 'y', clause: 'b' }]

  it('puts an out-of-order reply on the right row', () => {
    // ⚠️⚠️ A DROPPED OR REORDERED LINE WOULD SHIFT EVERY LABEL ONTO THE WRONG
    // ROW -- a whole column of confident, misattributed verdicts, which is worse
    // than no labels at all.
    const u = applyReplies(manifest, '2|personal_result|Day 5\n1|relatable_moment|Hate when', AT)
    expect(u[0]?.caption_shape).toBe('relatable_moment')
    expect(u[1]?.caption_shape).toBe('personal_result')
  })

  it('records a MISSING reply as model_unavailable, not as no shape', () => {
    // ⚠️ ABSENT IS NOT ZERO. A failed read recorded as "no shape" becomes
    // evidence that the corpus has no shape here.
    const u = applyReplies(manifest, '1|none|-', AT)
    expect(u[1]?.caption_shape_reason).toBe('model_unavailable')
  })

  it('ignores a reply numbered outside the manifest', () => {
    const u = applyReplies(manifest, '9|personal_result|x\n1|none|-', AT)
    expect(u[0]?.caption_shape_reason).toBe('model_found_no_shape')
    expect(u[1]?.caption_shape_reason).toBe('model_unavailable')
  })

  it('takes the FIRST reply for a duplicated number', () => {
    // A trailing echo of the prompt must not overwrite a real answer.
    const u = applyReplies([{ id: 'x', clause: 'a' }], '1|personal_result|real\n1|none|-', AT)
    expect(u[0]?.caption_shape).toBe('personal_result')
  })
})

describe('a row that already has a shape is never touched', () => {
  it('skips it rather than sending it', () => {
    // ⚖️ The pattern set is cheaper, deterministic and auditable. A model read
    // must not overwrite one.
    const s = split([{ id: 'a', title: 'How to win at chess properly', caption_shape: 'how_to' }], AT)
    expect(s.skipped).toEqual(['a'])
    expect(s.ask).toEqual([])
    expect(s.refused).toEqual([])
  })

  it('and the UPDATE refuses at the SQL level as well as in the split', () => {
    // ⚠️ TWO GUARDS BECAUSE THE CALLER IS A QUERY. If the operator passes the
    // wrong row set, the WHERE clause is what still protects the column.
    const sql = planSql(applyReplies([{ id: 'x', clause: 'a' }], '1|topic_announcement|On dating', AT))
    expect(sql).toContain('g.caption_shape is null')
    expect(sql).toContain('g.caption_shape_version < v.version')
  })

  it('emits nothing at all for an empty batch', () => {
    expect(planSql([])).toBe('')
  })
})

describe('every value this script can emit is one the database accepts', () => {
  // ⚠️ THIS IS WHAT PROTECTS THE SQL, NOT THE QUOTE-ESCAPING -- and it is the
  // 0208 lesson one day old: shipping a vocabulary the CHECK does not carry
  // means every write is REJECTED, and where the caller swallows the error the
  // row simply never lands.
  const MIG = 'supabase/migrations/0213_the_misses_named_their_own_taxonomy.sql'

  it('0213 carries every shape the module can produce', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
    const sql = readFileSync(join(repo, MIG), 'utf8')
    for (const s of ALL_CAPTION_SHAPES) expect(sql, s).toContain(`'${s}'`)
  })

  it('0213 carries every reason the script can write', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
    const sql = readFileSync(join(repo, MIG), 'utf8')
    const reasons = new Set<string>()
    // Every refusal the pre-filter can produce.
    for (const t of ['', '#fy #fyp', 'How to win', 'Das wird dir jeder gesunde Mensch bestätigen',
      'Check my profile for the full guide']) {
      const v = worthAModelRead(t)
      if (v.send === false) reasons.add(v.reason)
    }
    // Every refusal a reply can produce.
    for (const u of applyReplies([{ id: 'a', clause: 'x' }, { id: 'b', clause: 'y' }],
      '1|none|-', AT)) if (u.caption_shape_reason) reasons.add(u.caption_shape_reason)
    reasons.add('model_reply_unreadable')
    expect(reasons.size).toBeGreaterThanOrEqual(6)
    for (const r of reasons) expect(sql, r).toContain(`'${r}'`)
  })
})

describe('the tally counts shapes and refusals in one place', () => {
  it('keys a shaped row by its shape and a refused row by its reason', () => {
    const u = applyReplies([{ id: 'x', clause: 'a' }, { id: 'y', clause: 'b' }],
      '1|personal_result|Day 5\n2|none|-', AT)
    expect(tallyOf(u)).toEqual({ personal_result: 1, model_found_no_shape: 1 })
  })
})

describe('a caption read is never laundered into an observation', () => {
  it('emits only inferred or null as a basis, on every path', () => {
    // ⚠️ 0213's CHECK allows NULL or 'inferred' and nothing else, so any other
    // value means every write is REJECTED -- and the pattern path's whole naming
    // argument is that a caption is not the hook. A model read is weaker still:
    // it is a guess about a spoken line nobody heard.
    const u = applyReplies(
      [{ id: 'a', clause: 'x' }, { id: 'b', clause: 'y' }, { id: 'c', clause: 'z' }],
      '1|flat_declarative_claim|A Plan\n2|none|-\n3|invented_label|q', AT,
    )
    expect(u).toHaveLength(3)
    for (const r of u) expect([null, 'inferred']).toContain(r.caption_shape_basis)
    // And a shaped row must carry one, because 0196's CHECK requires it.
    expect(u[0]?.caption_shape_basis).toBe('inferred')
    expect(u[1]?.caption_shape_basis).toBeNull()
    expect(u[2]?.caption_shape_basis).toBeNull()
  })

  it('a refused row carries no shape, and a shaped row carries no reason', () => {
    // ⚖️ 0196 enforces the exclusion with a CHECK rather than trusting a writer.
    const u = applyReplies([{ id: 'a', clause: 'x' }, { id: 'b', clause: 'y' }],
      '1|personal_result|Day 5\n2|none|-', AT)
    expect(u[0]?.caption_shape_reason).toBeNull()
    expect(u[1]?.caption_shape).toBeNull()
  })
})
