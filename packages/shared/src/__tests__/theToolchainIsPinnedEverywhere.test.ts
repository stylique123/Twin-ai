import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ⚠️ THE OUTAGE THIS EXISTS TO PREVENT IS ONE THAT ALREADY HAPPENED, AND THE
// LESSON WAS ALREADY WRITTEN DOWN IN ONE FILE. On 2026-08-24 the edge deploy
// failed at setup with "Failed to resolve latest Supabase CLI release: rate
// limit exceeded" -- before the CLI was installed and before any deploy step
// ran. The merge that triggered it therefore sat UNDEPLOYED while main looked
// green, which is the dangerous part: nothing on the PR said the edge functions
// were stale.
//
// ⚖️ staging-integration.yml HAD BEEN PINNED FOR EXACTLY THIS REASON, with a
// comment naming the rate limit. The knowledge existed; it had just not been
// applied to the other two workflows. A comment in one file is not a rule --
// this is.

const WORKFLOWS = join(import.meta.dirname, '..', '..', '..', '..', '.github', 'workflows')

const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

describe('no workflow installs a moving Supabase CLI', () => {
  it('finds the workflow directory at all', () => {
    // Guards that read a directory must prove the directory was read: an empty
    // list would otherwise pass every case below while checking nothing.
    expect(files.length).toBeGreaterThan(0)
  })

  const installers = files.filter((f) =>
    readFileSync(join(WORKFLOWS, f), 'utf8').includes('supabase/setup-cli'))

  it('there is at least one workflow that installs it', () => {
    expect(installers.length).toBeGreaterThan(0)
  })

  it.each(installers)('%s pins an explicit version', (file) => {
    const body = readFileSync(join(WORKFLOWS, file), 'utf8')
    // ⚠️ MATCHED ON THE `with:` VALUE, NOT ANYWHERE IN THE FILE. The word
    // "latest" appears in prose comments explaining why it is not used, and a
    // guard that matched those would fail against the very file that fixed it.
    const versions = [...body.matchAll(/^\s*version:\s*(\S+)\s*$/gm)].map((m) => m[1])
    expect(versions.length, `${file} sets no version`).toBeGreaterThan(0)
    // ⚖️ EVERY `version:` IN AN INSTALLER WORKFLOW, not only the CLI's. The
    // failure mode is "a tool resolved at run time from a shared runner IP",
    // and that is a property of `latest`, not of which action asked for it.
    for (const v of versions) {
      expect(v, `${file} pins ${v}`).not.toBe('latest')
    }
  })
})
