// @vitest-environment jsdom
//
// THIS IS HOW YOU SOUND (plan v5.1 item L, trial only). Fictional fixtures only.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VoiceCardPanel, withRemoved } from './VoiceCardPanel'

const TRIAL = 'trial-0000'
const view = {
  id: 'vc_fictional',
  title: 'This is how you sound',
  counted_from: '4 videos (18 min) and 6 answers',
  sections: [
    { key: 'sentences' as const, label: 'Your sentences', summary: 'About 14 words each; casual.', items: [], editable: false },
    { key: 'signatures' as const, label: 'Your phrases', summary: 'Said word for word at least twice.', items: ["here's the thing", 'honestly'], editable: true },
    { key: 'never_says' as const, label: 'What you never say', summary: 'Twin will not write these for you.', items: ['game-changer'], editable: true },
  ],
}

beforeEach(() => { vi.stubEnv('VITE_TRIAL_USER_ID', TRIAL) })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('VoiceCardPanel', () => {
  it('hidden for a real creator, and loads nothing', () => {
    const load = vi.fn()
    const { container } = render(<VoiceCardPanel userId="someone-else" load={load} />)
    expect(container.innerHTML).toBe('')
    expect(load).not.toHaveBeenCalled()
  })

  it('hidden under the kill switch', () => {
    vi.stubEnv('VITE_VOICE_CARD_KILL', '1')
    const load = vi.fn()
    const { container } = render(<VoiceCardPanel userId={TRIAL} load={load} />)
    expect(container.innerHTML).toBe('')
    expect(load).not.toHaveBeenCalled()
  })

  it('shows the card and removes a phrase she does not use', async () => {
    const load = vi.fn(async (action: 'get' | 'edit') => (action === 'get' ? { card: view, reason: 'ok', edits: {} } : { card: view, reason: 'ok', edits: { remove: { signatures: ['honestly'] } } }))
    render(<VoiceCardPanel userId={TRIAL} load={load} />)
    await screen.findByText('This is how you sound')
    expect(screen.getByText(/4 videos \(18 min\)/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Remove honestly'))
    await waitFor(() => expect(load).toHaveBeenCalledWith('edit', { remove: { signatures: ['honestly'] } }))
  })

  it('adds a phrase she never says', async () => {
    const load = vi.fn(async () => ({ card: view, reason: 'ok', edits: {} }))
    render(<VoiceCardPanel userId={TRIAL} load={load} />)
    await screen.findByText('This is how you sound')
    fireEvent.change(screen.getByLabelText('A phrase you never say'), { target: { value: 'hey besties' } })
    fireEvent.click(screen.getByText('I never say this'))
    await waitFor(() => expect(load).toHaveBeenCalledWith('edit', { never_says_add: ['hey besties'] }))
  })

  it('a thin creator is told why there is no card', async () => {
    render(<VoiceCardPanel userId={TRIAL} load={vi.fn(async () => ({ card: null, reason: 'thin' }))} />)
    await screen.findByText(/Not enough of your own words yet/)
  })

  it('withRemoved is pure and de-duplicates', () => {
    const e = { remove: { uses: ['beans'] } }
    expect(withRemoved(e, 'uses', 'beans')).toEqual({ remove: { uses: ['beans'] } })
    expect(withRemoved(e, 'never_says', 'x')).toEqual({ remove: { uses: ['beans'], never_says: ['x'] } })
    expect(e).toEqual({ remove: { uses: ['beans'] } })
  })
})
