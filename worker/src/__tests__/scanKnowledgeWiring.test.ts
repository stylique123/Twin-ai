// THE SCAN MUST LEAVE THE CREATOR WITH SOMETHING TO WRITE FROM.
//
// ⚠️ THE DEFECT, EXACTLY. `build_voice` was the ONLY job that ever wrote
// `creator_knowledge`. The DNA scan itself wrote none — so a creator whose audio
// upgrade never ran, had no usable transcripts, or simply failed, ended up with
// an empty table. `generate-blueprint` selects creator knowledge from that
// table, so the result was a content-empty script arrived at in silence, with
// every check passing because nothing was fabricated.
//
// ⚖️ AND THE PIECES ALREADY EXISTED. The captions were in hand and
// `extractKnowledgeFromCaptions` was already written and tested. Nothing called
// it from here. Same shape as `scanTargetConfirmation`: a capability shipped and
// never wired to the path that needed it, with CI reporting it green.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCAN = readFileSync(join(REPO, 'worker/src/jobs/scrapeDna.ts'), 'utf8')
const VOICE = readFileSync(join(REPO, 'worker/src/jobs/voice.ts'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the scan stores creator knowledge, not just a voice', () => {
  it('extracts from the captions it already has', () => {
    expect(SCAN).toMatch(/extractKnowledgeFromCaptions\(handle, platform, captions\)/)
    // The insert goes through `insertKnowledge`, which carries the `source`
    // column's PGRST204 fallback. Asserting the raw `.insert(rows)` here would
    // forbid that wrapper and push provenance-less writes back into the scan.
    expect(SCAN).toMatch(/insertKnowledge\(db as never, rows\)/)
  })

  it('is enrichment and never gates the voice', () => {
    // ⚖️ The rule the audio path already follows. A creator whose extraction
    // breaks must still get their voice; trading a working feature for a new
    // one is not an upgrade.
    const block = SCAN.slice(SCAN.indexOf('CAPTION KNOWLEDGE, BECAUSE ZERO IS WORSE'))
    expect(block.slice(0, block.indexOf('Best-effort audio upgrade')))
      .toMatch(/catch \(err\) \{\n\s*console\.error\('scrape_dna: caption knowledge failed'/)
  })

  it('degrades an unreadable basis to the WEAKEST reading', () => {
    // `inferred` may never be quoted back. Defaulting to anything stronger
    // would let junk become a stance.
    expect(SCAN).toMatch(/\['stated', 'demonstrated', 'inferred'\]\.includes\(r\.basis\) \? r\.basis : 'inferred'/)
  })

  it('logs the COMPOSITION, because a count cannot show the weak state', () => {
    // ⚠️ Reading the corpus, 479 of 479 stored items were coverage-level — not
    // one could license an opinion beat — and `knowledge_items: N` would have
    // reported that as a healthy number.
    expect(SCAN).toMatch(/event: 'caption_knowledge_stored'/)
    expect(SCAN).toMatch(/by_kind: byKind/)
    expect(SCAN).toMatch(/stated: rows\.filter/)
  })
})

describe('the reader this feeds, and the path that was doing all the work', () => {
  it('the blueprint really does read creator_knowledge', () => {
    // If this ever stops being true, the wiring above is pointless and this
    // test is where that gets noticed.
    expect(EDGE).toMatch(/from\('creator_knowledge'\)/)
  })

  it('the audio path still adds what captions cannot', () => {
    // ⚖️ Caption items are clamped to `demonstrated` and resolve to COVERAGE.
    // Only speech produces `stated` positions, so this wiring supplements the
    // audio upgrade and must never be read as replacing it.
    expect(VOICE).toMatch(/extractKnowledgeFromAudio\(handle, platform, transcripts\)/)
  })
})
