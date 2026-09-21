import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Play, Download, CheckCircle2, AlertCircle, Loader2, Cpu, Zap,
  LogIn, LogOut, Users, Database, Maximize2,
} from 'lucide-react'
import { videoUrl } from '../../services/counters'
import { useT } from '../../i18n'
import type { JobState, MethodInfo } from '../../services/counters'

interface Props {
  info:     MethodInfo
  job?:     JobState
  busy:     boolean
  onRun:    () => void
}

/** Job status → dictionary key. */
const STATUS_KEY: Record<string, string> = {
  queued:     'status.queued',
  preparing:  'status.preparing',
  processing: 'status.processing',
  done:       'status.done',
  error:      'status.error',
}

export default function MethodCard({ info, job, busy, onRun }: Props) {
  const t = useT()
  const status = job?.status
  const pct = job && job.total_frames > 0
    ? Math.min(100, Math.round((job.frames_done / job.total_frames) * 100))
    : 0
  const active = status === 'queued' || status === 'preparing' || status === 'processing'

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 w-7 h-7 rounded-lg gradient-bg text-white grid place-items-center
                             font-mono font-bold text-sm">
              {info.label}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm leading-tight truncate">{info.name}</h3>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                {info.needs_gpu ? <Cpu size={10} /> : <Zap size={10} />}
                {info.needs_gpu ? t('card.nn') : t('card.noNn')}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <Link
              to={`/lab/${info.id}`}
              title={t('card.open', { label: info.label })}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] border border-border
                         text-muted-foreground hover:border-accent hover:text-accent transition-colors"
            >
              <Maximize2 size={11} />
            </Link>
            <button
              onClick={onRun}
              disabled={busy}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                         gradient-bg text-white transition-all hover:-translate-y-0.5 hover:shadow-accent
                         disabled:opacity-40 disabled:translate-y-0 disabled:cursor-not-allowed"
            >
              <Play size={11} /> {t('card.run')}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{info.desc}</p>
      </div>

      {/* Preview frame */}
      <div className="relative aspect-video bg-muted">
        {job?.last_image ? (
          <img
            src={`data:image/jpeg;base64,${job.last_image}`}
            alt={info.name}
            className="absolute inset-0 w-full h-full object-contain bg-black"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            {active ? (
              <span className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" />
                {t(STATUS_KEY[status!] ?? 'card.waiting')}…
              </span>
            ) : t('card.press')}
          </div>
        )}

        {status === 'done' && (
          <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md
                           bg-green-500 text-white text-[10px] font-mono">
            <CheckCircle2 size={10} /> {job!.fps} fps
          </span>
        )}
      </div>

      {/* Progress */}
      {active && (
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1">
            <span>{STATUS_KEY[status!] ? t(STATUS_KEY[status!]) : status}</span>
            <span>{t('card.frames', { done: job!.frames_done, total: job!.total_frames })}</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full gradient-bg rounded-full"
                        animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
          </div>
        </div>
      )}

      {/* Counts */}
      <div className="grid grid-cols-3 gap-2 p-4">
        <Stat icon={<LogIn size={12} />}  label={t('card.in')} value={job?.in_count      ?? 0} tone="accent" />
        <Stat icon={<LogOut size={12} />} label={t('card.out')} value={job?.out_count     ?? 0} tone="muted" />
        <Stat icon={<Users size={12} />}  label={t('card.now')} value={job?.current_count ?? 0} tone="strong" />
      </div>

      {/* Error */}
      {status === 'error' && (
        <p className="mx-4 mb-3 flex items-start gap-1.5 text-[11px] text-red-600 font-mono
                      bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertCircle size={12} className="shrink-0 mt-px" />
          <span className="break-all">{job?.error}</span>
        </p>
      )}

      {/* Footer: datasets, pros/cons, download */}
      <div className="mt-auto px-4 pb-4 space-y-3">
        {status === 'done' && (
          <div className="text-[10px] font-mono text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
            <span>⏱ {job!.seconds}s</span>
            <span>{job!.resolution}</span>
            {!!job!.scene_cuts && <span>{t('card.cuts', { n: job!.scene_cuts! })}</span>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[10px] leading-snug">
          <ul className="space-y-1">
            {info.pros.map(p => (
              <li key={p} className="text-green-700 flex gap-1"><span>+</span><span>{p}</span></li>
            ))}
          </ul>
          <ul className="space-y-1">
            {info.cons.map(c => (
              <li key={c} className="text-orange-700 flex gap-1"><span>−</span><span>{c}</span></li>
            ))}
          </ul>
        </div>

        <details className="group">
          <summary className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer
                              hover:text-foreground transition-colors list-none">
            <Database size={10} /> {t('card.datasets')}
          </summary>
          <ul className="mt-1.5 space-y-0.5">
            {info.datasets.map(d => (
              <li key={d} className="text-[10px] font-mono text-muted-foreground pl-3.5">· {d}</li>
            ))}
          </ul>
        </details>

        {status === 'done' && job?.frames_done ? (
          <a
            href={videoUrl(job.job_id)}
            download
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-border
                       text-xs font-medium hover:bg-muted transition-colors"
          >
            <Download size={12} /> {t('card.download')}
          </a>
        ) : null}
      </div>
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
    <div className="rounded-lg bg-muted p-2.5 text-center">
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
      <motion.p key={value} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                className={`text-lg font-mono font-bold leading-none ${color}`}>
        {value}
      </motion.p>
    </div>
  )
}
