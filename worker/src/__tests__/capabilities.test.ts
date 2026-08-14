// THE MISSING TOKEN THAT COST A DAY, MADE AUDIBLE.
//
// `APIFY_TOKEN` was absent from the worker's environment for an entire session
// of development. Every credential check was correct and every one was per-call,
// so the absence only spoke when a user tripped over it — and what it said,
// "not configured yet… contact support", reads as a product decision rather than
// a missing environment variable.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { capabilitySummary, darkCapabilityWarnings, readCapabilities } from '../capabilities.js'

const ALL = { apifyToken: 't', apifyProxyPassword: 'p', geminiKey: 'g' }

describe('what the worker says at boot', () => {
  it('says nothing when everything is live', () => {
    // ⚖️ A WARNING ON EVERY HEALTHY BOOT IS A WARNING NOBODY READS.
    expect(darkCapabilityWarnings(readCapabilities(ALL))).toEqual([])
  })

  it('names the VARIABLE, not the symptom', () => {
    const [first] = darkCapabilityWarnings(readCapabilities({ ...ALL, apifyToken: '' }))
    // ⚠️ "apify unavailable" sends somebody reading source. This is the fix.
    expect(first).toMatch(/^APIFY_TOKEN is not set/)
  })

  it('says what silently does not happen', () => {
    const lines = darkCapabilityWarnings(readCapabilities({ ...ALL, geminiKey: '' })).join(' ')
    expect(lines).toMatch(/scans store no knowledge/)
  })

  it('treats the proxy password as its own capability', () => {
    // ⚠️ NOT DERIVABLE FROM THE TOKEN. A token without the proxy password scrapes
    // Instagram fine and returns EMPTY PALETTES, because Meta signs its imagery
    // to the requesting IP. That presents as a colour bug, not a config gap.
    const warn = darkCapabilityWarnings(readCapabilities({ ...ALL, apifyProxyPassword: '' }))
    expect(warn).toHaveLength(1)
    expect(warn[0]).toMatch(/APIFY_PROXY_PASSWORD/)
    expect(warn[0]).toMatch(/empty palettes/)
  })

  it('reports one dark capability per missing key, not one per feature', () => {
    // Both Apify capabilities go dark on one missing token — the operator has ONE
    // thing to fix and should see it as one cause, listed per affected capability.
    const warn = darkCapabilityWarnings(readCapabilities({ ...ALL, apifyToken: '' }))
    expect(warn).toHaveLength(2)
    expect(warn.every((w) => w.startsWith('APIFY_TOKEN'))).toBe(true)
  })

  it('summarises by variable name, so a log line is greppable', () => {
    expect(capabilitySummary(readCapabilities({ ...ALL, apifyToken: '' })))
      .toEqual({ APIFY_TOKEN: false, APIFY_PROXY_PASSWORD: true, GEMINI_API_KEY: true })
  })

  it('survives an entirely empty environment', () => {
    const caps = readCapabilities({})
    expect(caps.every((c) => c.live)).toBe(false)
    expect(darkCapabilityWarnings(caps)).toHaveLength(caps.length)
  })
})

describe('the boot path', () => {
  const SRC = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'), 'utf8')

  it('reports capability at boot rather than at first use', () => {
    // ⚠️ THE WHOLE POINT. A per-call check reaches the user; a boot line reaches
    // the person who can fix it.
    expect(SRC).toMatch(/readCapabilities\(env\)/)
    expect(SRC).toMatch(/capabilities: capabilitySummary\(caps\)/)
  })

  it('WARNS AND KEEPS RUNNING — a missing optional key is not an outage', () => {
    // ⚖️ A worker without Apify still transcribes, renders and scans TikTok.
    // Exiting here would turn reduced capability into downtime.
    const boot = SRC.slice(SRC.indexOf('async function main()'), SRC.indexOf('Graceful shutdown'))
    expect(boot).toMatch(/darkCapabilityWarnings\(caps\)/)
    expect(boot).not.toMatch(/process\.exit|throw new Error/)
  })
})
