import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { Camera, Users, MapPin, Gauge, Shield, Zap } from 'lucide-react'
import FeatureCard from './FeatureCard'
import SectionLabel from '../ui/SectionLabel'

const features = [
  {
    icon: Camera,
    title: 'Анализ в реальном времени',
    description: 'YOLOv11 обрабатывает кадр раз в минуту — результат мгновенен без задержек.',
  },
  {
    icon: Users,
    title: 'Общий подсчёт людей',
    description: 'Считаем всех пассажиров в салоне сразу: одна камера — весь автобус.',
  },
  {
    icon: MapPin,
    title: 'Живая карта маршрута',
    description: 'Маркер автобуса обновляется каждые 7 секунд. Видно, где он прямо сейчас.',
  },
  {
    icon: Gauge,
    title: 'Процент заполненности',
    description: 'Один понятный показатель вместо сложных графиков и перегруженных таблиц.',
  },
  {
    icon: Shield,
    title: 'Без персональных данных',
    description: 'Только количество людей — никаких лиц, никакой биометрии, никаких записей.',
  },
  {
    icon: Zap,
    title: 'Быстрый отклик системы',
    description: 'От камеры до экрана — меньше минуты. Данные всегда актуальны.',
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
            <SectionLabel inverted>Возможности</SectionLabel>
          </div>
          <h2 className="font-display text-[2rem] md:text-[2.75rem] text-white leading-[1.12] tracking-tight mb-4">
            Всё что нужно для{' '}
            <span className="gradient-text">умного мониторинга</span>
          </h2>
          <p className="text-white/45 text-base max-w-xl mx-auto leading-relaxed">
            Шесть ключевых возможностей, которые делают CrowdLess незаменимым
            инструментом для городского транспорта
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
              <FeatureCard icon={f.icon} title={f.title} description={f.description} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
