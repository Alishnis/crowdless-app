import type { Stop } from '../types/bus.types'
import {
  ROUTE_1_PATH,
  ROUTE_2_PATH,
  ROUTE_3_PATH,
  ROUTE_4_PATH,
  ROUTE_5_PATH,
  ROUTE_6_PATH,
} from './osrmPaths'

export interface KyzRoute {
  id: string
  number: string
  name: string
  color: string
  capacity: number
  stops: Stop[]
  path: { lat: number; lng: number }[]
  busCount: number
  intervalMin: number
}

// ── Route 1 — "1" — Ж/Д Вокзал ↔ Мкр. Нурсая (blue, N-S backbone) ───────
const R1_STOPS: Stop[] = [
  { id: 'r1-s1', name: 'Ж/Д Вокзал',           lat: 44.8632, lng: 65.5128 },
  { id: 'r1-s2', name: 'ул. Тәуелсіздік',       lat: 44.8562, lng: 65.5118 },
  { id: 'r1-s3', name: 'Центральная площадь',   lat: 44.8495, lng: 65.5108 },
  { id: 'r1-s4', name: 'Центральный базар',     lat: 44.8435, lng: 65.5122 },
  { id: 'r1-s5', name: 'Мкр. 1',               lat: 44.8368, lng: 65.5110 },
  { id: 'r1-s6', name: 'Мкр. Достык',          lat: 44.8295, lng: 65.5098 },
  { id: 'r1-s7', name: 'Мкр. Нурсая',          lat: 44.8222, lng: 65.5085 },
]

// ── Route 2 — "2" — Аэропорт ↔ Мкр. Нурлы (green, NW-SE diagonal) ───────
const R2_STOPS: Stop[] = [
  { id: 'r2-s1', name: 'Аэропорт',             lat: 44.8628, lng: 65.4822 },
  { id: 'r2-s2', name: 'КазГУ',                lat: 44.8558, lng: 65.4908 },
  { id: 'r2-s3', name: 'Автовокзал',           lat: 44.8508, lng: 65.4985 },
  { id: 'r2-s4', name: 'Центр',                lat: 44.8478, lng: 65.5098 },
  { id: 'r2-s5', name: 'ГКБ №1',               lat: 44.8415, lng: 65.5215 },
  { id: 'r2-s6', name: 'Мкр. Нурлы',          lat: 44.8348, lng: 65.5308 },
  { id: 'r2-s7', name: 'Мкр. Достык (ТРЦ)',   lat: 44.8278, lng: 65.5402 },
]

// ── Route 3 — "5" — Северный рынок ↔ Мкр. 8 (orange, NE-SW) ─────────────
const R3_STOPS: Stop[] = [
  { id: 'r3-s1', name: 'Северный рынок',       lat: 44.8625, lng: 65.5318 },
  { id: 'r3-s2', name: 'Мкр. 7',              lat: 44.8555, lng: 65.5232 },
  { id: 'r3-s3', name: 'ул. Жибек Жолы',      lat: 44.8508, lng: 65.5162 },
  { id: 'r3-s4', name: 'Центр',               lat: 44.8478, lng: 65.5098 },
  { id: 'r3-s5', name: 'Парк им. Абая',       lat: 44.8398, lng: 65.4990 },
  { id: 'r3-s6', name: 'Мкр. Жайлы',         lat: 44.8322, lng: 65.4888 },
  { id: 'r3-s7', name: 'Мкр. 8',             lat: 44.8235, lng: 65.4795 },
]

// ── Route 4 — "7" — Тасбугет ↔ КазМунайГаз (red, E-W) ───────────────────
const R4_STOPS: Stop[] = [
  { id: 'r4-s1', name: 'Тасбугет',             lat: 44.8518, lng: 65.5485 },
  { id: 'r4-s2', name: 'Промзона',             lat: 44.8508, lng: 65.5355 },
  { id: 'r4-s3', name: 'Обл. больница',        lat: 44.8492, lng: 65.5218 },
  { id: 'r4-s4', name: 'Центр',                lat: 44.8478, lng: 65.5098 },
  { id: 'r4-s5', name: 'Автовокзал',           lat: 44.8495, lng: 65.4985 },
  { id: 'r4-s6', name: 'Аэропорт (ост.)',      lat: 44.8508, lng: 65.4868 },
  { id: 'r4-s7', name: 'КазМунайГаз',          lat: 44.8522, lng: 65.4758 },
]

// ── Route 5 — "12" — Кольцевой центр (purple) ────────────────────────────
const R5_STOPS: Stop[] = [
  { id: 'r5-s1', name: 'Центр (нач.)',          lat: 44.8478, lng: 65.5098 },
  { id: 'r5-s2', name: 'Северный рынок',        lat: 44.8552, lng: 65.5155 },
  { id: 'r5-s3', name: 'Мкр. 5',               lat: 44.8608, lng: 65.5228 },
  { id: 'r5-s4', name: 'Б-ца им. Ленина',      lat: 44.8582, lng: 65.5325 },
  { id: 'r5-s5', name: 'ТРЦ Асем',             lat: 44.8502, lng: 65.5378 },
  { id: 'r5-s6', name: 'Парк Победы',          lat: 44.8398, lng: 65.5288 },
  { id: 'r5-s7', name: 'Мкр. 2',              lat: 44.8352, lng: 65.5142 },
  { id: 'r5-s8', name: 'Рынок Жаңа',          lat: 44.8385, lng: 65.5012 },
  { id: 'r5-s9', name: 'Центр (кон.)',          lat: 44.8478, lng: 65.5098 },
]

// ── Route 6 — "15" — Вокзал ↔ Жаксыкент (yellow, long S route) ──────────
const R6_STOPS: Stop[] = [
  { id: 'r6-s1', name: 'Ж/Д Вокзал',          lat: 44.8632, lng: 65.5128 },
  { id: 'r6-s2', name: 'Центр',               lat: 44.8478, lng: 65.5098 },
  { id: 'r6-s3', name: 'Мкр. 4',             lat: 44.8348, lng: 65.5045 },
  { id: 'r6-s4', name: 'Пос. Маяк',          lat: 44.8215, lng: 65.4982 },
  { id: 'r6-s5', name: 'Жаксыкент',          lat: 44.8078, lng: 65.4905 },
]

export const KYZ_ROUTES: KyzRoute[] = [
  {
    id: 'route-1', number: '1', name: 'Ж/Д Вокзал — Мкр. Нурсая',
    color: '#3b82f6', capacity: 65,
    stops: R1_STOPS, path: ROUTE_1_PATH,
    busCount: 3, intervalMin: 8,
  },
  {
    id: 'route-2', number: '2', name: 'Аэропорт — Мкр. Нурлы',
    color: '#22c55e', capacity: 55,
    stops: R2_STOPS, path: ROUTE_2_PATH,
    busCount: 2, intervalMin: 12,
  },
  {
    id: 'route-3', number: '5', name: 'Сев. рынок — Мкр. 8',
    color: '#f97316', capacity: 60,
    stops: R3_STOPS, path: ROUTE_3_PATH,
    busCount: 2, intervalMin: 10,
  },
  {
    id: 'route-4', number: '7', name: 'Тасбугет — КазМунайГаз',
    color: '#ef4444', capacity: 70,
    stops: R4_STOPS, path: ROUTE_4_PATH,
    busCount: 2, intervalMin: 15,
  },
  {
    id: 'route-5', number: '12', name: 'Кольцевой центр',
    color: '#a855f7', capacity: 55,
    stops: R5_STOPS, path: ROUTE_5_PATH,
    busCount: 3, intervalMin: 7,
  },
  {
    id: 'route-6', number: '15', name: 'Вокзал — Жаксыкент',
    color: '#eab308', capacity: 50,
    stops: R6_STOPS, path: ROUTE_6_PATH,
    busCount: 2, intervalMin: 20,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Haversine distance in metres between two lat/lng points */
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** All unique stops across every route with the route numbers that serve them */
export function getAllStops(): Array<{ stop: Stop; routeNumbers: string[] }> {
  const map = new Map<string, { stop: Stop; routeNumbers: string[] }>()
  for (const route of KYZ_ROUTES) {
    for (const stop of route.stops) {
      const key = stop.name
      if (!map.has(key)) map.set(key, { stop, routeNumbers: [] })
      const entry = map.get(key)!
      if (!entry.routeNumbers.includes(route.number)) {
        entry.routeNumbers.push(route.number)
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.stop.name.localeCompare(b.stop.name, 'ru'),
  )
}

export interface RouteMatch {
  route: KyzRoute
  fromIdx: number
  toIdx: number
  isForward: boolean
  stopsOnRoute: Stop[]
  etaMin: number
  type: 'direct'
}

export interface WalkTransferMatch {
  walkFrom: Stop          // user's fromStop  (start walking)
  walkTo: Stop            // nearby stop       (board bus here)
  walkDistM: number       // metres to walk
  walkMinutes: number
  boardRoute: KyzRoute
  boardFromIdx: number
  boardToIdx: number
  isForward: boolean
  stopsOnRoute: Stop[]
  busEtaMin: number
  totalEtaMin: number
  type: 'walk+bus'
}

export type AnyMatch = RouteMatch | WalkTransferMatch

/** Find all direct routes connecting fromStop → toStop */
export function findDirectRoutes(fromName: string, toName: string): RouteMatch[] {
  const matches: RouteMatch[] = []
  for (const route of KYZ_ROUTES) {
    const fromIdx = route.stops.findIndex(s => s.name === fromName)
    const toIdx   = route.stops.findIndex(s => s.name === toName)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) continue

    const isForward    = fromIdx < toIdx
    const stopsOnRoute = isForward
      ? route.stops.slice(fromIdx, toIdx + 1)
      : [...route.stops.slice(toIdx, fromIdx + 1)].reverse()

    matches.push({
      route, fromIdx, toIdx, isForward,
      stopsOnRoute,
      etaMin: stopsOnRoute.length * 2.5 + 1,
      type: 'direct',
    })
  }
  return matches
}

const WALK_SPEED_MPS = 1.2  // 4.3 km/h
const MAX_WALK_M     = 1200 // don't suggest walks longer than 1.2 km

/**
 * When no direct route exists, find routes reachable by walking from fromStop
 * to a nearby stop, then riding to toStop.
 */
export function findWalkTransfers(
  fromStop: Stop,
  toStop: Stop,
): WalkTransferMatch[] {
  const results: WalkTransferMatch[] = []
  const allStopEntries = getAllStops()

  for (const { stop: nearbyStop } of allStopEntries) {
    if (nearbyStop.name === fromStop.name) continue
    const walkDist = haversineM(fromStop, nearbyStop)
    if (walkDist > MAX_WALK_M) continue

    // Can we ride from nearbyStop to toStop?
    const directFromNearby = findDirectRoutes(nearbyStop.name, toStop.name)
    for (const direct of directFromNearby) {
      const walkMinutes = Math.ceil((walkDist / WALK_SPEED_MPS) / 60)
      const totalEta    = walkMinutes + direct.etaMin + 2 // +2 min wait
      results.push({
        walkFrom:     fromStop,
        walkTo:       nearbyStop,
        walkDistM:    Math.round(walkDist),
        walkMinutes,
        boardRoute:   direct.route,
        boardFromIdx: direct.fromIdx,
        boardToIdx:   direct.toIdx,
        isForward:    direct.isForward,
        stopsOnRoute: direct.stopsOnRoute,
        busEtaMin:    direct.etaMin,
        totalEtaMin:  totalEta,
        type: 'walk+bus',
      })
    }
  }

  // Deduplicate: keep best (shortest total) per route
  const best = new Map<string, WalkTransferMatch>()
  for (const m of results) {
    const key = m.boardRoute.id
    if (!best.has(key) || m.totalEtaMin < best.get(key)!.totalEtaMin) {
      best.set(key, m)
    }
  }

  return Array.from(best.values())
    .sort((a, b) => a.totalEtaMin - b.totalEtaMin)
    .slice(0, 3)
}

/** Main entry: direct routes first, walking transfers if no directs */
export function findRoutes(fromStop: Stop, toStop: Stop): AnyMatch[] {
  const direct = findDirectRoutes(fromStop.name, toStop.name)
  if (direct.length > 0) return direct
  return findWalkTransfers(fromStop, toStop)
}

// legacy alias kept so other imports don't break
export type { Stop }
