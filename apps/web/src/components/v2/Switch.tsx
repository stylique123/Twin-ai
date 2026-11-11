// On/off switch from "Edit what Twin knows" (Create.dc.html): 38x22, knob 18,
// on #65E5D8 / off rgba(255,255,255,0.14), knob slides 2px -> 18px.
import { cn } from '../../lib/cn'

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full border-0 transition-[background] duration-200',
        checked ? 'bg-teal' : 'bg-white/[0.14]',
      )}
    >
      <span
        className={cn('absolute top-[2px] h-[18px] w-[18px] rounded-full bg-cream transition-[left] duration-200', checked ? 'left-[18px]' : 'left-[2px]')}
      />
    </button>
  )
}
