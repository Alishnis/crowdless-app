import { useI18n } from '../../i18n'
import type { Lang } from '../../i18n'

const LANGS: { id: Lang; short: string }[] = [
  { id: 'ru', short: 'RU' },
  { id: 'en', short: 'EN' },
]

/** Two-state RU/EN pill. The choice is remembered in localStorage. */
export default function LanguageSwitch() {
  const { lang, setLang, t } = useI18n()

  return (
    <div
      role="group"
      aria-label={t('nav.language')}
      className="flex items-center rounded-lg border border-border overflow-hidden"
    >
      {LANGS.map(l => (
        <button
          key={l.id}
          onClick={() => setLang(l.id)}
          aria-pressed={lang === l.id}
          className={`px-2.5 py-1.5 text-[11px] font-mono font-medium transition-colors ${
            lang === l.id
              ? 'bg-accent text-white'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {l.short}
        </button>
      ))}
    </div>
  )
}
