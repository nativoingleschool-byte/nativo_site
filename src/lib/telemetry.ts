import { track } from '@vercel/analytics'
import { supabase } from '../reminder/lib/supabase'

export interface TelemetryEventOptions {
  userRole?: string
  userId?: string
  skipDatabase?: boolean
}

/**
 * Tracks an application event across Vercel Web Analytics and Supabase activity_logs.
 * Safely handles unauthenticated sessions, offline mode, or network errors without throwing.
 */
export async function trackEvent(
  eventName: string,
  eventData: Record<string, any> = {},
  options: TelemetryEventOptions = {}
): Promise<void> {
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
 * Tracks SPA route changes in Vercel Analytics.
 */
export function trackPageView(path: string): void {
  try {
    track('page_view', { path })
  } catch (err) {
    console.debug('[Telemetry] page_view error:', err)
  }
}
