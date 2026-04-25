import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, MapPin } from 'lucide-react'
import type { City } from '../../services/cities'

interface Props {
  cities: City[]
  selected: City
  onSelect: (city: City) => void
}

export default function CitySelector({ cities, selected, onSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [isOpen])

  function handleSelect(city: City) {
    onSelect(city)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center gap-2.5 bg-foreground/85 backdrop-blur-md border border-white/15 rounded-xl px-4 py-2 text-white text-sm font-medium transition-colors duration-200 hover:border-accent/40 hover:bg-foreground/95"
      >
        <MapPin size={13} className="text-accent shrink-0" />
        <span>{selected.name}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/40"
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>

      {/* Dropdown list */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-44 bg-foreground/95 backdrop-blur-md border border-white/15 rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.5)] z-[300]"
          >
            <ul className="max-h-64 overflow-y-auto py-1 scrollbar-none">
              {cities.map((city) => {
                const active = city.name === selected.name
                return (
                  <li key={city.name}>
                    <button
                      onClick={() => handleSelect(city)}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors duration-150 flex items-center justify-between gap-2 ${
                        active
                          ? 'text-accent bg-accent/10'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {city.name}
                      {active && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
