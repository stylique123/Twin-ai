// THE TEMPLATE DEFINES STRUCTURE. THE CREATOR DEFINES CONTENT. THE RESOLVER
// DECIDES WHICH AVAILABLE MATERIAL CAN PERFORM WHICH JOB.
//
// ⚠️ IT USED TO ASK "DO THESE TWO STRINGS SHARE ENOUGH NOUNS?" — comparing a
// template's generic prose ("the strongest item, saved for last") against
// domain-specific knowledge ("raise prices before increasing ad spend"). One is
// a ROLE IN A STRUCTURE and the other is content that could occupy that role;
// they are not supposed to resemble each other. Measured over production — 19
// creators x 14 templates, 836 beats — that filter discarded 661 items that were
// strong enough to use. Fill was 12.6% and ZERO of 266 templates came out fully
// resolved, so `slotsReady` was false everywhere and `validateScript` could
// never run. With semantic matching: 64.2% and 40.6%.
import { describe, expect, it } from 'vitest'
import { resolveTemplate, resolveContainer } from '../knowledgeResolver'
import type { ContainerTemplate } from '../containerTemplates'

const item = (kind: string, text: string, basis = 'stated', timesSeen = 1) =>
  ({ kind, text, basis, source: 'user', timesSeen }) as never

const tpl = (beats: { label: string; needs: string | null; purpose: string }[]): ContainerTemplate =>
  ({ container: 'numbered_list', summary: 's',
     beats: beats.map((b) => ({ ...b, role: 'body' })) }) as never

const K = (items: unknown[]) => ({ items, audience: [] }) as never
const filled = (r: ReturnType<typeof resolveTemplate>) =>
  Object.fromEntries(r.map((x) => [x.label, x.evidence.map((e) => e.text)]))

describe('a beat is a job, matched by what material can do it', () => {
  it('fills a beat whose evidence shares NOT ONE WORD with the beat purpose', () => {
    // ⚠️ THE REGRESSION THAT MATTERED. Under the old filter this returned
    // nothing, which is 79% of the real corpus.
    const r = resolveTemplate(
      tpl([{ label: 'strongest', needs: 'claim', purpose: 'the strongest item, saved for last' }]),
      K([item('opinion', 'Raise prices before increasing ad spend.')]),
      {},
    )
    expect(filled(r).strongest).toEqual(['Raise prices before increasing ad spend.'])
  })

  it('still REFUSES material that cannot do the job, however well the words match', () => {
    // ⚖️ Loosening relevance must not loosen truthfulness. A lived beat is not
    // filled by an opinion just because both mention pricing.
    const r = resolveTemplate(
      tpl([{ label: 'story', needs: 'personal_experience', purpose: 'what happened when they tried pricing' }]),
      K([item('opinion', 'Pricing is what everyone gets wrong when they tried pricing.')]),
      {},
    )
    expect(filled(r).story).toEqual([])
    expect(r[0].fallback?.kind).toBe('ask')
  })

  it('refuses an observed experience for a beat that licenses "I"', () => {
    // ⚠️ Strength alone does not capture this: something we WATCHED can rank as
    // experience and still not be something they TOLD us.
    const r = resolveTemplate(
      tpl([{ label: 'story', needs: 'personal_experience', purpose: 'a lived moment' }]),
      K([item('experience', 'They appear to have used it.', 'demonstrated')]),
      {},
    )
    expect(filled(r).story).toEqual([])
  })

  it('says nothing twice across a template', () => {
    // ⚠️ Resolved per beat in isolation, every beat picks the same strongest
    // item and the script says one thing five times in different costumes.
    const r = resolveTemplate(
      tpl([
        { label: 'a', needs: 'claim', purpose: 'first point' },
        { label: 'b', needs: 'claim', purpose: 'second point' },
        { label: 'c', needs: 'claim', purpose: 'third point' },
      ]),
      K([item('opinion', 'One.', 'stated', 9), item('opinion', 'Two.', 'stated', 5), item('opinion', 'Three.')]),
      {},
    )
    const texts = Object.values(filled(r)).flat()
    expect(texts).toHaveLength(3)
    expect(new Set(texts).size).toBe(3)
  })

  it('resolves the NARROWEST need first, so a claim beat cannot eat the only lived item', () => {
    // ⚖️ In template order the claim beat resolves first and takes the
    // experience item — which it is allowed to — leaving the beat that REQUIRED
    // one unfilled, reporting a shortfall while a complete assignment existed.
    const r = resolveTemplate(
      tpl([
        { label: 'claimbeat', needs: 'claim', purpose: 'a point' },
        { label: 'lived', needs: 'personal_experience', purpose: 'a lived moment' },
      ]),
      K([item('experience', 'I ran it for six months.'), item('opinion', 'Most people over-think this.')]),
      {},
    )
    expect(filled(r).lived).toEqual(['I ran it for six months.'])
    expect(filled(r).claimbeat).toEqual(['Most people over-think this.'])
  })

  it('spends ONE item per beat inside a template, and up to three standalone', () => {
    // ⚖️ Three is right for a container resolved on its own — more supporting
    // evidence is strictly better. Inside a template it starves later beats.
    const many = [item('opinion', 'A.'), item('opinion', 'B.'), item('opinion', 'C.')]
    const solo = resolveContainer({ id: 'x', about: 'a point', needs: 'opinion' }, K(many))
    expect(solo.evidence).toHaveLength(3)
    const inTemplate = resolveTemplate(
      tpl([{ label: 'x', needs: 'claim', purpose: 'a point' }]), K(many), {})
    expect(inTemplate[0].evidence).toHaveLength(1)
  })

  it('prefers the lexically closer item when several can do the job', () => {
    // ⚖️ Overlap is poor evidence of UNFIT and decent evidence of FIT, which is
    // the profile of a tiebreak rather than a gate.
    const r = resolveTemplate(
      tpl([{ label: 'x', needs: 'claim', purpose: 'pricing mistakes founders make' }]),
      K([item('opinion', 'Sleep matters more than hustle.', 'stated', 99),
         item('opinion', 'Founders underprice constantly.', 'stated', 1)]),
      {},
    )
    expect(filled(r).x).toEqual(['Founders underprice constantly.'])
  })

  it('emits beats in TEMPLATE order, not resolution order', () => {
    // The order beats are RESOLVED in is an allocation detail; the order they
    // are WRITTEN in is what keeps somebody watching.
    const r = resolveTemplate(
      tpl([
        { label: 'first', needs: 'claim', purpose: 'opening point' },
        { label: 'second', needs: 'personal_experience', purpose: 'a lived moment' },
      ]),
      K([item('experience', 'I did it.'), item('opinion', 'A view.')]),
      {},
    )
    expect(r.map((x) => x.label)).toEqual(['first', 'second'])
  })
})
