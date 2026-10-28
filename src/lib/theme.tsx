import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'nativo_theme_preference'

interface ThemeContextValue {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw
    }
  } catch {
    // Ignore storage read errors
  }
  return 'system'
}

const applyResolvedThemeToDom = (resolved: ResolvedTheme, mode: ThemeMode) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
  root.setAttribute('data-theme', resolved)
  root.setAttribute('data-theme-mode', mode)
  root.style.colorScheme = resolved
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getStoredThemeMode())
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const resolvedTheme: ResolvedTheme = themeMode === 'system' ? systemTheme : themeMode

  useEffect(() => {
    applyResolvedThemeToDom(resolvedTheme, themeMode)
  }, [resolvedTheme, themeMode])

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, mode)
      } catch {
        // Ignore storage write errors
      }
    }
  }

  const toggleTheme = () => {
    setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  const value = useMemo(
    () => ({
      themeMode,
      resolvedTheme,
      setThemeMode,
      toggleTheme,
    }),
    [themeMode, resolvedTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    const fallbackResolved = getSystemTheme()
    return {
      themeMode: 'system',
      resolvedTheme: fallbackResolved,
      setThemeMode: (mode: ThemeMode) => {
        const nextResolved = mode === 'system' ? getSystemTheme() : mode
        applyResolvedThemeToDom(nextResolved, mode)
      },
      toggleTheme: () => {
        const nextResolved = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
        applyResolvedThemeToDom(nextResolved, nextResolved)
      },
    }
  }
  return ctx
}

export interface ThemeToggleProps {
  lang?: 'pt' | 'en' | 'es'
  className?: string
  showLabels?: boolean
}

export function ThemeToggle({ lang = 'pt', className = '', showLabels = false }: ThemeToggleProps) {
  const { themeMode, setThemeMode } = useTheme()

  const labels =
    lang === 'es'
      ? { light: 'Claro', dark: 'Oscuro', system: 'Sistema', group: 'Tema del sitio' }
      : lang === 'en'
      ? { light: 'Light', dark: 'Dark', system: 'System', group: 'Site theme' }
      : { light: 'Claro', dark: 'Escuro', system: 'Sistema', group: 'Tema do site' }

  const options: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
    { mode: 'light', label: labels.light, icon: Sun },
    { mode: 'dark', label: labels.dark, icon: Moon },
    { mode: 'system', label: labels.system, icon: Monitor },
  ]

  return (
    <div
      role="group"
      aria-label={labels.group}
      className={`nativo-theme-toggle ${className}`.trim()}
    >
      {options.map(({ mode, label, icon: Icon }) => {
        const isActive = themeMode === mode
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setThemeMode(mode)}
            title={`${labels.group}: ${label}`}
            aria-label={`${labels.group}: ${label}`}
            aria-pressed={isActive}
            className={`nativo-theme-toggle__btn${isActive ? ' is-active' : ''}`}
          >
            <Icon size={14} strokeWidth={isActive ? 2.3 : 1.9} aria-hidden="true" />
            {showLabels && <span>{label}</span>}
          </button>
        )
      })}
    </div>
  )
}
