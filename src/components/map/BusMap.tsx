import { useJsApiLoader, GoogleMap, Marker, Polyline } from '@react-google-maps/api'
import { useMemo, useRef, useCallback, useEffect, useState } from 'react'
import { MapPin, AlertCircle, Loader2 } from 'lucide-react'
import type { BusOccupancy } from '../../types/bus.types'
import type { City } from '../../services/cities'
import { ROUTE_POINTS } from '../../services/routeData'
import { getOccupancyLevel, OCCUPANCY_COLORS } from '../../utils/occupancy'

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ?? ''

// Based on Google's official Night Mode — proven to show labels correctly
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',            stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#746855' }] },

  { featureType: 'administrative.locality', elementType: 'labels.text.fill',   stylers: [{ color: '#d59563' }] },

  { featureType: 'landscape',            elementType: 'geometry',               stylers: [{ color: '#1e2d3a' }] },
  { featureType: 'landscape.man_made',   elementType: 'geometry',               stylers: [{ color: '#566b84' }] },
  { featureType: 'landscape.man_made',   elementType: 'geometry.stroke',        stylers: [{ color: '#6e8aaa' }] },
  { featureType: 'landscape.natural',    elementType: 'geometry',               stylers: [{ color: '#1a3228' }] },

  { featureType: 'poi',                  elementType: 'geometry',               stylers: [{ color: '#3a4a5e' }] },
  { featureType: 'poi',                  elementType: 'labels.text.fill',       stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park',             elementType: 'geometry',               stylers: [{ color: '#1e4030' }] },
  { featureType: 'poi.park',             elementType: 'labels.text.fill',       stylers: [{ color: '#6b9a76' }] },

  { featureType: 'road',                 elementType: 'geometry',               stylers: [{ color: '#38414e' }] },
  { featureType: 'road',                 elementType: 'geometry.stroke',        stylers: [{ color: '#212a37' }] },
  { featureType: 'road',                 elementType: 'labels.text.fill',       stylers: [{ color: '#9ca5b3' }] },

  { featureType: 'road.highway',         elementType: 'geometry',               stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway',         elementType: 'geometry.stroke',        stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway',         elementType: 'labels.text.fill',       stylers: [{ color: '#f3d19c' }] },

  { featureType: 'transit',              elementType: 'geometry',               stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station',      elementType: 'labels.text.fill',       stylers: [{ color: '#d59563' }] },

  { featureType: 'water',                elementType: 'geometry',               stylers: [{ color: '#17263c' }] },
  { featureType: 'water',                elementType: 'labels.text.fill',       stylers: [{ color: '#515c6d' }] },
  { featureType: 'water',                elementType: 'labels.text.stroke',     stylers: [{ color: '#17263c' }] },
]

// ── Bus SVG icon (top-down view, rotates with heading) ────────────────────────

function makeBusIcon(heading: number, selected: boolean, color: string): string {
  const size = selected ? 56 : 48
  const cx = size / 2
  const cy = size / 2
  const bw = 20, bh = 30
  const bx = cx - bw / 2
  const by = cy - bh / 2

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${Math.round(heading % 360)}, ${cx}, ${cy})">
      ${selected ? `<ellipse cx="${cx}" cy="${cy}" rx="${cx - 2}" ry="${cy - 2}" fill="${color}" fill-opacity="0.18"/>` : ''}
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="5" fill="${color}" fill-opacity="0.93"/>
      <rect x="${bx + 1}" y="${by}" width="${bw - 2}" height="5" rx="3" fill="white" fill-opacity="0.25"/>
      <rect x="${bx + 2}" y="${by + 4}" width="${bw - 4}" height="8" rx="2" fill="white" fill-opacity="0.6"/>
      <rect x="${bx + 2}" y="${by + 15}" width="${bw - 4}" height="6" rx="1.5" fill="white" fill-opacity="0.42"/>
      <rect x="${bx + 2}" y="${by + 23}" width="${bw - 4}" height="5" rx="1" fill="white" fill-opacity="0.28"/>
      <polygon points="${cx},${by - 4} ${cx - 5},${by + 2} ${cx + 5},${by + 2}" fill="white" fill-opacity="0.88"/>
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="5" fill="none" stroke="white" stroke-width="0.6" stroke-opacity="0.25"/>
    </g>
  </svg>`
}

// ── Animation hook ────────────────────────────────────────────────────────────

const TRIP_MS = 150_000 // 2.5 minutes per direction

// Precompute cumulative time weights so that straight segments are slower.
// straightness ∈ [0,1]: 1 = perfectly straight, 0 = sharp turn.
// straight segments get a higher time cost → bus spends more time there → slower.
function buildCumulativeWeights(pts: ReadonlyArray<{ lat: number; lng: number }>): number[] {
  const weights: number[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1]
    const dLat = p1.lat - p0.lat
    const dLng = (p1.lng - p0.lng) * Math.cos(p0.lat * Math.PI / 180)
    const segLen = Math.sqrt(dLat * dLat + dLng * dLng) || 1e-9

    // Compare direction with next segment to measure straightness
    let straightness = 0
    if (i < pts.length - 2) {
      const p2 = pts[i + 2]
      const ax = p1.lng - p0.lng, ay = p1.lat - p0.lat
      const bx = p2.lng - p1.lng, by = p2.lat - p1.lat
      const magA = Math.sqrt(ax * ax + ay * ay)
      const magB = Math.sqrt(bx * bx + by * by)
      if (magA > 0 && magB > 0) {
        const cos = (ax * bx + ay * by) / (magA * magB)
        straightness = Math.max(0, Math.min(1, cos)) // clamp [0,1]
      }
    }

    // straight segments: up to 2× more time (slower); turns: 1× (normal)
    const timeCost = segLen * (1 + straightness * 1.2)
    weights.push(timeCost)
  }

  const total = weights.reduce((s, w) => s + w, 0)
  let running = 0
  return weights.map((w) => { running += w / total; return running })
}

const CUM_WEIGHTS = buildCumulativeWeights(ROUTE_POINTS)

function useBusAnimation() {
  const [state, setState] = useState({ pos: ROUTE_POINTS[0], heading: 0 })
  const rafRef   = useRef<number>()
  const startRef = useRef<number>(0)

  useEffect(() => {
    const n = ROUTE_POINTS.length

    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts
      const elapsed = ts - startRef.current

      const cycle   = Math.floor(elapsed / TRIP_MS)
      const phase   = (elapsed % TRIP_MS) / TRIP_MS
      const forward = cycle % 2 === 0
      const t       = forward ? phase : 1 - phase

      // Binary search: find which segment [idx, idx+1] contains time t
      let lo = 0, hi = CUM_WEIGHTS.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (CUM_WEIGHTS[mid] < t) lo = mid + 1
        else hi = mid
      }
      const idx = Math.min(lo, n - 2)
      const segStart = idx > 0 ? CUM_WEIGHTS[idx - 1] : 0
      const segEnd   = CUM_WEIGHTS[idx]
      const frac     = segEnd > segStart ? (t - segStart) / (segEnd - segStart) : 0

      const p1 = ROUTE_POINTS[idx]
      const p2 = ROUTE_POINTS[idx + 1]

      const lat = p1.lat + (p2.lat - p1.lat) * frac
      const lng = p1.lng + (p2.lng - p1.lng) * frac

      // Bearing: atan2(dLng, dLat) → 0° = north, 90° = east (matches SVG rotate)
      let heading = Math.atan2(p2.lng - p1.lng, p2.lat - p1.lat) * (180 / Math.PI)
      if (!forward) heading += 180

      setState({ pos: { lat, lng }, heading })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  return state
}

// ── Fallback states ────────────────────────────────────────────────────────────

function MapShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full bg-foreground flex flex-col items-center justify-center gap-4 text-white/40">
      {children}
    </div>
  )
}

function MapLoading() {
  return (
    <MapShell>
      <Loader2 size={28} className="animate-spin text-accent" />
      <p className="text-sm font-mono">Загрузка карты…</p>
    </MapShell>
  )
}

function MapPlaceholder({ message }: { message: string }) {
  return (
    <MapShell>
      <div className="w-12 h-12 rounded-xl border border-white/10 flex items-center justify-center">
        {message.startsWith('Ошибка') ? (
          <AlertCircle size={22} className="text-red-400" />
        ) : (
          <MapPin size={22} className="text-accent" />
        )}
      </div>
      <p className="text-sm font-mono text-center max-w-xs leading-relaxed">{message}</p>
      {!message.startsWith('Ошибка') && (
        <p className="text-xs font-mono text-white/25">
          Создайте .env и добавьте VITE_GOOGLE_MAPS_API_KEY
        </p>
      )}
    </MapShell>
  )
}

// ── Inner map (rendered only after API loads) ─────────────────────────────────

interface InnerProps {
  buses: BusOccupancy[]
  onBusSelect: (bus: BusOccupancy) => void
  selectedBusId: string
  selectedCity: City
}

function BusMapLoaded({ buses, onBusSelect, selectedBusId, selectedCity }: InnerProps) {
  const mapRef = useRef<google.maps.Map | null>(null)
  const initialCenter = useRef({ lat: selectedCity.lat, lng: selectedCity.lng })

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.panTo({ lat: selectedCity.lat, lng: selectedCity.lng })
    mapRef.current.setZoom(selectedCity.zoom)
  }, [selectedCity])

  // Animated bus position + heading
  const { pos: busPos, heading: busHeading } = useBusAnimation()

  // Polyline uses the same ROUTE_POINTS so the bus follows the visible path
  const routePath = useMemo(() => ROUTE_POINTS.map((p) => ({ lat: p.lat, lng: p.lng })), [])

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      styles: DARK_STYLE,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      gestureHandling: 'greedy',
      minZoom: 4,
      maxZoom: 18,
    }),
    [],
  )

  return (
    <GoogleMap
      mapContainerClassName="w-full h-full"
      center={initialCenter.current}
      zoom={selectedCity.zoom}
      options={mapOptions}
      onLoad={onLoad}
    >
      {/* Route polyline */}
      <Polyline
        path={routePath}
        options={{
          strokeColor: '#0052FF',
          strokeOpacity: 0.5,
          strokeWeight: 4,
        }}
      />

      {/* Animated bus markers */}
      {buses.map((bus) => {
        const selected = bus.busId === selectedBusId
        const size = selected ? 56 : 48
        const color = OCCUPANCY_COLORS[getOccupancyLevel(bus.percentage)]
        return (
          <Marker
            key={bus.busId}
            position={busPos}
            onClick={() => onBusSelect(bus)}
            icon={{
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
                makeBusIcon(busHeading, selected, color),
              )}`,
              scaledSize: new google.maps.Size(size, size),
              anchor: new google.maps.Point(size / 2, size / 2),
            }}
          />
        )
      })}
    </GoogleMap>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export interface BusMapProps {
  buses: BusOccupancy[]
  onBusSelect: (bus: BusOccupancy) => void
  selectedBusId: string
  selectedCity: City
}

export default function BusMap(props: BusMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: API_KEY,
  })

  if (!API_KEY)  return <MapPlaceholder message="Google Maps API ключ не найден" />
  if (loadError) return <MapPlaceholder message="Ошибка загрузки Google Maps" />
  if (!isLoaded) return <MapLoading />

  return <BusMapLoaded {...props} />
}
