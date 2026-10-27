import { useState } from 'react'
import { NOTICE_SECTIONS, PRIVACY_NOTICE_VERSION, privacyNoticeOn, recordConsent, requestDataDeletion } from '../lib/privacyNotice'

/**
 * Privacy notice with consent and a data-deletion request. Renders nothing
 * unless VITE_PRIVACY_NOTICE=1 (default OFF). See lib/privacyNotice.ts.
 */
export function PrivacyNotice({ ownerId }: { ownerId: string | null | undefined }) {
  const [consent, setConsent] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [deletion, setDeletion] = useState<'idle' | 'confirm' | 'sending' | 'sent' | 'failed'>('idle')
  if (!privacyNoticeOn()) return null

  const agree = async () => {
    setConsent('saving')
    const r = await recordConsent(ownerId)
    setConsent(r.ok ? 'saved' : 'failed')
  }
  const askDelete = async () => {
    setDeletion('sending')
    const r = await requestDataDeletion()
    setDeletion(r.ok ? 'sent' : 'failed')
  }

  return (
    <section aria-labelledby="privacy-notice-title" className="space-y-3">
      <h2 id="privacy-notice-title" className="text-base font-semibold">Privacy</h2>
      <p className="text-xs text-stone">Notice version {PRIVACY_NOTICE_VERSION}</p>
      {NOTICE_SECTIONS.map((s) => (
        <div key={s.title}>
          <h3 className="text-sm font-medium">{s.title}</h3>
          <p className="text-sm text-stone">{s.body}</p>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={agree} disabled={consent === 'saving' || consent === 'saved'}>
          {consent === 'saved' ? 'Agreed' : 'I agree'}
        </button>
        {deletion === 'confirm' ? (
          <>
            <button type="button" onClick={askDelete}>Yes, delete my data</button>
            <button type="button" onClick={() => setDeletion('idle')}>Cancel</button>
          </>
        ) : (
          <button type="button" onClick={() => setDeletion('confirm')} disabled={deletion === 'sending' || deletion === 'sent'}>
            Ask to delete my data
          </button>
        )}
      </div>
      <div role="status" className="text-sm">
        {consent === 'failed' && 'Could not save your answer. Try again later.'}
        {deletion === 'confirm' && 'This removes your account data. Billing records are kept. Are you sure?'}
        {deletion === 'sent' && 'Request received. The team will check it and delete your data.'}
        {deletion === 'failed' && 'Could not send the request. Try again later.'}
      </div>
    </section>
  )
}
