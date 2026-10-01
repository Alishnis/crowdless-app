// Overridable at build time (VITE_API_URL) so a production build can point at
// a deployed backend instead of localhost; falls back to the dev default.
export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface ParamOption { value: string | number; label: string }

/** A method-specific knob, described by the backend so the UI can render it. */
export interface MethodParam {
  key:      string
  label:    string
  type:     'float' | 'int' | 'bool' | 'select'
  default:  string | number | boolean
  min?:     number
  max?:     number
  step?:    number
  options?: ParamOption[]
  hint?:    string
}

export type ParamValues = Record<string, string | number | boolean>

export interface MethodInfo {
  id:        string
  label:     string
  name:      string
  title:     string
  desc:      string
  pros:      string[]
  cons:      string[]
  datasets:  string[]
  needs_gpu: boolean
  params:    MethodParam[]
}

/** Defaults straight from the backend schema. */
export function defaultParamValues(params: MethodParam[]): ParamValues {
  return Object.fromEntries(params.map(p => [p.key, p.default]))
}

export interface SamplePreset {
  start_seconds: number
  max_seconds:   number
  line_ratio:    number
  invert:        boolean
  orientation:   string
  note:          string
}

export interface SampleInfo {
  id:         number
  name:       string
  duration:   number
  resolution: string
  fps:        number
  color:      boolean
  preset:     SamplePreset
}

export interface JobState {
  job_id:        string
  method:        string
  source:        string
  status:        'queued' | 'preparing' | 'processing' | 'done' | 'error'
  phase?:        string
  in_count:      number
  out_count:     number
  current_count: number
  frames_done:   number
  total_frames:  number
  last_image:    string
  fps:           number
  seconds:       number
  scene_cuts?:   number
  resolution?:   string
  error:         string | null
}

/** Analysis knobs shared by every method — the whole point is that they match. */
export interface RunParams {
  line_ratio:    number
  orientation:   'h' | 'v'
  invert:        boolean
  start_seconds: number
  max_seconds:   number
  conf:          number
  stride:        number
  proc_width:    number
  /** Use the top-view fine-tuned weights. Applies to method B only. */
  finetuned:     boolean
  /** Frames a track must survive before it may count. 0 = per-model default. */
  min_age:       number
}

export const DEFAULT_PARAMS: RunParams = {
  line_ratio: 0.55, orientation: 'h', invert: false,
  start_seconds: 0, max_seconds: 10, conf: 0.35, stride: 1, proc_width: 640,
  finetuned: false, min_age: 0,
}

export interface ModelVariant {
  id:        string
  name:      string
  desc:      string
  available: boolean
}

/** {methodId: variants} — which weight sets each method can run. */
export async function fetchModelVariants(lang = 'ru'): Promise<Record<string, ModelVariant[]>> {
  const r = await fetch(`${BACKEND}/models?lang=${lang}`)
  return await r.json()
}

/** Method ids that have top-view fine-tuned weights on disk. */
export function finetunedMethods(models: Record<string, ModelVariant[]>): string[] {
  return Object.entries(models)
    .filter(([, vs]) => vs.some(v => v.id === 'topview' && v.available))
    .map(([m]) => m)
}

function qs(params: RunParams, methods: string[], extra?: ParamValues): string {
  const q = new URLSearchParams({
    methods:       methods.join(','),
    line_ratio:    String(params.line_ratio),
    orientation:   params.orientation,
    invert:        String(params.invert),
    start_seconds: String(params.start_seconds),
    max_seconds:   String(params.max_seconds),
    conf:          String(params.conf),
    stride:        String(params.stride),
    proc_width:    String(params.proc_width),
    finetuned:     String(params.finetuned),
    min_age:       String(params.min_age),
  })
  if (extra && Object.keys(extra).length) q.set('params', JSON.stringify(extra))
  return q.toString()
}

/** Method prose lives on the backend, so the language travels with the request. */
export async function fetchMethods(lang = 'ru'): Promise<MethodInfo[]> {
  const r = await fetch(`${BACKEND}/methods?lang=${lang}`)
  return (await r.json()).methods
}

export async function fetchSamples(lang = 'ru'): Promise<SampleInfo[]> {
  const r = await fetch(`${BACKEND}/samples?lang=${lang}`)
  return (await r.json()).samples
}

export async function fetchThumb(sampleId: number, at: number): Promise<string> {
  const r = await fetch(`${BACKEND}/sample/${sampleId}/thumb?at=${at}`)
  const d = await r.json()
  return d.image_b64 ?? ''
}

/** Returns { methodId: jobId }. */
export async function runSample(
  sampleId: number, methods: string[], params: RunParams, extra?: ParamValues,
): Promise<Record<string, string>> {
  const r = await fetch(`${BACKEND}/sample/${sampleId}/run?${qs(params, methods, extra)}`,
    { method: 'POST' })
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.jobs
}

export async function runUpload(
  file: File, methods: string[], params: RunParams, extra?: ParamValues,
): Promise<Record<string, string>> {
  const form = new FormData()
  form.append('file', file)
  const r = await fetch(`${BACKEND}/compare?${qs(params, methods, extra)}`,
    { method: 'POST', body: form })
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.jobs
}

export async function fetchJob(jobId: string): Promise<JobState> {
  const r = await fetch(`${BACKEND}/job/${jobId}`)
  return await r.json()
}

export const videoUrl = (jobId: string) => `${BACKEND}/job/${jobId}/video`

// ─── Ground-truth benchmarks ──────────────────────────────────────────────────

export const BENCHMARKS = `${BACKEND}/benchmarks`

export interface GtEvent { t: number; type: 'in' | 'out' }

export interface Benchmark {
  id:            string
  clip:          string
  sample_id:     number
  start_seconds: number
  end_seconds:   number
  line_ratio:    number
  orientation:   string
  invert:        boolean
  note:          string
  events:        GtEvent[]
  in_count:      number
  out_count:     number
}

export interface BenchmarkTotals {
  count: number; in: number; out: number; seconds: number
}

export interface FrameStrip {
  start:  number
  fps:    number
  count:  number
  frames: string[]   // base64 JPEG, no data: prefix
}

/** Decode a segment server-side into frames — see the /strip endpoint for why. */
export async function fetchStrip(
  sampleId: number, start: number, end: number, fps = 10, width = 640,
): Promise<FrameStrip> {
  const q = new URLSearchParams({
    start: String(start), end: String(end), fps: String(fps), width: String(width),
  })
  const r = await fetch(`${BACKEND}/sample/${sampleId}/strip?${q}`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d
}

export async function fetchBenchmarks(): Promise<{ benchmarks: Benchmark[]; totals: BenchmarkTotals }> {
  const r = await fetch(`${BACKEND}/benchmarks`)
  return await r.json()
}

export async function saveBenchmark(rec: Omit<Benchmark, 'id' | 'in_count' | 'out_count'>): Promise<Benchmark> {
  const r = await fetch(`${BACKEND}/benchmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rec),
  })
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.saved
}

export async function deleteBenchmark(id: string): Promise<boolean> {
  const r = await fetch(`${BACKEND}/benchmarks/${id}`, { method: 'DELETE' })
  return (await r.json()).deleted === true
}
