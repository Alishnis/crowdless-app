import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react'
import type { ReactNode } from 'react'
import { en } from './en'
import { ru } from './ru'

export type Lang = 'ru' | 'en'

const DICTS: Record<Lang, Record<string, string>> = { ru, en }
const STORAGE_KEY = 'crowdless.lang'

/** Russian unless the browser clearly prefers English. */
function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ru' || saved === 'en') return saved
  } catch { /* private mode — fall through to the browser hint */ }
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('en')
    ? 'en' : 'ru'
}

interface Ctx {
  lang: Lang
  setLang: (l: Lang) => void
  /** Look up a key; `vars` fills {placeholders}. Missing keys fall back to ru. */
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<Ctx | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* not critical */ }
    document.documentElement.lang = lang
    document.title = DICTS[lang]['doc.title'] ?? document.title
  }, [lang])

  const setLang = useCallback((l: Lang) => setLangState(l), [])

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    // Falling back to ru rather than to the raw key keeps a half-translated
    // build readable instead of sprinkling it with dotted identifiers.
    let s = DICTS[lang][key] ?? DICTS.ru[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    }
    return s
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useI18n(): Ctx {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>')
  return ctx
}

/** Shorthand for components that only need the lookup function. */
export function useT() {
  return useI18n().t
}
