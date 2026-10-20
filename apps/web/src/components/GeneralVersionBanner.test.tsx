// @vitest-environment jsdom
//
// General-version banner (plan v5.4 O, trial only). Fictional fixtures only.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { GeneralVersionBanner, isGeneralVersion } from './GeneralVersionBanner'

const TRIAL = 'trial-0000'
const general = { degraded: { reason: 'writer_timeout', source: 'general', lines: 3 } }
const planB = { degraded: { reason: 'writer_timeout', source: 'plan_b', lines: 4 } }

beforeEach(() => { vi.stubEnv('VITE_TRIAL_USER_ID', TRIAL) })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('GeneralVersionBanner', () => {
  it('reads blueprint.degraded', () => {
    expect(isGeneralVersion(general)).toBe(true)
    expect(isGeneralVersion(planB)).toBe(true)
    expect(isGeneralVersion({})).toBe(false)
    expect(isGeneralVersion({ degraded: 'yes' })).toBe(false)
  })
  it('shows the banner and goes back to the questions', () => {
    const back = vi.fn()
    render(<GeneralVersionBanner userId={TRIAL} blueprint={general} onBackToQuestions={back} />)
    expect(screen.getByText(/This is a general version — add a story or answer a question to make it yours/)).toBeTruthy()
    fireEvent.click(screen.getByText('Back to the questions'))
    expect(back).toHaveBeenCalled()
  })
  it('nothing on a full script', () => {
    const { container } = render(<GeneralVersionBanner userId={TRIAL} blueprint={{}} onBackToQuestions={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
  it('hidden for a real creator', () => {
    const { container } = render(<GeneralVersionBanner userId="someone-else" blueprint={general} onBackToQuestions={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
  it('hidden under the kill switch', () => {
    vi.stubEnv('VITE_GENERAL_BANNER_KILL', '1')
    const { container } = render(<GeneralVersionBanner userId={TRIAL} blueprint={general} onBackToQuestions={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
})
