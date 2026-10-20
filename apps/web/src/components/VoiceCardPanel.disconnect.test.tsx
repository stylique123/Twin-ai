// @vitest-environment jsdom
//
// DISCONNECT TEST, ledger row 16 (screen half): the Settings voice card panel (#1288).
// With the route on, Settings shows her card; with VOICE_CARD_ENABLED=false the route
// answers `{disabled: true}` and the panel renders nothing. The route half is
// packages/shared/src/script/__tests__/disconnect/voiceCardRoute.disconnect.test.ts.
// Fictional fixtures only.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, render, screen } from '@testing-library/react'
import { VoiceCardPanel } from './VoiceCardPanel'
import type { VoiceCardResult } from '../lib/api'

const TRIAL = 'trial-0000'
const view = {
  id: 'vc_fictional',
  title: 'This is how you sound',
  counted_from: '4 videos (18 min) and 6 answers',
  sections: [
    { key: 'signatures' as const, label: 'Your phrases', summary: 'Said word for word at least twice.', items: ['honestly'], editable: true },
  ],
}

beforeEach(() => { vi.stubEnv('VITE_TRIAL_USER_ID', TRIAL) })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('Settings voice card panel disconnect', () => {
  it('route on: the card is shown; route off (disabled): nothing is shown', async () => {
    const on = render(<VoiceCardPanel userId={TRIAL} load={vi.fn(async () => ({ card: view, reason: 'ok', edits: {} }))} />)
    await screen.findByText('This is how you sound')
    const onHtml = on.container.innerHTML
    cleanup()
    // The route's exact off answer is `{ disabled: true }` (index.ts, VOICE_CARD_ENABLED=false).
    const load = vi.fn(async () => ({ disabled: true }) as VoiceCardResult)
    const off = render(<VoiceCardPanel userId={TRIAL} load={load} />)
    await vi.waitFor(() => expect(load).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(off.container.innerHTML).toBe('')
    expect(onHtml).not.toBe(off.container.innerHTML)
    expect(onHtml).toContain('honestly')
  })
  it('Settings still mounts the panel', () => {
    const settings = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Settings.tsx'), 'utf8')
    expect(settings).toContain("import { VoiceCardPanel } from '../components/VoiceCardPanel'")
    expect(settings).toMatch(/<VoiceCardPanel userId=\{profile\?\.id\} \/>/)
  })
})
