import { useJsApiLoader, GoogleMap, Marker, Polyline } from '@react-google-maps/api'
import { useMemo, useRef, useCallback, useEffect } from 'react'
import { MapPin, AlertCircle, Loader2 } from 'lucide-react'
import type { BusOccupancy } from '../../types/bus.types'
import type { City } from '../../services/cities'
import { MOCK_ROUTE_POINTS } from '../../services/mockData'
import { getOccupancyLevel, OCCUPANCY_COLORS } from '../../utils/occupancy'

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ?? ''

// Based on Google's official Night Mode — proven to show labels correctly
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',            stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#746855' }] },

  { featureType: 'administrative.locality', elementType: 'labels.text.fill',   stylers: [{ color: '#d59563' }] },

  { featureType: 'landscape',            elementType: 'geometry',                stylers: [{ color: '#1e2d3a' }] },
  { featureType: 'landscape.man_made',  elementType: 'geometry',                stylers: [{ color: '#566b84' }] },
  { featureType: 'landscape.man_made',  elementType: 'geometry.stroke',         stylers: [{ color: '#6e8aaa' }] },
  { featureType: 'landscape.natural',   elementType: 'geometry',                stylers: [{ color: '#1a3228' }] },

  { featureType: 'poi',                 elementType: 'geometry',                stylers: [{ color: '#3a4a5e' }] },
  { featureType: 'poi',                 elementType: 'labels.text.fill',        stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park',            elementType: 'geometry',                stylers: [{ color: '#1e4030' }] },
  { featureType: 'poi.park',            elementType: 'labels.text.fill',        stylers: [{ color: '#6b9a76' }] },

  { featureType: 'road',                elementType: 'geometry',                stylers: [{ color: '#38414e' }] },
  { featureType: 'road',                elementType: 'geometry.stroke',         stylers: [{ color: '#212a37' }] },
  { featureType: 'road',                elementType: 'labels.text.fill',        stylers: [{ color: '#9ca5b3' }] },

  { featureType: 'road.highway',        elementType: 'geometry',                stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway',        elementType: 'geometry.stroke',         stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway',        elementType: 'labels.text.fill',        stylers: [{ color: '#f3d19c' }] },

  { featureType: 'transit',             elementType: 'geometry',                stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station',     elementType: 'labels.text.fill',        stylers: [{ color: '#d59563' }] },

  { featureType: 'water',               elementType: 'geometry',                stylers: [{ color: '#17263c' }] },
  { featureType: 'water',               elementType: 'labels.text.fill',        stylers: [{ color: '#515c6d' }] },
  { featureType: 'water',               elementType: 'labels.text.stroke',      stylers: [{ color: '#17263c' }] },
]

function makeSvgIcon(percentage: number, color: string, selected: boolean): string {
  const size = selected ? 52 : 44
  const cx = size / 2
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${selected ? `<circle cx="${cx}" cy="${cx}" r="${cx - 1}" fill="${color}" fill-opacity="0.2"/>` : ''}
    <circle cx="${cx}" cy="${cx}" r="${cx - 6}" fill="${color}" fill-opacity="0.88" stroke="white" stroke-width="2"/>
    <text x="${cx}" y="${cx + 4}" text-anchor="middle" font-size="11" font-family="monospace" fill="white" font-weight="700">${percentage}%</text>
  </svg>`
}

// ── Fallback states ────────────────────────────────────────────────────────

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

// ── Inner map (rendered only after API loads) ──────────────────────────────

interface InnerProps {
  buses: BusOccupancy[]
  onBusSelect: (bus: BusOccupancy) => void
  selectedBusId: string
  selectedCity: City
}

function BusMapLoaded({ buses, onBusSelect, selectedBusId, selectedCity }: InnerProps) {
  const mapRef = useRef<google.maps.Map | null>(null)

  // Save the initial center so GoogleMap doesn't re-center on every render
  const initialCenter = useRef({ lat: selectedCity.lat, lng: selectedCity.lng })

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  // Imperatively pan + zoom when the city changes
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.panTo({ lat: selectedCity.lat, lng: selectedCity.lng })
    mapRef.current.setZoom(selectedCity.zoom)
  }, [selectedCity])

  const routePath = useMemo(
    () => MOCK_ROUTE_POINTS.map((p) => ({ lat: p.coordinates[1], lng: p.coordinates[0] })),
    [],
  )

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
          strokeOpacity: 0.55,
          strokeWeight: 4,
        }}
      />

      {/* Bus markers */}
      {buses.map((bus) => {
        const color = OCCUPANCY_COLORS[getOccupancyLevel(bus.percentage)]
        const selected = bus.busId === selectedBusId
        const size = selected ? 52 : 44
        return (
          <Marker
            key={bus.busId}
            position={{ lat: bus.coordinates[1], lng: bus.coordinates[0] }}
            onClick={() => onBusSelect(bus)}
            icon={{
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
                makeSvgIcon(bus.percentage, color, selected),
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

// ── Public component ───────────────────────────────────────────────────────

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
