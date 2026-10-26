/**
 * PRIVACY NOTICE, CONSENT RECORD AND DATA DELETION (Task D item 8).
 *
 * ⚖️ BEHIND A FLAG THAT DEFAULTS OFF: only `VITE_PRIVACY_NOTICE=1` shows it.
 * The tables and the RPC it calls are in migration 0294, which is a FILE ONLY
 * (not applied) until counsel signs off on the wording below. With the flag
 * off nothing renders and nothing is called.
 *
 * The notice text is a draft for counsel (docs/legal/consent-and-deletion.md).
 */
import { supabase } from './supabase'

/** Bump on any change to NOTICE_SECTIONS; a new version asks again. */
export const PRIVACY_NOTICE_VERSION = '2026-10-26'

export function privacyNoticeOn(flag: unknown = import.meta.env.VITE_PRIVACY_NOTICE): boolean {
  return String(flag ?? '').trim() === '1'
}

export const NOTICE_SECTIONS: ReadonlyArray<{ title: string; body: string }> = [
  { title: 'What Twin keeps about you', body: 'Your account, the answers you give, your products and brands, the scripts Twin writes for you, the videos you upload, and the posts on accounts you connect.' },
  { title: 'Public sources Twin reads', body: 'To learn what works in your niche, Twin reads public posts and their captions or transcripts from YouTube, TikTok and Instagram, public web pages you or Twin look up, and public discussion threads. These are used to shape your scripts and are not shown to other users.' },
  { title: 'Who processes it', body: 'Your data is stored with our database host and processed by the AI and data providers Twin uses to read sources and write scripts. It is not sold and is not used to train those providers’ models.' },
  { title: 'Your choices', body: 'You can switch off any fact Twin holds about you, and you can ask for your data to be deleted. Billing and tax records are kept as the law requires.' },
]

export type ConsentResult = { ok: true } | { ok: false; reason: 'not_signed_in' | 'unavailable' }

export async function recordConsent(ownerId: string | null | undefined): Promise<ConsentResult> {
  if (!ownerId) return { ok: false, reason: 'not_signed_in' }
  const { error } = await supabase.from('consent_records')
    .insert({ owner_id: ownerId, kind: 'privacy_notice', notice_version: PRIVACY_NOTICE_VERSION })
  return error ? { ok: false, reason: 'unavailable' } : { ok: true }
}

export type DeletionResult = { ok: true; requestId: string } | { ok: false; reason: 'unavailable' }

export async function requestDataDeletion(): Promise<DeletionResult> {
  const { data, error } = await supabase.rpc('request_data_deletion')
  if (error || typeof data !== 'string') return { ok: false, reason: 'unavailable' }
  return { ok: true, requestId: data }
}
