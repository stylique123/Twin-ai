// @vitest-environment jsdom
//
// THE AGENCY FEATURES NOBODY HAS EVER USED.
//
// ⚠️ MEASURED IN PRODUCTION, 2026-08-31. `workspace_members` 0,
// `workspace_invites` 0, `brand_voices` carrying a `share_token` 0 — while
// THREE owners hold more than one brand voice and one holds TEN. Every RPC
// behind those features is deployed and working (`brand_report`,
// `ensure_brand_share_token`, `accept_workspace_invite`) and all four pages are
// routed. The agency workload is real; the features serving it are invisible.
//
// ⚠️ AND THE REASON WAS LEGIBILITY, NOT CORRECTNESS. The client-report button
// was `text-xs text-stone` — the dimmest token in the palette, doing the work of
// a disabled state on a live control — sitting below the primary action, with
// the ONE sentence explaining it hidden in a `title` tooltip that a phone never
// shows and a desktop shows only on hover.
//
// ⚖️ THESE ASSERT WHAT A PERSON CAN SEE, not what the source says. A grep for a
// class name would pass on a page nobody can read, which is the exact failure
// being fixed.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { BrandVoice } from '../lib/types'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'owner-1' } }, profile: { plan: 'agency' } }),
}))

function voice(id: string, label: string): BrandVoice {
  return {
    id, label, handle: `@${label}`, platform: 'tiktok', status: 'ready',
    is_default: id === 'v1', stats: null,
  } as unknown as BrandVoice
}

const listBrandVoices = vi.fn(async () => [voice('v1', 'alpha'), voice('v2', 'beta')])

vi.mock('../lib/api', () => ({
  listBrandVoices: (...a: unknown[]) => listBrandVoices(...(a as [])),
  setDefaultBrandVoice: vi.fn(async () => {}),
  renameBrandVoice: vi.fn(async () => {}),
  ensureBrandShareToken: vi.fn(async () => 'tok'),
  startDna: vi.fn(async () => {}),
  pollDna: vi.fn(async () => {}),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

async function renderBrands() {
  const { default: Brands } = await import('./Brands')
  render(<MemoryRouter><Brands /></MemoryRouter>)
  await waitFor(() => expect(screen.getAllByText(/alpha/i).length).toBeGreaterThan(0))
}

describe('an agency can find the features built for it', () => {
  it('says what the client link IS, in text a phone can render', () => {
    // ⚠️ THE WHOLE DEFECT. This sentence used to exist only as a `title`.
    return renderBrands().then(() => {
      expect(screen.getAllByText(/without an account/i).length).toBeGreaterThan(0)
    })
  })

  it('names the action in plain English rather than product jargon', async () => {
    await renderBrands()
    expect(screen.getAllByText(/Send this client their results/i).length).toBeGreaterThan(0)
  })

  it('tells someone running several brands that teammates exist', async () => {
    // The invite lives in Settings, a page away from the work. Nothing on the
    // page where an agency actually works has ever mentioned it.
    await renderBrands()
    const link = screen.getByRole('link', { name: /add a teammate/i })
    expect(link.getAttribute('href')).toBe('/settings')
  })

  it('says NOTHING about teammates to a solo creator with one brand', async () => {
    // ⚖️ THE HALF THAT KEEPS THIS FROM BECOMING NOISE. A creator with one voice
    // has no client to report to and no teammate to invite. Telling them anyway
    // is how a product teaches people to skim past its own guidance, and then
    // the guidance that matters is unread too.
    listBrandVoices.mockResolvedValueOnce([voice('v1', 'alpha')])
    await renderBrands()
    expect(screen.queryByRole('link', { name: /add a teammate/i })).toBeNull()
  })
})
