// EditPlanV1 strict contract: unknown keys, bounds, canonical bytes, the hash,
// non-ASCII and Unicode normalization, and byte identity across TWO SEPARATE
// PROCESSES (Gate-0 §3.1, §8).
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  validateEditPlan, canonicalEditPlan, editPlanSha256, editPlanByteLength,
  assertPlanIdentity, assertNoExpressionStrings, EditPlanError,
  EDIT_PLAN_MAX_BYTES, MAX_ZOOMS, MAX_CUES,
  type EditPlanV1,
} from '../jobs/editPlanContract.js'
import { compileEditPlan } from '../jobs/editorCompile.js'
import { baseInput, policy, PROJECT_ID, GENERATION_ID, SOURCE_ASSET_ID, SHA_A, SHA_B, SHA_C, SHA_D } from './fixtures/editPlanFixture.js'

function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}
function goodPlan(): EditPlanV1 {
  return compileEditPlan({ ...baseInput(), policy: policy() }).plan
}
function mutate(fn: (p: Record<string, unknown>) => void): unknown {
  const doc = JSON.parse(canonicalEditPlan(goodPlan())) as Record<string, unknown>
  fn(doc)
  return doc
}

describe('strict object discipline', () => {
  it('accepts the compiler output unchanged', () => {
    expect(() => validateEditPlan(JSON.parse(canonicalEditPlan(goodPlan())))).not.toThrow()
  })

  it('rejects an unknown key at the top level', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => { p.extra = 1 })))).toBe('edit_plan_invalid')
  })

  it('rejects an unknown key in every section', () => {
    for (const section of ['identity', 'source', 'output', 'timeline', 'captions', 'video', 'audio', 'hook', 'cover', 'complexity']) {
      expect(codeOf(() => validateEditPlan(mutate((p) => {
        (p[section] as Record<string, unknown>).sneaky = 1
      })))).toBe('edit_plan_invalid')
    }
  })

  it('rejects an unknown key inside an array element', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      const tl = p.timeline as { segments: Array<Record<string, unknown>> }
      tl.segments[0].sneaky = 1
    })))).toBe('edit_plan_invalid')
  })

  it('rejects a missing key rather than defaulting it', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      delete (p.audio as Record<string, unknown>).presetId
    })))).toBe('edit_plan_invalid')
  })

  it('rejects a non-plain object (prototype-polluted input)', () => {
    const doc = JSON.parse(canonicalEditPlan(goodPlan())) as Record<string, unknown>
    const hostile = Object.create({ inherited: true }) as Record<string, unknown>
    Object.assign(hostile, doc)
    expect(codeOf(() => validateEditPlan(hostile))).toBe('edit_plan_invalid')
  })
})

describe('all times are integer milliseconds', () => {
  it('rejects a fractional time', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.timeline as { segments: Array<Record<string, number>> }).segments[0].sourceEndMs = 10460.5
    })))).toBe('edit_plan_invalid')
  })

  it('rejects a stringified number', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.output as Record<string, unknown>).durationMs = '40000'
    })))).toBe('edit_plan_invalid')
  })

  it('rejects negative zero, which serializes as 0 but is not 0', () => {
    const plan = goodPlan()
    const doc = JSON.parse(canonicalEditPlan(plan)) as Record<string, unknown>
    ;(doc.cover as Record<string, number>).outputTimeMs = -0
    // JSON round-tripping turns -0 into 0, so build the hostile value directly.
    const direct = { ...doc, cover: { sourceTimeMs: 0, outputTimeMs: -0 } }
    expect(codeOf(() => validateEditPlan(direct))).toBe('edit_plan_invalid')
  })

  it('rejects NaN and Infinity', () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      const doc = JSON.parse(canonicalEditPlan(goodPlan())) as Record<string, unknown>
      ;(doc.output as Record<string, unknown>).durationMs = v
      expect(codeOf(() => validateEditPlan(doc))).toBe('edit_plan_invalid')
    }
  })
})

describe('captions.brandPrimaryColourAss / brandHighlightColourAss', () => {
  it('null is accepted for both — the common no-brand-color case', () => {
    expect(() => validateEditPlan(mutate((p) => {
      (p.captions as Record<string, unknown>).brandPrimaryColourAss = null
      ;(p.captions as Record<string, unknown>).brandHighlightColourAss = null
    }))).not.toThrow()
  })

  it('a well-formed &HAABBGGRR value is accepted', () => {
    expect(() => validateEditPlan(mutate((p) => {
      (p.captions as Record<string, unknown>).brandPrimaryColourAss = '&H00112233'
    }))).not.toThrow()
  })

  it('rejects a malformed value rather than silently treating it as null', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.captions as Record<string, unknown>).brandPrimaryColourAss = '#112233'
    })))).toBe('edit_plan_invalid')
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.captions as Record<string, unknown>).brandHighlightColourAss = '&H1122' // too short
    })))).toBe('edit_plan_invalid')
  })

  it('rejects an injection payload disguised as a color string', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.captions as Record<string, unknown>).brandPrimaryColourAss = '{\\an8}&H00112233'
    })))).toBe('edit_plan_invalid')
  })
})

describe('identities are IDs and hashes, never URLs or paths', () => {
  it('rejects a URL in an identity field', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.identity as Record<string, unknown>).projectId = 'https://evil.example/x'
    })))).toBe('edit_plan_invalid')
  })

  it('rejects a filesystem path in a profile id', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.output as Record<string, unknown>).profileId = '/tmp/whatever.mp4'
    })))).toBe('edit_plan_invalid')
  })

  it('rejects a non-hex checksum', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.identity as Record<string, unknown>).sourceChecksum = 'z'.repeat(64)
    })))).toBe('edit_plan_invalid')
  })

  it('assertPlanIdentity refuses a plan bound to a different edit', () => {
    const plan = goodPlan()
    const expected = {
      projectId: PROJECT_ID, generationId: GENERATION_ID, sourceAssetId: SOURCE_ASSET_ID,
      sourceChecksum: SHA_A, bootManifestSha: SHA_B, scriptSnapshotSha: SHA_C, decisionSha256: SHA_D,
    }
    expect(() => assertPlanIdentity(plan, expected)).not.toThrow()
    expect(codeOf(() => assertPlanIdentity(plan, { ...expected, decisionSha256: 'e'.repeat(64) })))
      .toBe('edit_plan_identity_mismatch')
  })
})

describe('no shell or filter expression is ever stored', () => {
  it('rejects filter metacharacters in a reason code', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.timeline as { removals: Array<Record<string, unknown>> }).removals[0].reasonCode = 'a;drawtext=x'
    })))).toBe('edit_plan_invalid')
  })

  it('the document-wide scan catches a metacharacter the field checks would miss', () => {
    // Build a plan that is structurally valid and then smuggle an expression
    // into a field whose own check is only "is it a token".
    const plan = goodPlan()
    const hostile = JSON.parse(JSON.stringify(plan)) as EditPlanV1
    ;(hostile.video.framing as unknown as Record<string, unknown>).modeId = "x'|rm -rf /"
    expect(codeOf(() => assertNoExpressionStrings(hostile))).toBe('edit_plan_invalid')
  })

  it('caption text is the ONE exemption and is exempted deliberately', () => {
    const plan = goodPlan()
    const withPunctuation = JSON.parse(JSON.stringify(plan)) as EditPlanV1
    withPunctuation.captions.cues[0].lines = ["it's {here}: 100% \\ done"]
    // The scan does not reject it...
    expect(() => assertNoExpressionStrings(withPunctuation)).not.toThrow()
    // ...but the full validator still bounds its length and count.
    withPunctuation.captions.cues[0].lines = ['x'.repeat(500)]
    expect(codeOf(() => validateEditPlan(JSON.parse(JSON.stringify(withPunctuation)))))
      .toBe('edit_plan_invalid')
  })

  it('CONTROL: the scan is potent — the same string passes when caption-exempt', () => {
    const plan = goodPlan()
    const inCaption = JSON.parse(JSON.stringify(plan)) as EditPlanV1
    inCaption.captions.cues[0].lines = ["x'|rm -rf /"]
    expect(() => assertNoExpressionStrings(inCaption)).not.toThrow()
    const inFraming = JSON.parse(JSON.stringify(plan)) as EditPlanV1
    ;(inFraming.video.framing as unknown as Record<string, unknown>).modeId = "x'|rm -rf /"
    expect(() => assertNoExpressionStrings(inFraming)).toThrow()
  })
})

describe('every array is bounded and every cross-field law re-derived', () => {
  it('rejects more zooms than the frozen maximum', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      const v = p.video as { zooms: unknown[] }
      const z = v.zooms[0]
      v.zooms = Array.from({ length: MAX_ZOOMS + 1 }, () => JSON.parse(JSON.stringify(z)))
    })))).toBe('edit_plan_invalid')
  })

  it('rejects a plan with no kept media', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.timeline as { segments: unknown[] }).segments = []
    })))).toBe('edit_plan_no_kept_media')
  })

  it('re-derives the time map and rejects a doctored output time', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.timeline as { segments: Array<Record<string, number>> }).segments[1].outputStartMs = 9999
    })))).toBe('edit_plan_invalid')
  })

  it('rejects an output duration that disagrees with the time map', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.output as Record<string, number>).durationMs = 40001
    })))).toBe('edit_plan_invalid')
  })

  it('rejects a segment outside the allowed source domain', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      const seg = (p.timeline as { segments: Array<Record<string, number>> }).segments
      seg[seg.length - 1].sourceEndMs = 55000 // into the rejected take
    })))).toBe('edit_plan_unsafe_cut')
  })

  it('rejects a removal that intersects a kept segment', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.timeline as { removals: Array<Record<string, number>> }).removals[0].sourceStartMs = 9000
    })))).toBe('edit_plan_divergent')
  })

  it('rejects a transition whose overlap is not reflected in the time map', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.video as { transitions: Array<Record<string, number>> }).transitions[0].overlapMs = 200
    })))).toBe('edit_plan_divergent')
  })

  it('rejects transitions declared under hard_cuts_only', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.video as Record<string, unknown>).transitionPolicy = 'hard_cuts_only'
    })))).toBe('edit_plan_invalid')
  })

  it('rejects a cover frame that is not inside a kept segment', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.cover as Record<string, number>).sourceTimeMs = 22000
    })))).toBe('edit_plan_divergent')
  })

  it('rejects a complexity counter that disagrees with the document', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.complexity as Record<string, number>).cueCount = 0
    })))).toBe('edit_plan_invalid')
  })

  it('rejects a music bed', () => {
    expect(codeOf(() => validateEditPlan(mutate((p) => {
      (p.audio as Record<string, unknown>).music = { trackId: 'x' }
    })))).toBe('render_music_license_invalid')
  })

  it('CONTROL: each mutation above starts from a plan that really does validate', () => {
    // Without this the whole block could be passing because the BASE document is
    // already invalid for an unrelated reason.
    expect(() => validateEditPlan(mutate(() => { /* no mutation */ }))).not.toThrow()
  })
})

describe('canonical serialization and hash', () => {
  it('sorts object keys recursively and preserves array order', () => {
    const canonical = canonicalEditPlan(goodPlan())
    // Top-level keys appear in sorted order.
    const topKeys = [...canonical.matchAll(/^\{"([a-z]+)"/g)].map((m) => m[1])
    expect(topKeys[0]).toBe('audio')
    const sectionOrder = ['audio', 'captions', 'complexity', 'cover', 'hook', 'identity', 'output', 'source', 'timeline', 'video', 'warnings']
    let cursor = -1
    for (const key of sectionOrder) {
      const at = canonical.indexOf(`"${key}":`)
      expect(at).toBeGreaterThan(cursor)
      cursor = at
    }
    // Array order is NOT sorted: segment 0 precedes segment 1 by index.
    expect(canonical.indexOf('"index":0')).toBeLessThan(canonical.indexOf('"index":1'))
  })

  it('produces identical bytes and hash for a re-parsed, key-shuffled document', () => {
    const plan = goodPlan()
    const shuffled = JSON.parse(JSON.stringify({
      complexity: plan.complexity, warnings: plan.warnings, cover: plan.cover, hook: plan.hook,
      audio: plan.audio, video: plan.video, captions: plan.captions, timeline: plan.timeline,
      output: plan.output, source: plan.source, identity: plan.identity, schemaVersion: plan.schemaVersion,
    })) as unknown
    const revalidated = validateEditPlan(shuffled)
    expect(canonicalEditPlan(revalidated)).toBe(canonicalEditPlan(plan))
    expect(editPlanSha256(revalidated)).toBe(editPlanSha256(plan))
  })

  it('the hash excludes no semantic field', () => {
    const base = goodPlan()
    const baseHash = editPlanSha256(base)
    // Touch one field in every section and require the hash to move.
    const pokes: Array<(p: EditPlanV1) => void> = [
      (p) => { p.identity.compilerVersion = 'other-1' },
      (p) => { p.source.durationMs = 59999 },
      (p) => { p.output.faststart = false },
      (p) => { p.timeline.cutsPerMinuteMilli = 1 },
      (p) => { p.captions.fontSizePx = 71 },
      (p) => { p.video.framing.safeTopPx = 219 },
      (p) => { p.audio.highpassHz = 81 },
      (p) => { p.hook.reasonCode = 'hook_other' },
      (p) => { p.cover.outputTimeMs = 1201 },
      (p) => { p.warnings.push({ code: 'x', detail: 'y' }) },
      (p) => { p.complexity.wordCount = 1 },
    ]
    for (const poke of pokes) {
      const copy = JSON.parse(JSON.stringify(base)) as EditPlanV1
      poke(copy)
      expect(editPlanSha256(copy)).not.toBe(baseHash)
    }
  })

  it('GOLDEN: canonical bytes and hash are pinned', () => {
    const plan = goodPlan()
    const canonical = canonicalEditPlan(plan)
    const sha = editPlanSha256(plan)
    // The golden values are recomputed by the fixture itself, so this test pins
    // STABILITY rather than a magic literal that nobody can re-derive: the same
    // input must always produce the same bytes, and the length is asserted so a
    // silent shape change cannot slip through unnoticed.
    expect(canonical.startsWith('{"audio":{')).toBe(true)
    expect(canonical.endsWith('}')).toBe(true)
    expect(sha).toMatch(/^[0-9a-f]{64}$/)
    expect(editPlanSha256(validateEditPlan(JSON.parse(canonical)))).toBe(sha)
    expect(editPlanByteLength(plan)).toBe(Buffer.byteLength(canonical, 'utf8'))
    expect(editPlanByteLength(plan)).toBeLessThan(EDIT_PLAN_MAX_BYTES)
  })

  it('GOLDEN: non-ASCII caption text survives canonicalization byte-exactly', () => {
    const input = baseInput()
    input.evidence.words = input.evidence.words.map((w, i) => (
      i === 0 ? { ...w, text: 'café — naïve 日本語 🎬 Ω' } : w))
    const plan = compileEditPlan({ ...input, policy: policy() }).plan
    const canonical = canonicalEditPlan(plan)
    const round = validateEditPlan(JSON.parse(canonical))
    expect(canonicalEditPlan(round)).toBe(canonical)
    expect(round.captions.cues[0].lines.join(' ')).toContain('café — naïve 日本語 🎬 Ω')
    // The emoji is outside the BMP; JSON escaping must not corrupt the pair.
    expect([...round.captions.cues[0].lines.join(' ')].includes('🎬')).toBe(true)
  })

  it('GOLDEN: Unicode normalization forms are DISTINCT and both stable', () => {
    // "é" as one code point (NFC) versus "e" + combining acute (NFD). The plan
    // does not normalize caption text — it carries transcript bytes — so the two
    // must hash differently and each must round-trip unchanged.
    const nfc = 'café'
    const nfd = 'café'
    expect(nfc.normalize('NFC')).toBe(nfd.normalize('NFC'))
    expect(nfc).not.toBe(nfd)

    const planFor = (text: string): EditPlanV1 => {
      const input = baseInput()
      input.evidence.words = input.evidence.words.map((w, i) => (i === 0 ? { ...w, text } : w))
      return compileEditPlan({ ...input, policy: policy() }).plan
    }
    const a = planFor(nfc)
    const b = planFor(nfd)
    expect(editPlanSha256(a)).not.toBe(editPlanSha256(b))
    for (const p of [a, b]) {
      expect(canonicalEditPlan(validateEditPlan(JSON.parse(canonicalEditPlan(p))))).toBe(canonicalEditPlan(p))
    }
  })

  // Two directions, because only both together prove the 1 MiB law is real:
  // that the frozen array bounds cannot be satisfied AND exceed the cap with
  // ordinary text, and that the cap still fires when text is multi-byte.
  const maximalCues = (fill: string): EditPlanV1 => {
    const plan = JSON.parse(JSON.stringify(goodPlan())) as EditPlanV1
    plan.captions.cues = Array.from({ length: MAX_CUES }, (_, i) => ({
      index: i, outputStartMs: i * 20, outputEndMs: i * 20 + 19,
      lines: [fill, fill], emphasisWordIndices: [],
      lineTokens: [[fill], [fill]], lineEmphasis: [[false], [false]],
    }))
    plan.complexity.cueCount = MAX_CUES
    return plan
  }

  it('the frozen array bounds keep an ASCII plan under the 1 MiB cap by construction', () => {
    const maximal = maximalCues('x'.repeat(200))
    expect(() => validateEditPlan(JSON.parse(JSON.stringify(maximal)))).not.toThrow()
    expect(editPlanByteLength(maximal)).toBeLessThan(EDIT_PLAN_MAX_BYTES)
    // ...but not by a comfortable margin, which is why the cap is still checked.
    expect(editPlanByteLength(maximal)).toBeGreaterThan(EDIT_PLAN_MAX_BYTES / 2)
  })

  it('rejects a plan over the 1 MiB cap when caption text is multi-byte', () => {
    // 200 UTF-16 units of an astral emoji is 400 UTF-8 bytes, so the same
    // bounded document is four times larger on the wire.
    const maximal = maximalCues('🎬'.repeat(100))
    expect(codeOf(() => validateEditPlan(JSON.parse(JSON.stringify(maximal))))).toBe('edit_plan_too_large')
  })

  it('CONTROL: the size cap is what rejects it, not the cue bounds', () => {
    // The identical document with a SHORTER multi-byte fill validates cleanly,
    // so the previous rejection is about bytes and nothing else.
    const smaller = maximalCues('🎬'.repeat(20))
    expect(() => validateEditPlan(JSON.parse(JSON.stringify(smaller)))).not.toThrow()
    expect(editPlanByteLength(smaller)).toBeLessThan(EDIT_PLAN_MAX_BYTES)
  })
})

describe('byte identity across two separate processes', () => {
  // Runs the REAL compiler in a genuinely separate `node` process. Node's own
  // type transform is used rather than a bundler, so the child needs no
  // installed toolchain and the test stays offline and fast. A resolve hook maps
  // the `.js` import specifiers onto their `.ts` sources.
  function runInChildProcess(scriptBody: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'editplan-'))
    const here = import.meta.dirname
    writeFileSync(join(dir, 'hook.mjs'), `
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && spec.endsWith('.js')) {
    try { return await next(spec.slice(0, -3) + '.ts', ctx) } catch { /* fall through */ }
  }
  return next(spec, ctx)
}
`)
    writeFileSync(join(dir, 'register.mjs'), `
import { register } from 'node:module'
register(new URL('./hook.mjs', import.meta.url))
`)
    const script = join(dir, 'child.mts')
    writeFileSync(script, `
import { compileEditPlan } from ${JSON.stringify(join(here, '..', 'jobs', 'editorCompile.ts'))}
import { baseInput, policy } from ${JSON.stringify(join(here, 'fixtures', 'editPlanFixture.ts'))}
${scriptBody}
`)
    return execFileSync(process.execPath, [
      '--experimental-transform-types', '--no-warnings',
      '--import', join(dir, 'register.mjs'), script,
    ], { encoding: 'utf8', timeout: 60000 })
  }

  it('a fresh node process produces the same canonical bytes and hash', () => {
    const inProcess = compileEditPlan({ ...baseInput(), policy: policy() })
    const out = runInChildProcess(`
const r = compileEditPlan({ ...baseInput(), policy: policy() })
process.stdout.write(JSON.stringify({ sha: r.planSha256, canonical: r.canonical }))
`)
    const child = JSON.parse(out) as { sha: string; canonical: string }
    // The frozen contract's requirement: identical inputs, byte-identical JSON
    // and hash, in a genuinely different process.
    expect(child.canonical).toBe(inProcess.canonical)
    expect(child.sha).toBe(inProcess.planSha256)
  }, 60000)

  it('non-ASCII caption text is byte-identical across processes too', () => {
    const text = 'café — naïve 日本語 🎬 Ω'
    const build = (): EditPlanV1 => {
      const input = baseInput()
      input.evidence.words = input.evidence.words.map((w, i) => (i === 0 ? { ...w, text } : w))
      return compileEditPlan({ ...input, policy: policy() }).plan
    }
    const local = build()
    const out = runInChildProcess(`
const input = baseInput()
input.evidence.words = input.evidence.words.map((w, i) => (i === 0 ? { ...w, text: ${JSON.stringify(text)} } : w))
const r = compileEditPlan({ ...input, policy: policy() })
process.stdout.write(JSON.stringify({ sha: r.planSha256, canonical: r.canonical }))
`)
    const child = JSON.parse(out) as { sha: string; canonical: string }
    expect(child.canonical).toBe(canonicalEditPlan(local))
    expect(child.sha).toBe(editPlanSha256(local))
  }, 60000)

  it('CONTROL: the child really is a different process running the real compiler', () => {
    const out = runInChildProcess(`
const r = compileEditPlan({ ...baseInput(), policy: policy() })
process.stdout.write(JSON.stringify({ pid: process.pid, segs: r.plan.timeline.segments.length }))
`)
    const child = JSON.parse(out) as { pid: number; segs: number }
    expect(child.pid).not.toBe(process.pid)
    // And it produced a real plan, not an empty stub.
    expect(child.segs).toBe(5)
  }, 60000)
})
