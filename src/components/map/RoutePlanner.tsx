import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, ArrowDownUp, Search, Clock, Users,
  ChevronRight, Sparkles, Navigation, X, Footprints,
} from 'lucide-react'
import {
  getAllStops,
  findRoutes,
  KYZ_ROUTES,
} from '../../services/kyzylordaRoutes'
import type { AnyMatch, RouteMatch, WalkTransferMatch } from '../../services/kyzylordaRoutes'
import type { Stop, SimulatedBus } from '../../types/bus.types'
import { getOccupancyLevel, OCCUPANCY_COLORS, OCCUPANCY_LABELS } from '../../utils/occupancy'
import { useT } from '../../i18n'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

// ── Stop Selector ─────────────────────────────────────────────────────────────

interface StopSelectorProps {
  label: string
  accent: string
  value: Stop | null
  onChange: (stop: Stop | null) => void
  exclude?: string
}

function StopSelector({ label, accent, value, onChange, exclude }: StopSelectorProps) {
  const t = useT()
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const containerRef      = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLInputElement>(null)

  const allStops = useMemo(() => getAllStops(), [])
  const filtered = useMemo(
    () => allStops.filter(({ stop }) =>
      stop.name !== exclude &&
      stop.name.toLowerCase().includes(query.toLowerCase()),
    ),
    [allStops, query, exclude],
  )

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  function select(stop: Stop) { onChange(stop); setOpen(false); setQuery('') }
  function clear(e: React.MouseEvent) { e.stopPropagation(); onChange(null); setQuery('') }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => { setOpen(v => !v); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="w-full flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] hover:border-white/20 rounded-xl px-4 py-3 transition-colors group"
      >
        <MapPin size={14} style={{ color: accent }} className="shrink-0" />
        <span className={`flex-1 text-sm text-left truncate ${value ? 'text-white' : 'text-white/30'}`}>
          {value ? value.name : label}
        </span>
        {value
          ? <button onClick={clear} className="text-white/25 hover:text-white/60 transition-colors"><X size={13} /></button>
          : <ChevronRight size={13} className="text-white/20 group-hover:text-white/40 transition-colors" />
        }
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-1.5 z-[500] bg-[#1a2535] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07]">
              <Search size={13} className="text-white/30 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('rp.search')}
                className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none"
              />
            </div>
            <ul className="max-h-52 overflow-y-auto py-1 scrollbar-none">
              {filtered.length === 0 && (
                <li className="px-4 py-3 text-sm text-white/30 text-center">{t('rp.notFound')}</li>
              )}
              {filtered.map(({ stop, routeNumbers }) => (
                <li key={stop.id}>
                  <button
                    onClick={() => select(stop)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.06] transition-colors text-left"
                  >
                    <span className="text-sm text-white/80 truncate">{stop.name}</span>
                    <div className="flex gap-1 shrink-0 ml-2">
                      {routeNumbers.map(num => (
                        <span
                          key={num}
                          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: (KYZ_ROUTES.find(r => r.number === num)?.color ?? '#666') + '33',
                            color: KYZ_ROUTES.find(r => r.number === num)?.color ?? '#888',
                          }}
                        >
                          {num}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Direct Route Card ─────────────────────────────────────────────────────────

interface DirectCardProps {
  match: RouteMatch
  bus: SimulatedBus | undefined
  recommended: boolean
  selected: boolean
  onClick: () => void
}

function DirectCard({ match, bus, recommended, selected, onClick }: DirectCardProps) {
  const t = useT()
  const { route, stopsOnRoute, etaMin } = match
  const pct      = bus?.percentage ?? 50
  const level    = getOccupancyLevel(pct)
  const color    = OCCUPANCY_COLORS[level]
  const occLabel = OCCUPANCY_LABELS[level]
  const count    = bus?.count ?? Math.round(pct / 100 * route.capacity)
  const nextStop = bus?.nextStop ?? ''

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
        selected
          ? 'border-accent/50 bg-accent/[0.06]'
          : 'border-white/[0.07] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: route.color + '22', color: route.color, border: `1.5px solid ${route.color}55` }}
          >
            {route.number}
          </div>
          <div>
            <p className="text-sm font-medium text-white leading-tight">{route.name}</p>
            <p className="text-[11px] text-white/35 mt-0.5 font-mono">
              {t('rp.stopsEta', { stops: stopsOnRoute.length - 1, min: Math.round(etaMin) })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {recommended && (
            <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-accent">
              <Sparkles size={9} /> {t('rp.best')}
            </span>
          )}
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: color + '22', color }}
          >
            {occLabel}
          </span>
        </div>
      </div>

      {/* Stop sequence */}
      <div className="flex items-center gap-1 mb-3 overflow-hidden">
        {stopsOnRoute.slice(0, 5).map((stop, i, arr) => (
          <div key={stop.id} className="flex items-center gap-1 min-w-0">
            <span className={`text-[11px] truncate max-w-[80px] ${
              i === 0 || i === arr.length - 1 ? 'text-white/70 font-medium' : 'text-white/35'
            }`}>
              {i === 0 ? stop.name : i === arr.length - 1 ? stop.name : '•'}
            </span>
            {i < arr.length - 1 && <ChevronRight size={10} className="text-white/20 shrink-0" />}
          </div>
        ))}
        {stopsOnRoute.length > 5 && (
          <span className="text-[11px] text-white/25">+{stopsOnRoute.length - 5}</span>
        )}
      </div>

      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: EASE }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] font-mono text-white/30">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Users size={10} />{count}/{route.capacity}</span>
          <span className="flex items-center gap-1"><Clock size={10} />{t('rp.etaMin', { min: Math.round(etaMin) })}</span>
        </div>
        {nextStop && (
          <span className="flex items-center gap-1 text-white/20 truncate max-w-[120px]">
            <Navigation size={9} />{nextStop}
          </span>
        )}
      </div>
    </motion.button>
  )
}

// ── Walk + Bus Card ───────────────────────────────────────────────────────────

interface WalkCardProps {
  match: WalkTransferMatch
  bus: SimulatedBus | undefined
  selected: boolean
  onClick: () => void
}

function WalkCard({ match, bus, selected, onClick }: WalkCardProps) {
  const t = useT()
  const { boardRoute, stopsOnRoute, walkMinutes, walkDistM, busEtaMin, totalEtaMin, walkTo } = match
  const pct      = bus?.percentage ?? 50
  const level    = getOccupancyLevel(pct)
  const color    = OCCUPANCY_COLORS[level]
  const occLabel = OCCUPANCY_LABELS[level]
  const count    = bus?.count ?? Math.round(pct / 100 * boardRoute.capacity)

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
        selected
          ? 'border-accent/50 bg-accent/[0.06]'
          : 'border-white/[0.07] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]'
      }`}
    >
      {/* Walk segment */}
      <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
        <Footprints size={13} className="text-sky-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-sky-300">
            {t('rp.walkTo', { name: walkTo.name })}
          </p>
          <p className="text-[10px] font-mono text-white/30 mt-0.5">
            {t('rp.walkInfo', { m: walkDistM, min: walkMinutes })}
          </p>
        </div>
      </div>

      {/* Bus segment */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: boardRoute.color + '22', color: boardRoute.color, border: `1.5px solid ${boardRoute.color}55` }}
          >
            {boardRoute.number}
          </div>
          <div>
            <p className="text-sm font-medium text-white leading-tight">{boardRoute.name}</p>
            <p className="text-[11px] text-white/35 mt-0.5 font-mono">
              {t('rp.stopsEta', { stops: stopsOnRoute.length - 1, min: Math.round(busEtaMin) })}
            </p>
          </div>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: color + '22', color }}
        >
          {occLabel}
        </span>
      </div>

      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: EASE }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] font-mono text-white/30">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Users size={10} />{count}/{boardRoute.capacity}</span>
          <span className="flex items-center gap-1 font-semibold text-white/50">
            <Clock size={10} />{t('rp.totalEta', { min: Math.round(totalEtaMin) })}
          </span>
        </div>
      </div>
    </motion.button>
  )
}

// ── Main RoutePlanner ─────────────────────────────────────────────────────────

interface Props {
  simBuses: SimulatedBus[]
  selectedRouteId: string | null
  onRouteSelect: (routeId: string | null) => void
  onStopsChange: (from: Stop | null, to: Stop | null) => void
}

export default function RoutePlanner({
  simBuses, selectedRouteId, onRouteSelect, onStopsChange,
}: Props) {
  const t = useT()
  const [fromStop, setFromStop] = useState<Stop | null>(null)
  const [toStop,   setToStop]   = useState<Stop | null>(null)

  useEffect(() => { onStopsChange(fromStop, toStop) }, [fromStop, toStop, onStopsChange])

  function swapStops() { setFromStop(toStop); setToStop(fromStop) }

  const matches = useMemo<AnyMatch[]>(() => {
    if (!fromStop || !toStop) return []
    return findRoutes(fromStop, toStop)
  }, [fromStop, toStop])

  // Sort directs by occupancy; walk+bus already sorted by totalEta
  const sortedMatches = useMemo(() => {
    const directs = matches.filter((m): m is RouteMatch => m.type === 'direct')
    const walks   = matches.filter((m): m is WalkTransferMatch => m.type === 'walk+bus')
    const sortedDirects = [...directs].sort((a, b) => {
      const busA = simBuses.find(bus => bus.routeId === a.route.id)
      const busB = simBuses.find(bus => bus.routeId === b.route.id)
      return (busA?.percentage ?? 50) - (busB?.percentage ?? 50)
    })
    return [...sortedDirects, ...walks]
  }, [matches, simBuses])

  const hasDirects = sortedMatches.some(m => m.type === 'direct')
  const hasWalks   = sortedMatches.some(m => m.type === 'walk+bus')

  const handleRouteClick = useCallback((routeId: string) => {
    onRouteSelect(selectedRouteId === routeId ? null : routeId)
  }, [selectedRouteId, onRouteSelect])

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Header */}
      <div className="px-6 pt-6 pb-5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Navigation size={12} className="text-accent" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">
            {t('rp.title')}
          </span>
        </div>
        <h2 className="font-display text-2xl text-white leading-none">{t('rp.where')}</h2>
        <p className="text-xs font-mono text-white/30 mt-2">
          {t('rp.lead')}
        </p>
      </div>

      {/* Stop selectors */}
      <div className="px-6 py-5 border-b border-white/10 shrink-0">
        <div className="relative flex flex-col gap-2">
          <StopSelector
            label={t('rp.from')}
            accent="#22c55e"
            value={fromStop}
            onChange={setFromStop}
            exclude={toStop?.name}
          />
          <button
            onClick={swapStops}
            disabled={!fromStop && !toStop}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-lg border border-white/10 bg-foreground flex items-center justify-center text-white/30 hover:text-white/70 hover:border-white/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowDownUp size={12} />
          </button>
          <StopSelector
            label={t('rp.to')}
            accent="#ef4444"
            value={toStop}
            onChange={setToStop}
            exclude={fromStop?.name}
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 px-6 py-5 overflow-y-auto">

        {/* Empty state */}
        {!fromStop && !toStop && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center mb-4">
              <MapPin size={22} className="text-white/20" />
            </div>
            <p className="text-sm text-white/35 font-medium">{t('rp.pickStops')}</p>
            <p className="text-xs text-white/20 mt-1 font-mono leading-relaxed">
              {t('rp.pickHint1')}<br/>
              {t('rp.pickHint2')}
            </p>
            <div className="mt-6 w-full">
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/20 mb-3">
                {t('rp.routeCount')}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {KYZ_ROUTES.map(route => (
                  <button
                    key={route.id}
                    onClick={() => onRouteSelect(selectedRouteId === route.id ? null : route.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: selectedRouteId === route.id ? route.color + '33' : route.color + '18',
                      color: route.color,
                      border: `1px solid ${route.color}${selectedRouteId === route.id ? '70' : '35'}`,
                    }}
                  >
                    <span className="font-bold">{route.number}</span>
                    <span className="text-[10px] opacity-70">{route.name.split('—')[0].trim()}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No results */}
        {fromStop && toStop && sortedMatches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-xl border border-white/[0.07] flex items-center justify-center mb-3">
              <Search size={18} className="text-white/20" />
            </div>
            <p className="text-sm text-white/35">{t('rp.noRoutes')}</p>
            <p className="text-xs text-white/20 mt-1 font-mono">{t('rp.tryOther')}</p>
          </div>
        )}

        {/* Results list */}
        {sortedMatches.length > 0 && (
          <div>
            {hasDirects && (
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35 mb-3">
                {t('rp.direct', { n: sortedMatches.filter(m => m.type === 'direct').length })}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <AnimatePresence mode="popLayout">
                {sortedMatches.map((match, idx) => {
                  if (match.type === 'direct') {
                    const routeBuses = simBuses.filter(b => b.routeId === match.route.id)
                    const bestBus    = routeBuses.sort((a, b) => a.percentage - b.percentage)[0]
                    return (
                      <DirectCard
                        key={match.route.id}
                        match={match}
                        bus={bestBus}
                        recommended={idx === 0}
                        selected={selectedRouteId === match.route.id}
                        onClick={() => handleRouteClick(match.route.id)}
                      />
                    )
                  } else {
                    const routeBuses = simBuses.filter(b => b.routeId === match.boardRoute.id)
                    const bestBus    = routeBuses.sort((a, b) => a.percentage - b.percentage)[0]
                    return (
                      <div key={`walk-${match.boardRoute.id}`}>
                        {/* Divider before walking suggestions */}
                        {idx === 0 && hasWalks && !hasDirects && (
                          <div className="flex items-center gap-2 mb-3">
                            <div className="flex-1 h-px bg-white/[0.06]" />
                            <span className="text-[10px] font-mono text-white/25 flex items-center gap-1">
                              <Footprints size={10} /> {t('rp.withWalk')}
                            </span>
                            <div className="flex-1 h-px bg-white/[0.06]" />
                          </div>
                        )}
                        {idx > 0 && hasWalks && !hasDirects && idx === sortedMatches.filter(m => m.type === 'direct').length && (
                          <div className="flex items-center gap-2 mb-3 mt-2">
                            <div className="flex-1 h-px bg-white/[0.06]" />
                            <span className="text-[10px] font-mono text-white/25 flex items-center gap-1">
                              <Footprints size={10} /> {t('rp.nearestWalk')}
                            </span>
                            <div className="flex-1 h-px bg-white/[0.06]" />
                          </div>
                        )}
                        <WalkCard
                          match={match}
                          bus={bestBus}
                          selected={selectedRouteId === match.boardRoute.id}
                          onClick={() => handleRouteClick(match.boardRoute.id)}
                        />
                      </div>
                    )
                  }
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
