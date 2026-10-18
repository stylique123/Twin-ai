// A NOUN WHERE THE VERB WAS ALREADY IN THE SAME SCRIPT.
//
// ⚠️ THE OWNER'S RULE, AND PRESENCE IS THE ORACLE: ban a noun when the verb form
// is already in the script or in her vocabulary; keep it when no verb form
// exists. No blocklist, no dictionary — which is what makes it checkable.
//
// ⚠️⚠️ AND THE OWNER'S TWO EXAMPLES ARE DIFFERENT MECHANISMS. "Repairability"
// banned because "repair" is right there is MORPHOLOGICAL and is built here.
// "Durability" banned because "lasts" is available is a SYNONYM — "durability"
// does not contain "last" — and reaching it needs the curated map the ruling
// rejects, or a model. The synonym half is NOT built, and the test below pins
// that as a known limit rather than leaving it to be discovered.
import { describe, expect, it } from 'vitest'
import { candidateStems, EXCLUDED_SUFFIX, MAX_FINDINGS, nominalisationsIn } from '../script/nominalisation'

describe("the owner's own examples", () => {
  it('bans repairability when repair is right there', () => {
    const f = nominalisationsIn('You can repair it yourself. The repairability is the point.')
    expect(f).toHaveLength(1)
    expect(f[0]?.word).toBe('repairability')
    expect(f[0]?.verbAvailable).toBe('repair')
    expect(f[0]?.foundIn).toBe('script')
  })

  it('⚠️ CANNOT ban durability for "lasts", and says so rather than pretending', () => {
    // "durability" has no morphological path to "last". Catching this needs a
    // synonym map — the curated list the ruling rejects — or a model call.
    expect(nominalisationsIn('This one lasts. The durability is unmatched.')).toEqual([])
  })
})

describe('technical vocabulary is left alone', () => {
  it("keeps the owner's four, because none has a verb to swap in", () => {
    const script = 'I use an Oxford hollow and a saddle stitch. The signatures are '
      + 'sewn and the tannage is vegetable.'
    expect(nominalisationsIn(script)).toEqual([])
  })

  it('keeps a noun whose stem appears nowhere', () => {
    // ⚠️ THE POINT OF PRESENCE-AS-ORACLE. "visibility" is only banned if
    // something actually says "vis", which nothing ever does.
    expect(nominalisationsIn('Visibility matters more than reach.')).toEqual([])
  })
})

describe('the false positives the measurement caught, which must stay dead', () => {
  // ⚠️ EVERY ONE OF THESE WAS PRODUCED BY THE FIRST VERSION OF THIS RULE against
  // 60 real shipped scripts, at a 65% flag rate. The owner's test is "if it
  // flags anything in the eight good scripts the rule is wrong" — these would
  // flag ANY script, so they were wrong before reaching that set.
  it('does not read "sentence" as a form of "send"', () => {
    expect(nominalisationsIn('I sent one sentence.')).toEqual([])
  })

  it('does not read "comment" as a form of "come"', () => {
    expect(nominalisationsIn('It comes with a comment.')).toEqual([])
  })

  it('does not read "reality" as a verb, because "real" is an adjective', () => {
    expect(nominalisationsIn('It is real. That is the reality.')).toEqual([])
  })

  it('does not read "mechanical" as a nominalisation', () => {
    expect(nominalisationsIn('The mechanics are mechanical.')).toEqual([])
  })

  it('does not read "position" as a form of "pose"', () => {
    expect(nominalisationsIn('She is posing in position.')).toEqual([])
  })

  it('does not read "realization" as "real"', () => {
    // It may still fire on the actual verb, which is correct.
    const f = nominalisationsIn('It is real and the realization landed.')
    expect(f).toEqual([])
  })
})

describe('an adjective nominalisation is out of scope', () => {
  // ⚠️⚠️ MUTATION SHOWS THIS GUARD IS CURRENTLY UNREACHABLE, AND IT IS RECORDED
  // AS SURVIVING RATHER THAN CLAIMED AS TESTED. Deleting the `-ness` skip does
  // NOT fail this suite, because no suffix left in the tightened list matches a
  // `-ness` word anyway: the seven that could were removed on the 60-script
  // measurement. The same is true of the check that a stem must differ from the
  // word itself. Both are insurance against a future widening of the suffix
  // list, not properties this suite proves — and saying so is the difference
  // between a defence and a defence that looks tested.
  it('never strips -ness, because that is not a verb standing aside', () => {
    expect(EXCLUDED_SUFFIX).toBe('ness')
    expect(nominalisationsIn('The leather is thick. The thickness is the tell.')).toEqual([])
  })
})

describe('the verb counts however it is inflected', () => {
  it('accepts a plural, a past tense or a gerund as proof the verb was there', () => {
    for (const verb of ['place', 'places', 'placed', 'placing']) {
      const f = nominalisationsIn(`I ${verb} it there. The placement is deliberate.`)
      expect(f.map((x) => x.word), verb).toEqual(['placement'])
    }
  })

  it('reaches subscribe from subscription, which is why -ption survives', () => {
    const f = nominalisationsIn('Subscribe below. The subscription is monthly.')
    expect(f.map((x) => x.word)).toEqual(['subscription'])
  })

  it('reaches create from creation rather than stopping at "creat"', () => {
    expect(candidateStems('creation')).toContain('create')
  })
})

describe('her vocabulary counts as well as the script', () => {
  it('flags a noun whose verb she uses elsewhere, and says where it was found', () => {
    const f = nominalisationsIn('The alignment is what matters.', ['aligning', 'burnish'])
    expect(f).toHaveLength(1)
    expect(f[0]?.verbAvailable).toBe('aligning')
    expect(f[0]?.foundIn).toBe('vocabulary')
  })

  it('prefers the script when the verb is in both', () => {
    const f = nominalisationsIn('I align it. The alignment is what matters.', ['align'])
    expect(f[0]?.foundIn).toBe('script')
  })
})

describe('it refuses to run on nothing, and stays bounded', () => {
  it('returns empty for a non-string or an empty script', () => {
    expect(nominalisationsIn(null)).toEqual([])
    expect(nominalisationsIn(42)).toEqual([])
    expect(nominalisationsIn('   ')).toEqual([])
  })

  it('reports each noun once, however often it appears', () => {
    const f = nominalisationsIn('I place it. Placement, placement, placement.')
    expect(f).toHaveLength(1)
  })

  it('is capped, so one bad script cannot produce a wall of text', () => {
    const many = Array.from({ length: 40 }, (_, i) => `improve${i} improvement${i}`).join(' ')
    expect(nominalisationsIn(`I improve it. ${many} improvement`).length).toBeLessThanOrEqual(MAX_FINDINGS)
  })
})
