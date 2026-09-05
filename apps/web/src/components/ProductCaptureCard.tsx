// THE PRODUCT-BLINDNESS DECISION, TURNED INTO ONE QUESTION.
//
// ⚠️ THE WRITER ALREADY TOLD US THIS SCRIPT WAS WRITTEN BLIND. generate-blueprint
// computes `unrecordedProduct` on every generation and, until this card existed,
// used it once to write a prompt instruction and threw it away. `product_entities`
// held roughly one row in production while this system generated hundreds of
// scripts — not because creators have no products, but because the only door in
// was a page nobody had a reason to visit. This card is that reason: it appears
// under a script the creator just watched get written around a gap, at the one
// moment they can feel the cost of the gap directly.
//
// ⚖️ SAME PLACEMENT DOCTRINE AS CreatorQuestionCard, FOR THE SAME MEASURED
// REASON. Below-the-fold questions on the confirm screen went unanswered; a
// dedicated Product Library page holds ~1 row after weeks of use. Under a
// script, dismissible in a tap, is the only placement this repo has evidence
// for.
//
// ⚖️ BOTH ANSWERS CLOSE THE GAP, NOT JUST "YES". "No, nothing to sell" mints a
// `NONE` relationship row through the same `claimProductEntity` the Product
// Library uses — which converts a permanent unknown into a known, recorded
// fact. Every future generation reads `ownedEntity` and finds it: no more
// guessing, whichever way the creator answered.
import { useEffect, useState } from 'react'
import {
  claimProductEntity, ProductLibraryFullError,
  type EntityType, type ProductEntityRecord,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/cn'

const TYPE_LABEL: Record<EntityType, string> = {
  SAAS: 'Software / app',
  APP: 'Software / app',
  PHYSICAL_PRODUCT: 'A physical product',
  DIGITAL_PRODUCT: 'A digital product',
  SERVICE: 'A service',
  COURSE: 'A course',
  COMMUNITY: 'A community',
  MARKETPLACE: 'A marketplace',
  OTHER: 'Something else',
}
// ⚖️ SAAS AND APP COLLAPSE TO ONE LABEL HERE ONLY. The entity schema keeps them
// distinct because the Director needs the difference (a phone screen versus a
// desktop dashboard); a creator answering one quick question does not need to
// make that call themselves, so the picker below still writes the entity's own
// choice for either label — see `TYPE_OPTIONS`.
const TYPE_OPTIONS: ReadonlyArray<{ value: EntityType; label: string }> = [
  { value: 'PHYSICAL_PRODUCT', label: TYPE_LABEL.PHYSICAL_PRODUCT },
  { value: 'SAAS', label: TYPE_LABEL.SAAS },
  { value: 'SERVICE', label: TYPE_LABEL.SERVICE },
  { value: 'COURSE', label: TYPE_LABEL.COURSE },
  { value: 'DIGITAL_PRODUCT', label: TYPE_LABEL.DIGITAL_PRODUCT },
  { value: 'OTHER', label: TYPE_LABEL.OTHER },
]

/**
 * Whether this generation's blueprint was written blind to the creator's
 * product — read, not cast, mirroring `readAdvisoryFindings` in Result.tsx.
 * `product_capture_prompt` is a plain boolean the edge function writes
 * unconditionally; anything else on the wire (absent, not a boolean) reads as
 * false, which is the safe direction — a missing signal must never conjure a
 * card that asks about a product the creator was never told is unrecorded.
 */
export function readProductCapturePrompt(bp: unknown): boolean {
  return (bp as { product_capture_prompt?: unknown })?.product_capture_prompt === true
}

// ⚠️ PER-VOICE, IN localStorage, NOT A SERVER RECORD. Answering "yes" or "no"
// mints a durable `product_entities` row — that is the real, cross-device
// closure, and `unrecordedProduct` will read false for every future
// generation regardless of this key. This key exists ONLY to suppress the
// card after a creator dismisses it without answering, so the same script
// session does not ask twice. Losing it (a new device, cleared storage) means
// the card can reappear — an acceptable low-severity gap for a soft dismiss,
// not for the two real answers.
function dismissKey(voiceId: string): string {
  return `twinai:product-capture-dismissed:${voiceId}`
}

function isDismissed(voiceId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(voiceId)) === '1'
  } catch {
    return false
  }
}

function setDismissed(voiceId: string): void {
  try {
    sessionStorage.setItem(dismissKey(voiceId), '1')
  } catch {
    // ⚖️ A STORAGE WRITE FAILING (private mode, quota) MUST NOT BLOCK THE
    // DISMISS ITSELF. The card still unmounts for this render; it may simply
    // reappear on the next script, which is the same soft-suppression gap
    // named above, not a new one.
  }
}

export function ProductCaptureCard(
  { shown, voiceId }: { shown: boolean; voiceId: string | null },
) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<'ask' | 'form' | 'thanks'>('ask')
  const [name, setName] = useState('')
  const [type, setType] = useState<EntityType>('PHYSICAL_PRODUCT')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    setVisible(shown && !!voiceId && !isDismissed(voiceId))
  }, [shown, voiceId])

  if (!visible || !voiceId) return null

  const dismiss = () => {
    setDismissed(voiceId)
    setVisible(false)
  }

  const mint = async (
    payload: { relationship: 'NONE' } | { relationship: 'OWN_PRODUCT' | 'OWN_SERVICE'; name: string; type: EntityType },
  ) => {
    setBusy(true)
    setProblem(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth?.user?.id
      if (!ownerId) throw new Error('not signed in')
      const record: ProductEntityRecord | null = await claimProductEntity(ownerId, voiceId, {
        relationship: payload.relationship,
        personalUse: 'NOT_CONFIRMED',
        type: payload.relationship === 'NONE' ? 'OTHER' : payload.type,
        name: payload.relationship === 'NONE' ? null : payload.name,
      })
      if (!record) throw new Error('not saved')
      setStep('thanks')
    } catch (err) {
      // ⚖️ THE ALREADY-OWNED BRANCH IS GONE WITH THE RULE IT HANDLED. It caught
      // `OwnedEntityExistsError` and showed 'thanks', on the reasoning that a
      // creator whose product was minted in another tab had already got what
      // they came for. 0186 removed the one-owned-per-voice rule — a second
      // product is now simply saved — so nothing raises that error and the
      // branch could only ever be dead code claiming to handle something.
      if (err instanceof ProductLibraryFullError) {
        setProblem(`You've reached your product limit (${err.limit}). Manage them in your Product Library.`)
      } else {
        setProblem('We could not save that just now. Your script is safe — try again in a moment.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (step === 'thanks') {
    return (
      <div className="rounded-card border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm text-cream">Got it — future scripts can build scenes around this.</p>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber">
          Teach your twin
        </p>
        <button type="button" onClick={dismiss} className="text-xs text-stone hover:text-cream">
          Not now
        </button>
      </div>

      {step === 'ask' && (
        <>
          {/* ⚠️ SAYS WHY, NOT JUST WHAT. A creator who does not know this script
              was written around an unanswered question has no reason to answer
              it — the same "says what it changes" doctrine as the thanks state
              on CreatorQuestionCard. */}
          <p className="mt-2 text-sm text-cream">
            This script was written without knowing whether you have a product or
            service — so it couldn't build a scene around one.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep('form')}
              className="rounded-full bg-amber px-4 py-2 text-xs font-semibold text-ink"
            >
              Yes, I have one
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void mint({ relationship: 'NONE' })}
              className={cn(
                'rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-cream',
                busy && 'opacity-50',
              )}
            >
              No, nothing to feature
            </button>
          </div>
        </>
      )}

      {step === 'form' && (
        <div className="mt-3 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What's it called?"
            maxLength={120}
            className="w-full rounded-lg border border-white/10 bg-ink2/60 px-3 py-2 text-sm text-cream placeholder:text-stone"
          />
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs',
                  type === opt.value
                    ? 'border-amber bg-amber/10 text-amber'
                    : 'border-white/10 text-stone',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {problem && <p className="text-xs text-coral">{problem}</p>}
          <button
            type="button"
            disabled={busy || name.trim().length === 0}
            onClick={() => void mint({
              relationship: type === 'SERVICE' || type === 'COURSE' ? 'OWN_SERVICE' : 'OWN_PRODUCT',
              name: name.trim(),
              type,
            })}
            className={cn(
              'rounded-full bg-amber px-4 py-2 text-xs font-semibold text-ink',
              (busy || name.trim().length === 0) && 'opacity-50',
            )}
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}
