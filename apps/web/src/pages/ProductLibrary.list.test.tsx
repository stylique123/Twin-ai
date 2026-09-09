// @vitest-environment jsdom
//
// THE LIBRARY IS A LIST, NOT EVERY FORM AT ONCE.
//
// ⚠️ REPORTED FROM PRODUCTION, TWICE. First: "no proper confirmation of ui of
// added products remove or edit". Then, after a pass that fixed the WORDS and
// not the SHAPE: "two stupid big boxes in which I cannot actually select
// anything — they should not be boxes anymore".
//
// Both reports are one defect. Every product rendered its entire editor inline
// — name, one-liner, link, capability, photos, facts, relationship — so an
// account with two products was a page several screens long with no overview
// anywhere on it. Archive and edit both existed; the shape of the screen buried
// them, and a control a creator cannot find is a control nobody built.
//
// ⚖️ SO: ONE ROW PER PRODUCT, ONE PANEL FOR THE ONE BEING WORKED ON.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ProductEntityRecord } from '@twinai/shared'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'owner-1' } } }),
}))

const ONE: ProductEntityRecord = {
  id: 'e1', name: 'Peak Tripod', creatorSummary: null, type: 'PHYSICAL_PRODUCT',
  relationship: 'OWN_PRODUCT', personalUse: 'NOT_CONFIRMED', showability: 'UNKNOWN',
  productUrl: 'https://peakdesign.example/tripod', affiliateUrl: null, evidence: null,
  restrictions: { approvedClaims: [], forbiddenClaims: [], complianceNotes: null },
  source: 'user_answer', userConfirmed: true, updated: '2026-08-24T00:00:00Z',
  communityMap: null, archivedAt: null, knowledge: null,
  knowledgeExtractedAt: null, knowledgeSourceUrl: null,
  knowledgeFailedAt: null, knowledgeError: null,
}
const TWO: ProductEntityRecord = { ...ONE, id: 'e2', name: 'Medicube Pads', relationship: 'SPONSOR' }

vi.mock('@twinai/shared', async () => {
  const actual = await vi.importActual<typeof import('@twinai/shared')>('@twinai/shared')
  return {
    ...actual,
    loadProductEntities: vi.fn(async (o?: { includeArchived?: boolean }) => o?.includeArchived ? [] : [ONE, TWO]),
    loadProductSuggestions: vi.fn(async () => []),
    updateEntityPresentation: vi.fn(async () => {}),
    requestProductExtraction: vi.fn(async () => {}),
    listBrandVoices: vi.fn(async () => []),
  }
})

afterEach(() => { cleanup(); document.body.style.overflow = '' })

async function library() {
  const { default: ProductLibrary } = await import('./ProductLibrary')
  render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
  return await screen.findAllByRole('button', { name: /^Open / })
}

describe('the library is a list, not every form at once', () => {
  it('shows one row per product and no editor until one is opened', async () => {
    const rows = await library()
    expect(rows).toHaveLength(2)
    // ⚠️ THE DEFECT, ASSERTED DIRECTLY. Two open forms is what was reported.
    expect(screen.queryByLabelText('Link')).toBeNull()
    expect(screen.queryByPlaceholderText('What you call it on camera')).toBeNull()
  })

  it('the row names the product, so two are never two identical boxes', async () => {
    await library()
    expect(screen.getByRole('button', { name: 'Open Peak Tripod' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Medicube Pads' })).toBeTruthy()
  })

  it('opening one gives the editor and the remove control together', async () => {
    const rows = await library()
    fireEvent.click(rows[0])
    expect(await screen.findByLabelText('Link')).toBeTruthy()
    // ⚠️ "no option to edit or remove it" was reported against a screen where
    // both existed. They are now in the one place a creator goes looking.
    expect(screen.getByRole('button', { name: 'Archive or remove' })).toBeTruthy()
  })

  it('exactly one product is open at a time', async () => {
    // ⚖️ THE PROPERTY THE WHOLE CHANGE EXISTS FOR. A set of open ids would let
    // the reported defect straight back in.
    const rows = await library()
    fireEvent.click(rows[0])
    await screen.findByLabelText('Link')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByLabelText('Link')).toBeNull())

    fireEvent.click((await screen.findAllByRole('button', { name: /^Open / }))[1])
    await screen.findByLabelText('Link')
    expect(screen.getAllByLabelText('Link')).toHaveLength(1)
    // The other product is still a row, not a second form.
    expect(screen.getByRole('button', { name: 'Open Peak Tripod' })).toBeTruthy()
  })

  it('the panel is a dialog that closes on Escape and does not scroll the page behind it', async () => {
    const rows = await library()
    fireEvent.click(rows[0])
    await screen.findByLabelText('Link')
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByLabelText('Link')).toBeNull())
    // ⚠️ RESTORED, NOT BLANKED. A page left unscrollable after a panel closes is
    // a worse bug than the one being fixed.
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
