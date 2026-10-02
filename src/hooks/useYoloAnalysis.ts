import { useState, useEffect, useRef, useCallback } from 'react'
import { BACKEND } from '../services/counters'

export interface YoloFrame {
  count: number
  capacity: number
  percentage: number
  status: 'low' | 'medium' | 'high'
  imageB64: string
  inCount: number
  outCount: number
}

export interface YoloState extends YoloFrame {
  loading: boolean
  connected: boolean
}

const POLL_MS  = 3_000

const INITIAL: YoloState = {
  count: 0, capacity: 50, percentage: 0,
  status: 'low', imageB64: '',
  inCount: 0, outCount: 0,
  loading: true, connected: false,
}

export function useYoloAnalysis(): YoloState {
  const [state, setState] = useState<YoloState>(INITIAL)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/analyze?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setState({
        count:      d.count,
        capacity:   d.capacity,
        percentage: d.percentage,
        status:     d.status,
        imageB64:   d.image_b64,
        inCount:    d.in_count  ?? 0,
        outCount:   d.out_count ?? 0,
        loading:    false,
        connected:  true,
      })
    } catch {
      setState(p => ({ ...p, loading: false, connected: false }))
    }
  }, [])

  useEffect(() => {
    poll()
    timer.current = setInterval(poll, POLL_MS)
    return () => clearInterval(timer.current)
  }, [poll])

  return state
}
