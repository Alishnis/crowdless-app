import { useI18n } from '../i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_PARAMS, fetchModelVariants, fetchSamples, fetchThumb, finetunedMethods,
} from '../services/counters'
import type { ModelVariant, RunParams, SampleInfo } from '../services/counters'

/**
 * The video being analysed plus the knobs shared by every method — source
 * selection, the counting line, timing. Both the comparison lab and the
 * per-method pages drive from this, so they cannot drift apart.
 */
export function useLabSource() {
  const { lang } = useI18n()
  const [samples,  setSamples]  = useState<SampleInfo[]>([])
  const [sampleId, setSampleId] = useState<number | null>(null)
  const [upload,   setUpload]   = useState<File | null>(null)
  const [thumb,    setThumb]    = useState('')
  const [params,   setParams]   = useState<RunParams>(DEFAULT_PARAMS)
  const [models,   setModels]   = useState<Record<string, ModelVariant[]>>({})
  const [error,    setError]    = useState('')

  const sample = useMemo(
    () => samples.find(s => s.id === sampleId) ?? null,
    [samples, sampleId],
  )

  /** Selecting a clip also loads its curated preset (start time, line, direction). */
  const selectSample = useCallback((s: SampleInfo) => {
    setSampleId(s.id)
    setUpload(null)
    setParams(p => ({
      ...p,
      start_seconds: s.preset.start_seconds,
      max_seconds:   s.preset.max_seconds,
      line_ratio:    s.preset.line_ratio,
      invert:        s.preset.invert,
      orientation:   s.preset.orientation === 'v' ? 'v' : 'h',
    }))
  }, [])

  const chooseUpload = useCallback((f: File) => {
    setUpload(f)
    setSampleId(null)
    setThumb('')
  }, [])

  // Clip notes and model descriptions are authored on the backend, so both are
  // refetched when the visitor switches language.
  useEffect(() => {
    fetchSamples(lang)
      .then(s => {
        setSamples(s)
        // Open on the clip that actually contains usable doorway footage
        const best = s.find(x => x.name.includes('Bus Passenger Counting')) ?? s[0]
        if (best) selectSample(best)
      })
      .catch(() => setError('lab.backendDown'))
    fetchModelVariants(lang).then(setModels).catch(() => setModels({}))
  }, [selectSample, lang])

  // Refresh the still whenever the clip or its start time changes
  useEffect(() => {
    if (sampleId == null) { setThumb(''); return }
    let cancelled = false
    fetchThumb(sampleId, params.start_seconds)
      .then(b64 => { if (!cancelled) setThumb(b64) })
      .catch(() => { if (!cancelled) setThumb('') })
    return () => { cancelled = true }
  }, [sampleId, params.start_seconds])

  return {
    samples, sampleId, sample, upload, thumb, params, models, error,
    setParams, setError, selectSample, chooseUpload,
    tunedMethods: finetunedMethods(models),
    ready: upload != null || sampleId != null,
  }
}
