import { motion } from 'framer-motion'
import { Bus, Clock, Users, Zap, Wifi } from 'lucide-react'
import type { BusOccupancy } from '../../types/bus.types'
import { getOccupancyLevel, OCCUPANCY_COLORS, OCCUPANCY_LABELS } from '../../utils/occupancy'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

interface StatCardProps {
  label: string
  value: string
  icon: React.ReactNode
  accent?: boolean
}

function StatCard({ label, value, icon, accent = false }: StatCardProps) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-4">
      <div className={`mb-2 ${accent ? 'text-accent' : 'text-white/35'}`}>{icon}</div>
      <p className="text-xs text-white/35 mb-1">{label}</p>
      <p className={`text-lg font-semibold font-mono leading-none ${accent ? 'text-accent' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

interface Props {
  bus: BusOccupancy
}

export default function BusInfoPanel({ bus }: Props) {
  const level  = getOccupancyLevel(bus.percentage)
  const color  = OCCUPANCY_COLORS[level]
  const label  = OCCUPANCY_LABELS[level]
  const time   = new Date(bus.updatedAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return (
    <div className="w-full md:w-[360px] md:min-w-[360px] bg-foreground border-t md:border-t-0 md:border-l border-white/10 flex flex-col overflow-y-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-5 border-b border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative h-2 w-2 rounded-full bg-green-400" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">
            Живой поток
          </span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-3xl text-white leading-none">
              Маршрут {bus.routeNumber}
            </h2>
            <p className="text-xs font-mono text-white/30 mt-2">{bus.busId}</p>
          </div>
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center shadow-accent shrink-0">
            <Bus size={18} className="text-white" />
          </div>
        </div>
      </div>

      {/* ── Occupancy ──────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-white/10">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35 mb-5">
          Заполненность
        </p>

        <div className="text-center mb-5">
          <span className="font-display text-[4rem] leading-none gradient-text">
            {bus.percentage}%
          </span>
          <p className="text-sm mt-2 font-medium" style={{ color }}>
            {label}
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
          <motion.div
            className="h-full rounded-full gradient-bg"
            initial={{ width: 0 }}
            animate={{ width: `${bus.percentage}%` }}
            transition={{ duration: 1.2, ease: EASE }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-white/35">{bus.count} пасс.</span>
          <span className="text-white/35">из {bus.capacity} мест</span>
        </div>
      </div>

      {/* ── Stat grid ──────────────────────────────────────────────────── */}
      <div className="px-6 py-5 grid grid-cols-2 gap-3">
        <StatCard
          label="Пассажиров"
          value={String(bus.count)}
          icon={<Users size={14} />}
        />
        <StatCard
          label="Вместимость"
          value={String(bus.capacity)}
          icon={<Bus size={14} />}
        />
        <StatCard
          label="Обновление"
          value="7 сек"
          icon={<Zap size={14} />}
          accent
        />
        <StatCard
          label="Статус"
          value="Онлайн"
          icon={<Wifi size={14} />}
          accent
        />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="px-6 pb-6 mt-auto flex items-center gap-2 text-white/25">
        <Clock size={11} />
        <span className="text-[10px] font-mono">Обновлено в {time}</span>
      </div>
    </div>
  )
}
