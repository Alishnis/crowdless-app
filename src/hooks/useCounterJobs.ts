import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchJob } from '../services/counters'
import type { JobState } from '../services/counters'

const POLL_MS = 800

/** Polls a set of {method → jobId} until every job reaches a terminal state. */
export function useCounterJobs() {
  const [jobs,    setJobs]    = useState<Record<string, JobState>>({})
  const [running, setRunning] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  const ids   = useRef<Record<string, string>>({})

  const stop = useCallback(() => {
    clearInterval(timer.current)
    timer.current = undefined
    setRunning(false)
  }, [])

  const poll = useCallback(async () => {
    const entries = Object.entries(ids.current)
    if (!entries.length) return

    const results = await Promise.all(
      entries.map(async ([method, id]) => {
        try {
          return [method, await fetchJob(id)] as const
        } catch {
          return [method, null] as const
        }
      }),
    )

    // Decide this out here: React may defer the updater below, so a flag set
    // inside it would still read its initial value when we test it.
    const allDone = results.every(([, job]) =>
      job !== null && (job.status === 'done' || job.status === 'error'))

    setJobs(prev => {
      const next = { ...prev }
      for (const [method, job] of results) {
        if (!job) continue
        // A frame arrives only every ~15 frames; keep the last one on screen
        // between updates so the preview does not flicker to empty.
        next[method] = { ...job, last_image: job.last_image || prev[method]?.last_image || '' }
      }
      return next
    })

    if (allDone) stop()
  }, [stop])

  const start = useCallback((map: Record<string, string>) => {
    clearInterval(timer.current)
    ids.current = map
    setJobs(Object.fromEntries(Object.entries(map).map(([m, id]) => ([m, {
      job_id: id, method: m, source: '', status: 'queued',
      in_count: 0, out_count: 0, current_count: 0,
      frames_done: 0, total_frames: 0, last_image: '',
      fps: 0, seconds: 0, error: null,
    } as JobState]))))
    setRunning(true)
    timer.current = setInterval(poll, POLL_MS)
    void poll()
  }, [poll])

  const reset = useCallback(() => {
    stop()
    ids.current = {}
    setJobs({})
  }, [stop])

  useEffect(() => () => clearInterval(timer.current), [])

  return { jobs, running, start, reset }
}
