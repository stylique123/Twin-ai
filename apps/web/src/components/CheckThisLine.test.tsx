// @vitest-environment jsdom
//
// CHECK THIS LINE (backlog d, trial only). Fictional fixtures only.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CheckThisLine, checkLinesOf } from './CheckThisLine'

const TRIAL = 'trial-0000'
const bp = {
  script: [
    { line: 'Here is the Paper Kite. I sewed the first one on my kitchen table.' },
    { line: 'Grab a Paper Kite, link in bio.' },
  ],
  check_lines: [{ line_index: 0, reason: 'event_unbacked', span: { start: 24, end: 66 } }],
}

beforeEach(() => { vi.stubEnv('VITE_TRIAL_USER_ID', TRIAL) })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('CheckThisLine', () => {
  it('hidden for a real creator', () => {
    const { container } = render(<CheckThisLine userId="someone-else" generationId="g" blueprint={bp} send={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
  it('hidden under the kill switch', () => {
    vi.stubEnv('VITE_CHECK_LINE_KILL', '1')
    const { container } = render(<CheckThisLine userId={TRIAL} generationId="g" blueprint={bp} send={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
  it('hidden when nothing is left to check', () => {
    const done = { ...bp, check_lines: [{ ...bp.check_lines[0], decision: 'confirm' }] }
    const { container } = render(<CheckThisLine userId={TRIAL} generationId="g" blueprint={done} send={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
  it('trial: shows the line with the phrase marked and three buttons', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true })
    const onDone = vi.fn()
    render(<CheckThisLine userId={TRIAL} generationId="gen-1" blueprint={bp} send={send} onDone={onDone} />)
    expect(screen.getByText('I sewed the first one on my kitchen table.').tagName).toBe('MARK')
    fireEvent.click(screen.getByRole('button', { name: "It's true" }))
    await waitFor(() => expect(send).toHaveBeenCalledWith('gen-1', 0, 'confirm', undefined))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
  })
  it('edit sends her text; remove sends remove', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true })
    render(<CheckThisLine userId={TRIAL} generationId="gen-1" blueprint={bp} send={send} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Your line'), { target: { value: 'I sewed it at a friend’s studio.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save line' }))
    await waitFor(() => expect(send).toHaveBeenCalledWith('gen-1', 0, 'edit', 'I sewed it at a friend’s studio.'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(send).toHaveBeenCalledWith('gen-1', 0, 'remove', undefined))
  })
  it('a failed save says so', async () => {
    const send = vi.fn().mockRejectedValue(new Error('x'))
    render(<CheckThisLine userId={TRIAL} generationId="g" blueprint={bp} send={send} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
  it('checkLinesOf drops malformed rows', () => {
    expect(checkLinesOf({ check_lines: [{ line_index: 'x' }, null, bp.check_lines[0]] })).toHaveLength(1)
  })
})
