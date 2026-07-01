// Loading steps that EXPLAIN what the AI is doing (never just spin). Each step
// shows done / active / pending so waiting feels short and legible. See
// docs/PRODUCT_VISION.md §13.
export interface Step {
  label: string
}

export default function StepList({ steps, activeIndex }: { steps: Step[]; activeIndex: number }) {
  return (
    <ul className="space-y-3">
      {steps.map((s, i) => {
        const done = i < activeIndex
        const active = i === activeIndex
        return (
          <li key={i} className="flex items-center gap-3">
            <span
              className={`h-6 w-6 grid place-items-center rounded-full text-xs font-bold shrink-0 ${
                done ? 'bg-emerald-500 text-white' : active ? 'bg-teal text-ink' : 'bg-white/10 text-sand/50'
              }`}
            >
              {done ? '✓' : active ? '' : i + 1}
            </span>
            <span className={`text-sm ${active ? 'text-cream font-medium' : done ? 'text-sand/70' : 'text-sand/50'}`}>
              {s.label}
              {active && <span className="inline-block ml-1 animate-pulse">…</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
