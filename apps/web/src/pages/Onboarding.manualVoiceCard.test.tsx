// @vitest-environment jsdom
//
// Plan v6.6 §32: "describe your voice yourself" stores her typed answers,
// labelled manual, so the server builds a voice card with no model call.
// Behind VITE_MANUAL_VOICE_CARD, default off. Fictional fixtures only.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { withManualVoiceAnswers, manualVoiceCardFlag } from './Onboarding'
import { VoiceCardPanel } from '../components/VoiceCardPanel'
import { buildManualVoiceCard, MANUAL_VOICE_KEY } from '@twinai/shared'
import type { VoiceProfile } from '../lib/types'

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

const vp: VoiceProfile = {
  summary: '', niche: 'Fictional pottery classes', tone: 'calm and friendly', pacing: '', hook_style: '',
  vocabulary: [], recurring_ctas: [], dos: [], donts: [], sample_hooks: ['I cracked forty bowls before one survived the kiln.'],
}

describe('withManualVoiceAnswers', () => {
  it('flag is off by default', () => {
    expect(manualVoiceCardFlag()).toBe(false)
    vi.stubEnv('VITE_MANUAL_VOICE_CARD', 'true')
    expect(manualVoiceCardFlag()).toBe(true)
  })

  it('leaves the profile untouched when the flag is off or the voice was scanned', () => {
    expect(withManualVoiceAnswers(vp, { manual: true }, 'beginners', 'Clay kit', false)).toBe(vp)
    expect(withManualVoiceAnswers(vp, {}, 'beginners', 'Clay kit', true)).toBe(vp)
  })

  it('stores her typed answers, labelled manual, and they build a card', () => {
    const out = withManualVoiceAnswers(vp, { manual: true }, 'beginners', 'Clay kit', true) as unknown as Record<string, unknown>
    const stored = out[MANUAL_VOICE_KEY] as Record<string, unknown>
    expect(stored.source).toBe('manual')
    expect(stored.niche).toBe('Fictional pottery classes')
    expect(stored.audience).toBe('beginners')
    expect(stored.products).toEqual(['Clay kit'])
    expect(stored.stories).toEqual(vp.sample_hooks)
    expect(out.niche).toBe(vp.niche)
    const card = buildManualVoiceCard(stored)
    expect(card?.source).toBe('manual')
  })
})

describe('VoiceCardPanel shows a manual card as manual', () => {
  it('labels it set up by hand', async () => {
    vi.stubEnv('VITE_TRIAL_USER_ID', 'trial-0000')
    const view = {
      id: 'manual-00000000', title: 'This is how you sound', counted_from: 'what you typed when you set up your voice by hand', manual: true as const,
      sections: [{ key: 'tone' as const, label: 'Humor and tone', summary: 'even', items: [], editable: false }],
    }
    render(<VoiceCardPanel userId="trial-0000" load={async () => ({ card: view, reason: 'manual', edits: {} })} />)
    expect((await screen.findByTestId('voice-card-manual')).textContent).toMatch(/No AI was used/)
  })
})
