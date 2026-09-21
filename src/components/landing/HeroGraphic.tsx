import { motion } from 'framer-motion'
import { Users, MapPin, Zap, Camera } from 'lucide-react'
import Planet3D from './Planet3D'
import { useT } from '../../i18n'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

interface FloatingChipProps {
  icon: React.ReactNode
  iconBg: string
  label: string
  sub: string
  className: string
  yAnim: number[]
  duration: number
  delay?: number
}

function FloatingChip({ icon, iconBg, label, sub, className, yAnim, duration, delay = 0 }: FloatingChipProps) {
  return (
    <motion.div
      className={`absolute ${className}`}
      animate={{ y: yAnim }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay, repeatType: 'mirror' }}
    >
      <div className="bg-card border border-border rounded-xl p-2.5 [box-shadow:0_8px_24px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground leading-none">{label}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function HeroGraphic() {
  const t = useT()
  return (
    <div className="relative w-full max-w-[460px] aspect-square select-none">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 55% 45%, rgba(0,82,255,0.09) 0%, transparent 68%)' }}
      />

      {/* Decorative dot grid — top-left */}
      <div className="absolute top-4 left-4 grid grid-cols-5 gap-[10px] opacity-25 pointer-events-none">
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={i} className="w-1 h-1 rounded-full bg-accent" />
        ))}
      </div>

      {/* 3D Planet centered in sphere */}
      <div
        className="absolute pointer-events-none opacity-90"
        style={{
          width: 224,
          height: 224,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 0,
        }}
      >
        <Planet3D />
      </div>

      {/* Outer rotating ring */}
      <motion.div
        className="absolute inset-4 rounded-full border-2 border-dashed border-accent/20 pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      />

      {/* Inner counter-rotating ring */}
      <motion.div
        className="absolute inset-[72px] rounded-full border border-dashed border-accent/12 pointer-events-none"
        animate={{ rotate: -360 }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      />

      {/* ── Main dashboard card ────────────────────────────────────────────── */}
      <div className="absolute" style={{ top: '70%', left: '72%', transform: 'translate(-50%, -50%) scale(0.65)', transformOrigin: 'center center', width: 200 }}>
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="bg-card border border-border rounded-2xl p-5 [box-shadow:0_20px_40px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,82,255,0.07)]">
          {/* Live indicator */}
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative h-2 w-2 rounded-full bg-green-400" />
            </span>
            <span className="text-xs font-mono text-muted-foreground">{t('hero.online')}</span>
          </div>

          {/* Percentage */}
          <div className="text-center mb-4">
            <span className="font-display text-[2.75rem] gradient-text leading-none">74%</span>
            <p className="text-xs text-muted-foreground mt-1.5">{t('hero.seats')}</p>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full gradient-bg"
              initial={{ width: 0 }}
              animate={{ width: '74%' }}
              transition={{ duration: 1.4, ease: EASE, delay: 0.9 }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-muted-foreground">{t('hero.full')}</span>
            <span className="text-[10px] font-mono text-accent font-medium">74%</span>
          </div>
        </div>
      </motion.div>
      </div>

      {/* ── Floating chips ─────────────────────────────────────────────────── */}
      <FloatingChip
        icon={<Users size={12} className="text-white" />}
        iconBg="gradient-bg"
        label={t('hero.people')}
        sub={t('hero.inSaloon')}
        className="top-[15%] right-[8%]"
        yAnim={[0, -8, 0]}
        duration={4}
        delay={0.4}
      />

      <FloatingChip
        icon={<MapPin size={12} className="text-white" />}
        iconBg="bg-gradient-to-br from-amber-400 to-orange-500"
        label={t('hero.street')}
        sub={t('hero.route')}
        className="bottom-[22%] left-[6%]"
        yAnim={[0, 9, 0]}
        duration={4.5}
        delay={1.1}
      />

      <FloatingChip
        icon={<Camera size={12} className="text-white" />}
        iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
        label="YOLOv11"
        sub={t('hero.aiActive')}
        className="top-[22%] left-[7%]"
        yAnim={[0, -6, 0]}
        duration={5.5}
        delay={2}
      />

      <FloatingChip
        icon={<Zap size={12} className="text-white" />}
        iconBg="bg-gradient-to-br from-emerald-400 to-green-500"
        label={t('hero.sevenSec')}
        sub={t('hero.refresh')}
        className="bottom-[18%] right-[7%]"
        yAnim={[0, 7, 0]}
        duration={4}
        delay={0.7}
      />

      {/* Corner accent block */}
      <div className="absolute bottom-[10%] right-[17%] w-7 h-7 rounded-xl gradient-bg shadow-accent-lg pointer-events-none" />
    </div>
  )
}
