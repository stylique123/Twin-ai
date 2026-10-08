import { describe, it, expect } from 'vitest'
import { readExtractedFact, EXTRACTED_FIELDS } from '../jobs/productExtractionContract.js'

// Plan v3 1.1 — fictional FlowDesk / Maya's Coffee pages.
const read = (field: string, value: string) =>
  readExtractedFact({ field: field as never, value, source: 'official_product_page' as never, sourceUrl: 'https://flowdesk.example/', now: 't' })

describe('extractor fields (plan 1.1)', () => {
  it('keeps the screen and shape facts the prompt already asked for', () => {
    expect(read('page_section', 'dashboard screenshot: a weekly board')).not.toBeNull()
    expect(read('object_shape', 'bag')).not.toBeNull()
  })
  it('keeps every new field', () => {
    for (const f of ['problem', 'process_step', 'faq', 'proof_number', 'testimonial', 'screen', 'terms', 'includes', 'comparison', 'show_action']) {
      expect(EXTRACTED_FIELDS).toContain(f)
      expect(read(f, 'something the page states')).not.toBeNull()
    }
  })
  it('holds numbers, quotes, rivals and terms for her confirmation', () => {
    for (const f of ['proof_number', 'testimonial', 'comparison', 'terms']) {
      expect(read(f, 'plain words')?.trust).toBe('needs_confirmation')
    }
  })
  it('lets descriptive fields through when they assert nothing measurable', () => {
    expect(read('process_step', '1. Open the board and add a task')?.trust).toBe('usable')
    expect(read('screen', 'board view: tasks in three columns')?.trust).toBe('usable')
  })
  it('still rejects an unknown field', () => {
    expect(read('vibe', 'cozy')).toBeNull()
  })
})
