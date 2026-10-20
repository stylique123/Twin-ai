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
    fireEvent.click(screen.getByText('Write a general version'))
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
  describe('skip caution (plan v5.4 O)', () => {
    const toQuestion = async () => {
      invoke.mockImplementation(serve)
      render(<AngleQuestionsCard onAnswers={() => {}} />)
      fireEvent.click(await screen.findByText(/Tell the moment/))
      await screen.findByText(question.text)
      fireEvent.click(screen.getByText('Skip'))
    }
    const answerCalls = () => invoke.mock.calls.filter((c) => (c[1] as { body: { mode: string } }).body.mode === 'angle_answer')
    it('a skip offers three choices and sends nothing yet', async () => {
      await toQuestion()
      expect(screen.getByTestId('skip-caution')).toBeTruthy()
      expect(screen.getByText('Write a general version')).toBeTruthy()
      expect(screen.getByText('Add one more line')).toBeTruthy()
      expect(screen.getByText('Try another angle')).toBeTruthy()
      expect(answerCalls()).toHaveLength(0)
    })
    it('"Add one more line" reopens the question for a single line', async () => {
      await toQuestion()
      fireEvent.click(screen.getByText('Add one more line'))
      const input = screen.getByLabelText(question.text) as HTMLInputElement
      expect(input.placeholder).toBe('Just one line is enough')
      expect(answerCalls()).toHaveLength(0)
    })
    it('"Try another angle" goes back to the three cards', async () => {
      await toQuestion()
      fireEvent.click(screen.getByText('Try another angle'))
      expect(screen.queryByTestId('mn-questions')).toBeNull()
      expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(3)
      expect(answerCalls()).toHaveLength(0)
    })
    it('kill switch: skip records at once, no caution', async () => {
      vi.stubEnv('VITE_SKIP_CAUTION_KILL', '1')
      try {
        await toQuestion()
        expect(screen.queryByTestId('skip-caution')).toBeNull()
        await waitFor(() => expect(answerCalls()).toHaveLength(1))
      } finally { vi.unstubAllEnvs() }
    })
  })
})
