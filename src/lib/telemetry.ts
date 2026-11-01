import { track } from '@vercel/analytics'
import { supabase } from '../reminder/lib/supabase'

export interface TelemetryEventOptions {
  userRole?: string
  userId?: string
  skipDatabase?: boolean
}

// In-memory cache to debounce/deduplicate rapid successive events (e.g. double-clicks, duplicate logins)
const recentEvents = new Map<string, number>()
const DEFAULT_DEBOUNCE_MS = 3000

function isRecentDuplicate(key: string, windowMs = DEFAULT_DEBOUNCE_MS): boolean {
  const now = Date.now()
  const previous = recentEvents.get(key)
  if (previous && now - previous < windowMs) {
    return true
  }
  recentEvents.set(key, now)

  // Prevent memory accumulation over long sessions
  if (recentEvents.size > 200) {
    for (const [k, timestamp] of recentEvents.entries()) {
      if (now - timestamp > 30000) {
        recentEvents.delete(k)
      }
    }
  }
  return false
}

/**
 * Tracks an application event across Vercel Web Analytics and Supabase activity_logs.
 * Safely handles unauthenticated sessions, offline mode, or network errors without throwing.
 * Automatically deduplicates duplicate triggers within a 3-second debounce window.
 */
export async function trackEvent(
  eventName: string,
  eventData: Record<string, any> = {},
  options: TelemetryEventOptions = {}
): Promise<void> {
  const dedupeKey = `${eventName}:${options.userId || ''}:${JSON.stringify(eventData)}`
  if (isRecentDuplicate(dedupeKey)) {
    return
  }

  // 1. Send to Vercel Web Analytics
  try {
    track(eventName, eventData)
  } catch (err) {
    // Vercel analytics handles errors internally, but guard just in case
    console.debug('[Telemetry] Vercel track error:', err)
  }

  // 2. If user is authenticated and skipDatabase is not set, log to Supabase activity_logs
  if (options.skipDatabase) {
    return
  }

  try {
    const { data } = await supabase.auth.getSession()
    const sessionUser = data?.session?.user

    if (sessionUser) {
      const payload: Record<string, any> = {
        user_id: sessionUser.id,
        user_role: options.userRole || null,
        event_name: eventName,
        event_data: eventData,
      }

      const { error } = await supabase.from('activity_logs').insert(payload)
      if (error) {
        console.debug('[Telemetry] activity_logs insert notice:', error.message)
      }
    }
  } catch (err) {
    // Silent catch: operational logging should never break user interaction
    console.debug('[Telemetry] Database logging notice:', err)
  }
}

/**
 * Tracks SPA route and tab changes in Vercel Analytics with a 1-second debounce.
 */
export function trackPageView(path: string, _options: TelemetryEventOptions = {}): void {
  const dedupeKey = `page_view:${path}`
  if (isRecentDuplicate(dedupeKey, 1000)) {
    return
  }
  try {
    track('page_view', { path })
  } catch (err) {
    console.debug('[Telemetry] page_view error:', err)
  }
}

