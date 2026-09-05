// @vitest-environment jsdom
//
// ONE FACT, ONE FIELD — AND THE REFUSAL WHERE THE MISTAKE WAS MADE.
//
// ⚠️ THE DEFECT. The card carried two boxes for one URL. The `Link` field saved
// `product_url` and could not ask Twin to read it; the box inside "What Twin
// knows about it" could read a page but existed ONLY while `knowledge === null`.
// So a product Twin had already read had no way to be re-read, and a product it
// had not could have its address edited in one box while the button acted on
// the other. Two inputs for one fact are two answers waiting to disagree.
//
// ⚠️ AND THE REFUSAL WAS IN THE WRONG PLACE. The add form told a creator "That
// does not look like a full link"; this card told them nothing and saved it, so
// the same mistake was caught on the screen a product passes through once and
// missed on the screen it lives on.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ProductEntityRecord } from '@twinai/shared'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'owner-1' } } }),
}))

const requestProductExtraction = vi.fn(async () => {})
const updateEntityPresentation = vi.fn(async () => {})

/** Already read once: the state in which the old card offered no way to re-read. */
const KNOWN_ENTITY: ProductEntityRecord = {
  id: 'e1', name: 'Peak Tripod', creatorSummary: null, type: 'PHYSICAL_PRODUCT',
  relationship: 'OWN_PRODUCT', personalUse: 'NOT_CONFIRMED', showability: 'UNKNOWN',
  productUrl: 'https://peakdesign.example/tripod', affiliateUrl: null, evidence: null,
  restrictions: { approvedClaims: [], forbiddenClaims: [], complianceNotes: null },
  source: 'user_answer', userConfirmed: true, updated: '2026-08-24T00:00:00Z',
  communityMap: null, archivedAt: null,
  knowledge: [{ field: 'what it is', value: 'A travel tripod', trust: 'usable', origin: null, asOf: null }],
  knowledgeExtractedAt: '2026-08-24T00:05:00Z',
  knowledgeSourceUrl: 'https://peakdesign.example/tripod',
  knowledgeFailedAt: null, knowledgeError: null,
}

/** ⚠️ NEEDS_SOURCE — no link and no photos — which with IMPORT_FAILED is one of
 *  the only two states that ever rendered the second link box. `productLifecycle`
 *  sends a null-knowledge product WITH a link to READING instead, whose branch
 *  shows no box at all; a fixture built that way made the count below pass with
 *  the duplicate restored. */
const UNREAD_ENTITY: ProductEntityRecord = {
  ...KNOWN_ENTITY, id: 'e2', productUrl: null, knowledge: null,
  knowledgeExtractedAt: null, knowledgeSourceUrl: null,
}

/** Which fixture the page loads, chosen per test before rendering. */
let current: ProductEntityRecord = KNOWN_ENTITY

vi.mock('@twinai/shared', async () => {
  const actual = await vi.importActual<typeof import('@twinai/shared')>('@twinai/shared')
  return {
    ...actual,
    loadProductEntities: vi.fn(async (opts?: { includeArchived?: boolean }) =>
      opts?.includeArchived ? [] : [current]),
    loadProductSuggestions: vi.fn(async () => []),
    listBrandVoices: vi.fn(async () => []),
    signEditUrls: vi.fn(async () => ({})),
    requestProductExtraction: (...a: unknown[]) => requestProductExtraction(...a as []),
    updateEntityPresentation: (...a: unknown[]) => updateEntityPresentation(...a as []),
  }
})

afterEach(() => {
  cleanup(); requestProductExtraction.mockClear(); updateEntityPresentation.mockClear()
  current = KNOWN_ENTITY
})

async function openCard() {
  const { default: ProductLibrary } = await import('./ProductLibrary')
  render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
  return await screen.findByLabelText('Link') as HTMLInputElement
}

describe('the product card has one link field, and it can be read from', () => {
  // ⚠️ ASSERTED IN THE UNREAD STATE, WHICH IS THE ONLY PLACE THE DUPLICATE COULD
  //    EXIST. Written first against an already-read product, this test PASSED
  //    with the second box deliberately restored -- the duplicate rendered only
  //    while `knowledge === null`, so the count never visited it. A guard that
  //    cannot fail is not a guard, and mutation is how that was found rather
  //    than assumed.
  it('offers exactly one https:// box on a product Twin has never read', async () => {
    current = UNREAD_ENTITY
    await openCard()
    // The affiliate box is a DIFFERENT fact and is hidden for OWN_PRODUCT;
    // this asserts what is on screen, whatever the reason.
    expect(screen.getAllByPlaceholderText('https://')).toHaveLength(1)
    // And the button is the one on the Link field, not a second one below.
    expect(screen.getAllByRole('button', { name: 'Read the page' })).toHaveLength(1)
    // With no link on file it is offered but not armed — nothing to read yet.
    expect((screen.getByRole('button', { name: 'Read the page' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers exactly one https:// box on a product Twin has read', async () => {
    await openCard()
    expect(screen.getAllByPlaceholderText('https://')).toHaveLength(1)
  })

  it('lets an already-read product be read again', async () => {
    const link = await openCard()
    expect(link.value).toBe('https://peakdesign.example/tripod')
    // ⚠️ THE STATE WITH NO BUTTON AT ALL BEFORE. `knowledge` is non-null, so the
    // old retry box did not render and a stale page could never be refreshed.
    const button = screen.getByRole('button', { name: 'Read it again' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    await waitFor(() => expect(requestProductExtraction).toHaveBeenCalledWith(
      'owner-1', 'e1', 'https://peakdesign.example/tripod'))
  })

  it('refuses a malformed link at the field, and does not save it', async () => {
    const link = await openCard()
    fireEvent.change(link, { target: { value: 'peakdesign.example' } })

    // ⚠️ NEXT TO ITS CAUSE, not in the banner at the top of the page.
    await screen.findByText('That does not look like a full link. It should start with https://')
    expect((screen.getByRole('button', { name: 'Read it again' }) as HTMLButtonElement).disabled).toBe(true)

    // ⚠️ AND NOT PERSISTED. Storing it would hand the worker a job that can only
    // fail, minutes later, on a card that had already said it was saved.
    fireEvent.blur(link)
    await new Promise((r) => setTimeout(r, 0))
    expect(updateEntityPresentation).not.toHaveBeenCalled()
  })

  it('accepts a corrected link and saves that one', async () => {
    const link = await openCard()
    fireEvent.change(link, { target: { value: 'https://peakdesign.example/tripod-v2' } })
    expect(screen.queryByText('That does not look like a full link. It should start with https://')).toBeNull()
    fireEvent.blur(link)
    await waitFor(() => expect(updateEntityPresentation).toHaveBeenCalledWith(
      'e1', { productUrl: 'https://peakdesign.example/tripod-v2' }))
  })
})
