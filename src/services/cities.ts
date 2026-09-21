export interface City {
  name: string
  lat: number
  lng: number
  zoom: number
}

export const KZ_CITIES: City[] = [
  { name: 'Алматы',     lat: 43.2220, lng: 76.8512, zoom: 16 },
  { name: 'Астана',     lat: 51.1801, lng: 71.4460, zoom: 16 },
  { name: 'Шымкент',    lat: 42.3000, lng: 69.5900, zoom: 16 },
  { name: 'Қарағанды',  lat: 49.8028, lng: 73.1058, zoom: 15 },
  { name: 'Актобе',     lat: 50.2839, lng: 57.1670, zoom: 15 },
  { name: 'Тараз',      lat: 42.9000, lng: 71.3667, zoom: 15 },
  { name: 'Павлодар',   lat: 52.2873, lng: 76.9674, zoom: 15 },
  { name: 'Өскемен',    lat: 49.9654, lng: 82.6059, zoom: 15 },
  { name: 'Семей',      lat: 50.4111, lng: 80.2275, zoom: 15 },
  { name: 'Атырау',     lat: 47.1167, lng: 51.8833, zoom: 15 },
  { name: 'Қостанай',   lat: 53.2141, lng: 63.6240, zoom: 15 },
  { name: 'Петропавл',  lat: 54.8694, lng: 69.1531, zoom: 15 },
  { name: 'Орал',       lat: 51.2333, lng: 51.3833, zoom: 15 },
  { name: 'Қызылорда',  lat: 44.8479, lng: 65.5092, zoom: 15 },
  { name: 'Ақтау',      lat: 43.6500, lng: 51.2000, zoom: 15 },
]

export const DEFAULT_CITY = KZ_CITIES.find(c => c.name === 'Қызылорда') ?? KZ_CITIES[0]
