import { useState, useEffect, useRef, useCallback } from 'react'
import { BACKEND } from '../services/counters'
import { KYZ_ROUTES } from '../services/kyzylordaRoutes'
import type { YoloState } from './useYoloAnalysis'

/** Number of distinct door cameras the backend serves (see backend/bus_cams.py). */
export const CAMERA_SLOTS = 6

const POLL_MS = 450

const BUS_IDS = KYZ_ROUTES.flatMap(r =>
  Array.from({ length: r.busCount }, (_, i) => `${r.id}-bus-${i}`))

/** Each bus gets a stable camera; neighbouring buses get different footage. */
export function slotForBus(busId: string): number {
  const i = BUS_IDS.indexOf(busId)
  return (i < 0 ? 0 : i) % CAMERA_SLOTS
}

export interface BusCamState extends YoloState {
  /** What the footage on this camera is showing right now. */
  activity: 'boarding' | 'alighting' | null
  /** Clip the footage comes from, e.g. "B_No_d800mm_R5". */
  source: string
}

const INITIAL: BusCamState = {
  count: 0, capacity: 50, percentage: 0, status: 'low', imageB64: '',
  inCount: 0, outCount: 0, loading: true, connected: false,
  activity: null, source: '',
}

/**
 * Polls one bus's door camera. Pass `slot = null` (or `enabled = false`) to stay
 * idle — the backend only runs inference for cameras someone is watching.
 */
export function useBusCamera(slot: number | null, enabled = true): BusCamState {
  const [state, setState] = useState<BusCamState>(INITIAL)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const active = enabled && slot !== null

  const poll = useCallback(async (s: number, alive: () => boolean) => {
    try {
      const res = await fetch(`${BACKEND}/bus-cam/${s}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      // No footage on this deployment — {"error": "..."}, no count fields.
      if (d.error) throw new Error(d.error)
      if (!alive()) return
      setState({
        count: d.count, capacity: d.capacity, percentage: d.percentage, status: d.status,
        imageB64: d.image_b64, inCount: d.in_count, outCount: d.out_count,
        loading: false, connected: true, activity: d.activity, source: d.source,
      })
    } catch {
      if (!alive()) return
      setState(p => ({ ...p, loading: false, connected: false }))
    }
  }, [])

  useEffect(() => {
    if (!active) {
      setState(p => (p.connected || !p.loading ? INITIAL : p))
      return
    }
    let alive = true
    setState(INITIAL)
    // Chained timeouts rather than setInterval: the next request waits for the
    // previous one, so a slow inference never piles up a queue of requests.
    const loop = async () => {
      await poll(slot as number, () => alive)
      if (alive) timer.current = setTimeout(loop, POLL_MS)
    }
    loop()
    return () => { alive = false; clearTimeout(timer.current) }
  }, [active, slot, poll])

  return state
}
