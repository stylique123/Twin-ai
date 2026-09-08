// @vitest-environment jsdom
//
// "NO OPTION IN THE PRODUCT PAGE TO REMOVE A PRODUCT OR EDIT IT" — AND BOTH SHIPPED.
//
// ⚠️ WHAT WAS ACTUALLY TRUE. Removal has been on this card since #355
// (2026-08-13) as `text-xs text-stone underline` reading "Archive or remove", at
// the foot of a card that runs the height of several screens. Every field is
// editable, saving on blur, with nothing anywhere on the card saying so. A
// control a creator cannot find is, to them, a control nobody built.
//
// ⚖️ SO THE FIX IS DISCOVERABILITY, NOT A SECOND BUTTON. This card already
// carries two add buttons and two capability questions from exactly that
// reflex — answering a "cannot find it" report by adding another one is how
// those pairs got there. The trigger MOVED to the head of the card and became a
// real bordered control; it did not multiply.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ProductEntityRecord } from '@twinai/shared'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'owner-1' } } }),
}))

const navigated: string[] = []
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => (to: string) => { navigated.push(to) } }
})

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

const updateEntityPresentation = vi.fn(async (_id: string, edit: Record<string, unknown>) => ({
  ...ENTITY, ...edit,
}))

vi.mock('@twinai/shared', async () => {
  const actual = await vi.importActual<typeof import('@twinai/shared')>('@twinai/shared')
  return {
    ...actual,
    loadProductEntities: vi.fn(async (o?: { includeArchived?: boolean }) => o?.includeArchived ? [] : [ENTITY]),
    loadProductSuggestions: vi.fn(async () => []),
    listBrandVoices: vi.fn(async () => []),
    signEditUrls: vi.fn(async () => ({})),
    updateEntityPresentation: (...a: [string, Record<string, unknown>]) => updateEntityPresentation(...a),
  }
})

afterEach(() => { cleanup(); updateEntityPresentation.mockClear(); navigated.length = 0 })

async function page() {
  const { default: ProductLibrary } = await import('./ProductLibrary')
  render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
  return await screen.findByDisplayValue('Peak Tripod')
}

describe('the card says it can be edited', () => {
  it('states in words that the boxes are editable and that they save', async () => {
    await page()
    // ⚠️ BOTH HALVES, IN ONE SENTENCE. "You can change this" without "and it
    // saves when you click away" leaves a creator typing and then hunting for a
    // Save button that does not exist — the other half of the same report.
    const note = await screen.findByText(/type in a box and it saves when you click away/i)
    expect(note).toBeTruthy()
  })
})

describe('the removal control is findable', () => {
  it('offers exactly ONE archive-or-remove trigger, not two', async () => {
    await page()
    // ⚖️ THE COUNT IS THE ASSERTION. A card with two of these would be the
    // defect this fix exists to avoid repeating, and would still pass a test
    // that only asked whether one existed.
    expect(screen.getAllByRole('button', { name: /archive or remove/i })).toHaveLength(1)
  })

  it('puts the choice directly under the button that opened it', async () => {
    const nameBox = await page()
    const card = nameBox.closest('section') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /archive or remove/i }))
    const archive = within(card).getByRole('button', { name: 'Archive' })
    const del = within(card).getByRole('button', { name: 'Delete for good' })
    expect(within(card).getByRole('button', { name: 'Keep' })).toBeTruthy()
    // ⚠️ ORDER IN THE DOCUMENT IS THE POINT, not merely presence. The panel used
    // to render in the card's footer while its trigger sat at the head, which
    // puts the question a full screen away from the click that asked it.
    // DOCUMENT_POSITION_FOLLOWING === 4.
    expect(nameBox.compareDocumentPosition(archive) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(archive.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the trigger disappears while the choice is open, so it cannot be double-asked', async () => {
    const nameBox = await page()
    const card = nameBox.closest('section') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /archive or remove/i }))
    expect(within(card).queryByRole('button', { name: /archive or remove/i })).toBeNull()
  })
})

describe('there is exactly ONE way to add a product on screen', () => {
  // ⚠️ THERE WERE THREE, ALL OPENING THE SAME DIALOG: the header, the empty
  // state, and a mid-page "Add another product". An empty library showed two
  // identical primary buttons; a stocked one showed two more. Two buttons doing
  // one thing is a creator wondering what the difference is.
  const addButtons = () => screen.queryAllByRole('button', { name: /add (a|another) product/i })

  it('with products: the header owns it, and nothing repeats it mid-page', async () => {
    await page()
    expect(addButtons()).toHaveLength(1)
  })

  it('with no products: the empty state owns it, and the header stands down', async () => {
    // ⚖️ THE EMPTY STATE KEEPS ITS OWN because there the button belongs beside
    // the paragraph explaining why the library is empty — so it is the header's
    // that yields, not the other way round.
    const shared = await import('@twinai/shared')
    const load = vi.mocked(shared.loadProductEntities)
    const original = load.getMockImplementation()
    load.mockResolvedValue([])
    try {
      const { default: ProductLibrary } = await import('./ProductLibrary')
      render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
      await screen.findByText(/You have not registered a product yet/i)
      expect(addButtons()).toHaveLength(1)
    } finally {
      // ⚠️ A MOCK LEFT REWRITTEN IS A FAILURE IN THE NEXT TEST WITH THIS TEST'S
      // NAME NOWHERE ON IT. Restored in `finally`, so an assertion failure here
      // cannot cascade into three unrelated ones.
      load.mockImplementation(original!)
    }
  })
})

describe('the card does not tell a creator it knows nothing they have already told it', () => {
  it('with a one-line description and no read page, it says the line will be used', async () => {
    // ⚠️ THE CARD SAID "so your scripts can say what it actually does instead of
    // guessing" WHILE THE CREATOR'S OWN SENTENCE SAT IN THE BOX ABOVE IT.
    // `creator_summary` is read by generate-blueprint (index.ts:6204) and put in
    // the prompt when the page has not been read, so the claim was false for
    // exactly the creator who had already answered.
    const shared = await import('@twinai/shared')
    const load = vi.mocked(shared.loadProductEntities)
    const original = load.getMockImplementation()
    load.mockImplementation(async (o?: { includeArchived?: boolean }) => o?.includeArchived ? [] : [{
      ...ENTITY, knowledge: null, productUrl: null,
      creatorSummary: 'Sourdough loaves, baked to order for people near me',
    }])
    try {
      const { default: ProductLibrary } = await import('./ProductLibrary')
      render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
      expect(await screen.findByText(/Twin will use the line you wrote above/i)).toBeTruthy()
      expect(screen.queryByText(/instead of guessing/i)).toBeNull()
    } finally { load.mockImplementation(original!) }
  })

  it('with no description and no read page, it still asks for a link', async () => {
    // ⚖️ THE OTHER HALF, PINNED. The fix must not silence the prompt for the
    // creator who really has told us nothing.
    const shared = await import('@twinai/shared')
    const load = vi.mocked(shared.loadProductEntities)
    const original = load.getMockImplementation()
    load.mockImplementation(async (o?: { includeArchived?: boolean }) => o?.includeArchived ? [] : [{
      ...ENTITY, knowledge: null, productUrl: null, creatorSummary: null,
    }])
    try {
      const { default: ProductLibrary } = await import('./ProductLibrary')
      render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
      expect(await screen.findByText(/instead of guessing/i)).toBeTruthy()
    } finally { load.mockImplementation(original!) }
  })
})

describe('two unnamed products are not two identical blank cards', () => {
  // ⚠️ THE CARD HAD NO HEADING. The first thing on it is an empty `Name` box
  // with a placeholder, so a creator who added two things from links — before
  // either page was read — was looking at two blank forms and had to open the
  // Link field of each to tell them apart.
  const twoUnnamed = async (fn: () => Promise<void>) => {
    const shared = await import('@twinai/shared')
    const load = vi.mocked(shared.loadProductEntities)
    const original = load.getMockImplementation()
    load.mockImplementation(async (o?: { includeArchived?: boolean }) => o?.includeArchived ? [] : [
      { ...ENTITY, id: 'a', name: null, creatorSummary: null, productUrl: 'https://www.medicube.example/booster' },
      { ...ENTITY, id: 'b', name: null, creatorSummary: 'Sourdough loaves, baked to order', productUrl: null },
    ])
    try { await fn() } finally { load.mockImplementation(original!) }
  }

  it('falls back to the link host, then the creator\'s own line', async () => {
    await twoUnnamed(async () => {
      const { default: ProductLibrary } = await import('./ProductLibrary')
      render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
      // ⚖️ `www.` DROPPED, because the point is telling two cards apart, not
      // reproducing a URL the creator can already see in the Link box.
      expect(await screen.findByRole('heading', { name: 'medicube.example' })).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Sourdough loaves, baked to order' })).toBeTruthy()
    })
  })

  it('says so plainly when there is nothing to fall back to', async () => {
    const shared = await import('@twinai/shared')
    const load = vi.mocked(shared.loadProductEntities)
    const original = load.getMockImplementation()
    load.mockImplementation(async (o?: { includeArchived?: boolean }) => o?.includeArchived ? [] : [
      { ...ENTITY, name: null, creatorSummary: null, productUrl: null },
    ])
    try {
      const { default: ProductLibrary } = await import('./ProductLibrary')
      render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
      expect(await screen.findByRole('heading', { name: 'Not named yet' })).toBeTruthy()
    } finally { load.mockImplementation(original!) }
  })

  it('the fallback is a LABEL and is never written back as the name', async () => {
    // ⚠️ GUESSING A NAME INTO THE RECORD would hand the writer a title the
    // creator never said — the exact failure this library exists to end.
    await twoUnnamed(async () => {
      const { default: ProductLibrary } = await import('./ProductLibrary')
      render(<MemoryRouter><ProductLibrary /></MemoryRouter>)
      await screen.findByRole('heading', { name: 'medicube.example' })
      expect(updateEntityPresentation).not.toHaveBeenCalled()
      // The Name box stays empty, so the placeholder still invites a real name.
      expect(screen.getAllByPlaceholderText('What you call it on camera')[0])
        .toHaveProperty('value', '')
    })
  })
})

describe('the Library is a selector, not just a list', () => {
  it('every product card can start a video about that product', async () => {
    // ⚠️ IT SHOWED A CREATOR EVERY PRODUCT THEY OWN AND OFFERED NO WAY TO MAKE
    // A VIDEO ABOUT ONE. The route in was to start a video and hope the picker
    // asked — which it only does when they own two or more.
    const nameBox = await page()
    const card = nameBox.closest('section') as HTMLElement
    const go = within(card).getByRole('button', { name: /make a video about this/i })
    fireEvent.click(go)
    // ⚖️ THE ID TRAVELS AS AN ANSWER, on the studio's own route. The build
    // screen still puts it through `selectProduct`, so it cannot force a
    // product onto a video that may not carry one.
    expect(navigated).toContain('/v2?product=e1')
  })
})

describe('a save is confirmed beside the field that was edited', () => {
  it('reports on the NAME field, not at the foot of the card', async () => {
    const nameBox = await page()
    fireEvent.blur(nameBox, { target: { value: 'Peak Tripod Mk2' } })
    await waitFor(() => expect(updateEntityPresentation).toHaveBeenCalled())
    const note = await screen.findByTestId('save-note-name')
    await waitFor(() => expect(note.textContent).toBe('Saved.'))
    // ⚠️ AND THE OTHER FIELDS STAY SILENT. One shared note that lights up
    // everywhere would be the old footer defect wearing a new position.
    expect(screen.getByTestId('save-note-creatorSummary').textContent).toBe('')
  })

  it('reports on the one-line description independently', async () => {
    await page()
    const box = screen.getByPlaceholderText(/Sourdough loaves/i)
    fireEvent.blur(box, { target: { value: 'A travel tripod for phone filming' } })
    await waitFor(() => expect(updateEntityPresentation).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByTestId('save-note-creatorSummary').textContent).toBe('Saved.'))
    expect(screen.getByTestId('save-note-name').textContent).toBe('')
  })

  it('never leaves a field saying "Saving…" after a failure', async () => {
    // ⚠️ A STUCK "Saving…" IS A WORSE LIE THAN NO NOTE AT ALL — it reports a
    // write that did not happen, for ever. The clear belongs in `finally`.
    updateEntityPresentation.mockRejectedValueOnce(new Error('nope'))
    const nameBox = await page()
    fireEvent.blur(nameBox, { target: { value: 'Peak Tripod Mk3' } })
    await waitFor(() => expect(screen.getByTestId('save-note-name').textContent).toBe(''))
    expect(await screen.findByText(/nope|Could not save/i)).toBeTruthy()
  })
})
