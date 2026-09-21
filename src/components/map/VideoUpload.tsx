import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useT } from '../../i18n'
import { Upload, X, LogIn, LogOut, Users, CheckCircle, AlertCircle, Download } from 'lucide-react'

const BACKEND = 'http://localhost:8000'
const POLL_MS  = 1_500

interface JobResult {
  status:        'processing' | 'done' | 'error'
  in_count:      number
  out_count:     number
  current_count: number
  frames_done:   number
  total_frames:  number
  last_image:    string
  error:         string | null
}

interface Props {
  onResult?: (inCount: number, outCount: number, current: number) => void
}

export default function VideoUpload({ onResult }: Props) {
  const t = useT()
  const [dragging,   setDragging]   = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [job,        setJob]        = useState<JobResult | null>(null)
  const [jobId,      setJobId]      = useState<string | null>(null)
  const fileRef  = useRef<HTMLInputElement>(null)
  const pollRef  = useRef<ReturnType<typeof setInterval>>(undefined)

  const stopPolling = () => clearInterval(pollRef.current)

  const startPolling = useCallback((id: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND}/job/${id}`)
        const data: JobResult = await res.json()
        setJob(data)
        if (data.status === 'done' || data.status === 'error') {
          stopPolling()
          if (data.status === 'done') {
            onResult?.(data.in_count, data.out_count, data.current_count)
          }
        }
      } catch { /* network error — keep polling */ }
    }, POLL_MS)
  }, [onResult])

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mov|mp4|avi|mkv)$/i)) {
      alert(t('up.pickVideo'))
      return
    }

    setUploading(true)
    setJob(null)
    setJobId(null)

    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch(`${BACKEND}/upload`, { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setJobId(data.job_id)
      setJob({
        status: 'processing', in_count: 0, out_count: 0, current_count: 0,
        frames_done: 0, total_frames: 0, last_image: '', error: null,
      })
      startPolling(data.job_id)
    } catch (err) {
      alert(t('up.error', { err: String(err) }))
    } finally {
      setUploading(false)
    }
  }, [startPolling])

  const reset = () => {
    stopPolling()
    setJob(null)
    setJobId(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const pct = job && job.total_frames > 0
    ? Math.round((job.frames_done / job.total_frames) * 100)
    : 0

  // ── Drop zone ───────────────────────────────────────────────────────────────
  if (!job && !uploading) {
    return (
      <div
        className={`rounded-xl border-2 border-dashed transition-all duration-200 p-6 text-center cursor-pointer select-none
          ${dragging ? 'border-accent bg-accent/10' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.03]'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="video/*,.mov,.mp4,.avi,.mkv"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
        <Upload size={22} className="mx-auto mb-2 text-white/30" />
        <p className="text-sm text-white/50">{t('up.drop')}</p>
        <p className="text-[11px] text-white/25 mt-1">{t('up.formats')}</p>
      </div>
    )
  }

  // ── Processing / result ─────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          {job?.status === 'done'
            ? <CheckCircle size={14} className="text-green-400" />
            : job?.status === 'error'
            ? <AlertCircle size={14} className="text-red-400" />
            : <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
          }
          <span className="text-[11px] font-mono text-white/50 uppercase tracking-widest">
            {uploading ? t('up.uploading')
              : job?.status === 'done'   ? t('up.done')
              : job?.status === 'error'  ? t('up.failed')
              : t('up.progress', { pct })}
          </span>
        </div>
        <button onClick={reset} className="text-white/25 hover:text-white/60 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Progress bar */}
      {job?.status === 'processing' && (
        <div className="mx-4 mb-3 h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full gradient-bg rounded-full"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}

      {/* Live camera frame */}
      <AnimatePresence mode="wait">
        {job?.last_image && (
          <motion.div
            key={job.frames_done}
            className="mx-4 mb-3 rounded-lg overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <img
              src={`data:image/jpeg;base64,${job.last_image}`}
              alt={t('up.frame')}
              className="w-full object-cover"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        <div className="bg-white/[0.05] rounded-lg p-3 text-center">
          <LogIn size={13} className="mx-auto mb-1 text-accent" />
          <p className="text-[10px] text-white/35 mb-0.5">{t('card.in')}</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={job?.in_count}
              className="text-lg font-mono font-bold text-accent leading-none"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              {job?.in_count ?? 0}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="bg-white/[0.05] rounded-lg p-3 text-center">
          <LogOut size={13} className="mx-auto mb-1 text-white/40" />
          <p className="text-[10px] text-white/35 mb-0.5">{t('card.out')}</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={job?.out_count}
              className="text-lg font-mono font-bold text-white leading-none"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              {job?.out_count ?? 0}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="bg-white/[0.05] rounded-lg p-3 text-center">
          <Users size={13} className="mx-auto mb-1 text-white/40" />
          <p className="text-[10px] text-white/35 mb-0.5">{t('card.now')}</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={job?.current_count}
              className="text-lg font-mono font-bold text-white leading-none"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              {job?.current_count ?? 0}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* Download button */}
      {job?.status === 'done' && jobId && (
        <div className="px-4 pb-4">
          <a
            href={`${BACKEND}/job/${jobId}/video`}
            download="crowdless_analysis.mp4"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl gradient-bg text-white text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-accent-lg"
          >
            <Download size={14} />
            {t('up.download')}
          </a>
        </div>
      )}

      {/* Error message */}
      {job?.status === 'error' && (
        <p className="px-4 pb-4 text-xs text-red-400 font-mono">{job.error}</p>
      )}
    </div>
  )
}
