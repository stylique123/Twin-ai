import { trialUser } from './ProductDetailsByKind'

/**
 * GENERAL-VERSION BANNER (plan v5.4 item O). Shown when the script is a
 * fallback: `blueprint.degraded` (writer-timeout record, source 'plan_b' or
 * 'general'). Points her back to the questions.
 *
 * ⚖️ BEHIND THE TRIAL: only `VITE_TRIAL_USER_ID` sees it; `VITE_GENERAL_BANNER_KILL=1`
 * hides it for everyone.
 */
export function isGeneralVersion(bp: { degraded?: unknown } | null | undefined): boolean {
  const d = bp?.degraded as { source?: unknown } | null | undefined
  return !!d && typeof d === 'object' && (d.source === 'general' || d.source === 'plan_b')
}

export function generalBannerVisible(userId: string | null | undefined): boolean {
  return trialUser(userId) && String(import.meta.env.VITE_GENERAL_BANNER_KILL ?? '').trim() !== '1'
}

export function GeneralVersionBanner({ userId, blueprint, onBackToQuestions }: {
  userId: string | null | undefined
  blueprint: { degraded?: unknown } | null | undefined
  onBackToQuestions: () => void
}) {
  if (!generalBannerVisible(userId) || !isGeneralVersion(blueprint)) return null
  return (
    <section role="status" data-testid="general-banner" className="rounded-xl border border-amber/40 bg-amber/[0.06] p-4 text-sm text-cream">
      <p>This is a general version — add a story or answer a question to make it yours.</p>
      <button type="button" onClick={onBackToQuestions} className="btn-ghost mt-3 inline-flex">Back to the questions</button>
    </section>
  )
}
