// @vitest-environment jsdom
//
// Owner rule (13 Oct): a placeholder must never be shown as a finished script.
// Fictional fixtures only.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import {
  NeedsAnswerCard, ScriptWithGaps, checkStatusOf, gateStatusFor, recordBlocked,
} from './NeedsAnswerGate'

const TRIAL = 'trial-0000'
const OTHER = 'someone-else'

const needsAnswers = {
  invention_gate: { outcome: 'needs_answers' },
  gate_questions: [
    { scope: 'script', kind: 'story', text: 'What happened the first time you tried it?', writes_to: 'script.beat.1:story' },
    { scope: 'script', kind: 'result', text: 'What changed after a week?', writes_to: 'script.beat.3:result' },
  ],
  script: [
    { line: 'Here is the fictional lamp.' },
    { line: 'The first night [Your answer: what happened] and I kept it.' },
  ],
}

beforeEach(() => { vi.stubEnv('VITE_TRIAL_USER_ID', TRIAL) })
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe('needs one answer screen', () => {
  it('needs_answers: lists each question with a box and keeps recording closed', async () => {
    const onSubmit = vi.fn(async () => {})
    render(<NeedsAnswerCard userId={TRIAL} blueprint={needsAnswers} onSubmit={onSubmit} />)
    expect(screen.getByText('Twin needs 2 answers before this script is ready')).toBeTruthy()
    const boxes = screen.getAllByRole('textbox')
    expect(boxes).toHaveLength(2)
    expect(recordBlocked(gateStatusFor(TRIAL, needsAnswers))).toBe(true)
    const send = screen.getByRole('button', { name: /send answers/i }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.change(boxes[0], { target: { value: 'It flickered' } })
    fireEvent.change(boxes[1], { target: { value: 'I slept better' } })
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      'script.beat.1:story': 'It flickered', 'script.beat.3:result': 'I slept better',
    }))
  })

  it('check_status wins over invention_gate when present', () => {
    expect(checkStatusOf({ check_status: 'checked', invention_gate: { outcome: 'needs_answers' } })).toBe('checked')
    expect(checkStatusOf({ invention_gate: { outcome: 'general' } })).toBe('general')
    expect(checkStatusOf({})).toBe('checked')
  })

  it('placeholder lines render as gaps, not as script text', () => {
    render(<ScriptWithGaps script={needsAnswers.script} />)
    const gap = screen.getByTestId('script-gap')
    expect(gap.textContent).toBe('gap: what happened')
    expect(screen.queryByText(/\[Your answer:/)).toBeNull()
    expect(document.querySelectorAll('li[data-gap="true"]')).toHaveLength(1)
  })

  it('general: shows the make-it-yours banner, recording stays open', () => {
    const bp = { ...needsAnswers, invention_gate: { outcome: 'general' } }
    render(<NeedsAnswerCard userId={TRIAL} blueprint={bp} onSubmit={async () => {}} />)
    expect(screen.getByText(/This is a general version/)).toBeTruthy()
    expect(recordBlocked(gateStatusFor(TRIAL, bp))).toBe(false)
  })

  it('non-trial users see nothing and are never blocked', () => {
    const { container } = render(<NeedsAnswerCard userId={OTHER} blueprint={needsAnswers} onSubmit={async () => {}} />)
    expect(container.innerHTML).toBe('')
    expect(gateStatusFor(OTHER, needsAnswers)).toBe('checked')
    expect(recordBlocked(gateStatusFor(OTHER, { check_status: 'unchecked' }))).toBe(false)
  })

  it('unchecked: neutral banner, record disabled, polls then stops after the window', () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn()
    const bp = { check_status: 'unchecked' }
    render(<NeedsAnswerCard userId={TRIAL} blueprint={bp} onSubmit={async () => {}} onRefresh={onRefresh} />)
    expect(screen.getByText('Twin is still checking this script')).toBeTruthy()
    expect(recordBlocked(gateStatusFor(TRIAL, bp))).toBe(true)
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(200_000) })
    expect(onRefresh.mock.calls.length).toBeLessThanOrEqual(12)
  })
})
