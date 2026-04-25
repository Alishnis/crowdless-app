import type { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
}

export default function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="group relative border border-white/10 rounded-xl p-6 bg-white/[0.03] transition-all duration-300 hover:border-accent/35 hover:bg-white/[0.06] cursor-default overflow-hidden">
      {/* Hover gradient sheen */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="relative">
        <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 shadow-accent">
          <Icon size={18} className="text-white" />
        </div>
        <h3 className="text-white font-semibold mb-2 leading-snug">{title}</h3>
        <p className="text-sm text-white/45 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
