// @vitest-environment jsdom
// Security audit #1: opening an invite link must never join on its own. Joining
// gives the inviter edit access to her account, so it waits for her click.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { acceptWorkspaceInvite } = vi.hoisted(() => ({ acceptWorkspaceInvite: vi.fn(async (_token: string) => ({ ok: true })) }))
vi.mock('../lib/api', () => ({ acceptWorkspaceInvite, markOnboarded: vi.fn(async () => {}) }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, refreshProfile: vi.fn(async () => {}) }) }))
vi.mock('../components/Aurora', () => ({ Aurora: () => null }))
vi.mock('../components/Logo', () => ({ Logo: () => null }))

import JoinWorkspace from './JoinWorkspace'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/join/:token" element={<JoinWorkspace />} />
        <Route path="/app" element={<p>studio</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => { cleanup(); acceptWorkspaceInvite.mockClear(); localStorage.clear() })

describe('JoinWorkspace', () => {
  it('asks first and does not join on load', async () => {
    renderAt('/join/tok123')
    expect(screen.getByText('Join a shared workspace?')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 20))
    expect(acceptWorkspaceInvite).not.toHaveBeenCalled()
  })

  it('joins only after she clicks Join', async () => {
    renderAt('/join/tok123')
    fireEvent.click(screen.getByText('Join workspace'))
    await waitFor(() => expect(acceptWorkspaceInvite).toHaveBeenCalledWith('tok123'))
  })

  it('No thanks forgets the invite and never joins', async () => {
    localStorage.setItem('twinai_pending_join', 'tok123')
    renderAt('/join/tok123')
    fireEvent.click(screen.getByText('No thanks'))
    await waitFor(() => expect(screen.getByText('studio')).toBeTruthy())
    expect(localStorage.getItem('twinai_pending_join')).toBeNull()
    expect(acceptWorkspaceInvite).not.toHaveBeenCalled()
  })
})
