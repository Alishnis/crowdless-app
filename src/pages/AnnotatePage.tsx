import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList, Play, Pause, LogIn, LogOut, Undo2, Trash2, Save,
  ArrowLeftRight, Check, AlertCircle, Repeat,
} from 'lucide-react'
import { useT } from '../i18n'
import {
  deleteBenchmark, fetchBenchmarks, fetchSamples, fetchStrip, saveBenchmark,
} from '../services/counters'
import type {
  Benchmark, BenchmarkTotals, FrameStrip, GtEvent, SampleInfo,
} from '../services/counters'

const SPEEDS = [0.25, 0.5, 1]
const STRIP_FPS = 10

export default function AnnotatePage() {
  const t = useT()
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const [samples,  setSamples]  = useState<SampleInfo[]>([])
  const [sampleId, setSampleId] = useState<number | null>(null)
  const [start,    setStart]    = useState(0)
  const [end,      setEnd]      = useState(10)
  const [lineRatio, setLineRatio] = useState(0.5)
  const [invert,   setInvert]   = useState(false)
  const [note,     setNote]     = useState('')

  const [events,   setEvents]   = useState<GtEvent[]>([])
  const [playing,  setPlaying]  = useState(false)
  const [speed,    setSpeed]    = useState(0.5)
  const [loop,     setLoop]     = useState(true)

  const [strip,    setStrip]    = useState<FrameStrip | null>(null)
  const [frameIdx, setFrameIdx] = useState(0)
  const [loading,  setLoading]  = useState(false)

  // Time of the frame on screen — every mark is stamped with this.
  const now = strip ? strip.start + frameIdx / strip.fps : start

  const [saved,    setSaved]    = useState('')
  const [error,    setError]    = useState('')
  const [list,     setList]     = useState<Benchmark[]>([])
  const [totals,   setTotals]   = useState<BenchmarkTotals | null>(null)

  const sample = samples.find(s => s.id === sampleId) ?? null

  const refreshList = useCallback(() => {
    fetchBenchmarks()
      .then(d => { setList(d.benchmarks); setTotals(d.totals) })
      .catch(() => { /* backend down — the banner below already says so */ })
  }, [])

  useEffect(() => {
    fetchSamples()
      .then(s => {
        setSamples(s)
        const best = s.find(x => x.name.includes('Bus Passenger Counting')) ?? s[0]
        if (best) pick(best)
      })
      .catch(() => setError('lab.backendDown'))
    refreshList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pick(s: SampleInfo) {
    setSampleId(s.id)
    setStart(s.preset.start_seconds)
    setEnd(Math.min(s.duration, s.preset.start_seconds + s.preset.max_seconds))
    setLineRatio(s.preset.line_ratio)
    setInvert(s.preset.invert)
    setEvents([])
    setSaved('')
  }

  // Fetch the segment's frames whenever the clip or its bounds change.
  useEffect(() => {
    if (sampleId == null || end <= start) { setStrip(null); return }
    let cancelled = false
    setLoading(true)
    setPlaying(false)
    fetchStrip(sampleId, start, end, STRIP_FPS)
      .then(st => {
        if (cancelled) return
        setStrip(st)
        setFrameIdx(0)
      })
      .catch(() => { if (!cancelled) setStrip(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sampleId, start, end])

  // Playback is just an index walking the strip at its own frame rate.
  useEffect(() => {
    clearInterval(timerRef.current)
    if (!playing || !strip) return
    timerRef.current = setInterval(() => {
      setFrameIdx(i => {
        if (i + 1 < strip.count) return i + 1
        if (loop) return 0
        setPlaying(false)
        return i
      })
    }, 1000 / (strip.fps * speed))
    return () => clearInterval(timerRef.current)
  }, [playing, strip, speed, loop])

  useEffect(() => () => clearInterval(timerRef.current), [])

  const step = useCallback((delta: number) => {
    setPlaying(false)
    setFrameIdx(i => Math.min(Math.max(i + delta, 0), Math.max(0, (strip?.count ?? 1) - 1)))
  }, [strip])

  const toggle = useCallback(() => {
    if (!strip) return
    setPlaying(p => !p)
  }, [strip])

  const mark = useCallback((type: 'in' | 'out') => {
    if (!strip) return
    const at = Number((strip.start + frameIdx / strip.fps).toFixed(2))
    setEvents(e => [...e, { t: at, type }].sort((a, b) => a.t - b.t))
    setSaved('')
  }, [strip, frameIdx])

  /** Jump the playhead to the frame nearest a marked event. */
  const seekTo = useCallback((time: number) => {
    if (!strip) return
    setPlaying(false)
    setFrameIdx(Math.min(strip.count - 1,
                         Math.max(0, Math.round((time - strip.start) * strip.fps))))
  }, [strip])

  // Hotkeys — annotating with the mouse alone is far too slow to be practical
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      const k = e.key.toLowerCase()
      if (e.code === 'Space')  { e.preventDefault(); toggle() }
      else if (k === 'i')      { e.preventDefault(); mark('in') }
      else if (k === 'o')      { e.preventDefault(); mark('out') }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); step(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, mark, step])

  async function onSave() {
    if (sampleId == null || !sample) return
    setSaved(''); setError('')
    try {
      const rec = await saveBenchmark({
        clip: sample.name, sample_id: sampleId,
        start_seconds: start, end_seconds: end,
        line_ratio: lineRatio, orientation: 'h', invert, note, events,
      })
      setSaved(rec.id)
      refreshList()
    } catch (e) {
      setError(t('ann.saveError', { err: String(e) }))
    }
  }

  const inCount  = events.filter(e => e.type === 'in').length
  const outCount = events.filter(e => e.type === 'out').length

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1400px] mx-auto px-6 pt-24 pb-12">

        <div className="mb-8">
          <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-accent mb-2">
            <ClipboardList size={13} /> {t('ann.label')}
          </p>
          <h1 className="font-display text-4xl mb-2">{t('ann.title')}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{t('ann.lead')}</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-mono">
            {t(error)}
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">

          {/* ── Player ──────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden border border-border bg-black">
              {strip && strip.count > 0 ? (
                <img
                  src={`data:image/jpeg;base64,${strip.frames[Math.min(frameIdx, strip.count - 1)]}`}
                  alt=""
                  className="w-full block max-h-[60vh] object-contain"
                  draggable={false}
                />
              ) : (
                <div className="aspect-video grid place-items-center text-xs text-white/40 font-mono">
                  {loading ? t('ann.decoding') : t('map.loading')}
                </div>
              )}

              {/* Reference counting line */}
              <div className="absolute left-0 right-0 h-px bg-green-400 pointer-events-none
                              shadow-[0_0_8px_rgba(74,222,128,0.9)]"
                   style={{ top: `${lineRatio * 100}%` }} />
              <div className="absolute left-2 bottom-2 px-2 py-1 rounded-md bg-black/70 text-white
                              text-[10px] font-mono pointer-events-none">
                {t('ann.time', { t: now.toFixed(2) })} · {inCount}↓ / {outCount}↑
              </div>
            </div>

            {/* Scrub bar — drag to any frame in the segment */}
            <input
              type="range" min={0} max={Math.max(0, (strip?.count ?? 1) - 1)} step={1}
              value={frameIdx} disabled={!strip}
              onChange={e => { setPlaying(false); setFrameIdx(Number(e.target.value)) }}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground -mt-2">
              <span>{start.toFixed(1)}s</span>
              <span>{strip ? `${frameIdx + 1} / ${strip.count}` : '—'}</span>
              <span>{end.toFixed(1)}s</span>
            </div>

            {/* Transport + marking */}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => step(-1)} disabled={!strip} title="←"
                      className="px-3 py-2.5 rounded-xl border border-border hover:bg-muted
                                 transition-colors disabled:opacity-40 font-mono text-xs">
                ◀
              </button>
              <button onClick={toggle} disabled={!strip}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border
                                 hover:bg-muted transition-colors text-sm disabled:opacity-40">
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button onClick={() => step(1)} disabled={!strip} title="→"
                      className="px-3 py-2.5 rounded-xl border border-border hover:bg-muted
                                 transition-colors disabled:opacity-40 font-mono text-xs">
                ▶
              </button>

              <button onClick={() => mark('in')}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 rounded-xl
                                 bg-green-600 text-white text-sm font-medium transition-all
                                 hover:-translate-y-0.5 active:scale-[0.98]">
                <LogIn size={15} /> {t('ann.in')} <kbd className="opacity-60 font-mono text-[10px]">I</kbd>
              </button>

              <button onClick={() => mark('out')}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 rounded-xl
                                 bg-orange-600 text-white text-sm font-medium transition-all
                                 hover:-translate-y-0.5 active:scale-[0.98]">
                <LogOut size={15} /> {t('ann.out')} <kbd className="opacity-60 font-mono text-[10px]">O</kbd>
              </button>

              <button onClick={() => { setEvents(e => e.slice(0, -1)); setSaved('') }}
                      disabled={!events.length} title={t('ann.undo')}
                      className="px-3 py-2.5 rounded-xl border border-border hover:bg-muted
                                 transition-colors disabled:opacity-40">
                <Undo2 size={15} />
              </button>
              <button onClick={() => { setEvents([]); setSaved('') }}
                      disabled={!events.length} title={t('ann.clear')}
                      className="px-3 py-2.5 rounded-xl border border-border hover:bg-muted
                                 transition-colors disabled:opacity-40">
                <Trash2 size={15} />
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground font-mono">{t('ann.hotkeys')}</p>

            {/* Marked events */}
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {events.length ? t('ann.events', { n: events.length }) : t('ann.noEvents')}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <AnimatePresence>
                  {events.map((e, i) => (
                    <motion.button
                      key={`${e.t}-${e.type}-${i}`}
                      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      onClick={() => seekTo(e.t)}
                      title={t('ann.time', { t: e.t.toFixed(2) })}
                      className={`px-2 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                        e.type === 'in'
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-orange-100 text-orange-800 hover:bg-orange-200'}`}
                    >
                      {e.type === 'in' ? '↓' : '↑'} {e.t.toFixed(1)}s
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          </div>

          {/* ── Controls ────────────────────────────────────────────────── */}
          <div className="space-y-4 lg:sticky lg:top-20">

            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('ann.clip')}
              </h2>
              <select
                value={sampleId ?? ''}
                onChange={e => {
                  const s = samples.find(x => x.id === Number(e.target.value))
                  if (s) pick(s)
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs
                           focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {samples.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name.length > 40 ? s.name.slice(0, 40) + '…' : s.name} · {s.duration}s
                  </option>
                ))}
              </select>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('ann.segment')}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <NumberBox label="start" value={start} onChange={setStart} />
                <NumberBox label="end"   value={end}   onChange={setEnd} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setStart(Number(now.toFixed(2)))}
                        className="py-2 rounded-lg border border-border text-[11px] hover:bg-muted transition-colors">
                  {t('ann.markStart')}
                </button>
                <button onClick={() => setEnd(Number(now.toFixed(2)))}
                        className="py-2 rounded-lg border border-border text-[11px] hover:bg-muted transition-colors">
                  {t('ann.markEnd')}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('ann.playback')}
              </h2>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">{t('ann.speed')}</p>
                <div className="grid grid-cols-3 gap-1">
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => setSpeed(s)}
                            className={`py-1.5 rounded-lg text-[11px] font-mono border transition-colors ${
                              speed === s ? 'border-accent bg-accent/10 text-accent'
                                          : 'border-border hover:bg-muted'}`}>
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setLoop(l => !l)}
                      className={`flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border
                                  text-[11px] transition-colors ${
                        loop ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-muted'}`}>
                <Repeat size={11} /> {t('ann.loop')}
              </button>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">
                  {t('lab.line')} — {(lineRatio * 100).toFixed(0)}%
                </p>
                <input type="range" min={0.05} max={0.95} step={0.01} value={lineRatio}
                       onChange={e => setLineRatio(Number(e.target.value))}
                       className="w-full accent-accent" />
                <p className="text-[10px] text-muted-foreground mt-1">{t('ann.lineHint')}</p>
              </div>
              <button onClick={() => setInvert(v => !v)}
                      className={`flex items-center justify-center gap-1 w-full py-2 rounded-lg border
                                  text-[11px] transition-colors ${
                        invert ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-muted'}`}>
                <ArrowLeftRight size={11} /> {t('lab.line.invert')}
              </button>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <label className="block text-[11px] text-muted-foreground">{t('ann.note')}</label>
              <textarea value={note} onChange={e => setNote(e.target.value)}
                        placeholder={t('ann.notePh')} rows={2}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs
                                   focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
              <button onClick={onSave} disabled={sampleId == null}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl gradient-bg
                                 text-white text-sm font-medium transition-all hover:-translate-y-0.5
                                 hover:shadow-accent-lg disabled:opacity-40">
                <Save size={14} /> {t('ann.save')}
              </button>
              {saved && (
                <p className="flex items-center gap-1.5 text-[11px] text-green-700 font-mono">
                  <Check size={12} /> {t('ann.saved', { id: saved })}
                </p>
              )}
              {error && !error.startsWith('lab.') && (
                <p className="flex items-start gap-1.5 text-[11px] text-red-600 font-mono">
                  <AlertCircle size={12} className="shrink-0 mt-px" /> {error}
                </p>
              )}
            </section>
          </div>
        </div>

        {/* ── Saved set ─────────────────────────────────────────────────── */}
        <section className="mt-8 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-baseline justify-between px-4 py-3 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('ann.existing')}
            </h2>
            {totals && totals.count > 0 && (
              <span className="text-[11px] font-mono text-muted-foreground">
                {t('ann.totalsLine', {
                  count: totals.count, seconds: totals.seconds,
                  in: totals.in, out: totals.out,
                })}
              </span>
            )}
          </div>

          {!list.length ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">{t('ann.empty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map(b => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="font-mono text-[11px] text-muted-foreground w-[40%] truncate">{b.id}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {b.start_seconds}–{b.end_seconds}s
                  </span>
                  <span className="font-mono text-xs text-green-700 font-bold">↓{b.in_count}</span>
                  <span className="font-mono text-xs text-orange-700">↑{b.out_count}</span>
                  {b.note && <span className="text-[11px] text-muted-foreground truncate flex-1">{b.note}</span>}
                  <button onClick={() => { void deleteBenchmark(b.id).then(refreshList) }}
                          title={t('ann.delete')}
                          className="ml-auto text-muted-foreground hover:text-red-600 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="px-4 py-3 border-t border-border text-[11px] text-muted-foreground leading-relaxed">
            <p className="font-medium mb-1">{t('ann.howto')}</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>{t('ann.step1')}</li>
              <li>{t('ann.step2')}</li>
              <li>{t('ann.step3')}</li>
            </ol>
            <code className="block mt-2 font-mono text-[10px] bg-muted rounded px-2 py-1">
              {t('ann.step4')}
            </code>
          </div>
        </section>
      </div>
    </div>
  )
}

function NumberBox({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-mono text-muted-foreground mb-1">{label}</span>
      <input type="number" step={0.1} min={0} value={value}
             onChange={e => onChange(Number(e.target.value))}
             className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-mono
                        focus:outline-none focus:ring-2 focus:ring-accent/30" />
    </label>
  )
}
