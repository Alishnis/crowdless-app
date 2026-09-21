import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, ArrowLeftRight, Cpu, Download, Film, Loader2, Play, RotateCcw,
  Sliders, Upload, Zap, LogIn, LogOut, Users, Database, AlertCircle,
} from 'lucide-react'
import LinePreview from '../components/lab/LinePreview'
import ParamControl, { isModified } from '../components/lab/ParamControl'
import { useCounterJobs } from '../hooks/useCounterJobs'
import { useLabSource } from '../hooks/useLabSource'
import { useI18n, useT } from '../i18n'
import {
  defaultParamValues, fetchMethods, runSample, runUpload, videoUrl,
} from '../services/counters'
import type { MethodInfo, ParamValues, SampleInfo } from '../services/counters'

export default function MethodPage() {
  const { lang, t } = useI18n()
  const { methodId = '' } = useParams()
  const [methods, setMethods] = useState<MethodInfo[]>([])
  const [extra,   setExtra]   = useState<ParamValues>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const src = useLabSource()
  const { jobs, running, start, reset } = useCounterJobs()
  const job = jobs[methodId]

  const info = useMemo(
    () => methods.find(m => m.id === methodId) ?? null,
    [methods, methodId],
  )

  useEffect(() => {
    fetchMethods(lang).then(setMethods).catch(() => setMethods([]))
  }, [lang])

  // Knob values follow the backend schema, and reset when switching method
  useEffect(() => {
    if (info) setExtra(defaultParamValues(info.params))
  }, [info])

  const launch = useCallback(async () => {
    if (!info) return
    src.setError('')
    try {
      const map = src.upload
        ? await runUpload(src.upload, [info.id], src.params, extra)
        : src.sampleId != null
          ? await runSample(src.sampleId, [info.id], src.params, extra)
          : null
      if (!map) { src.setError('lab.pickVideo'); return }
      start(map)
    } catch (e) {
      src.setError(String(e))
    }
  }, [info, src, extra, start])

  const canTune = info ? src.tunedMethods.includes(info.id) : false
  const pct = job && job.total_frames > 0
    ? Math.min(100, Math.round((job.frames_done / job.total_frames) * 100))
    : 0

  if (!info) {
    return (
      <div className="min-h-screen bg-background grid place-items-center text-sm text-muted-foreground">
        {methods.length ? t('method.notFoundX', { id: methodId ?? '' }) : t('method.loading')}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* pt clears the fixed h-16 navbar */}
      <div className="max-w-[1400px] mx-auto px-6 pt-24 pb-12">

        {/* Header */}
        <Link to="/lab" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground
                                   hover:text-accent transition-colors mb-4">
          <ArrowLeft size={12} /> {t('method.back')}
        </Link>

        <div className="flex items-start gap-3 mb-2">
          <span className="w-10 h-10 shrink-0 rounded-xl gradient-bg text-white grid place-items-center
                           font-mono font-bold text-lg">
            {info.label}
          </span>
          <div>
            <h1 className="font-display text-3xl leading-tight">{info.title}</h1>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
              {info.needs_gpu ? <Cpu size={11} /> : <Zap size={11} />}
              {info.needs_gpu ? t('card.nn') : t('method.noNnCpu')}
              {canTune && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px]">
                  {t('method.hasFt')}
                </span>
              )}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed mb-8">{info.desc}</p>

        {src.error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm
                          text-red-700 font-mono">{src.error}</div>
        )}

        <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">

          {/* ── Left: source + knobs ──────────────────────────────────────── */}
          <div className="space-y-4">

            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider
                             text-muted-foreground mb-3">
                <Film size={12} /> {t('lab.source')}
              </h2>
              <SourcePicker
                samples={src.samples} sampleId={src.sampleId} upload={src.upload}
                onSample={src.selectSample}
                onUploadClick={() => fileRef.current?.click()}
              />
              <input
                ref={fileRef} type="file" accept="video/*,.mov,.mp4,.avi,.mkv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { src.chooseUpload(f); reset() } }}
              />
              {src.sample && !src.upload && (
                <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                  {src.sample.preset.note}
                </p>
              )}
            </section>

            {!src.upload && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {t('lab.line')}
                </h2>
                <LinePreview
                  thumb={src.thumb}
                  lineRatio={src.params.line_ratio}
                  orientation={src.params.orientation}
                  invert={src.params.invert}
                  onLineChange={r => src.setParams(p => ({ ...p, line_ratio: r }))}
                />
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => src.setParams(p => ({
                      ...p, orientation: p.orientation === 'h' ? 'v' : 'h' }))}
                    className="py-2 rounded-lg border border-border text-[11px] hover:bg-muted transition-colors"
                  >
                    {src.params.orientation === 'h' ? t('lab.line.horiz') : t('lab.line.vert')}
                  </button>
                  <button
                    onClick={() => src.setParams(p => ({ ...p, invert: !p.invert }))}
                    className={`flex items-center justify-center gap-1 py-2 rounded-lg border text-[11px]
                                transition-colors ${src.params.invert
                        ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-muted'}`}
                  >
                    <ArrowLeftRight size={11} /> {t('lab.line.invert')}
                  </button>
                </div>
              </section>
            )}

            {/* Shared analysis knobs */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('method.common')}
              </h2>
              <Range label={t('lab.param.start')} value={src.params.start_seconds} min={0}
                     max={Math.max(1, Math.floor(src.sample?.duration ?? 60))} step={0.5}
                     onChange={v => src.setParams(p => ({ ...p, start_seconds: v }))} />
              <Range label={t('lab.param.duration')} value={src.params.max_seconds} min={2} max={60} step={1}
                     onChange={v => src.setParams(p => ({ ...p, max_seconds: v }))} />
              <Range label={t('lab.param.conf')} value={src.params.conf} min={0.1} max={0.8} step={0.05}
                     hint={canTune && src.params.finetuned
                       ? t('method.confLock1')
                       : undefined}
                     onChange={v => src.setParams(p => ({ ...p, conf: v }))} />
              <Range label={t('lab.param.minAge')} value={src.params.min_age} min={0} max={20} step={1}
                     hint={src.params.min_age === 0 ? t('method.minAgeAuto') : undefined}
                     onChange={v => src.setParams(p => ({ ...p, min_age: v }))} />
              <Range label={t('lab.param.stride')} value={src.params.stride} min={1} max={5} step={1}
                     onChange={v => src.setParams(p => ({ ...p, stride: v }))} />

              {canTune && (
                <button
                  onClick={() => src.setParams(p => ({ ...p, finetuned: !p.finetuned }))}
                  className={`w-full flex items-start gap-2 p-2.5 rounded-lg border text-left
                    transition-colors ${src.params.finetuned
                      ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted'}`}
                >
                  <span className={`mt-0.5 w-8 h-4 shrink-0 rounded-full relative transition-colors
                                    ${src.params.finetuned ? 'bg-accent' : 'bg-border'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all
                                      ${src.params.finetuned ? 'left-4' : 'left-0.5'}`} />
                  </span>
                  <span>
                    <span className="block text-[11px] font-medium">{t('method.ftWeights')}</span>
                    <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5">
                      {t('method.ftNote')}
                    </span>
                  </span>
                </button>
              )}
            </section>

            {/* Method-specific knobs, rendered from the backend schema */}
            {info.params.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase
                                 tracking-wider text-muted-foreground">
                    <Sliders size={12} /> {t('method.onlyFor', { label: info.label })}
                  </h2>
                  {isModified(info.params, extra) && (
                    <button
                      onClick={() => setExtra(defaultParamValues(info.params))}
                      className="text-[10px] text-muted-foreground hover:text-accent transition-colors"
                    >
                      {t('method.resetOne')}
                    </button>
                  )}
                </div>
                {info.params.map(p => (
                  <ParamControl
                    key={p.key}
                    param={p}
                    value={extra[p.key] ?? p.default}
                    onChange={v => setExtra(prev => ({ ...prev, [p.key]: v }))}
                  />
                ))}
              </section>
            )}

            <div className="flex gap-2">
              <button
                onClick={launch}
                disabled={running || !src.ready}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl gradient-bg
                           text-white text-sm font-medium transition-all hover:-translate-y-0.5
                           hover:shadow-accent-lg disabled:opacity-40 disabled:translate-y-0
                           disabled:cursor-not-allowed"
              >
                <Play size={14} /> {running ? t('lab.running') : t('method.runOne', { label: info.label })}
              </button>
              <button
                onClick={reset} disabled={running}
                className="px-3 rounded-xl border border-border hover:bg-muted transition-colors
                           disabled:opacity-40"
                title={t('method.resetRes')}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          {/* ── Right: result ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="relative aspect-video bg-black">
                {job?.last_image ? (
                  <img
                    src={`data:image/jpeg;base64,${job.last_image}`}
                    alt={info.name}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-sm text-white/40">
                    {running ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={15} className="animate-spin" /> {t('status.processing')}…
                      </span>
                    ) : t('method.pressRun')}
                  </div>
                )}
                {job?.status === 'done' && (
                  <span className="absolute top-3 right-3 px-2 py-1 rounded-md bg-green-500 text-white
                                   text-[11px] font-mono">{job.fps} fps · {job.seconds}s</span>
                )}
              </div>

              {running && (
                <div className="px-4 py-3">
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                    <span>{t(job?.status === 'queued' ? 'status.queued' : 'status.processing')}</span>
                    <span>{t('card.frames', { done: job?.frames_done ?? 0, total: job?.total_frames ?? 0 })}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <motion.div className="h-full gradient-bg rounded-full"
                                animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 p-4">
                <Stat icon={<LogIn size={14} />}  label={t('card.in')}  value={job?.in_count ?? 0} tone="accent" />
                <Stat icon={<LogOut size={14} />} label={t('card.out')}  value={job?.out_count ?? 0} tone="muted" />
                <Stat icon={<Users size={14} />}  label={t('card.now')} value={job?.current_count ?? 0} tone="strong" />
              </div>

              {job?.status === 'error' && (
                <p className="mx-4 mb-4 flex items-start gap-1.5 text-[11px] text-red-600 font-mono
                              bg-red-50 border border-red-200 rounded-lg p-2">
                  <AlertCircle size={12} className="shrink-0 mt-px" />
                  <span className="break-all">{job.error}</span>
                </p>
              )}

              {job?.status === 'done' && (
                <div className="px-4 pb-4">
                  <a href={videoUrl(job.job_id)} download
                     className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl
                                border border-border text-xs font-medium hover:bg-muted transition-colors">
                    <Download size={13} /> {t('method.dlVideo')}
                  </a>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <section className="rounded-2xl border border-border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {t('method.prosCons')}
                </h3>
                <ul className="space-y-1 mb-2">
                  {info.pros.map(p => (
                    <li key={p} className="text-[11px] text-green-700 flex gap-1.5"><span>+</span>{p}</li>
                  ))}
                </ul>
                <ul className="space-y-1">
                  {info.cons.map(c => (
                    <li key={c} className="text-[11px] text-orange-700 flex gap-1.5"><span>−</span>{c}</li>
                  ))}
                </ul>
              </section>

              <section className="rounded-2xl border border-border bg-card p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase
                               tracking-wider text-muted-foreground mb-2">
                  <Database size={12} /> {t('method.dsShort')}
                </h3>
                <ul className="space-y-1">
                  {info.datasets.map(d => (
                    <li key={d} className="text-[11px] font-mono text-muted-foreground">· {d}</li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="flex flex-wrap gap-2">
              {methods.filter(m => m.id !== info.id).map(m => (
                <Link key={m.id} to={`/lab/${m.id}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border
                                 text-[11px] hover:border-accent hover:text-accent transition-colors">
                  <span className="font-mono font-bold">{m.label}</span> {m.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function SourcePicker({ samples, sampleId, upload, onSample, onUploadClick }: {
  samples: SampleInfo[]; sampleId: number | null; upload: File | null
  onSample: (s: SampleInfo) => void; onUploadClick: () => void
}) {
  const t = useT()

  return (
    <>
      <select
        value={upload ? '' : sampleId ?? ''}
        onChange={e => {
          const s = samples.find(x => x.id === Number(e.target.value))
          if (s) onSample(s)
        }}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs
                   focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {upload && <option value="">📁 {upload.name}</option>}
        {samples.map(s => (
          <option key={s.id} value={s.id}>
            {s.name.length > 40 ? s.name.slice(0, 40) + '…' : s.name} · {s.duration}s
          </option>
        ))}
      </select>
      <button
        onClick={onUploadClick}
        className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg
                   border border-dashed border-border text-xs text-muted-foreground
                   hover:border-accent hover:text-accent transition-colors"
      >
        <Upload size={12} /> {upload ? t('lab.uploaded', { name: upload.name }) : t('lab.upload')}
      </button>
    </>
  )
}

function Range({ label, value, min, max, step, hint, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  hint?: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={e => onChange(Number(e.target.value))}
             className="w-full accent-accent" />
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
    </div>
  )
}

function Stat({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number
  tone: 'accent' | 'muted' | 'strong'
}) {
  const color = tone === 'accent' ? 'text-accent'
    : tone === 'strong' ? 'text-foreground' : 'text-muted-foreground'
  return (
    <div className="rounded-xl bg-muted p-3 text-center">
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <motion.p key={value} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                className={`text-2xl font-mono font-bold leading-none ${color}`}>
        {value}
      </motion.p>
    </div>
  )
}
