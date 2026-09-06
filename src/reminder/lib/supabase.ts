import { createClient, SupportedStorage } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-anon-key'

export const isSupabaseConfigured =
  Boolean(import.meta.env.VITE_SUPABASE_URL) && Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY)

const authStorage: SupportedStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null
    try {
      const keep = localStorage.getItem('nativo_keep_logged_in')
      if (keep === 'false') {
        return sessionStorage.getItem(key)
      }
      return localStorage.getItem(key) || sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return
    try {
      const keep = localStorage.getItem('nativo_keep_logged_in')
      if (keep === 'false') {
        sessionStorage.setItem(key, value)
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, value)
        sessionStorage.removeItem(key)
      }
    } catch {
      // ignore quota or privacy mode errors
    }
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      // ignore
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
})
