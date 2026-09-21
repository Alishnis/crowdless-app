import { useEffect, useMemo, useRef, useState } from 'react'
import { KYZ_ROUTES } from '../services/kyzylordaRoutes'
import type { SimulatedBus } from '../types/bus.types'

const TRIP_MS = 140_000 // 2.33 min per direction

// Precompute cumulative arc-lengths (normalised 0→1) for a path
function buildCumLengths(path: { lat: number; lng: number }[]): number[] {
  const lengths: number[] = [0]
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const dLat = b.lat - a.lat
    const dLng = (b.lng - a.lng) * Math.cos(a.lat * (Math.PI / 180))
    total += Math.sqrt(dLat * dLat + dLng * dLng)
    lengths.push(total)
  }
  const inv = total > 0 ? 1 / total : 1
  return lengths.map(l => l * inv)
}

// Return position + heading on path at normalised distance t ∈ [0,1]
function getPosOnPath(
  path: { lat: number; lng: number }[],
  cum: number[],
  t: number,
): { pos: { lat: number; lng: number }; heading: number } {
  const n = path.length
  if (n === 0) return { pos: { lat: 0, lng: 0 }, heading: 0 }
  if (n === 1) return { pos: path[0], heading: 0 }

  const clamped = Math.max(0, Math.min(1, t))

  // Binary search for the segment containing t
  let lo = 0
  let hi = n - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cum[mid] <= clamped) lo = mid
    else hi = mid - 1
  }

  const segStart = cum[lo]
  const segEnd   = cum[lo + 1] ?? 1
  const frac     = segEnd > segStart ? (clamped - segStart) / (segEnd - segStart) : 0

  const p1 = path[lo]
  const p2 = path[lo + 1] ?? p1
  const lat = p1.lat + (p2.lat - p1.lat) * frac
  const lng = p1.lng + (p2.lng - p1.lng) * frac
  const heading = Math.atan2(p2.lng - p1.lng, p2.lat - p1.lat) * (180 / Math.PI)

  return { pos: { lat, lng }, heading }
}

// Rush-hour occupancy bonus based on current clock time
function getRushBonus(): number {
  const h = new Date().getHours() + new Date().getMinutes() / 60
  if (h >= 7.5  && h <= 9.5)  return  0.42
  if (h >= 12.0 && h <= 13.5) return  0.22
  if (h >= 17.0 && h <= 19.5) return  0.38
  if (h < 6 || h > 22)        return -0.22
  return 0
}

interface BusCfg {
  busId: string
  routeIdx: number
  phaseOffset: number   // fraction [0,1] to stagger buses on the same route
  occupancyBase: number // base fill fraction [0,1]
  noiseSeed: number
}

export function useBusSimulation(): SimulatedBus[] {
  // Build config list once
  const configs = useMemo<BusCfg[]>(() => {
    const list: BusCfg[] = []
    let seed = 0
    KYZ_ROUTES.forEach((route, rIdx) => {
      for (let i = 0; i < route.busCount; i++) {
        list.push({
          busId:        `${route.id}-bus-${i}`,
          routeIdx:     rIdx,
          phaseOffset:  i / route.busCount,
          occupancyBase: 0.28 + (seed % 5) * 0.07,
          noiseSeed:    seed * 137.508,
        })
        seed++
      }
    })
    return list
  }, [])

  // Precompute cumulative lengths per route
  const cumByRoute = useMemo(
    () => KYZ_ROUTES.map(r => buildCumLengths(r.path)),
    [],
  )

  const [buses, setBuses] = useState<SimulatedBus[]>(() =>
    configs.map(cfg => {
      const route = KYZ_ROUTES[cfg.routeIdx]
      const pct   = Math.round(cfg.occupancyBase * 100)
      const count = Math.round((pct / 100) * route.capacity)
      return {
        busId:       cfg.busId,
        routeId:     route.id,
        routeNumber: route.number,
        routeName:   route.name,
        color:       route.color,
        pos:         route.path[0] ?? { lat: 44.848, lng: 65.509 },
        heading:     0,
        count,
        capacity:    route.capacity,
        percentage:  pct,
        nextStop:    route.stops[1]?.name ?? '',
        inCount:     count,
        outCount:    0,
      }
    }),
  )

  // Refs to avoid stale closures in rAF
  const configsRef    = useRef(configs)
  const cumRef        = useRef(cumByRoute)
  const startTimeRef  = useRef<number | null>(null)

  useEffect(() => {
    let rafId: number
    let lastUpdate = 0

    const tick = (ts: number) => {
      if (startTimeRef.current === null) startTimeRef.current = ts
      const elapsed = ts - startTimeRef.current

      // Throttle React state updates to ~20 fps
      if (ts - lastUpdate >= 50) {
        lastUpdate = ts
        const rushBonus = getRushBonus()

        setBuses(
          configsRef.current.map(cfg => {
            const route = KYZ_ROUTES[cfg.routeIdx]
            const cum   = cumRef.current[cfg.routeIdx]
            const path  = route.path

            // Each bus has a staggered starting phase
            const adjusted = elapsed + cfg.phaseOffset * TRIP_MS
            const cycle   = Math.floor(adjusted / TRIP_MS)
            const phase   = (adjusted % TRIP_MS) / TRIP_MS
            const forward = cycle % 2 === 0
            const t       = forward ? phase : 1 - phase

            const { pos, heading: rawH } = getPosOnPath(path, cum, t)
            const heading = forward ? rawH : rawH + 180

            // Next stop
            const stopFrac  = t * (route.stops.length - 1)
            const nextIdx   = forward
              ? Math.min(Math.ceil(stopFrac), route.stops.length - 1)
              : Math.max(Math.floor((1 - t) * (route.stops.length - 1)), 0)
            const nextStop  = route.stops[nextIdx]?.name ?? ''

            // Smooth occupancy with sine noise
            const noise = Math.sin(elapsed / 28_000 + cfg.noiseSeed) * 0.09
            const pct   = Math.max(5, Math.min(98,
              Math.round((cfg.occupancyBase + rushBonus + noise) * 100),
            ))
            const count = Math.round((pct / 100) * route.capacity)

            // Simulated cumulative boarding / alighting for this trip direction
            const totalStops   = Math.max(2, route.stops.length)
            const stopsPassed  = Math.floor(t * (totalStops - 1))
            const boardPerStop = Math.max(1, Math.round(route.capacity * 0.09))
            const inCount      = Math.max(count, stopsPassed * boardPerStop)
            const outCount     = Math.max(0, inCount - count)

            return {
              busId:       cfg.busId,
              routeId:     route.id,
              routeNumber: route.number,
              routeName:   route.name,
              color:       route.color,
              pos,
              heading,
              count,
              capacity:    route.capacity,
              percentage:  pct,
              nextStop,
              inCount,
              outCount,
            }
          }),
        )
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, []) // runs once

  return buses
}
