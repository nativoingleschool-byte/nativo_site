import { createClient, SupportedStorage } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://olgfgsbrnrpbatjgdjfj.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sZ2Znc2JybnJwYmF0amdkamZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTQ5MTMsImV4cCI6MjA5NzQzMDkxM30.RA3TG_HjReuKQqLAEWBDH36esRb1vI6sXTkX8x5bj6c'

export const isSupabaseConfigured = Boolean(supabaseUrl) && Boolean(supabaseAnonKey)

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

/**
 * Ensures the session token is valid and refreshed if expired or close to expiry.
 */
export async function getFreshSessionToken(): Promise<string> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session) return ''

    // If token is expired or within 60s of expiring, proactively refresh it
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError && refreshed.session?.access_token) {
        return refreshed.session.access_token
      }
    }

    return session.access_token || ''
  } catch {
    return ''
  }
}
