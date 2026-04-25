interface SectionLabelProps {
  children: React.ReactNode
  pulse?: boolean
  /** Use inside dark (inverted) sections */
  inverted?: boolean
}

export default function SectionLabel({ children, pulse = false, inverted = false }: SectionLabelProps) {
  return (
    <div
      className={`inline-flex items-center gap-3 rounded-full border px-5 py-2 ${
        inverted
          ? 'border-accent/40 bg-accent/10'
          : 'border-accent/30 bg-accent/5'
      }`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {pulse && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-accent">
        {children}
      </span>
    </div>
  )
}
