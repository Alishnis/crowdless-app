import { motion } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import { Bus } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

interface NavItem {
  label: string
  path: string
  anchor?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Главная',     path: '/'        },
  { label: 'Возможности', path: '/', anchor: '#features' },
  { label: 'Монитор',     path: '/monitor' },
]

const SECTION_IDS = ['features']

export default function Navbar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [activeSection, setActiveSection] = useState('')
  const intersecting = useRef(new Set<string>())

  // Track which landing-page section is currently in the viewport
  useEffect(() => {
    if (location.pathname !== '/') {
      setActiveSection('')
      return
    }

    intersecting.current.clear()
    const observers: IntersectionObserver[] = []

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id)
      if (!el) return

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            intersecting.current.add(id)
          } else {
            intersecting.current.delete(id)
          }
          // Prefer the first section in DOM order that is visible
          const first = SECTION_IDS.find((s) => intersecting.current.has(s))
          setActiveSection(first ?? '')
        },
        // rootMargin offsets the fixed navbar height so detection starts below it
        { threshold: 0.25, rootMargin: '-64px 0px 0px 0px' },
      )

      obs.observe(el)
      observers.push(obs)
    })

    return () => {
      observers.forEach((o) => o.disconnect())
      intersecting.current.clear()
    }
  }, [location.pathname])

  function handleNav(item: NavItem) {
    if (item.anchor) {
      if (location.pathname !== '/') {
        navigate('/')
        setTimeout(() => {
          document.querySelector(item.anchor!)?.scrollIntoView({ behavior: 'smooth' })
        }, 120)
      } else {
        document.querySelector(item.anchor)?.scrollIntoView({ behavior: 'smooth' })
      }
    } else {
      navigate(item.path)
    }
  }

  function isActive(item: NavItem): boolean {
    if (item.anchor) {
      // Active when its section is in the viewport
      return location.pathname === '/' && activeSection === item.anchor.slice(1)
    }
    if (item.path === '/') {
      // "Главная" is active when on home and no section is highlighted
      return location.pathname === '/' && activeSection === ''
    }
    return location.pathname === item.path
  }

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-md bg-card/80 border-b border-border"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div className="max-w-6xl mx-auto h-full px-6 flex items-center justify-between">

        {/* Logo */}
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 gradient-bg rounded-lg flex items-center justify-center shadow-accent transition-transform duration-200 group-hover:scale-105">
            <Bus size={16} className="text-white" />
          </div>
          <span className="font-sans font-semibold text-foreground text-lg tracking-tight">
            CrowdLess
          </span>
        </button>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item)
            return (
              <button
                key={item.label}
                onClick={() => handleNav(item)}
                className={`relative px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                  active
                    ? 'text-accent font-medium bg-accent/8'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {item.label}

                {/* Animated underline indicator */}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full gradient-bg"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </nav>

        {/* CTA */}
        <button
          onClick={() => navigate('/monitor')}
          className="gradient-bg text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-accent-lg active:scale-[0.98]"
        >
          Открыть монитор →
        </button>
      </div>
    </motion.nav>
  )
}
