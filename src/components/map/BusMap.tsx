import {
  useJsApiLoader,
  GoogleMap,
  Marker,
  Polyline,
  OverlayView,
} from '@react-google-maps/api'
import { useMemo, useRef, useCallback, useEffect } from 'react'
import { MapPin, AlertCircle, Loader2 } from 'lucide-react'
import type { SimulatedBus, Stop } from '../../types/bus.types'
import type { City } from '../../services/cities'
import { KYZ_ROUTES } from '../../services/kyzylordaRoutes'
import { getOccupancyLevel, OCCUPANCY_COLORS } from '../../utils/occupancy'
import { useT } from '../../i18n'

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ?? ''

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',           stylers: [{ color: '#1a2332' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2332' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#6b7a8f' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c9aa7a' }] },
  { featureType: 'landscape',          elementType: 'geometry',              stylers: [{ color: '#1e2d3a' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry',              stylers: [{ color: '#243444' }] },
  { featureType: 'landscape.natural',  elementType: 'geometry',              stylers: [{ color: '#162a20' }] },
  { featureType: 'poi',                elementType: 'geometry',              stylers: [{ color: '#283848' }] },
  { featureType: 'poi',                elementType: 'labels.text.fill',      stylers: [{ color: '#c9aa7a' }] },
  { featureType: 'poi.park',           elementType: 'geometry',              stylers: [{ color: '#162a20' }] },
  { featureType: 'poi.park',           elementType: 'labels.text.fill',      stylers: [{ color: '#4a7a56' }] },
  { featureType: 'road',               elementType: 'geometry',              stylers: [{ color: '#2d3c4e' }] },
  { featureType: 'road',               elementType: 'geometry.stroke',       stylers: [{ color: '#1a2838' }] },
  { featureType: 'road',               elementType: 'labels.text.fill',      stylers: [{ color: '#7a8a9a' }] },
  { featureType: 'road.highway',       elementType: 'geometry',              stylers: [{ color: '#3d5068' }] },
  { featureType: 'road.highway',       elementType: 'geometry.stroke',       stylers: [{ color: '#1a2838' }] },
  { featureType: 'road.highway',       elementType: 'labels.text.fill',      stylers: [{ color: '#e8c87a' }] },
  { featureType: 'transit',            elementType: 'geometry',              stylers: [{ color: '#243444' }] },
  { featureType: 'water',              elementType: 'geometry',              stylers: [{ color: '#0e1e2e' }] },
  { featureType: 'water',              elementType: 'labels.text.fill',      stylers: [{ color: '#3d5068' }] },
]

// ── Bus SVG icon ──────────────────────────────────────────────────────────────

function makeBusIcon(
  heading: number,
  routeColor: string,
  occColor: string,
  selected: boolean,
): string {
  const size = selected ? 52 : 42
  const cx = size / 2
  const cy = size / 2
  const bw = 16
  const bh = 24
  const bx = cx - bw / 2
  const by = cy - bh / 2

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${Math.round(heading % 360)}, ${cx}, ${cy})">
      ${selected ? `<ellipse cx="${cx}" cy="${cy}" rx="${cx - 2}" ry="${cy - 2}" fill="${routeColor}" fill-opacity="0.18"/>` : ''}
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="${occColor}" fill-opacity="0.9"/>
      <rect x="${bx + 1}" y="${by}" width="${bw - 2}" height="4" rx="2" fill="white" fill-opacity="0.3"/>
      <rect x="${bx + 2}" y="${by + 3}" width="${bw - 4}" height="6" rx="1.5" fill="white" fill-opacity="0.55"/>
      <rect x="${bx + 2}" y="${by + 12}" width="${bw - 4}" height="5" rx="1" fill="white" fill-opacity="0.35"/>
      <rect x="${bx + 2}" y="${by + 18}" width="${bw - 4}" height="4" rx="1" fill="white" fill-opacity="0.22"/>
      <polygon points="${cx},${by - 4} ${cx - 4},${by + 1} ${cx + 4},${by + 1}" fill="white" fill-opacity="0.9"/>
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="none" stroke="${routeColor}" stroke-width="1.5" stroke-opacity="0.7"/>
    </g>
  </svg>`
}

// ── Stop marker ───────────────────────────────────────────────────────────────

function makeStopIcon(color: string, size = 10): string {
  return `<svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size}" cy="${size}" r="${size - 2}" fill="${color}" fill-opacity="0.9" stroke="white" stroke-width="1.5"/>
  </svg>`
}

// ── Fallback states ───────────────────────────────────────────────────────────

function MapShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full bg-foreground flex flex-col items-center justify-center gap-4 text-white/40">
      {children}
    </div>
  )
}

function MapLoading() {
  const t = useT()

  return (
    <MapShell>
      <Loader2 size={28} className="animate-spin text-accent" />
      <p className="text-sm font-mono">{t('map.loading')}</p>
    </MapShell>
  )
}

/** `message` is a dictionary key, resolved here. */
function MapPlaceholder({ message }: { message: string }) {
  const t = useT()

  return (
    <MapShell>
      <div className="w-12 h-12 rounded-xl border border-white/10 flex items-center justify-center">
        {message === 'map.loadError' ? (
          <AlertCircle size={22} className="text-red-400" />
        ) : (
          <MapPin size={22} className="text-accent" />
        )}
      </div>
      <p className="text-sm font-mono text-center max-w-xs leading-relaxed">{t(message)}</p>
      {message !== 'map.loadError' && (
        <p className="text-xs font-mono text-white/25">
          {t('map.envHint')}
        </p>
      )}
    </MapShell>
  )
}

// ── Route number label overlay ────────────────────────────────────────────────

function RouteLabelOverlay({ route, dimmed }: { route: typeof KYZ_ROUTES[0]; dimmed: boolean }) {
  const midIdx  = Math.floor(route.path.length / 2)
  const midPos  = route.path[midIdx] ?? { lat: 44.848, lng: 65.509 }

  return (
    <OverlayView
      position={{ lat: midPos.lat, lng: midPos.lng }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        className="flex items-center justify-center font-bold text-xs rounded-md px-2 py-0.5 pointer-events-none select-none transition-opacity duration-300"
        style={{
          background: route.color + '22',
          color: route.color,
          border: `1px solid ${route.color}60`,
          opacity: dimmed ? 0.3 : 1,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {route.number}
      </div>
    </OverlayView>
  )
}

// ── Inner map ─────────────────────────────────────────────────────────────────

interface InnerProps {
  simBuses: SimulatedBus[]
  selectedBusId: string
  onBusSelect: (bus: SimulatedBus) => void
  onRouteClick: (routeId: string) => void
  selectedCity: City
  selectedRouteId: string | null
  fromStop: Stop | null
  toStop: Stop | null
}

function BusMapLoaded({
  simBuses,
  selectedBusId,
  onBusSelect,
  onRouteClick,
  selectedCity,
  selectedRouteId,
  fromStop,
  toStop,
}: InnerProps) {
  const t = useT()
  const mapRef = useRef<google.maps.Map | null>(null)
  const initialCenter = useRef({ lat: selectedCity.lat, lng: selectedCity.lng })

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  // Pan when city changes
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.panTo({ lat: selectedCity.lat, lng: selectedCity.lng })
    mapRef.current.setZoom(selectedCity.zoom)
  }, [selectedCity])

  // Fit bounds to selected route when route changes
  useEffect(() => {
    if (!mapRef.current || !selectedRouteId) return
    const route = KYZ_ROUTES.find(r => r.id === selectedRouteId)
    if (!route || route.path.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    route.path.forEach(p => bounds.extend(p))
    mapRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 })
  }, [selectedRouteId])

  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    styles: DARK_STYLE,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
    gestureHandling: 'greedy',
    minZoom: 4,
    maxZoom: 18,
  }), [])

  return (
    <GoogleMap
      mapContainerClassName="w-full h-full"
      center={initialCenter.current}
      zoom={selectedCity.zoom}
      options={mapOptions}
      onLoad={onLoad}
    >
      {/* Route polylines — clickable */}
      {KYZ_ROUTES.map(route => {
        const isSelected = selectedRouteId === route.id
        const dimmed     = selectedRouteId !== null && !isSelected
        return (
          <Polyline
            key={route.id}
            path={route.path}
            onClick={() => onRouteClick(route.id)}
            options={{
              strokeColor:   route.color,
              strokeOpacity: dimmed ? 0.12 : isSelected ? 0.95 : 0.55,
              strokeWeight:  isSelected ? 6 : 4,
              clickable:     true,
              // invisible wider hit-area for easier clicking
              zIndex: isSelected ? 10 : 1,
            }}
          />
        )
      })}

      {/* Hit-area overlay (wider transparent line for easier clicking) */}
      {KYZ_ROUTES.map(route => (
        <Polyline
          key={`hit-${route.id}`}
          path={route.path}
          onClick={() => onRouteClick(route.id)}
          options={{
            strokeColor:   route.color,
            strokeOpacity: 0,
            strokeWeight:  16,
            clickable:     true,
            zIndex:        5,
          }}
        />
      ))}

      {/* Route number labels */}
      {KYZ_ROUTES.map(route => (
        <RouteLabelOverlay
          key={`label-${route.id}`}
          route={route}
          dimmed={selectedRouteId !== null && selectedRouteId !== route.id}
        />
      ))}

      {/* Animated bus markers */}
      {simBuses.map(bus => {
        const selected   = bus.busId === selectedBusId
        const isOnRoute  = selectedRouteId === bus.routeId
        const dimmed     = selectedRouteId !== null && !isOnRoute
        const occColor   = OCCUPANCY_COLORS[getOccupancyLevel(bus.percentage)]
        const iconSize   = selected ? 52 : 42

        return (
          <Marker
            key={bus.busId}
            position={bus.pos}
            onClick={() => onBusSelect(bus)}
            opacity={dimmed ? 0.18 : 1}
            icon={{
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
                makeBusIcon(bus.heading, bus.color, occColor, selected),
              )}`,
              scaledSize: new google.maps.Size(iconSize, iconSize),
              anchor:     new google.maps.Point(iconSize / 2, iconSize / 2),
            }}
          />
        )
      })}

      {/* From stop marker */}
      {fromStop && (
        <Marker
          position={{ lat: fromStop.lat, lng: fromStop.lng }}
          icon={{
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makeStopIcon('#22c55e', 12))}`,
            scaledSize: new google.maps.Size(24, 24),
            anchor: new google.maps.Point(12, 12),
          }}
          title={t('map.from', { name: fromStop.name })}
        />
      )}

      {/* To stop marker */}
      {toStop && (
        <Marker
          position={{ lat: toStop.lat, lng: toStop.lng }}
          icon={{
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makeStopIcon('#ef4444', 12))}`,
            scaledSize: new google.maps.Size(24, 24),
            anchor: new google.maps.Point(12, 12),
          }}
          title={t('map.to', { name: toStop.name })}
        />
      )}

      {/* All stops for selected route */}
      {selectedRouteId &&
        KYZ_ROUTES.find(r => r.id === selectedRouteId)
          ?.stops
          .filter(s => s.name !== fromStop?.name && s.name !== toStop?.name)
          .map(stop => (
            <Marker
              key={stop.id}
              position={{ lat: stop.lat, lng: stop.lng }}
              icon={{
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makeStopIcon(
                  KYZ_ROUTES.find(r => r.id === selectedRouteId)?.color ?? '#888', 7,
                ))}`,
                scaledSize: new google.maps.Size(14, 14),
                anchor: new google.maps.Point(7, 7),
              }}
              title={stop.name}
            />
          ))}
    </GoogleMap>
  )
}

// ── Public export ─────────────────────────────────────────────────────────────

export interface BusMapProps {
  simBuses: SimulatedBus[]
  selectedBusId: string
  onBusSelect: (bus: SimulatedBus) => void
  onRouteClick: (routeId: string) => void
  selectedCity: City
  selectedRouteId: string | null
  fromStop: Stop | null
  toStop: Stop | null
}

export default function BusMap(props: BusMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: API_KEY,
  })

  if (!API_KEY)  return <MapPlaceholder message="map.noKey" />
  if (loadError) return <MapPlaceholder message="map.loadError" />
  if (!isLoaded) return <MapLoading />

  return <BusMapLoaded {...props} />
}
