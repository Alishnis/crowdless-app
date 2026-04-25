import { useState, useEffect, useRef, useCallback } from 'react'

export interface YoloFrame {
  count: number
  capacity: number
  percentage: number
  status: 'low' | 'medium' | 'high'
  imageB64: string
  filename: string
}

export interface YoloState extends YoloFrame {
  loading: boolean
  connected: boolean
}

const BACKEND = 'http://localhost:8000'
const POLL_MS  = 5_000

const INITIAL: YoloState = {
  count: 0, capacity: 50, percentage: 0,
  status: 'low', imageB64: '', filename: '',
  loading: true, connected: false,
}

export function useYoloAnalysis(): YoloState {
  const [state, setState] = useState<YoloState>(INITIAL)
  const timer = useRef<ReturnType<typeof setInterval>>()

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
        filename:   d.filename,
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
