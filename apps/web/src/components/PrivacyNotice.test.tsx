// @vitest-environment jsdom
//
// Privacy notice, consent record and deletion request (Task D item 8).
// Behind VITE_PRIVACY_NOTICE, default OFF. Fictional ids only.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const insert = vi.fn()
const rpc = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(() => ({ insert })), rpc: (...a: unknown[]) => rpc(...a) } }))
import { PrivacyNotice } from './PrivacyNotice'
import { privacyNoticeOn, PRIVACY_NOTICE_VERSION, NOTICE_SECTIONS } from '../lib/privacyNotice'

const OWNER = '00000000-0000-4000-8000-000000000001'
afterEach(() => { cleanup(); vi.unstubAllEnvs(); insert.mockReset(); rpc.mockReset() })

describe('the flag defaults OFF', () => {
  it('unset, empty, "0", "true" and "yes" are all off; only "1" is on', () => {
    for (const v of [undefined, '', '0', 'true', 'yes', ' ']) expect(privacyNoticeOn(v)).toBe(false)
    expect(privacyNoticeOn('1')).toBe(true)
    expect(privacyNoticeOn(' 1 ')).toBe(true)
  })
  it('renders nothing and calls nothing when the flag is unset', () => {
    const { container } = render(<PrivacyNotice ownerId={OWNER} />)
    expect(container.innerHTML).toBe('')
    expect(insert).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
  it('the production env files do not turn it on', () => {
    for (const f of ['.env', '.env.production']) {
      let text = ''
      try { text = readFileSync(resolve(__dirname, '../..', f), 'utf8') } catch { continue }
      expect(text).not.toMatch(/^\s*VITE_PRIVACY_NOTICE\s*=\s*1/m)
    }
  })
})

describe('with the flag on', () => {
  it('shows every section and the version', () => {
    vi.stubEnv('VITE_PRIVACY_NOTICE', '1')
    render(<PrivacyNotice ownerId={OWNER} />)
    for (const s of NOTICE_SECTIONS) expect(screen.getByText(s.title)).toBeTruthy()
    expect(screen.getByText(`Notice version ${PRIVACY_NOTICE_VERSION}`)).toBeTruthy()
  })
  it('"I agree" records a consent row with the version and the owner', async () => {
    vi.stubEnv('VITE_PRIVACY_NOTICE', '1')
    insert.mockResolvedValue({ error: null })
    render(<PrivacyNotice ownerId={OWNER} />)
    fireEvent.click(screen.getByText('I agree'))
    await waitFor(() => expect(screen.getByText('Agreed')).toBeTruthy())
    expect(insert).toHaveBeenCalledWith({ owner_id: OWNER, kind: 'privacy_notice', notice_version: PRIVACY_NOTICE_VERSION })
  })
  it('a failed save says so and does not claim it was saved', async () => {
    vi.stubEnv('VITE_PRIVACY_NOTICE', '1')
    insert.mockResolvedValue({ error: { message: 'relation does not exist' } })
    render(<PrivacyNotice ownerId={OWNER} />)
    fireEvent.click(screen.getByText('I agree'))
    await waitFor(() => expect(screen.getByText(/Could not save your answer/)).toBeTruthy())
    expect(screen.queryByText('Agreed')).toBeNull()
  })
  it('no consent row without a signed-in user', async () => {
    vi.stubEnv('VITE_PRIVACY_NOTICE', '1')
    render(<PrivacyNotice ownerId={null} />)
    fireEvent.click(screen.getByText('I agree'))
    await waitFor(() => expect(screen.getByText(/Could not save your answer/)).toBeTruthy())
    expect(insert).not.toHaveBeenCalled()
  })
  it('deletion needs a second click, then calls request_data_deletion once', async () => {
    vi.stubEnv('VITE_PRIVACY_NOTICE', '1')
    rpc.mockResolvedValue({ data: '00000000-0000-4000-8000-0000000000aa', error: null })
    render(<PrivacyNotice ownerId={OWNER} />)
    fireEvent.click(screen.getByText('Ask to delete my data'))
    expect(rpc).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Yes, delete my data'))
    await waitFor(() => expect(screen.getByText(/Request received/)).toBeTruthy())
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('request_data_deletion')
  })
  it('cancel sends nothing', () => {
    vi.stubEnv('VITE_PRIVACY_NOTICE', '1')
    render(<PrivacyNotice ownerId={OWNER} />)
    fireEvent.click(screen.getByText('Ask to delete my data'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('Settings mounts it (disconnect test)', () => {
  it('the account tab renders <PrivacyNotice ownerId={profile?.id} />', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Settings.tsx'), 'utf8')
    expect(src).toMatch(/import \{ PrivacyNotice \} from '\.\.\/components\/PrivacyNotice'/)
    expect(src).toMatch(/tab === 'account' && <PrivacyNotice ownerId=\{profile\?\.id\} \/>/)
  })
})

describe('migration 0296 is safe as written', () => {
  const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/0296_consent_records_and_data_deletion.sql'), 'utf8')
  it('RLS on both tables', () => {
    expect(sql).toMatch(/alter table public\.consent_records enable row level security/)
    expect(sql).toMatch(/alter table public\.data_deletion_requests enable row level security/)
  })
  it('the processor is never callable by a signed-in user or anon', () => {
    expect(sql).toMatch(/revoke all on function public\.process_data_deletion\(uuid\) from public, anon, authenticated/)
    expect(sql).not.toMatch(/grant execute on function public\.process_data_deletion/)
  })
  it('billing, spend ledgers and the consent proof are retained', () => {
    for (const t of ['billing_events', 'subscriptions', 'credit_events', 'ai_usage_ledger', 'apify_spend_ledger', 'consent_records', 'data_deletion_requests']) {
      expect(sql).toContain(`'${t}'`)
    }
  })
  it('a request deletes nothing by itself', () => {
    const fn = sql.slice(sql.indexOf('function public.request_data_deletion'), sql.indexOf('function public.data_deletion_retained_tables'))
    expect(fn).not.toMatch(/\bdelete\b/i)
  })
  it('the version in the app matches the check constraint format', () => {
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$/)
  })
})
