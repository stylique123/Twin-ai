// Plan v5.1 M+N client (trial only). The server decides who is in the trial
// (test and panel accounts, from identity) and returns `disabled` for everyone
// else, so a real creator sees nothing new and her flow is unchanged.
import { supabase } from './supabase'

export interface AngleCardView {
  angle: string
  label: string
  shape: string
  opening: { text: string | null; source: string }
  twins_pick: boolean
}
export interface AngleQuestionView { ask_id: string | null; key: string; piece: string; kind: string; source: string; text: string }
export interface AnglePlan { disabled: boolean; cards: AngleCardView[]; questions: AngleQuestionView[] }

const OFF: AnglePlan = { disabled: true, cards: [], questions: [] }

export async function loadAnglePlan(input: { objective?: string; goal?: string; product_id?: string; angle?: string; door?: string; idea?: string }): Promise<AnglePlan> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-blueprint', { body: { mode: 'angle_plan', ...input } })
    if (error || !data || (data as { disabled?: unknown }).disabled === true) return OFF
    const d = data as { cards?: unknown; questions?: unknown }
    return {
      disabled: false,
      cards: Array.isArray(d.cards) ? d.cards as AngleCardView[] : [],
      questions: Array.isArray(d.questions) ? d.questions as AngleQuestionView[] : [],
    }
  } catch { return OFF }
}

/** Sends her answer, or her skip (`answer` null). Never throws: a failed save never blocks the build. */
export async function sendAngleAnswer(q: AngleQuestionView, answer: string | null, productId?: string): Promise<void> {
  try {
    await supabase.functions.invoke('generate-blueprint', {
      body: { mode: 'angle_answer', key: q.key, piece: q.piece, ask_id: q.ask_id ?? undefined, product_id: productId,
        ...(answer && answer.trim() ? { answer: answer.trim() } : { skip: true }) },
    })
  } catch { /* best effort */ }
}
