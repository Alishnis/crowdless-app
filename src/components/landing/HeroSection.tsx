import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { ArrowRight, Play } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import SectionLabel from '../ui/SectionLabel'
import HeroGraphic from './HeroGraphic'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
}

const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
}

export default function HeroSection() {
  const navigate = useNavigate()

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Top-right radial glow */}
      <div
        className="absolute -top-32 -right-32 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(0,82,255,0.055) 0%, transparent 65%)' }}
      />

      <div className="relative max-w-6xl mx-auto w-full px-6 py-36 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 xl:gap-20 items-center">

        {/* ── Left: copy ────────────────────────────────────────────────── */}
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <motion.div variants={fadeUp} className="mb-8">
            <SectionLabel pulse>Live · YOLOv8 · Хакатон 2025</SectionLabel>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="font-display text-[2.75rem] md:text-[3.5rem] xl:text-[4.25rem] leading-[1.05] tracking-[-0.02em] text-foreground mb-6"
          >
            Умный мониторинг
            <br />
            <span className="gradient-text">заполненности</span>
            <br />
            автобусов — сейчас
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="text-base md:text-lg text-muted-foreground leading-[1.7] max-w-lg mb-10"
          >
            YOLOv8 анализирует видеопоток с камер в реальном времени.
            Один понятный показатель — процент заполненности всего салона.
            Без лиц, без сложных графиков.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => navigate('/monitor')}
              className="group inline-flex items-center justify-center gap-2 gradient-bg text-white font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-accent-lg active:scale-[0.98]"
            >
              Открыть монитор
              <ArrowRight
                size={16}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>

            <button className="group inline-flex items-center justify-center gap-2.5 border border-border text-foreground font-medium px-7 py-3.5 rounded-xl transition-all duration-200 hover:border-accent/30 hover:bg-muted active:scale-[0.98]">
              <div className="w-6 h-6 rounded-full gradient-bg flex items-center justify-center shrink-0">
                <Play size={10} className="text-white ml-0.5" />
              </div>
              Как это работает
            </button>
          </motion.div>
        </motion.div>

        {/* ── Right: graphic ─────────────────────────────────────────────── */}
        <motion.div
          className="flex items-center justify-center lg:justify-end"
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
        >
          <HeroGraphic />
        </motion.div>
      </div>
    </section>
  )
}
