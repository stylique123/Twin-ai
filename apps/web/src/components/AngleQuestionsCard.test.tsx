// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const invoke = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))
import { AngleQuestionsCard } from './AngleQuestionsCard'

// Fictional fixture: Juniper Candle Co.
const cards = [
  { angle: 'moment', label: 'Tell the moment', shape: 'story_open', opening: { text: 'I burned my first batch.', source: 'her_material' }, twins_pick: true },
  { angle: 'stand', label: 'Take a stand', shape: 'stop_doing', opening: { text: null, source: 'none' }, twins_pick: false },
  { angle: 'myth', label: 'Bust a myth', shape: 'contrarian_gap', opening: { text: null, source: 'none' }, twins_pick: false },
]
const question = { ask_id: null, key: 'mn:story', piece: 'story', kind: 'story', source: 'her_material', text: 'Is there a moment with this you still think about? If so, what happened?' }

beforeEach(() => { cleanup(); invoke.mockReset() })
const serve = (_fn: string, opts?: { body?: Record<string, unknown> }) => {
  const body = opts?.body ?? {}
  return Promise.resolve({ data: body.mode === 'angle_plan' ? { cards, questions: body.angle ? [question] : [] } : { ok: true }, error: null })
}

describe('AngleQuestionsCard', () => {
  it('renders nothing for a real creator (server says disabled)', async () => {
    invoke.mockResolvedValue({ data: { disabled: true, cards: [], questions: [] }, error: null })
    const { container } = render(<AngleQuestionsCard onAnswers={() => {}} />)
    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
  it('shows three cards, then questions under the pick; skip and answers go to angle_answer', async () => {
    invoke.mockImplementation(serve)
    const onAnswers = vi.fn()
    render(<AngleQuestionsCard goal="educate" onAnswers={onAnswers} />)
    await screen.findByText(/Twin's pick/)
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(3)
    fireEvent.click(screen.getByText(/Tell the moment/))
    await screen.findByText(question.text)
    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('generate-blueprint', expect.objectContaining({ body: expect.objectContaining({ mode: 'angle_answer', key: 'mn:story', skip: true }) })))
    expect(screen.getByText('Skipped')).toBeTruthy()
    expect(onAnswers).toHaveBeenLastCalledWith({})
  })
  it('a saved answer is handed up as mn_answers', async () => {
    invoke.mockImplementation(serve)
    const onAnswers = vi.fn()
    render(<AngleQuestionsCard onAnswers={onAnswers} />)
    fireEvent.click(await screen.findByText(/Tell the moment/))
    fireEvent.change(await screen.findByLabelText(question.text), { target: { value: 'My tin cracked in the oven.' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(onAnswers).toHaveBeenLastCalledWith({ 'mn:story': 'My tin cracked in the oven.' }))
    expect(invoke).toHaveBeenCalledWith('generate-blueprint', expect.objectContaining({ body: expect.objectContaining({ mode: 'angle_answer', answer: 'My tin cracked in the oven.' }) }))
  })
})
