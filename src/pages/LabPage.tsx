import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FlaskConical, Play, Upload, RotateCcw, ArrowLeftRight, Film } from 'lucide-react'
import LinePreview from '../components/lab/LinePreview'
import MethodCard from '../components/lab/MethodCard'
import { useCounterJobs } from '../hooks/useCounterJobs'
import { useI18n, useT } from '../i18n'
import { useLabSource } from '../hooks/useLabSource'
import { fetchMethods, runSample, runUpload } from '../services/counters'
import type { MethodInfo, SampleInfo } from '../services/counters'

export default function LabPage() {
  const { lang, t } = useI18n()
  const [methods, setMethods] = useState<MethodInfo[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Source, counting line and shared knobs live in one hook, shared with the
  // per-method pages so the two views cannot drift apart.
  const src = useLabSource()
  const { jobs, running, start, reset } = useCounterJobs()

  useEffect(() => {
    fetchMethods(lang).then(setMethods)
      .catch(() => src.setError('lab.backendDown'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  const selectSample = useCallback((s: SampleInfo) => {
    reset()
    src.selectSample(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset, src.selectSample])

  const launch = useCallback(async (ids: string[]) => {
    src.setError('')
    try {
      const jobMap = src.upload
        ? await runUpload(src.upload, ids, src.params)
        : src.sampleId != null
          ? await runSample(src.sampleId, ids, src.params)
          : null
      if (!jobMap) { src.setError('lab.pickVideo'); return }
      start(jobMap)
    } catch (e) {
      src.setError(String(e))
    }
  }, [src, start])

  const allIds = methods.map(m => m.id)
  const { sample, samples, sampleId, upload, thumb, params, error, ready } = src
  const setParams = src.setParams

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* pt clears the fixed h-16 navbar */}
      <div className="max-w-[1400px] mx-auto px-6 pt-24 pb-12">

        {/* Header */}
        <div className="mb-8">
          <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-accent mb-2">
            <FlaskConical size={13} /> {t('lab.label')}
          </p>
          <h1 className="font-display text-4xl mb-2">{t('lab.title')}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {t('lab.lead')}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-mono">
            {t(error)}
          </div>
        )}

        <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">

          {/* ── Left: source + params ─────────────────────────────────────── */}
          <div className="space-y-4 lg:sticky lg:top-20">

            {/* Source */}
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider
                             text-muted-foreground mb-3">
                <Film size={12} /> {t('lab.source')}
              </h2>

              <select
                value={upload ? '' : sampleId ?? ''}
                onChange={e => {
                  const s = samples.find(x => x.id === Number(e.target.value))
                  if (s) selectSample(s)
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs
                           focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {upload && <option value="">📁 {upload.name}</option>}
                {samples.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name.length > 44 ? s.name.slice(0, 44) + '…' : s.name} · {s.duration}s
                  </option>
                ))}
              </select>

              {sample && !upload && (
                <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                  {sample.preset.note}
                </p>
              )}

              <input
                ref={fileRef} type="file" accept="video/*,.mov,.mp4,.avi,.mkv" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  src.chooseUpload(f); reset()
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg
                           border border-dashed border-border text-xs text-muted-foreground
                           hover:border-accent hover:text-accent transition-colors"
              >
                <Upload size={12} /> {upload ? t('lab.uploaded', { name: upload.name }) : t('lab.upload')}
              </button>
            </section>

            {/* Line preview */}
            {!upload && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {t('lab.line')}
                </h2>
                <LinePreview
                  thumb={thumb}
                  lineRatio={params.line_ratio}
                  orientation={params.orientation}
                  invert={params.invert}
                  onLineChange={r => setParams(p => ({ ...p, line_ratio: r }))}
                />
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => setParams(p => ({ ...p, orientation: p.orientation === 'h' ? 'v' : 'h' }))}
                    className="py-2 rounded-lg border border-border text-[11px] hover:bg-muted transition-colors"
                  >
                    {params.orientation === 'h' ? t('lab.line.horiz') : t('lab.line.vert')}
                  </button>
                  <button
                    onClick={() => setParams(p => ({ ...p, invert: !p.invert }))}
                    className={`flex items-center justify-center gap-1 py-2 rounded-lg border text-[11px]
                                transition-colors ${params.invert
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border hover:bg-muted'}`}
                  >
                    <ArrowLeftRight size={11} /> {t('lab.line.invert')}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
                  {t('lab.line.explain')}
                </p>
              </section>
            )}

            {/* Params */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('lab.params')}
              </h2>
              <Slider label={t('lab.param.start')} value={params.start_seconds} min={0}
                      max={Math.max(1, Math.floor(sample?.duration ?? 60))} step={0.5}
                      onChange={v => setParams(p => ({ ...p, start_seconds: v }))} />
              <Slider label={t('lab.param.duration')} value={params.max_seconds} min={2} max={60} step={1}
                      onChange={v => setParams(p => ({ ...p, max_seconds: v }))} />
              <Slider label={t('lab.param.conf')} value={params.conf} min={0.1} max={0.8} step={0.05}
                      disabled={params.finetuned}
                      hint={params.finetuned
                        ? t('lab.param.confLock')
                        : undefined}
                      onChange={v => setParams(p => ({ ...p, conf: v }))} />
              <Slider label={t('lab.param.stride')} value={params.stride} min={1} max={5} step={1}
                      hint={t('lab.param.strideHint')}
                      onChange={v => setParams(p => ({ ...p, stride: v }))} />
              <Slider label={t('lab.param.minAge')} value={params.min_age} min={0} max={20} step={1}
                      hint={params.min_age === 0
                        ? t('lab.param.minAgeAuto')
                        : t('lab.param.minAgeHint', { n: params.min_age })}
                      onChange={v => setParams(p => ({ ...p, min_age: v }))} />

            </section>

            {/* Run */}
            <div className="flex gap-2">
              <button
                onClick={() => launch(allIds)}
                disabled={running || !ready || !methods.length}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl gradient-bg
                           text-white text-sm font-medium transition-all hover:-translate-y-0.5
                           hover:shadow-accent-lg disabled:opacity-40 disabled:translate-y-0
                           disabled:cursor-not-allowed"
              >
                <Play size={14} /> {running ? t('lab.running') : t('lab.run')}
              </button>
              <button
                onClick={reset} disabled={running}
                className="px-3 rounded-xl border border-border hover:bg-muted transition-colors
                           disabled:opacity-40"
                title={t('lab.reset')}
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {t('lab.queueNote')}
            </p>
          </div>

          {/* ── Right: the methods ────────────────────────────────────────── */}
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              {methods.map(m => (
                <MethodCard
                  key={m.id}
                  info={m}
                  job={jobs[m.id]}
                  busy={running || !ready}
                  onRun={() => launch([m.id])}
                />
              ))}
            </div>

            <ComparisonTable methods={methods} jobs={jobs} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Slider({ label, value, min, max, step, hint, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  hint?: string; disabled?: boolean; onChange: (v: number) => void
}) {
  return (
    <div className={disabled ? 'opacity-45' : undefined}>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-accent disabled:cursor-not-allowed"
      />
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function ComparisonTable({ methods, jobs }: {
  methods: MethodInfo[]
  jobs: Record<string, import('../services/counters').JobState>
}) {
  const t = useT()
  const done = methods.filter(m => jobs[m.id]?.status === 'done')
  if (done.length < 2) return null

  const fastest = done.reduce((a, b) => (jobs[a.id].fps > jobs[b.id].fps ? a : b))

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <h2 className="px-4 py-3 border-b border-border text-xs font-semibold uppercase
                     tracking-wider text-muted-foreground">
        {t('cmp.title')}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground border-b border-border">
              <th className="text-left  font-medium px-4 py-2">{t('cmp.method')}</th>
              <th className="text-right font-medium px-3 py-2">{t('card.in')}</th>
              <th className="text-right font-medium px-3 py-2">{t('card.out')}</th>
              <th className="text-right font-medium px-3 py-2">{t('card.now')}</th>
              <th className="text-right font-medium px-3 py-2">{t('cmp.speed')}</th>
              <th className="text-right font-medium px-4 py-2">{t('cmp.time')}</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {done.map(m => {
              const j = jobs[m.id]
              return (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-sans">
                    <span className="font-mono font-bold text-accent mr-1.5">{m.label}</span>
                    {m.name}
                  </td>
                  <td className="text-right px-3 py-2.5 text-green-700 font-bold">{j.in_count}</td>
                  <td className="text-right px-3 py-2.5 text-orange-700">{j.out_count}</td>
                  <td className="text-right px-3 py-2.5 font-bold">{j.current_count}</td>
                  <td className="text-right px-3 py-2.5">
                    {j.fps} fps
                    {m.id === fastest.id && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                        {t('cmp.fastest')}
                      </span>
                    )}
                  </td>
                  <td className="text-right px-4 py-2.5 text-muted-foreground">{j.seconds}s</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-[11px] text-muted-foreground leading-relaxed border-t border-border">
        {t('cmp.note')}
      </p>
    </motion.section>
  )
}
