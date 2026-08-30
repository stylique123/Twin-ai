// @vitest-environment jsdom
//
// THE BANNER PROMISED A RETRY, AND THE CARD OFFERED NONE.
//
// ⚠️ THE DEFECT, AS AN OWNER REPORTED IT. "Added, but we could not start
// reading that page. You can retry from the product below." -- and the card
// below offered only "Add another product" and "Archive or remove". This
// proves the fix: an IMPORT_FAILED product's card reuses the SAME re-enqueue
// path the first attempt used (`requestProductExtraction`, via `learn`), with
// the link already on file so a retry is one tap rather than a re-paste.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ProductEntityRecord } from '@twinai/shared'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'owner-1' } } }),
}))

const requestProductExtraction = vi.fn(async () => {})

const FAILED_ENTITY: ProductEntityRecord = {
  id: 'e1', name: 'Peak Tripod', creatorSummary: null, type: 'PHYSICAL_PRODUCT',
  relationship: 'OWN_PRODUCT', personalUse: 'NOT_CONFIRMED', showability: 'UNKNOWN',
  productUrl: 'https://peakdesign.example/tripod', affiliateUrl: null, evidence: null,
  restrictions: { approvedClaims: [], forbiddenClaims: [], complianceNotes: null },
  source: 'user_answer', userConfirmed: true, updated: '2026-08-24T00:00:00Z',
  communityMap: null, archivedAt: null, knowledge: null, knowledgeExtractedAt: null,
  knowledgeSourceUrl: null,
  knowledgeFailedAt: '2026-08-24T00:05:00Z', knowledgeError: 'That page would not let Twin read it.',
}

vi.mock('@twinai/shared', async () => {
  const actual = await vi.importActual<typeof import('@twinai/shared')>('@twinai/shared')
  return {
    ...actual,
    loadProductEntities: vi.fn(async (opts?: { includeArchived?: boolean }) =>
      opts?.includeArchived ? [] : [FAILED_ENTITY]),
    loadProductSuggestions: vi.fn(async () => []),
    listBrandVoices: vi.fn(async () => []),
    signEditUrls: vi.fn(async () => ({})),
    requestProductExtraction: (...args: unknown[]) => requestProductExtraction(...args as []),
  }
})

afterEach(() => { cleanup(); requestProductExtraction.mockClear() })

describe('a failed read offers a real retry, on the product itself', () => {
  it('pre-fills the link already on file and re-triggers the same extraction job', async () => {
    const { default: ProductLibrary } = await import('./ProductLibrary')
    render(<MemoryRouter><ProductLibrary /></MemoryRouter>)

    // The single sentence, from the shared lifecycle map -- and it must NOT
    // also claim Twin is still reading, which is bug #1's contradiction.
    await screen.findByText('Twin could not read that page. Try again, or add the details yourself.')
    expect(screen.queryByText('Twin is reading the page. This keeps going if you leave.')).toBeNull()

    const retryButton = await screen.findByRole('button', { name: 'Retry' })
    // Two "https://" boxes exist on the card (the Link field, and this retry
    // box) -- the retry box is the one right beside the Retry button.
    const linkInput = retryButton.previousElementSibling as HTMLInputElement
    // ⚠️ PRE-FILLED, NOT BLANK. A retry that made the creator re-type a link
    // already on file is the "retry" that never actually worked.
    expect(linkInput.value).toBe('https://peakdesign.example/tripod')
    expect((retryButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(retryButton)
    await waitFor(() => expect(requestProductExtraction).toHaveBeenCalled())
    // The SAME mechanism the first attempt used, retargeted at the SAME entity
    // and the SAME link -- not a second, invented retry path.
    expect(requestProductExtraction).toHaveBeenCalledWith(
      'owner-1', 'e1', 'https://peakdesign.example/tripod')
  })
})
