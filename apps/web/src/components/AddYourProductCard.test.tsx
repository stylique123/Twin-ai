// @vitest-environment jsdom
//
// A CARD WITH A REAL CONDITION, OR IT IS DECORATION.
//
// Onboarding stopped asking thirteen options about what a creator sells. This
// card is what pays for that removal — so the thing worth testing is not that it
// renders, it is that it renders for EXACTLY the right person and then stops.
// Four ways it could be wrong, one test each:
//   1. It nags somebody who said "not right now".
//   2. It nags somebody who never answered — silence read as a yes.
//   3. It keeps nagging after they have added the product.
//   4. It appears on a failed read, i.e. on an assumption.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  loadPreScriptBrief: vi.fn(async (_id: string) => ({}) as Record<string, unknown>),
  loadProductEntities: vi.fn(async () => [] as unknown[]),
}))

vi.mock('@twinai/shared', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadPreScriptBrief: mocks.loadPreScriptBrief,
  loadProductEntities: mocks.loadProductEntities,
}))

const { AddYourProductCard } = await import('./AddYourProductCard')

const COPY = /You mentioned you sell something/

const show = async (brief: Record<string, unknown>, entities: unknown[], voiceId: string | null = 'v1') => {
  mocks.loadPreScriptBrief.mockResolvedValue(brief)
  mocks.loadProductEntities.mockResolvedValue(entities)
  render(<MemoryRouter><AddYourProductCard voiceId={voiceId} /></MemoryRouter>)
}

beforeEach(() => { mocks.loadPreScriptBrief.mockReset(); mocks.loadProductEntities.mockReset() })
afterEach(() => cleanup())

describe('it appears for the creator it was built for', () => {
  it('said yes, has no product → the card is there, pointing at the library', async () => {
    await show({ commercialTies: ['unspecified'] }, [])
    await waitFor(() => expect(screen.getByText(COPY)).toBeTruthy())
    expect(screen.getByText('Add it to your Product Library').getAttribute('href')).toBe('/products')
  })

  // ⚖️ ANSWERS FROM THE THIRTEEN-OPTION QUESTION STILL COUNT AS YES. The two
  // rows in production at the time of this change were both `own_service`.
  it('recognises a yes written by the question this replaced', async () => {
    await show({ commercialTies: ['own_service'], ownServiceKind: 'consulting' }, [])
    await waitFor(() => expect(screen.getByText(COPY)).toBeTruthy())
  })
})

describe('and stays away from everyone else', () => {
  it('does NOT appear for "not right now"', async () => {
    await show({ commercialTies: ['none'] }, [])
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(COPY)).toBeNull()
  })

  // ⚠️ THE ONE THAT MATTERS MOST. Unanswered is not yes; nudging on silence
  // invents a commercial fact the creator never stated.
  it('does NOT appear for a creator who never answered', async () => {
    await show({}, [])
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('does NOT appear once they actually have a product', async () => {
    await show({ commercialTies: ['unspecified'] }, [{ id: 'e1' }])
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('does NOT appear when the read fails — no card on an assumption', async () => {
    mocks.loadPreScriptBrief.mockRejectedValue(new Error('offline'))
    mocks.loadProductEntities.mockResolvedValue([])
    render(<MemoryRouter><AddYourProductCard voiceId="v1" /></MemoryRouter>)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('does NOT read anything at all without a voice', async () => {
    render(<MemoryRouter><AddYourProductCard voiceId={null} /></MemoryRouter>)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(COPY)).toBeNull()
    expect(mocks.loadPreScriptBrief).not.toHaveBeenCalled()
  })
})
