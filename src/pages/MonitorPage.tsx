import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { BusOccupancy } from '../types/bus.types'
import { MOCK_BUS } from '../services/mockData'
import { KZ_CITIES, DEFAULT_CITY } from '../services/cities'
import type { City } from '../services/cities'
import BusMap from '../components/map/BusMap'
import BusInfoPanel from '../components/map/BusInfoPanel'
import CitySelector from '../components/map/CitySelector'
import { useYoloAnalysis } from '../hooks/useYoloAnalysis'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export default function MonitorPage() {
  const [selectedBus,  setSelectedBus]  = useState<BusOccupancy>(MOCK_BUS)
  const [selectedCity, setSelectedCity] = useState<City>(DEFAULT_CITY)
  const [buses, setBuses] = useState<BusOccupancy[]>([MOCK_BUS])

  const yolo = useYoloAnalysis()

  // Sync YOLO count → bus state so map marker colour updates too
  useEffect(() => {
    if (!yolo.connected) return
    const updated: BusOccupancy = {
      ...MOCK_BUS,
      count:      yolo.count,
      capacity:   yolo.capacity,
      percentage: yolo.percentage,
      updatedAt:  new Date().toISOString(),
    }
    setBuses([updated])
    setSelectedBus(prev => ({ ...prev, ...updated }))
  }, [yolo.count, yolo.percentage, yolo.connected])

  return (
    <motion.div
      className="flex flex-col md:flex-row h-screen pt-16 bg-foreground"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {/* ── Map area ──────────────────────────────────────────────────── */}
      <div className="flex-1 h-[55vh] md:h-full relative overflow-hidden">
        <BusMap
          buses={buses}
          onBusSelect={setSelectedBus}
          selectedBusId={selectedBus.busId}
          selectedCity={selectedCity}
        />

        {/* Live badge — top left */}
        <div className="absolute top-4 left-4 z-10 inline-flex items-center gap-2 rounded-full border border-white/15 bg-foreground/80 backdrop-blur-sm px-4 py-1.5 pointer-events-none">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative h-2 w-2 rounded-full bg-green-400" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/60">
            {selectedCity.name} · Живая карта
          </span>
        </div>

        {/* City selector — top right */}
        <div className="absolute top-4 right-4 z-[200]">
          <CitySelector
            cities={KZ_CITIES}
            selected={selectedCity}
            onSelect={setSelectedCity}
          />
        </div>
      </div>

      {/* ── Info panel ────────────────────────────────────────────────── */}
      <BusInfoPanel bus={selectedBus} yolo={yolo} />
    </motion.div>
  )
}
