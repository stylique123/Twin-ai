// Single-choice list from the redesign boards (e.g. Create's "what's it about").
// A real ARIA radiogroup: one tab stop, arrow keys move AND select (per the
// WAI-ARIA radio pattern), Space/Enter select, visible focus ring. Each row is
// at least 58px tall (well over the 44px tap target).
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type RadioOption<V extends string> = {
  value: V
  title: ReactNode
  /** One line under the title (sand-muted). */
  description?: ReactNode
  /** Optional warning line under that (amber-soft), e.g. why it's not recommended. */
  note?: ReactNode
  /** Right-aligned quiet text (e.g. a real count). Never a made-up number. */
  aside?: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

export function RadioGroup<V extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Accessible name for the group (visually hidden). */
  label: string
  options: RadioOption<V>[]
  value: V | null
  onChange: (value: V) => void
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
  const checkedIdx = options.findIndex((o) => o.value === value)
  // Roving tab stop: the checked row, else the first enabled one.
  const tabIdx = checkedIdx >= 0 && !options[checkedIdx].disabled ? checkedIdx : enabled[0]

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight'
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft'
    if (!forward && !back) return
    e.preventDefault()
    const pos = enabled.indexOf(i)
    const next = enabled[(pos + (forward ? 1 : -1) + enabled.length) % enabled.length]
    refs.current[next]?.focus()
    onChange(options[next].value)
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-col gap-2', className)}>
      {options.map((o, i) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={o.disabled || undefined}
            tabIndex={i === tabIdx ? 0 : -1}
            onClick={() => { if (!o.disabled) onChange(o.value) }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="radio-row"
          >
            <span className="radio-dot" aria-hidden="true" />
            {o.icon && <span className="shrink-0 text-sand-muted" aria-hidden="true">{o.icon}</span>}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-cream">{o.title}</span>
              {o.description && <span className="text-[13px] text-sand-muted">{o.description}</span>}
              {o.note && <span className="text-xs text-amber-soft">{o.note}</span>}
            </span>
            {o.aside && <span className="shrink-0 text-xs text-stone">{o.aside}</span>}
          </button>
        )
      })}
    </div>
  )
}
