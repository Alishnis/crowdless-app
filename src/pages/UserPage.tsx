import {
  useJsApiLoader,
  GoogleMap,
  Marker,
  Polyline,
} from '@react-google-maps/api'
import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, ArrowDownUp, Footprints, Bus,
  ChevronRight, Navigation, Play, ChevronLeft,
  ShieldCheck, Clock, Users, Crosshair, CheckCircle2, Star,
} from 'lucide-react'
import { getAllStops, findRoutes, KYZ_ROUTES, haversineM } from '../services/kyzylordaRoutes'
import type { AnyMatch, RouteMatch, WalkTransferMatch, KyzRoute } from '../services/kyzylordaRoutes'
import type { Stop, SimulatedBus } from '../types/bus.types'
import { useNavigate } from 'react-router-dom'
import { useBusSimulation } from '../hooks/useBusSimulation'
import { useYoloAnalysis } from '../hooks/useYoloAnalysis'
import { getOccupancyLevel, OCCUPANCY_COLORS, OCCUPANCY_LABELS } from '../utils/occupancy'
import { useT } from '../i18n'

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ?? ''

// Stable reference — never recreated, so @react-google-maps/api won't call setCenter() on every render
const MAP_CENTER  = { lat: 44.848, lng: 65.509 }
// Single-point dummy path used for always-rendered invisible Polylines
const DUMMY_PATH  = [{ lat: 0, lng: 0 }]

// ── Map style (dark, neutral) ─────────────────────────────────────────────────
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',           stylers: [{ color: '#1a2332' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2332' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#6b7a8f' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c9aa7a' }] },
  { featureType: 'landscape',          elementType: 'geometry', stylers: [{ color: '#1e2d3a' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#243444' }] },
  { featureType: 'landscape.natural',  elementType: 'geometry', stylers: [{ color: '#162a20' }] },
  { featureType: 'poi',                elementType: 'geometry', stylers: [{ color: '#283848' }] },
  { featureType: 'poi',                elementType: 'labels.text.fill', stylers: [{ color: '#c9aa7a' }] },
  { featureType: 'poi.park',           elementType: 'geometry', stylers: [{ color: '#162a20' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#2d3c4e' }] },
  { featureType: 'road',               elementType: 'geometry.stroke', stylers: [{ color: '#1a2838' }] },
  { featureType: 'road',               elementType: 'labels.text.fill', stylers: [{ color: '#7a8a9a' }] },
  { featureType: 'road.highway',       elementType: 'geometry', stylers: [{ color: '#3d5068' }] },
  { featureType: 'road.highway',       elementType: 'labels.text.fill', stylers: [{ color: '#e8c87a' }] },
  { featureType: 'transit',            elementType: 'geometry', stylers: [{ color: '#243444' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#0e1e2e' }] },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserPoint {
  lat: number
  lng: number
  label: string
  nearestStop: Stop
  isCustom: boolean  // picked from map (not a stop directly)
}

interface NavStep {
  type: 'walk' | 'bus' | 'arrived'
  title: string
  subtitle: string
  distM?: number
  minutes?: number
  color?: string
  routeNumber?: string
  stopFrom?: string
  stopTo?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findNearestStop(lat: number, lng: number): Stop {
  const all = getAllStops()
  let best = all[0].stop
  let bestDist = Infinity
  for (const { stop } of all) {
    const d = haversineM({ lat, lng }, stop)
    if (d < bestDist) { bestDist = d; best = stop }
  }
  return best
}

/** Extract bus path between two stops (closest path-point approach) */
function extractBusSegment(
  match: RouteMatch | WalkTransferMatch,
): { lat: number; lng: number }[] {
  const route = match.type === 'direct' ? match.route : match.boardRoute
  const stops = match.stopsOnRoute
  if (!stops.length) return []

  const fromStop = stops[0]
  const toStop   = stops[stops.length - 1]
  const path     = route.path

  const closestIdx = (stop: Stop) => {
    let best = 0; let bestD = Infinity
    for (let i = 0; i < path.length; i++) {
      const d = haversineM(path[i], stop)
      if (d < bestD) { bestD = d; best = i }
    }
    return best
  }

  const fi = closestIdx(fromStop)
  const ti = closestIdx(toStop)
  if (fi <= ti) return path.slice(fi, ti + 1)
  return [...path.slice(ti, fi + 1)].reverse()
}

function computeNavSteps(
  fromPoint: UserPoint,
  toPoint: UserPoint,
  match: AnyMatch,
  t: (key: string, vars?: Record<string, string | number>) => string,
): NavStep[] {
  const steps: NavStep[] = []

  // Walk from custom from-point to nearest stop
  if (fromPoint.isCustom) {
    const d = Math.round(haversineM(fromPoint, fromPoint.nearestStop))
    if (d > 30) {
      steps.push({
        type: 'walk',
        title: t('nav.walkToStop'),
        subtitle: `«${fromPoint.nearestStop.name}»`,
        distM: d,
        minutes: Math.ceil(d / 72),
      })
    }
  }

  // Walking transfer segment
  if (match.type === 'walk+bus') {
    steps.push({
      type: 'walk',
      title: t('nav.walkToStop'),
      subtitle: `«${match.walkTo.name}»`,
      distM: match.walkDistM,
      minutes: match.walkMinutes,
    })
  }

  // Bus step
  const route    = match.type === 'direct' ? match.route : match.boardRoute
  const stops    = match.stopsOnRoute
  const etaMin   = match.type === 'direct' ? match.etaMin : match.busEtaMin
  const fromStop = stops[0]
  const toStop   = stops[stops.length - 1]

  steps.push({
    type: 'bus',
    title: t('nav.boardBus', { n: route.number }),
    subtitle: route.name,
    minutes: Math.round(etaMin),
    color: route.color,
    routeNumber: route.number,
    stopFrom: fromStop.name,
    stopTo: toStop.name,
  })

  // Walk from bus stop to custom to-point
  if (toPoint.isCustom) {
    const d = Math.round(haversineM(toPoint.nearestStop, toPoint))
    if (d > 30) {
      steps.push({
        type: 'walk',
        title: t('nav.walkToDest'),
        subtitle: toPoint.label,
        distM: d,
        minutes: Math.ceil(d / 72),
      })
    }
  }

  steps.push({ type: 'arrived', title: t('nav.arrived'), subtitle: toPoint.label })
  return steps
}

// ── Pin SVGs ──────────────────────────────────────────────────────────────────

function makePinIcon(color: string, label: string): string {
  return `<svg width="36" height="44" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z"
          fill="${color}" stroke="white" stroke-width="1.5"/>
    <text x="18" y="21" text-anchor="middle" dominant-baseline="middle"
          fill="white" font-size="10" font-family="sans-serif" font-weight="bold">${label}</text>
  </svg>`
}

function makeSmallDot(color: string): string {
  return `<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="5" r="4" fill="${color}" stroke="white" stroke-width="1.2"/>
  </svg>`
}

// ── Stop input with search + map pick ────────────────────────────────────────

interface PointInputProps {
  label: string
  dotColor: string
  value: UserPoint | null
  onClear: () => void
  onSearch: (q: string) => void
  onPickMap: () => void
  query: string
  results: Array<{ stop: Stop; routeNumbers: string[] }>
  onSelect: (stop: Stop) => void
  isPickMode: boolean
}

function PointInput({
  label, dotColor, value, onClear, onSearch, onPickMap,
  query, results, onSelect, isPickMode,
}: PointInputProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const displayLabel = value?.label ?? (isPickMode ? t('up.tapMap') : label)

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors ${
          isPickMode ? 'bg-blue-500/15 border border-blue-500/40' : 'bg-white/[0.06] border border-white/10'
        }`}
      >
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor }} />

        {value ? (
          <>
            <span className="flex-1 text-sm text-white truncate">{value.label}</span>
            <button onClick={onClear} className="text-white/30 hover:text-white/70 transition-colors shrink-0">
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <input
              className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none min-w-0"
              placeholder={displayLabel}
              value={query}
              onChange={e => { onSearch(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
            />
            <button
              onClick={onPickMap}
              className={`shrink-0 transition-colors ${isPickMode ? 'text-blue-400' : 'text-white/25 hover:text-white/60'}`}
              title={t('up.pickOnMap')}
            >
              <Crosshair size={14} />
            </button>
          </>
        )}
      </div>

      <AnimatePresence>
        {open && query && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full mt-1 z-[600] bg-[#1a2535] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            <ul className="max-h-44 overflow-y-auto py-1 scrollbar-none">
              {results.slice(0, 8).map(({ stop, routeNumbers }) => (
                <li key={stop.id}>
                  <button
                    onMouseDown={() => { onSelect(stop); setOpen(false) }}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.06] transition-colors text-left"
                  >
                    <span className="text-sm text-white/80 truncate">{stop.name}</span>
                    <div className="flex gap-1 ml-2 shrink-0">
                      {routeNumbers.map(num => (
                        <span
                          key={num}
                          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: (KYZ_ROUTES.find(r => r.number === num)?.color ?? '#555') + '33',
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

// ── RouteOptionCard ───────────────────────────────────────────────────────────

interface RouteOptionCardProps {
  match:       AnyMatch
  bestBus:     SimulatedBus | undefined
  recommended: boolean
  active:      boolean
  onClick:     () => void
}

function RouteOptionCard({ match, bestBus, recommended, active, onClick }: RouteOptionCardProps) {
  const t = useT()
  const route = match.type === 'direct' ? match.route : match.boardRoute
  const eta   = match.type === 'direct' ? match.etaMin : match.totalEtaMin
  const pct   = bestBus?.percentage ?? 50
  const level = getOccupancyLevel(pct)
  const occ   = OCCUPANCY_COLORS[level]
  const count = bestBus?.count ?? Math.round(pct / 100 * route.capacity)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 transition-all ${
        active
          ? 'border-blue-500/50 bg-blue-500/8'
          : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
    >
      {/* Top row: walk chip + route badge + recommended */}
      <div className="flex items-center gap-2 mb-2">
        {match.type === 'walk+bus' && (
          <span className="flex items-center gap-1 text-[10px] font-mono text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full shrink-0">
            <Footprints size={9} /> {t('up.walkMin', { n: match.walkMinutes })}
          </span>
        )}
        <span
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold shrink-0"
          style={{ background: route.color + '25', color: route.color }}
        >
          <Bus size={11} /> №{route.number}
        </span>
        <span className="text-white/50 text-xs truncate flex-1">{route.name}</span>
        {recommended && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full shrink-0">
            <Star size={9} fill="currentColor" /> {t('up.recommended')}
          </span>
        )}
      </div>

      {/* Occupancy bar */}
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden mb-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: occ }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3">
        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: occ + '20', color: occ }}
        >
          {OCCUPANCY_LABELS[level]}
        </span>
        <span className="flex items-center gap-1 text-[11px] font-mono text-white/35">
          <Users size={10} /> {t('up.seatsOf', { count, capacity: route.capacity })}
        </span>
        <span className="flex items-center gap-1 text-[11px] font-mono text-white/35 ml-auto">
          <Clock size={10} /> {t('up.etaMin', { n: Math.round(eta) })}
        </span>
      </div>
    </button>
  )
}

// ── Main UserPage ─────────────────────────────────────────────────────────────

export default function UserPage() {
  const t = useT()
  const navigate = useNavigate()

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: API_KEY,
  })

  const mapRef = useRef<google.maps.Map | null>(null)
  const onMapLoad = useCallback((map: google.maps.Map) => { mapRef.current = map }, [])

  // Points
  const [fromPoint, setFromPoint] = useState<UserPoint | null>(null)
  const [toPoint,   setToPoint]   = useState<UserPoint | null>(null)
  const [fromQuery, setFromQuery] = useState('')
  const [toQuery,   setToQuery]   = useState('')

  // Pick-on-map mode
  const [pickMode, setPickMode] = useState<'from' | 'to' | null>(null)

  // Route
  const [matches,     setMatches]     = useState<AnyMatch[]>([])
  const [activeMatch, setActiveMatch] = useState<AnyMatch | null>(null)

  // Navigation
  const [isNavigating, setIsNavigating] = useState(false)
  const [navSteps,     setNavSteps]     = useState<NavStep[]>([])
  const [currentStep,  setCurrentStep]  = useState(0)

  // Route browse mode
  const [browseMode,         setBrowseMode]         = useState(false)
  const [routeSearchQuery,   setRouteSearchQuery]   = useState('')
  const [selectedBrowseRoute, setSelectedBrowseRoute] = useState<KyzRoute | null>(null)

  const yolo = useYoloAnalysis()
  const simBuses = useBusSimulation({
    connected:  yolo.connected,
    count:      yolo.count,
    capacity:   yolo.capacity,
    percentage: yolo.percentage,
    inCount:    yolo.inCount,
    outCount:   yolo.outCount,
  })

  const allStops = useMemo(() => getAllStops(), [])

  const sortedMatches = useMemo(() => {
    const getBestPct = (m: AnyMatch) => {
      const routeId = m.type === 'direct' ? m.route.id : m.boardRoute.id
      return simBuses
        .filter(bus => bus.routeId === routeId)
        .sort((x, y) => x.percentage - y.percentage)[0]?.percentage ?? 50
    }
    const directs = matches.filter(m => m.type === 'direct')
    const walks   = matches.filter(m => m.type === 'walk+bus')
    return [
      ...[...directs].sort((a, b) => getBestPct(a) - getBestPct(b)),
      ...walks,
    ]
  }, [matches, simBuses])

  const filteredRoutes = useMemo(() => {
    const q = routeSearchQuery.trim().toLowerCase()
    if (!q) return KYZ_ROUTES
    return KYZ_ROUTES.filter(r =>
      r.number.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    )
  }, [routeSearchQuery])

  const routeBuses = useMemo(
    () => selectedBrowseRoute
      ? simBuses.filter(b => b.routeId === selectedBrowseRoute.id)
      : [],
    [selectedBrowseRoute, simBuses],
  )

  function filterStops(q: string) {
    if (!q.trim()) return []
    return allStops.filter(({ stop }) =>
      stop.name.toLowerCase().includes(q.toLowerCase()),
    )
  }

  // Re-compute routes when both points are set
  useEffect(() => {
    if (!fromPoint || !toPoint) { setMatches([]); setActiveMatch(null); return }
    const result = findRoutes(fromPoint.nearestStop, toPoint.nearestStop)
    setMatches(result)
    setActiveMatch(result[0] ?? null)
  }, [fromPoint, toPoint])

  // Map click handler
  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return
    const lat = e.latLng.lat()
    const lng = e.latLng.lng()
    const nearestStop = findNearestStop(lat, lng)
    const point: UserPoint = {
      lat, lng,
      label: t('up.pickedPoint'),
      nearestStop,
      isCustom: true,
    }
    if (pickMode === 'from') { setFromPoint(point); setPickMode(null) }
    else if (pickMode === 'to') { setToPoint(point); setPickMode(null) }
  }, [pickMode])

  function selectFromStop(stop: Stop) {
    setFromPoint({ lat: stop.lat, lng: stop.lng, label: stop.name, nearestStop: stop, isCustom: false })
    setFromQuery('')
  }
  function selectToStop(stop: Stop) {
    setToPoint({ lat: stop.lat, lng: stop.lng, label: stop.name, nearestStop: stop, isCustom: false })
    setToQuery('')
  }

  function swapPoints() {
    const tmp = fromPoint; setFromPoint(toPoint); setToPoint(tmp)
    const tq  = fromQuery;  setFromQuery(toQuery);  setToQuery(tq)
  }

  function startNavigation() {
    if (!fromPoint || !toPoint || !activeMatch) return
    const steps = computeNavSteps(fromPoint, toPoint, activeMatch, t)
    setNavSteps(steps)
    setCurrentStep(0)
    setIsNavigating(true)
    // Fit map to route
    if (mapRef.current) {
      const bounds = new google.maps.LatLngBounds()
      if (fromPoint) bounds.extend({ lat: fromPoint.lat, lng: fromPoint.lng })
      if (toPoint)   bounds.extend({ lat: toPoint.lat, lng: toPoint.lng })
      mapRef.current.fitBounds(bounds, { top: 120, right: 40, bottom: 200, left: 40 })
    }
  }

  function nextStep() {
    if (currentStep < navSteps.length - 1) setCurrentStep(s => s + 1)
  }
  function prevStep() {
    if (currentStep > 0) setCurrentStep(s => s - 1)
  }
  function endNavigation() {
    setIsNavigating(false); setCurrentStep(0); setNavSteps([])
  }

  // Map options — guard against google being undefined before Maps API loads
  const mapOptions = useMemo(() => ({
    styles: DARK_STYLE,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: isLoaded
      ? { position: google.maps.ControlPosition.RIGHT_BOTTOM }
      : undefined,
    gestureHandling: 'greedy',
    minZoom: 4,
    maxZoom: 18,
    draggableCursor: pickMode ? 'crosshair' : undefined,
    clickableIcons: false,
  }), [pickMode, isLoaded])

  // Compute display paths — also guard on fromPoint/toPoint so segments clear
  // in the same render cycle when a point is removed (before useEffect fires)
  const busSegment = useMemo(() => {
    if (!activeMatch || !fromPoint || !toPoint) return []
    return extractBusSegment(activeMatch)
  }, [activeMatch, fromPoint, toPoint])

  const walkSegment1 = useMemo<{ lat: number; lng: number }[]>(() => {
    if (!fromPoint || !activeMatch) return []
    const walkFrom = fromPoint
    const walkTo   = activeMatch.type === 'walk+bus'
      ? activeMatch.walkTo
      : activeMatch.type === 'direct'
        ? activeMatch.stopsOnRoute[0]
        : null
    if (!walkTo || !walkFrom.isCustom) return []
    return [{ lat: walkFrom.lat, lng: walkFrom.lng }, { lat: walkTo.lat, lng: walkTo.lng }]
  }, [fromPoint, activeMatch])

  const walkTransferSegment = useMemo<{ lat: number; lng: number }[]>(() => {
    if (!activeMatch || activeMatch.type !== 'walk+bus') return []
    return [
      { lat: activeMatch.walkFrom.lat, lng: activeMatch.walkFrom.lng },
      { lat: activeMatch.walkTo.lat,   lng: activeMatch.walkTo.lng   },
    ]
  }, [activeMatch])

  const walkSegment2 = useMemo<{ lat: number; lng: number }[]>(() => {
    if (!toPoint || !activeMatch) return []
    const stops = activeMatch.stopsOnRoute
    const lastStop = stops[stops.length - 1]
    if (!toPoint.isCustom || !lastStop) return []
    return [{ lat: lastStop.lat, lng: lastStop.lng }, { lat: toPoint.lat, lng: toPoint.lng }]
  }, [toPoint, activeMatch])

  // Stops to show along bus segment
  const stopsOnBus = useMemo(() =>
    (activeMatch && fromPoint && toPoint) ? activeMatch.stopsOnRoute : [],
  [activeMatch, fromPoint, toPoint])

  // Route color (neutral in user mode)
  const ROUTE_COLOR = '#60a5fa'
  const WALK_COLOR  = '#94a3b8'

  const hasRoute = !!activeMatch && !!fromPoint && !!toPoint
  const step = navSteps[currentStep]
  const isLastStep = currentStep === navSteps.length - 1

  if (loadError) {
    return (
      <div className="w-screen h-screen bg-[#1a2332] flex items-center justify-center">
        <p className="text-red-400 text-sm font-mono">{t('map.loadError')}</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="w-screen h-screen bg-[#1a2332] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-white/40 text-sm font-mono">{t('map.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-[#1a2332]">

      {/* ── Full-screen Map ─────────────────────────────────────────────── */}
      <GoogleMap
        mapContainerClassName="w-full h-full"
        center={MAP_CENTER}
        zoom={14}
        options={mapOptions}
        onLoad={onMapLoad}
        onClick={handleMapClick}
      >
        {/* Walking segment 1: from custom fromPoint → fromStop */}
        <Polyline
          path={walkSegment1.length > 1 ? walkSegment1 : DUMMY_PATH}
          options={{
            strokeColor: WALK_COLOR, strokeOpacity: 0,
            strokeWeight: 3, visible: walkSegment1.length > 1,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }],
          }}
        />

        {/* Walking transfer segment */}
        <Polyline
          path={walkTransferSegment.length > 1 ? walkTransferSegment : DUMMY_PATH}
          options={{
            strokeColor: WALK_COLOR, strokeOpacity: 0,
            strokeWeight: 3, visible: walkTransferSegment.length > 1,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }],
          }}
        />

        {/* Bus segment */}
        <Polyline
          path={busSegment.length > 1 ? busSegment : DUMMY_PATH}
          options={{
            strokeColor: ROUTE_COLOR, strokeOpacity: 0.9,
            strokeWeight: 5, visible: busSegment.length > 1,
          }}
        />

        {/* Walking segment 2: toStop → custom toPoint */}
        <Polyline
          path={walkSegment2.length > 1 ? walkSegment2 : DUMMY_PATH}
          options={{
            strokeColor: WALK_COLOR, strokeOpacity: 0,
            strokeWeight: 3, visible: walkSegment2.length > 1,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }],
          }}
        />

        {/* Bus stops along route */}
        {stopsOnBus.map(stop => (
          <Marker
            key={stop.id}
            position={{ lat: stop.lat, lng: stop.lng }}
            icon={{
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makeSmallDot(ROUTE_COLOR))}`,
              scaledSize: new google.maps.Size(10, 10),
              anchor:     new google.maps.Point(5, 5),
            }}
          />
        ))}

        {/* Browse route — always rendered; path/visible props update in-place so old lines never accumulate */}
        <Polyline
          path={selectedBrowseRoute ? selectedBrowseRoute.path : [{ lat: 0, lng: 0 }]}
          options={{
            strokeColor:   selectedBrowseRoute?.color ?? '#ffffff',
            strokeOpacity: selectedBrowseRoute ? 0.85 : 0,
            strokeWeight:  5,
            visible:       !!selectedBrowseRoute,
          }}
        />
        {selectedBrowseRoute?.stops.map(stop => (
          <Marker
            key={`browse-stop-${stop.id}`}
            position={{ lat: stop.lat, lng: stop.lng }}
            icon={{
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makeSmallDot(selectedBrowseRoute.color))}`,
              scaledSize: new google.maps.Size(12, 12),
              anchor:     new google.maps.Point(6, 6),
            }}
          />
        ))}

        {/* From marker */}
        {fromPoint && (
          <Marker
            position={{ lat: fromPoint.lat, lng: fromPoint.lng }}
            icon={{
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makePinIcon('#22c55e', 'A'))}`,
              scaledSize: new google.maps.Size(36, 44),
              anchor:     new google.maps.Point(18, 44),
            }}
          />
        )}

        {/* To marker */}
        {toPoint && (
          <Marker
            position={{ lat: toPoint.lat, lng: toPoint.lng }}
            icon={{
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makePinIcon('#ef4444', 'B'))}`,
              scaledSize: new google.maps.Size(36, 44),
              anchor:     new google.maps.Point(18, 44),
            }}
          />
        )}
      </GoogleMap>

      {/* ── Admin button (top right) ──────────────────────────────────── */}
      <button
        onClick={() => navigate('/monitor')}
        className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-black/50 backdrop-blur-md border border-white/15 rounded-xl px-3 py-2 text-xs text-white/50 hover:text-white/80 hover:border-white/30 transition-all"
      >
        <ShieldCheck size={13} />
        {t('up.admin')}
      </button>

      {/* ── Pick-mode banner ──────────────────────────────────────────── */}
      <AnimatePresence>
        {pickMode && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-blue-500/90 backdrop-blur-md rounded-2xl px-5 py-2.5 shadow-xl pointer-events-auto"
          >
            <Crosshair size={15} className="text-white" />
            <span className="text-white text-sm font-medium">
              {t('up.tapToPick')}{' '}
              {pickMode === 'from' ? t('up.startPoint') : t('up.endPoint')}
            </span>
            <button
              onClick={() => setPickMode(null)}
              className="text-white/70 hover:text-white ml-1"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search panel (top) — hidden during navigation ─────────────── */}
      <AnimatePresence>
        {!isNavigating && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="absolute top-4 left-4 right-16 z-40 max-w-sm pointer-events-none"
          >
            <div className="bg-[#141e2d]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-visible pointer-events-auto">
              {/* Logo + mode tabs */}
              <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 border-b border-white/[0.06]">
                <div className="w-6 h-6 rounded-lg gradient-bg flex items-center justify-center shrink-0">
                  <Bus size={12} className="text-white" />
                </div>
                <span className="font-semibold text-white text-sm">CrowdLess</span>
                <span className="text-[10px] font-mono text-white/25">{t('up.city')}</span>
                <div className="ml-auto flex gap-1 shrink-0">
                  <button
                    onClick={() => { setBrowseMode(false); setSelectedBrowseRoute(null) }}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                      !browseMode ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
                    }`}
                  >
                    {t('up.tabRoute')}
                  </button>
                  <button
                    onClick={() => { setBrowseMode(true); setPickMode(null) }}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                      browseMode ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
                    }`}
                  >
                    {t('up.tabLines')}
                  </button>
                </div>
              </div>

              {browseMode ? (
                /* ── Route browse ── */
                <div className="px-3 py-3">
                  <div className="flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 mb-2.5">
                    <Search size={13} className="text-white/25 shrink-0" />
                    <input
                      className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none min-w-0"
                      placeholder={t('up.searchRoute')}
                      value={routeSearchQuery}
                      onChange={e => setRouteSearchQuery(e.target.value)}
                    />
                    {routeSearchQuery && (
                      <button onClick={() => setRouteSearchQuery('')} className="text-white/25 hover:text-white/60 shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 max-h-52 overflow-y-auto scrollbar-none">
                    {filteredRoutes.map(route => {
                      const buses   = simBuses.filter(b => b.routeId === route.id)
                      const avgPct  = buses.length
                        ? Math.round(buses.reduce((s, b) => s + b.percentage, 0) / buses.length)
                        : 50
                      const level   = getOccupancyLevel(avgPct)
                      const occColor = OCCUPANCY_COLORS[level]
                      const isSelected = selectedBrowseRoute?.id === route.id
                      return (
                        <button
                          key={route.id}
                          onClick={() => setSelectedBrowseRoute(prev => prev?.id === route.id ? null : route)}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                            isSelected
                              ? 'bg-white/10 border border-white/15'
                              : 'hover:bg-white/[0.05] border border-transparent'
                          }`}
                        >
                          <span
                            className="font-bold text-xs px-2 py-0.5 rounded-lg shrink-0"
                            style={{ background: route.color + '25', color: route.color }}
                          >
                            №{route.number}
                          </span>
                          <span className="flex-1 text-sm text-white/65 truncate">{route.name}</span>
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: occColor + '20', color: occColor }}
                          >
                            {avgPct}%
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* ── Route planner inputs ── */
                <div className="px-3 py-3 flex flex-col gap-2 relative">
                <PointInput
                  label={t('rp.from')}
                  dotColor="#22c55e"
                  value={fromPoint}
                  onClear={() => { setFromPoint(null); setFromQuery('') }}
                  onSearch={setFromQuery}
                  onPickMap={() => setPickMode(p => p === 'from' ? null : 'from')}
                  query={fromQuery}
                  results={filterStops(fromQuery)}
                  onSelect={selectFromStop}
                  isPickMode={pickMode === 'from'}
                />

                {/* Swap */}
                <button
                  onClick={swapPoints}
                  disabled={!fromPoint && !toPoint}
                  className="absolute right-6 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg border border-white/10 bg-[#141e2d] flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/25 transition-colors disabled:opacity-25 z-10"
                >
                  <ArrowDownUp size={12} />
                </button>

                <PointInput
                  label={t('rp.to')}
                  dotColor="#ef4444"
                  value={toPoint}
                  onClear={() => { setToPoint(null); setToQuery('') }}
                  onSearch={setToQuery}
                  onPickMap={() => setPickMode(p => p === 'to' ? null : 'to')}
                  query={toQuery}
                  results={filterStops(toQuery)}
                  onSelect={selectToStop}
                  isPickMode={pickMode === 'to'}
                />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Route result sheet (bottom) — shown when route found ─────── */}
      <AnimatePresence>
        {hasRoute && !isNavigating && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-0 left-0 right-0 z-40 pb-safe pointer-events-none"
          >
            <div className="mx-4 mb-4 bg-[#141e2d]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto">
              {/* Header */}
              <div className="px-4 pt-3.5 pb-2.5 border-b border-white/[0.06]">
                <p className="font-mono text-[10px] uppercase tracking-widest text-white/25">
                  {t('up.options')}
                  {sortedMatches.length > 1 && (
                    <span className="ml-1.5 text-white/40">{sortedMatches.length}</span>
                  )}
                </p>
              </div>

              {/* Route cards */}
              <div className="px-3 py-3 flex flex-col gap-2 overflow-y-auto max-h-[240px] scrollbar-none">
                {sortedMatches.map((m, i) => {
                  const routeId = m.type === 'direct' ? m.route.id : m.boardRoute.id
                  const bestBus = simBuses
                    .filter(bus => bus.routeId === routeId)
                    .sort((a, b) => a.percentage - b.percentage)[0]
                  return (
                    <RouteOptionCard
                      key={i}
                      match={m}
                      bestBus={bestBus}
                      recommended={i === 0}
                      active={m === activeMatch}
                      onClick={() => setActiveMatch(m)}
                    />
                  )
                })}
              </div>

              {/* Start button */}
              <div className="px-3 pb-3 pt-1">
                <button
                  onClick={startNavigation}
                  className="w-full flex items-center justify-center gap-2.5 gradient-bg text-white font-semibold py-3.5 rounded-xl text-base hover:opacity-90 active:scale-[0.98] transition-all shadow-accent"
                >
                  <Play size={16} />
                  {t('up.startTrip')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Browse route detail panel ────────────────────────────────── */}
      <AnimatePresence>
        {selectedBrowseRoute && !isNavigating && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none"
          >
            <div className="mx-4 mb-4 bg-[#141e2d]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
                <button
                  onClick={() => setSelectedBrowseRoute(null)}
                  className="text-white/35 hover:text-white/70 transition-colors shrink-0"
                >
                  <X size={15} />
                </button>
                <span
                  className="flex items-center gap-1.5 font-bold text-sm px-2.5 py-1 rounded-lg shrink-0"
                  style={{ background: selectedBrowseRoute.color + '25', color: selectedBrowseRoute.color }}
                >
                  <Bus size={12} /> №{selectedBrowseRoute.number}
                </span>
                <span className="text-white/65 text-sm truncate">{selectedBrowseRoute.name}</span>
              </div>

              {/* Buses */}
              <div className="px-4 py-3">
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 mb-3">
                  {t('up.busesN', { n: routeBuses.length })}
                </p>
                <div className="flex flex-col gap-3">
                  {routeBuses.map((bus, i) => {
                    const level   = getOccupancyLevel(bus.percentage)
                    const occColor = OCCUPANCY_COLORS[level]
                    return (
                      <div key={bus.busId}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-white/40 flex items-center gap-1.5">
                            {t('up.busN', { n: i + 1 })}
                            {bus.isLive && (
                              <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {t('up.live')}
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-[11px] font-mono text-white/35">
                              <Users size={10} /> {t('up.seatsOf', { count: bus.count, capacity: bus.capacity })}
                            </span>
                            <span
                              className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                              style={{ background: occColor + '20', color: occColor }}
                            >
                              {OCCUPANCY_LABELS[level]}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: occColor }}
                            animate={{ width: `${bus.percentage}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Navigation overlay ────────────────────────────────────────── */}
      <AnimatePresence>
        {isNavigating && step && (
          <>
            {/* Top navigation card */}
            <motion.div
              initial={{ opacity: 0, y: -30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="absolute top-4 left-4 right-4 z-50"
            >
              <div className="bg-[#141e2d]/97 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Progress bar */}
                <div className="h-1 bg-white/[0.06]">
                  <motion.div
                    className="h-full gradient-bg"
                    animate={{ width: `${((currentStep + 1) / navSteps.length) * 100}%` }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>

                <div className="px-5 py-4">
                  {/* Step counter */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">
                      {t('up.stepOf', { cur: currentStep + 1, total: navSteps.length })}
                    </span>
                    <button
                      onClick={endNavigation}
                      className="text-white/30 hover:text-white/70 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Step icon + content */}
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: step.type === 'bus'
                          ? (step.color ?? '#3b82f6') + '22'
                          : step.type === 'arrived'
                            ? '#22c55e22'
                            : '#94a3b822',
                      }}
                    >
                      {step.type === 'walk' && <Footprints size={22} className="text-slate-300" />}
                      {step.type === 'bus'  && (
                        <span className="text-lg font-bold" style={{ color: step.color }}>
                          {step.routeNumber}
                        </span>
                      )}
                      {step.type === 'arrived' && <CheckCircle2 size={22} className="text-green-400" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-base leading-tight">{step.title}</p>
                      <p className="text-white/50 text-sm mt-1 leading-snug">{step.subtitle}</p>
                      {step.type === 'bus' && step.stopFrom && step.stopTo && (
                        <div className="flex items-center gap-1.5 mt-2 text-[12px] font-mono text-white/35">
                          <span className="truncate">{step.stopFrom}</span>
                          <ChevronRight size={10} className="shrink-0" />
                          <span className="truncate">{step.stopTo}</span>
                        </div>
                      )}
                      {(step.distM || step.minutes) && (
                        <div className="flex items-center gap-3 mt-2 text-[12px] font-mono text-white/40">
                          {step.distM && (
                            <span className="flex items-center gap-1">
                              <Navigation size={10} /> {t('up.metres', { n: step.distM! })}
                            </span>
                          )}
                          {step.minutes && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} /> {t('up.etaMin', { n: step.minutes! })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step dots */}
                  <div className="flex items-center justify-center gap-2 mt-4">
                    {navSteps.map((_s, i) => (
                      <div
                        key={i}
                        className="rounded-full transition-all duration-300"
                        style={{
                          width:   i === currentStep ? 20 : 6,
                          height:  6,
                          background: i <= currentStep ? '#60a5fa' : 'rgba(255,255,255,0.15)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Bottom nav controls */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="absolute bottom-0 left-0 right-0 z-50"
            >
              <div className="mx-4 mb-4 flex gap-3">
                {currentStep > 0 && (
                  <button
                    onClick={prevStep}
                    className="flex-1 flex items-center justify-center gap-2 bg-white/[0.08] backdrop-blur-md border border-white/10 text-white/70 font-medium py-3.5 rounded-xl hover:bg-white/[0.12] transition-all"
                  >
                    <ChevronLeft size={16} /> {t('up.back')}
                  </button>
                )}
                {!isLastStep ? (
                  <button
                    onClick={nextStep}
                    className="flex-1 flex items-center justify-center gap-2 gradient-bg text-white font-semibold py-3.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-accent"
                  >
                    {t('up.next')} <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={endNavigation}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-500/90 text-white font-semibold py-3.5 rounded-xl hover:bg-green-500 active:scale-[0.98] transition-all"
                  >
                    <CheckCircle2 size={16} /> {t('up.finish')}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Empty state hint ─────────────────────────────────────────── */}
      <AnimatePresence>
        {!fromPoint && !toPoint && !isNavigating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          >
            <div className="bg-black/50 backdrop-blur-md rounded-2xl px-5 py-3 border border-white/10 text-center">
              <p className="text-white/50 text-xs font-mono">
                {t('up.enterRoute')} <Crosshair size={10} className="inline" /> {t('up.onMap')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
