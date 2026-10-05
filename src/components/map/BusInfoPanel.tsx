import { motion, AnimatePresence } from 'framer-motion'
import { Bus, Clock, Users, Wifi, Camera, WifiOff, LogIn, LogOut } from 'lucide-react'
import type { BusOccupancy } from '../../types/bus.types'
import type { YoloState } from '../../hooks/useYoloAnalysis'
import type { BusCamState } from '../../hooks/useBusCamera'
import { getOccupancyLevel, OCCUPANCY_COLORS, OCCUPANCY_LABELS } from '../../utils/occupancy'
import VideoUpload from './VideoUpload'
import { useT } from '../../i18n'

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

function CameraFeed({ yolo }: { yolo: YoloState | BusCamState }) {
  const t = useT()
  const { activity } = yolo as Partial<BusCamState>

  if (yolo.loading) {
    return (
      <div className="w-full aspect-video bg-white/[0.03] rounded-xl border border-white/[0.07] flex flex-col items-center justify-center gap-2">
        <div className="w-5 h-5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
        <p className="text-[11px] font-mono text-white/30">{t('bus.connecting')}</p>
      </div>
    )
  }

  if (!yolo.connected) {
    return (
      <div className="w-full aspect-video bg-white/[0.03] rounded-xl border border-white/[0.07] flex flex-col items-center justify-center gap-2">
        <WifiOff size={20} className="text-white/20" />
        <p className="text-[11px] font-mono text-white/30">{t('bus.noCamera')}</p>
        <p className="text-[10px] font-mono text-white/20">uvicorn backend.main:app --reload</p>
      </div>
    )
  }

  return (
    <div className="w-full rounded-xl overflow-hidden relative border border-white/[0.07]">
      <AnimatePresence mode="wait">
        <motion.img
          key={yolo.inCount + '-' + yolo.outCount}
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
        <span className="text-[10px] font-mono text-white/80 uppercase tracking-widest">{t('bus.camFeed')}</span>
      </div>

      {/* What the door is doing right now (bus cameras only) */}
      {activity && (
        <div className={`absolute top-2 right-2 flex items-center gap-1.5 backdrop-blur-sm rounded-full px-2.5 py-1 ${
          activity === 'boarding' ? 'bg-green-500/25' : 'bg-red-500/25'
        }`}>
          {activity === 'boarding'
            ? <LogIn  size={10} className="text-green-300" />
            : <LogOut size={10} className="text-red-300" />}
          <span className="text-[10px] font-mono text-white/85 uppercase tracking-widest">
            {t(activity === 'boarding' ? 'bus.boarding' : 'bus.alighting')}
          </span>
        </div>
      )}

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
            {t('bus.people', { n: yolo.count })}
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
  onUploadResult?: (inCount: number, outCount: number, current: number) => void
}

export default function BusInfoPanel({ bus, yolo, onUploadResult }: Props) {
  const t = useT()
  // Prefer live YOLO data when connected, fall back to simulation data
  const count      = yolo.connected ? yolo.count      : bus.count
  const capacity   = yolo.connected ? yolo.capacity   : bus.capacity
  const percentage = yolo.connected ? yolo.percentage : bus.percentage
  const inCount    = yolo.connected ? yolo.inCount    : (bus.inCount  ?? 0)
  const outCount   = yolo.connected ? yolo.outCount   : (bus.outCount ?? 0)

  const level = getOccupancyLevel(percentage)
  const color = OCCUPANCY_COLORS[level]
  const label = OCCUPANCY_LABELS[level]
  const time  = new Date(bus.updatedAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return (
    <div className="w-full md:w-[360px] md:min-w-[360px] bg-foreground border-t md:border-t-0 md:border-l border-white/10 flex flex-col overflow-y-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative h-2 w-2 rounded-full bg-green-400" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">
            {t('bus.liveStream')}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-2xl text-white leading-none">
              {t('bus.route', { n: bus.routeNumber })}
            </h2>
            {bus.routeName && (
              <p className="text-xs text-white/40 mt-1 truncate">{bus.routeName}</p>
            )}
            <p className="text-[11px] font-mono text-white/20 mt-1">{bus.busId}</p>
          </div>
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center shadow-accent shrink-0">
            <Bus size={18} className="text-white" />
          </div>
        </div>
      </div>

      {/* ── Quick stats: entered / exited / now ───────────────────────── */}
      <div className="px-5 py-4 border-b border-white/10">
        <div className="grid grid-cols-3 gap-2 mb-4">
          {/* entered */}
          <div className="bg-green-500/[0.07] border border-green-500/15 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1.5">
              <LogIn size={11} className="text-green-400" />
              <span className="text-[10px] font-mono text-white/30">{t('bus.entered')}</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={inCount}
                className="text-2xl font-mono font-bold text-green-400 leading-none"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
                {inCount}
              </motion.p>
            </AnimatePresence>
            <p className="text-[9px] font-mono text-white/20 mt-1">{t('bus.unit')}</p>
          </div>

          {/* exited */}
          <div className="bg-red-500/[0.07] border border-red-500/15 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1.5">
              <LogOut size={11} className="text-red-400" />
              <span className="text-[10px] font-mono text-white/30">{t('bus.exited')}</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={outCount}
                className="text-2xl font-mono font-bold text-red-400 leading-none"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
                {outCount}
              </motion.p>
            </AnimatePresence>
            <p className="text-[9px] font-mono text-white/20 mt-1">{t('bus.unit')}</p>
          </div>

          {/* now */}
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1.5">
              <Users size={11} className="text-accent" />
              <span className="text-[10px] font-mono text-white/30">{t('bus.nowShort')}</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={count}
                className="text-2xl font-mono font-bold text-white leading-none"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
                {count}
              </motion.p>
            </AnimatePresence>
            <p className="text-[9px] font-mono text-white/20 mt-1">{t('bus.unit')}</p>
          </div>
        </div>

        {/* Occupancy bar */}
        <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
          <span className="font-bold text-sm" style={{ color }}>{percentage}%</span>
          <span className="text-white/30" style={{ color }}>{label}</span>
          <span className="text-white/30">{t('bus.seatsOf', { count, capacity })}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: EASE }}
          />
        </div>
      </div>

      {/* ── AI Camera ──────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Camera size={12} className="text-accent" />
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">
            {t('bus.camera')}
          </p>
        </div>
        <CameraFeed yolo={yolo} />
        {(yolo as Partial<BusCamState>).source && (
          <p className="mt-2 text-[9px] font-mono text-white/20">
            {t('bus.footage', { clip: (yolo as BusCamState).source })}
          </p>
        )}
      </div>

      {/* ── Video upload ───────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <Camera size={12} className="text-accent" />
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">
            {t('bus.uploadVideo')}
          </p>
        </div>
        <VideoUpload onResult={onUploadResult} />
      </div>

      {/* ── Extra stats ────────────────────────────────────────────────── */}
      <div className="px-5 py-4 grid grid-cols-2 gap-3">
        <StatCard label={t('bus.capacity')}  value={t('bus.seats', { n: capacity })} icon={<Bus  size={14} />} />
        <StatCard
          label={t('bus.cameraLabel')}
          value={yolo.connected ? t('bus.online') : t('bus.offline')}
          icon={<Wifi size={14} />}
          accent={yolo.connected}
        />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="px-5 pb-5 mt-auto flex items-center gap-2 text-white/25">
        <Clock size={11} />
        <span className="text-[10px] font-mono">{t('bus.updatedAt', { time })}</span>
      </div>
    </div>
  )
}
