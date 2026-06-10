export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-signature text-ink font-display">
        T
      </span>
      <span className="text-cream">
        Twin<span className="gradient-text">AI</span>
      </span>
    </span>
  )
}
