// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const invoke = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))
import { AngleQuestionsCard } from './AngleQuestionsCard'

// Fictional fixture: Juniper Candle Co. The server sends a ladder follow-up and
// the pre-writing problem question only when its flags are on; the card shows
// them like any other question and hands the answers up by key.
const cards = [{ angle: 'moment', label: 'Tell the moment', shape: 'story_open', opening: { text: null, source: 'none' }, twins_pick: true }]
const ladder = { ask_id: null, key: 'mn:ladder:k1:3', piece: 'story.turn', kind: 'story', source: 'her_material', text: 'After "I burned my first batch", what did you do next?' }
const problem = { ask_id: null, key: 'mn:problem', piece: 'problem', kind: 'product_slot', source: 'product', text: 'What problem does this solve for your customer, in your words?' }

beforeEach(() => { cleanup(); invoke.mockReset() })

describe('AngleQuestionsCard with ladder and problem questions', () => {
  it('answers to both go to angle_answer and up as mn_answers', async () => {
    invoke.mockImplementation((_f: string, o?: { body?: Record<string, unknown> }) => Promise.resolve({
      data: o?.body?.mode === 'angle_plan' ? { cards, questions: o.body.angle ? [ladder, problem] : [] } : { ok: true }, error: null,
    }))
    const onAnswers = vi.fn()
    render(<AngleQuestionsCard onAnswers={onAnswers} />)
    fireEvent.click(await screen.findByText(/Tell the moment/))
    fireEvent.change(await screen.findByLabelText(ladder.text), { target: { value: 'I moved the pots inside.' } })
    fireEvent.click(screen.getAllByText('Save')[0]!)
    fireEvent.change(screen.getByLabelText(problem.text), { target: { value: 'Candles that tunnel after one burn.' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(onAnswers).toHaveBeenLastCalledWith({ 'mn:ladder:k1:3': 'I moved the pots inside.', 'mn:problem': 'Candles that tunnel after one burn.' }))
    expect(invoke).toHaveBeenCalledWith('generate-blueprint', expect.objectContaining({ body: expect.objectContaining({ mode: 'angle_answer', key: 'mn:ladder:k1:3', piece: 'story.turn' }) }))
    expect(invoke).toHaveBeenCalledWith('generate-blueprint', expect.objectContaining({ body: expect.objectContaining({ mode: 'angle_answer', key: 'mn:problem', piece: 'problem' }) }))
  })
})
