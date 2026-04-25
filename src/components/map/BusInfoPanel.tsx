import { motion, AnimatePresence } from 'framer-motion'
import { Bus, Clock, Users, Zap, Wifi, Camera, WifiOff } from 'lucide-react'
import type { BusOccupancy } from '../../types/bus.types'
import type { YoloState } from '../../hooks/useYoloAnalysis'
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

// ── AI Camera feed ─────────────────────────────────────────────────────────

function CameraFeed({ yolo }: { yolo: YoloState }) {
  if (yolo.loading) {
    return (
      <div className="w-full aspect-video bg-white/[0.03] rounded-xl border border-white/[0.07] flex flex-col items-center justify-center gap-2">
        <div className="w-5 h-5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
        <p className="text-[11px] font-mono text-white/30">Подключение к камере…</p>
      </div>
    )
  }

  if (!yolo.connected) {
    return (
      <div className="w-full aspect-video bg-white/[0.03] rounded-xl border border-white/[0.07] flex flex-col items-center justify-center gap-2">
        <WifiOff size={20} className="text-white/20" />
        <p className="text-[11px] font-mono text-white/30">Камера недоступна</p>
        <p className="text-[10px] font-mono text-white/20">uvicorn backend.main:app --reload</p>
      </div>
    )
  }

  return (
    <div className="w-full rounded-xl overflow-hidden relative border border-white/[0.07]">
      <AnimatePresence mode="wait">
        <motion.img
          key={yolo.filename}
          src={`data:image/jpeg;base64,${yolo.imageB64}`}
          alt="YOLO detection"
          className="w-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        />
      </AnimatePresence>

      {/* Live badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className="text-[10px] font-mono text-white/80 uppercase tracking-widest">AI · YOLOv11</span>
      </div>

      {/* Count badge */}
      <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1">
        <AnimatePresence mode="wait">
          <motion.span
            key={yolo.count}
            className="text-sm font-mono font-bold text-accent"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            {yolo.count} чел.
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────

interface Props {
  bus: BusOccupancy
  yolo: YoloState
}

export default function BusInfoPanel({ bus, yolo }: Props) {
  // Prefer live YOLO data when connected, fall back to static bus data
  const count      = yolo.connected ? yolo.count      : bus.count
  const capacity   = yolo.connected ? yolo.capacity   : bus.capacity
  const percentage = yolo.connected ? yolo.percentage : bus.percentage

  const level = getOccupancyLevel(percentage)
  const color = OCCUPANCY_COLORS[level]
  const label = OCCUPANCY_LABELS[level]
  const time  = new Date(bus.updatedAt).toLocaleTimeString('ru-RU', {
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

      {/* ── AI Camera ──────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Camera size={12} className="text-accent" />
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">
            Камера автобуса
          </p>
        </div>
        <CameraFeed yolo={yolo} />
      </div>

      {/* ── Occupancy ──────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-white/10">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35 mb-5">
          Заполненность
        </p>

        <div className="text-center mb-5">
          <AnimatePresence mode="wait">
            <motion.span
              key={percentage}
              className="font-display text-[4rem] leading-none gradient-text inline-block"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {percentage}%
            </motion.span>
          </AnimatePresence>
          <p className="text-sm mt-2 font-medium" style={{ color }}>
            {label}
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
          <motion.div
            className="h-full rounded-full gradient-bg"
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1.0, ease: EASE }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono">
          <AnimatePresence mode="wait">
            <motion.span
              key={count}
              className="text-white/35"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {count} пасс.
            </motion.span>
          </AnimatePresence>
          <span className="text-white/35">из {capacity} мест</span>
        </div>
      </div>

      {/* ── Stat grid ──────────────────────────────────────────────────── */}
      <div className="px-6 py-5 grid grid-cols-2 gap-3">
        <StatCard label="Пассажиров"  value={String(count)}    icon={<Users size={14} />} />
        <StatCard label="Вместимость" value={String(capacity)} icon={<Bus   size={14} />} />
        <StatCard label="Интервал"    value="5 сек"            icon={<Zap   size={14} />} accent />
        <StatCard
          label="AI статус"
          value={yolo.connected ? 'Онлайн' : 'Офлайн'}
          icon={<Wifi size={14} />}
          accent={yolo.connected}
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
