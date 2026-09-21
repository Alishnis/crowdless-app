import { useCallback, useRef } from 'react'
import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  thumb:       string          // base64 jpeg, no data: prefix
  lineRatio:   number
  orientation: 'h' | 'v'
  invert:      boolean
  onLineChange: (ratio: number) => void
}

/** The frame with the counting line drawn on it — click or drag to place it. */
export default function LinePreview({
  thumb, lineRatio, orientation, invert, onLineChange,
}: Props) {
  const t       = useT()
  const boxRef  = useRef<HTMLDivElement>(null)
  const dragRef = useRef(false)

  const setFromEvent = useCallback((clientX: number, clientY: number) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const ratio = orientation === 'h'
      ? (clientY - r.top) / r.height
      : (clientX - r.left) / r.width
    onLineChange(Math.min(0.95, Math.max(0.05, Number(ratio.toFixed(3)))))
  }, [orientation, onLineChange])

  if (!thumb) {
    return (
      <div className="aspect-video rounded-xl bg-muted grid place-items-center
                      border border-border text-sm text-muted-foreground">
        {t('lab.line.frame')}
      </div>
    )
  }

  const Arrow = orientation === 'h'
    ? (invert ? ArrowUp : ArrowDown)
    : (invert ? ArrowLeft : ArrowRight)

  const pct = `${lineRatio * 100}%`

  return (
    <div
      ref={boxRef}
      className="relative rounded-xl overflow-hidden border border-border select-none
                 cursor-crosshair touch-none"
      onPointerDown={e => {
        dragRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        setFromEvent(e.clientX, e.clientY)
      }}
      onPointerMove={e => { if (dragRef.current) setFromEvent(e.clientX, e.clientY) }}
      onPointerUp={e => {
        dragRef.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
    >
      <img src={`data:image/jpeg;base64,${thumb}`} alt={t('lab.line')} className="w-full block" draggable={false} />

      {/* Counting line */}
      {orientation === 'h' ? (
        <>
          <div className="absolute left-0 right-0 h-px bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.9)]"
               style={{ top: pct }} />
          <div className="absolute left-0 right-0 bg-green-400/10 pointer-events-none"
               style={{ top: `calc(${pct} - 3%)`, height: '6%' }} />
        </>
      ) : (
        <>
          <div className="absolute top-0 bottom-0 w-px bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.9)]"
               style={{ left: pct }} />
          <div className="absolute top-0 bottom-0 bg-green-400/10 pointer-events-none"
               style={{ left: `calc(${pct} - 3%)`, width: '6%' }} />
        </>
      )}

      {/* Which way counts as "entered" */}
      <div
        className="absolute flex items-center gap-1 px-2 py-1 rounded-md bg-green-500 text-white
                   text-[10px] font-mono font-bold pointer-events-none whitespace-nowrap"
        style={orientation === 'h'
          ? { top: `calc(${pct} + 6px)`, left: '50%', transform: 'translateX(-50%)' }
          : { left: `calc(${pct} + 6px)`, top: '50%', transform: 'translateY(-50%)' }}
      >
        <Arrow size={11} /> {t('lab.line.entered')}
      </div>

      <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-black/70 text-white
                      text-[10px] font-mono pointer-events-none">
        {t('lab.line.hint', { pct: (lineRatio * 100).toFixed(0) })}
      </div>
    </div>
  )
}
