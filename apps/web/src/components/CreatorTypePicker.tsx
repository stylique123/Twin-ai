// W12.2 — "What kind of creator are you?" Behind VITE_CREATOR_TYPE_RULES
// (default OFF): with the flag off it renders nothing, so onboarding and
// settings are unchanged. The answer is stored on the voice profile as
// `creator_type`, and the writer reads it only behind CREATOR_TYPE_RULES.
import { CREATOR_TYPE_VALUES, normalizeCreatorType, type CreatorTypeValue } from '@twinai/shared'

const LABELS: Record<CreatorTypeValue, string> = {
  coach: 'Coach or consultant',
  maker: 'Maker or product seller',
  local_business: 'Local business',
  educator: 'Educator',
  community: 'Community or personal brand',
  entertainer: 'Entertainer',
}

export function creatorTypePickerOn(env: Record<string, unknown> = import.meta.env): boolean {
  return String(env.VITE_CREATOR_TYPE_RULES ?? '').trim() === 'on'
}

export default function CreatorTypePicker({ value, onChange, enabled = creatorTypePickerOn() }: {
  value: unknown
  onChange: (next: CreatorTypeValue | null) => void
  enabled?: boolean
}) {
  if (!enabled) return null
  const current = normalizeCreatorType(value)
  return (
    <fieldset data-testid="creator-type-picker">
      <legend className="text-xs text-stone">What kind of creator are you?</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {CREATOR_TYPE_VALUES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={current === t}
            className={current === t ? 'chip chip-on' : 'chip'}
            onClick={() => onChange(current === t ? null : t)}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
