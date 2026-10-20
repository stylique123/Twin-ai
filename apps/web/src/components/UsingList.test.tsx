// @vitest-environment jsdom
//
// "Using" list (plan v5.4 O, trial only). Fictional fixtures only.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
import { UsingList, usingItemsOf } from './UsingList'

const TRIAL = 'trial-0000'
const FACT_ID = '11111111-2222-4333-8444-555555555555'
// Fictional: Paper Kite Studio.
const bp = {
  line_sources: [
    { beat: 0, sentence: 'I sewed the first kite on my kitchen table.', from: [{ kind: 'fact', id: FACT_ID, label: 'Sewed the first kite at home' }] },
    { beat: 1, sentence: 'The kite folds into a pocket.', from: [{ kind: 'her_words', label: 'Your answer: it folds flat' }, { kind: 'product', label: 'Paper Kite' }] },
    { beat: 2, sentence: 'Parents ask if it survives wind.', from: [{ kind: 'audience', label: 'Viewers ask about wind' }, { kind: 'fact', id: FACT_ID, label: 'Sewed the first kite at home' }] },
    { beat: 3, sentence: 'Link in bio.', from: [] },
  ],
}

beforeEach(() => { vi.stubEnv('VITE_TRIAL_USER_ID', TRIAL) })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('usingItemsOf', () => {
  it('one row per item, tagged by source, deduplicated', () => {
    const items = usingItemsOf(bp)
    expect(items.map((i) => [i.tag, i.label])).toEqual([
      ['Your fact', 'Sewed the first kite at home'],
      ['Your answer', 'it folds flat'],
      ['Product', 'Paper Kite'],
      ['Outside', 'Viewers ask about wind'],
    ])
    expect(items[0].lines).toBe(2)
    expect(items[0].factId).toBe(FACT_ID)
    expect(items[2].factId).toBeNull()
  })
  it('nothing for an older blueprint', () => {
    expect(usingItemsOf({})).toEqual([])
  })
})

describe('UsingList', () => {
  it('hidden for a real creator', () => {
    const { container } = render(<UsingList userId="someone-else" blueprint={bp} send={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
  it('hidden under the kill switch', () => {
    vi.stubEnv('VITE_USING_LIST_KILL', '1')
    const { container } = render(<UsingList userId={TRIAL} blueprint={bp} send={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
  it('shows each item with its tag; "Never use" only on her stored facts; no "Remove"', () => {
    render(<UsingList userId={TRIAL} blueprint={bp} send={vi.fn()} />)
    expect(screen.getAllByTestId('using-tag').map((t) => t.textContent)).toEqual(['Your fact', 'Your answer', 'Product', 'Outside'])
    expect(screen.getAllByText('Never use')).toHaveLength(1)
    expect(screen.queryByText('Remove')).toBeNull()
  })
  it('"Never use" sends the fact id and confirms', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true })
    render(<UsingList userId={TRIAL} blueprint={bp} send={send} />)
    fireEvent.click(screen.getByText('Never use'))
    await screen.findByText("Twin won't use this again")
    expect(send).toHaveBeenCalledWith(FACT_ID)
  })
  it('a failed save says so', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false })
    render(<UsingList userId={TRIAL} blueprint={bp} send={send} />)
    fireEvent.click(screen.getByText('Never use'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})
