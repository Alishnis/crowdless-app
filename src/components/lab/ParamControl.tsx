import type { MethodParam, ParamValues } from '../../services/counters'

interface Props {
  param:  MethodParam
  value:  string | number | boolean
  onChange: (v: string | number | boolean) => void
}

/** Renders one backend-declared knob. Adding a param server-side needs no edit here. */
export default function ParamControl({ param, value, onChange }: Props) {
  const { label, type, hint, options, min, max, step } = param

  if (type === 'bool') {
    return (
      <label className="flex items-start gap-2 cursor-pointer group">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 accent-accent"
        />
        <span className="min-w-0">
          <span className="block text-[11px] group-hover:text-accent transition-colors">{label}</span>
          {hint && <span className="block text-[10px] text-muted-foreground leading-snug">{hint}</span>}
        </span>
      </label>
    )
  }

  if (type === 'select') {
    return (
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">{label}</label>
        <select
          value={String(value)}
          onChange={e => {
            const opt = options?.find(o => String(o.value) === e.target.value)
            onChange(opt ? opt.value : e.target.value)
          }}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs
                     focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {options?.map(o => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
        {hint && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
      </div>
    )
  }

  // float | int
  const num = Number(value)
  const decimals = type === 'float' && step && step < 0.01 ? 3 : type === 'float' ? 2 : 0
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{num.toFixed(decimals)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step ?? (type === 'int' ? 1 : 0.01)}
        value={num}
        onChange={e => onChange(type === 'int' ? parseInt(e.target.value, 10) : Number(e.target.value))}
        className="w-full accent-accent"
      />
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
    </div>
  )
}

/** Have any knobs been moved off the backend's defaults? */
export function isModified(params: MethodParam[], values: ParamValues): boolean {
  return params.some(p => values[p.key] !== undefined && values[p.key] !== p.default)
}
