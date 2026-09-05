// @vitest-environment jsdom
//
// THE ADD FORM SHOVED THE LIBRARY DOWN THE PAGE.
//
// ⚠️ THE DEFECT. `addingNew` rendered a `<section>` in normal document flow,
// between the header and the products. Opening it pushed everything the creator
// was looking at out from under them, and on a phone the list they were adding
// a SECOND product alongside left the screen entirely. Adding a product is a
// task performed on top of the library, not a new region of it.
//
// ⚖️ AND THE DISMISSAL RULES ARE ASYMMETRIC ON PURPOSE. Escape closes, because a
// dialog that cannot be dismissed from the keyboard traps anyone not using a
// mouse. The backdrop does NOT, because this form holds typed answers and
// uploaded photos and a mis-aimed click would discard them with no undo. A
// deliberate keypress and a slipped click are not the same gesture.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ProductEntityRecord } from '@twinai/shared'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'owner-1' } } }),
}))

const ENTITY: ProductEntityRecord = {
  id: 'e1', name: 'Peak Tripod', creatorSummary: null, type: 'PHYSICAL_PRODUCT',
  relationship: 'OWN_PRODUCT', personalUse: 'NOT_CONFIRMED', showability: 'UNKNOWN',
  productUrl: 'https://peakdesign.example/tripod', affiliateUrl: null, evidence: null,
  restrictions: { approvedClaims: [], forbiddenClaims: [], complianceNotes: null },
  source: 'user_answer', userConfirmed: true, updated: '2026-08-24T00:00:00Z',
  communityMap: null, archivedAt: null,
  knowledge: [{
    field: 'description', value: 'A travel tripod', trust: 'usable',
    source: 'official_product_page', sourceUrl: 'https://peakdesign.example/tripod',
    extractedAt: '2026-08-24T00:05:00Z',
  }],
  knowledgeExtractedAt: '2026-08-24T00:05:00Z',
  knowledgeSourceUrl: 'https://peakdesign.example/tripod',
  knowledgeFailedAt: null, knowledgeError: null,
}

vi.mock('@twinai/shared', async () => {
  const actual = await vi.importActual<typeof import('@twinai/shared')>('@twinai/shared')
  return {
    ...actual,
    loadProductEntities: vi.fn(async (o?: { includeArchived?: boolean }) => o?.includeArchived ? [] : [ENTITY]),
    loadProductSuggestions: vi.fn(async () => []),
    listBrandVoices: vi.fn(async () => []),
    signEditUrls: vi.fn(async () => ({})),
  }
})

afterEach(() => { cleanup(); document.body.style.overflow = '' })

async function open() {
  const { default: ProductLibrary } = await import('./ProductLibrary')
  render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Add another product' }))
  return await screen.findByRole('dialog')
}

describe('adding a product happens on top of the library, not inside it', () => {
  it('opens as a modal dialog with an accessible name', async () => {
    const dialog = await open()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // ⚠️ NAMED, OR A SCREEN READER ANNOUNCES "dialog" AND NOTHING ELSE.
    // Resolved by hand — jest-dom's matchers are not installed in this suite,
    // and a name asserted through a matcher that does not exist is no assertion.
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Add a product')
  })

  it('leaves the product list mounted behind it', async () => {
    await open()
    // ⚠️ THE CLAIM THE DEFECT DISPROVED. The list must still be there — not
    // pushed off, not unmounted — so cancelling returns the creator to exactly
    // what they were looking at.
    expect(screen.getByDisplayValue('Peak Tripod')).toBeTruthy()
  })

  it('closes on Escape', async () => {
    await open()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('does NOT close when the backdrop is clicked', async () => {
    // ⚠️ THE ONE THAT PROTECTS TYPED WORK. A creator half-way through the form
    // who clicks past its edge must not lose what they entered.
    const dialog = await open()
    const backdrop = dialog.parentElement as HTMLElement
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })

  it('closes on the × button', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('locks the page behind it and restores what it found', async () => {
    document.body.style.overflow = 'auto'
    await open()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(window, { key: 'Escape' })
    // ⚠️ RESTORED TO WHAT IT WAS, NOT TO ''. Another component may own it.
    await waitFor(() => expect(document.body.style.overflow).toBe('auto'))
  })
})
