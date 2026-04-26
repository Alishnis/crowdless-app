import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'

const stats = [
  { value: '< 1', unit: 'мин', label: 'от кадра до отображения' },
  { value: '7',   unit: 'сек', label: 'интервал обновления позиции' },
  { value: '100', unit: '%',   label: 'защита персональных данных' },
  { value: '24/7', unit: '',   label: 'непрерывная работа системы' },
]

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}

const item: Variants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
}

export default function StatsSection() {
  return (
    <section id="stats" className="py-20 px-6 border-y border-border">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border"
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
        >
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              variants={item}
              className="bg-background flex flex-col gap-3 px-8 py-10"
            >
              <div className="font-mono font-bold leading-none gradient-text text-5xl lg:text-[3.75rem] tracking-tight tabular-nums">
                {stat.value}
                {stat.unit && (
                  <span className="text-2xl lg:text-3xl ml-1 font-medium">{stat.unit}</span>
                )}
              </div>

              <div className="w-6 h-px bg-accent/35 mt-1" />

              <p className="text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground leading-relaxed">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
