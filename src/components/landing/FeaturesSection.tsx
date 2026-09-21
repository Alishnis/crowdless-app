import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { Camera, Users, MapPin, Gauge, Shield, Zap } from 'lucide-react'
import FeatureCard from './FeatureCard'
import SectionLabel from '../ui/SectionLabel'
import { useT } from '../../i18n'

const features = [
  {
    icon: Camera,
    title: 'features.1.title',
    description: 'features.1.desc',
  },
  {
    icon: Users,
    title: 'features.2.title',
    description: 'features.2.desc',
  },
  {
    icon: MapPin,
    title: 'features.3.title',
    description: 'features.3.desc',
  },
  {
    icon: Gauge,
    title: 'features.4.title',
    description: 'features.4.desc',
  },
  {
    icon: Shield,
    title: 'features.5.title',
    description: 'features.5.desc',
  },
  {
    icon: Zap,
    title: 'features.6.title',
    description: 'features.6.desc',
  },
]

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export default function FeaturesSection() {
  const t = useT()
  return (
    <section id="features" className="relative bg-foreground py-28 px-6 overflow-hidden">
      {/* Dot-pattern texture — gives depth to the flat dark bg */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Radial accent glow — top-left corner */}
      <div
        className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(0,82,255,0.14) 0%, transparent 65%)' }}
      />

      {/* Radial accent glow — bottom-right */}
      <div
        className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(77,124,255,0.08) 0%, transparent 65%)' }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Section header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex justify-center mb-6">
            <SectionLabel inverted>{t('features.label')}</SectionLabel>
          </div>
          <h2 className="font-display text-[2rem] md:text-[2.75rem] text-white leading-[1.12] tracking-tight mb-4">
            {t('features.title1')}{' '}
            <span className="gradient-text">{t('features.title2')}</span>
          </h2>
          <p className="text-white/45 text-base max-w-xl mx-auto leading-relaxed">
            {t('features.lead')}
          </p>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1, margin: '-60px' }}
        >
          {features.map((f) => (
            <motion.div key={f.title} variants={item}>
              <FeatureCard icon={f.icon} title={t(f.title)} description={t(f.description)} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
