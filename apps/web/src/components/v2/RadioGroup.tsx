// Single-choice rows, built one for one from Create.dc.html.
//   size "lg" = "What to take": min-height 58, padding 12/16, radius 14, gap 14,
//               picked: border #FF5B7B + bg rgba(255,91,123,.10); title 15/650,
//               description 13 #B7AE9F, note 12.5 #FFCB85, aside 12.5 #8D8475,
//               unavailable rows at opacity .4.
//   size "sm" = "Whose is it?" (Add a product): padding 11/14, radius 12, gap 12,
//               bg #0E0E12 always, picked border rgba(255,91,123,.5); title 14/600,
//               description 12.5 #8D8475.
// A real ARIA radiogroup: one tab stop, arrow keys move and select (skipping
// unavailable rows), visible focus ring for keyboard users only.
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type RadioOption<V extends string> = {
  value: V
  title: ReactNode
  description?: ReactNode
  /** Amber line under the description, e.g. why a row is unavailable. */
  note?: ReactNode
  /** Right-aligned quiet text (lg only), e.g. "Copies 1 of 4". */
  aside?: ReactNode
  disabled?: boolean
}

export function RadioGroup<V extends string>({
  label,
  options,
  value,
  onChange,
  size = 'lg',
  className,
}: {
  label: string
  options: RadioOption<V>[]
  value: V | null
  onChange: (value: V) => void
  size?: 'lg' | 'sm'
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
  const checkedIdx = options.findIndex((o) => o.value === value)
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

  const lg = size === 'lg'
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-col gap-2 leading-[normal]', className)}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={o.disabled || undefined}
            tabIndex={i === tabIdx ? 0 : -1}
            onClick={() => { if (!o.disabled) onChange(o.value) }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex w-full cursor-pointer items-center border text-left font-[inherit] text-cream',
              lg ? 'min-h-[58px] gap-[14px] rounded-[14px] px-4 py-3' : 'gap-3 rounded-[12px] px-[14px] py-[11px] bg-row',
              lg && (on ? 'border-coral bg-[rgba(255,91,123,0.10)]' : 'border-white/[0.08] bg-row'),
              !lg && (on ? 'border-[rgba(255,91,123,0.5)]' : 'border-white/[0.08]'),
              o.disabled && 'cursor-not-allowed opacity-40',
            )}
          >
            <span
              className={cn(
                // Board: 18px + 2px border in content-box = 22px outer.
                'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2',
                on ? 'border-coral' : 'border-white/25',
              )}
              aria-hidden="true"
            >
              <span className={cn('h-2 w-2 rounded-full', on ? 'bg-coral' : 'bg-transparent')} />
            </span>
            <span className={cn('flex flex-col', lg ? 'flex-grow gap-[3px]' : 'gap-[2px]')}>
              <span className={lg ? 'text-[15px] font-[650]' : 'text-[14px] font-semibold'}>{o.title}</span>
              {o.description && (
                <span className={lg ? 'text-[13px] text-sand-muted' : 'text-[12.5px] text-label'}>{o.description}</span>
              )}
              {/* The board always renders this line (empty when there's nothing to say),
                  so lg rows keep its 3px gap. */}
              {(lg || o.note) && <span className="text-[12.5px] text-amber-soft">{o.note}</span>}
              {/* Phone (MCreate): the aside sits under the text at 12px. */}
              {lg && o.aside && <span className="text-[12px] text-label md:hidden">{o.aside}</span>}
            </span>
            {/* >=768 (Create): the aside is right-aligned at 12.5px. */}
            {lg && o.aside && <span className="hidden shrink-0 text-[12.5px] text-label md:inline">{o.aside}</span>}
          </button>
        )
      })}
    </div>
  )
}
