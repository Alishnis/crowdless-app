import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Navigation, Camera, Map } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { KZ_CITIES } from '../services/cities'
import type { City } from '../services/cities'
import { KYZ_ROUTES } from '../services/kyzylordaRoutes'
import type { Stop, SimulatedBus } from '../types/bus.types'
import { useBusSimulation } from '../hooks/useBusSimulation'
import { useYoloAnalysis } from '../hooks/useYoloAnalysis'
import { useBusCamera, slotForBus } from '../hooks/useBusCamera'
import { useT } from '../i18n'
import BusMap from '../components/map/BusMap'
import BusInfoPanel from '../components/map/BusInfoPanel'
import RoutePlanner from '../components/map/RoutePlanner'
import CitySelector from '../components/map/CitySelector'

// Default to Kyzylorda since that is where all the routes are
const KYZYLORDA = KZ_CITIES.find(c => c.name === 'Қызылорда')!

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

type Tab = 'route' | 'camera'

export default function MonitorPage() {
  const t = useT()
  const navigate = useNavigate()
  const [selectedCity,   setSelectedCity]   = useState<City>(KYZYLORDA)
  const [activeTab,      setActiveTab]      = useState<Tab>('route')
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [selectedBusId,  setSelectedBusId]  = useState<string>('')
  const [fromStop,       setFromStop]       = useState<Stop | null>(null)
  const [toStop,         setToStop]         = useState<Stop | null>(null)

  // Each bus has its own door camera replaying real doorway footage through the
  // detector; only the bus being watched runs inference. Without that footage
  // (e.g. a deployment with no dataset) fall back to the single shared feed.
  const cam  = useBusCamera(slotForBus(selectedBusId), activeTab === 'camera')
  const yolo = useYoloAnalysis(activeTab === 'camera' && !cam.loading && !cam.connected)
  const feed = cam.connected ? cam : yolo

  // All simulated buses across all Kyzylorda routes. The watched bus takes its
  // numbers from its camera, so the map, the list and the panel agree.
  const simBuses = useBusSimulation(cam.connected ? {
    busId:      selectedBusId,
    connected:  true,
    count:      cam.count,
    capacity:   cam.capacity,
    percentage: cam.percentage,
    inCount:    cam.inCount,
    outCount:   cam.outCount,
  } : undefined)

  // When user selects a bus on the map, switch to camera tab and highlight
  function handleBusSelect(bus: SimulatedBus) {
    setSelectedBusId(bus.busId)
    setSelectedRouteId(bus.routeId)
    setActiveTab('camera')
  }

  const handleStopsChange = useCallback(
    (from: Stop | null, to: Stop | null) => {
      setFromStop(from)
      setToStop(to)
    },
    [],
  )

  // Derive BusOccupancy-compatible object for BusInfoPanel from selected bus
  const selectedBus = simBuses.find(b => b.busId === selectedBusId) ?? simBuses[0]
  const busForPanel = selectedBus
    ? {
        busId:       selectedBus.busId,
        routeNumber: selectedBus.routeNumber,
        routeName:   selectedBus.routeName,
        count:       selectedBus.count,
        capacity:    selectedBus.capacity,
        percentage:  selectedBus.percentage,
        inCount:     selectedBus.inCount,
        outCount:    selectedBus.outCount,
        updatedAt:   new Date().toISOString(),
        coordinates: [selectedBus.pos.lng, selectedBus.pos.lat] as [number, number],
      }
    : {
        busId: '—', routeNumber: '—', count: 0, capacity: 65, percentage: 0,
        updatedAt: new Date().toISOString(), coordinates: [65.509, 44.848] as [number, number],
      }

  // Live bus count stats for the top bar
  const totalBuses = simBuses.length
  const lowBuses   = simBuses.filter(b => b.percentage <= 40).length
  const highBuses  = simBuses.filter(b => b.percentage >  70).length

  return (
    <motion.div
      className="flex flex-col md:flex-row h-screen pt-16 bg-foreground"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {/* ── Map area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 h-[55vh] md:h-full relative overflow-hidden">
        <BusMap
          simBuses={simBuses}
          selectedBusId={selectedBusId}
          onBusSelect={handleBusSelect}
          onRouteClick={id => {
            setSelectedRouteId(prev => prev === id ? null : id)
            setActiveTab('route')
          }}
          selectedCity={selectedCity}
          selectedRouteId={selectedRouteId}
          fromStop={fromStop}
          toStop={toStop}
        />

        {/* Live badge — top left */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-foreground/80 backdrop-blur-sm px-4 py-1.5 pointer-events-none">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative h-2 w-2 rounded-full bg-green-400" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/60">
              {t('mon.sim', { city: selectedCity.name })}
            </span>
          </div>

          {/* Route stats chips */}
          <div className="flex gap-2 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-foreground/75 backdrop-blur-sm px-3 py-1 font-mono text-[10px] text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-white/30 inline-block" />
              {t('mon.buses', { n: totalBuses })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 backdrop-blur-sm px-3 py-1 font-mono text-[10px] text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              {t('mon.free', { n: lowBuses })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 backdrop-blur-sm px-3 py-1 font-mono text-[10px] text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
              {t('mon.crowded', { n: highBuses })}
            </span>
          </div>
        </div>

        {/* Route legend — bottom left */}
        <div className="absolute bottom-4 left-4 z-10 bg-foreground/80 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2.5 pointer-events-none">
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 mb-2">{t('mon.routes')}</p>
          <div className="flex flex-col gap-1">
            {KYZ_ROUTES.map(route => (
              <div key={route.id} className="flex items-center gap-2">
                <div className="w-4 h-1 rounded-full" style={{ background: route.color }} />
                <span className="font-mono text-[10px] text-white/40">
                  {route.number} · {route.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* City selector + user map button — top right */}
        <div className="absolute top-4 right-4 z-[200] flex items-center gap-2">
          <button
            onClick={() => navigate('/map')}
            className="inline-flex items-center gap-1.5 bg-foreground/80 backdrop-blur-md border border-white/15 rounded-xl px-3 py-2 text-xs text-white/50 hover:text-white/80 hover:border-accent/30 transition-all"
          >
            <Map size={12} className="text-accent" />
            {t('mon.passengerMap')}
          </button>
          <CitySelector
            cities={KZ_CITIES}
            selected={selectedCity}
            onSelect={setSelectedCity}
          />
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div className="w-full md:w-[360px] md:min-w-[360px] bg-foreground border-t md:border-t-0 md:border-l border-white/10 flex flex-col overflow-hidden">

        {/* Tab bar */}
        <div className="flex shrink-0 border-b border-white/10">
          {([
            { id: 'route',  label: t('mon.tabRoute'),  icon: <Navigation size={13} /> },
            { id: 'camera', label: t('mon.tabCamera'), icon: <Camera     size={13} /> },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-medium transition-colors relative ${
                activeTab === tab.id ? 'text-accent' : 'text-white/35 hover:text-white/60'
              }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'route' ? (
            <RoutePlanner
              simBuses={simBuses}
              selectedRouteId={selectedRouteId}
              onRouteSelect={id => {
                setSelectedRouteId(id)
                if (id) {
                  // Auto-select first bus of this route
                  const firstBus = simBuses.find(b => b.routeId === id)
                  if (firstBus) setSelectedBusId(firstBus.busId)
                }
              }}
              onStopsChange={handleStopsChange}
            />
          ) : (
            <BusInfoPanel
              bus={busForPanel}
              yolo={feed}
              onUploadResult={() => {}}
            />
          )}
        </div>
      </div>
    </motion.div>
  )
}
