// A RESOLVER THAT ONLY GRADES IS A RESOLVER THAT CHANGES NOTHING.
//
// ⚠️ THIS REPO'S RECURRING FAILURE IS THE UNWIRED CAPABILITY, not the wrong
// rule. `scanTargetConfirmation`, the caption extractor and `csEntities` each
// shipped complete, passed their own tests, and were never actually passed to
// the thing that needed them — CI green throughout. `resolveTemplate` at the
// edge is one `console.log` away from being the next one: it would produce
// perfect resolutions, grade the script against them, and never tell the writer
// which item answers which beat. These tests read the edge source and assert the
// resolutions reach the PROMPT, not just the report.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the resolver reaches the prompt, not only the report', () => {
  it('resolves the template against what the writer was actually handed', () => {
    // ⚠️ `speakable`, not the fuller knowledge set. Resolving against material
    // the model never received would mark a beat filled from a prompt nobody
    // sent — the check would then be measuring a different generation.
    expect(EDGE).toMatch(/resolveTemplate\(\s*\n\s*tpl,\s*\n\s*\{\s*\n\s*items: speakable\.map/)
  })

  it('never lets a beat resolve to research this function does not do', () => {
    expect(EDGE).toMatch(/researchable: false/)
  })

  it('appends the per-beat assignment to the prompt', () => {
    expect(EDGE).toContain('containerBlock += ')
    expect(EDGE).toContain('WHAT EACH OF THOSE BEATS IS FILLED WITH')
    expect(EDGE).toMatch(/\$\{beatLines\.join/)
  })

  it('names an unfilled beat as unfilled and forbids improvising one', () => {
    // ⚖️ The whole product decision in one line: an empty beat is a fact about
    // this creator's knowledge, not an invitation.
    expect(EDGE).toContain('NOTHING THEY HAVE SAID FILLS THIS')
    expect(EDGE).toMatch(/Do not invent a fact, a/)
  })

  it('carries the attribution into the prompt, so a claim is traceable', () => {
    expect(EDGE).toMatch(/they said this — source: \$\{got\.attribution\}/)
  })

  it('does NOT instruct the model to research or to ask mid-generation', () => {
    // ⚠️ Both fallbacks are real and neither is available here. Rendering
    // `research` as an instruction would be instructing the model to invent a
    // fact; `ask` has no channel once generation has started.
    const block = EDGE.slice(EDGE.indexOf('const beatLines'), EDGE.indexOf('resolvedSlots = buildSlots'))
    expect(block).toMatch(/fb\.kind === 'generalise'/)
    expect(block).not.toMatch(/kind === 'research'/)
    expect(block).not.toMatch(/kind === 'ask'/)
  })

  it('gates the two checks on slots that exist AND are filled', () => {
    // A half-resolved template must not manufacture a failure: the prompt still
    // hands the model the knowledge block for beats no slot filled.
    expect(EDGE).toMatch(/resolvedSlots !== null && slotsReady\(resolvedSlots\)/)
    expect(EDGE).toMatch(/\?\s*validateScript\(spoken/)
    expect(EDGE).toMatch(/:\s*validateWhatWeCan\(spoken, plan, opts\)/)
  })

  it('records which report was stored, rather than inferring it from notRun', () => {
    expect(EDGE).toMatch(/slots: resolvedSlots === null \? null : resolvedSlots\.length/)
  })
})
