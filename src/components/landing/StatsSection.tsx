import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'

const stats = [
  { value: '< 1', unit: 'мин', label: 'от камеры до экрана' },
  { value: '7',        unit: 'сек', label: 'интервал обновления' },
  { value: '100',      unit: '%',   label: 'приватность данных'  },
  { value: '24/7',     unit: '',    label: 'мониторинг без пауз' },
]

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
}

const item: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
}

export default function StatsSection() {
  return (
    <section id="stats" className="py-28 px-6 border-y border-border">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4"
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
        >
          {stats.map((stat, i) => (
            <motion.div key={i} variants={item} className="text-center">
              <div className="font-display leading-none gradient-text text-5xl lg:text-6xl mb-3">
                {stat.value}
                {stat.unit && (
                  <span className="text-3xl lg:text-4xl ml-0.5">{stat.unit}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
