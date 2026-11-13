// Onboarding header, one for one from the Connect / Reading / Stories / Meet
// boards (>=768: logo, 4-step stepper, start over, signed in as, sign out) and
// the M… boards (<768: logo + sign out, 4-segment bar, "Step n of 4 · name").
// ⚠️ AUDIT 2026-09-30 (from SignOutCorner): setup always offers a way out.
import type { ReactNode } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useWide } from '../../hooks/useWide'

export const STEP_NAMES = ['Your handle', 'Reading', 'Your stories', 'Your voice'] as const

export function OnboardingHeader({ step, startOver }: {
  /** 0-3: the step on screen. Earlier steps show as done. */
  step: number
  /** The "Stuck? Start over" control (absent on the first step). */
  startOver?: ReactNode
}) {
  const { signOut, session } = useAuth()
  const email = session?.user?.email ?? ''
  const wide = useWide()
  const leave = async () => { await signOut(); window.location.assign('/') }
  const signOutBtn = (cls: string) => (
    <button type="button" onClick={leave} data-testid="onboarding-sign-out" className={cls}>Sign out</button>
  )
  const logo = (size: 'lg' | 'sm') => (
    <span className={`flex items-center ${size === 'lg' ? 'gap-[10px]' : 'gap-2'}`}>
      <span className={`ob-gbtn flex items-center justify-center font-extrabold text-ink ${size === 'lg' ? 'h-7 w-7 rounded-[8px] text-[14px]' : 'h-6 w-6 rounded-[7px] text-[12px]'}`}>T</span>
      <span className={`font-bold text-cream ${size === 'lg' ? 'text-[16px]' : 'text-[15px]'}`}>TwinAI</span>
    </span>
  )

  if (!wide) {
    return (
      <div className="relative z-[2] pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between px-5 pt-1 text-[12.5px] text-label">
          {logo('sm')}
          {signOutBtn('-my-[10px] min-h-11 border-0 bg-transparent text-sand-muted underline')}
        </div>
        <div className="mx-5 mt-[14px] flex flex-col gap-2">
          <div className="flex gap-[5px]" aria-hidden="true">
            {STEP_NAMES.map((n, i) => (
              <span key={n} className="h-1 flex-1 rounded-[9px]" style={{ background: i < step ? '#65E5D8' : i === step ? 'linear-gradient(90deg,#FFB347,#FF5B7B)' : 'rgba(255,255,255,0.1)' }} />
            ))}
          </div>
          <span className="flex justify-between text-[12px] text-sand-muted">
            <span aria-live="polite">Step {step + 1} of 4 · <b className="text-cream">{STEP_NAMES[step]}</b></span>
            {startOver}
          </span>
        </div>
      </div>
    )
  }

  return (
    <header className="pin d1 relative z-[2] flex items-center justify-between gap-6 border-b border-white/[0.06] px-6 py-5 leading-[normal] lg:px-10">
      <span className="flex shrink-0 items-center gap-[10px] xl:w-[300px]">{logo('lg')}</span>
      <ol className="m-0 flex list-none items-center gap-[10px] p-0" aria-label="Setup steps">
        {STEP_NAMES.map((n, i) => {
          const done = i < step
          const on = i === step
          return (
            <li key={n} className="flex items-center gap-[10px]" aria-current={on ? 'step' : undefined}>
              {i > 0 && <span className="h-px w-9 bg-white/[0.12] max-lg:w-4" aria-hidden="true" />}
              <span className={`flex items-center gap-2 text-[13px] ${on ? 'font-semibold text-cream' : done ? 'text-teal-soft' : 'text-stone-dim'}`}>
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12px] font-extrabold"
                  style={{ background: on ? 'linear-gradient(135deg,#FFB347,#FF5B7B)' : done ? '#65E5D8' : 'rgba(255,255,255,0.08)', color: on || done ? '#07070A' : '#8D8475' }}>
                  {done ? '✓' : i + 1}
                </span>
                <span className="max-lg:hidden">{n}</span>
                {on && <span className="lg:hidden">{n}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      <span className="flex shrink-0 items-center justify-end gap-[10px] whitespace-nowrap text-[12.5px] text-label xl:w-[300px]">
        {startOver}
        {startOver && <span aria-hidden="true">·</span>}
        <span className="max-w-[190px] overflow-hidden text-ellipsis max-lg:hidden" title={email}>Signed in as {email}</span>
        {signOutBtn('border-0 bg-transparent p-0 text-sand-soft underline')}
      </span>
    </header>
  )
}
