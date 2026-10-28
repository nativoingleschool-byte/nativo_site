/**
 * Central School Google Calendar API Service
 *
 * Uses OAuth2 Refresh Token credentials for the school's central Google account
 * to create, update, and delete class events and teacher availability blocks.
 * Automatically invites teacher and student emails (`sendUpdates=all`) so events
 * appear on their personal Google Calendars with the existing Zoom link.
 */

let cachedAccessToken = null
let cachedTokenExpiresAt = 0

export const getGoogleCalendarConfig = () => {
  const clientId = (process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim()
  const refreshToken = (process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || '').trim()
  const calendarId = (process.env.GOOGLE_CALENDAR_ID || 'primary').trim()
  const availabilityCalendarId = (process.env.GOOGLE_AVAILABILITY_CALENDAR_ID || calendarId).trim()

  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId,
    availabilityCalendarId,
    configured: Boolean(clientId && clientSecret && refreshToken),
  }
}

export const isGoogleCalendarConfigured = () => getGoogleCalendarConfig().configured

const isRealAttendeeEmail = (email) => {
  if (!email || typeof email !== 'string') return false
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes('@')) return false
  if (
    normalized.endsWith('@setup.local') ||
    normalized.endsWith('@preview.invalid') ||
    normalized.endsWith('@example.com')
  ) {
    return false
  }
  return true
}

const getAccessToken = async () => {
  const config = getGoogleCalendarConfig()
  if (!config.configured) return null

  const now = Date.now()
  if (cachedAccessToken && cachedTokenExpiresAt - 60000 > now) {
    return cachedAccessToken
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Google OAuth token exchange failed (${response.status}): ${errText}`)
  }

  const data = await response.json()
  cachedAccessToken = data.access_token
  cachedTokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000
  return cachedAccessToken
}

const googleCalendarFetch = async (calendarId, path, options = {}) => {
  const token = await getAccessToken()
  if (!token) return null

  const encodedCalId = encodeURIComponent(calendarId || 'primary')
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (response.status === 204 || response.status === 404 || response.status === 410) {
    return { deletedOrMissing: true, status: response.status }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Google Calendar API error (${response.status}): ${errText}`)
  }

  return response.json()
}

/**
 * Groups individual student lesson rows into logical class sessions
 * (by teacher_id + starts_at + subject + class_name) so a multi-student turma
 * produces a single Google Calendar event with all students and the teacher invited.
 */
const groupLessonRowsIntoSessions = (lessonRows) => {
  const map = new Map()
  for (const row of lessonRows || []) {
    if (!row || !row.starts_at) continue
    const key = [
      row.teacher_id || 'no-teacher',
      new Date(row.starts_at).toISOString(),
      (row.subject || '').trim(),
      (row.class_name || '').trim(),
    ].join('|')
    const list = map.get(key) || []
    list.push(row)
    map.set(key, list)
  }
  return Array.from(map.values())
}

const buildClassEventPayload = ({ sessionRows, profilesById }) => {
  const first = sessionRows[0]
  const start = new Date(first.starts_at)
  const durationMinutes = Number(first.duration_minutes) || 60
  const end = new Date(start.getTime() + durationMinutes * 60000)

  const teacherProfile = profilesById.get(first.teacher_id)
  const studentProfiles = sessionRows
    .map((r) => profilesById.get(r.student_id))
    .filter(Boolean)

  const studentNames = studentProfiles.map((s) => s.full_name).filter(Boolean)
  const subject = (first.subject || 'Aula de Inglês').trim()
  const className = (first.class_name || '').trim()

  const summaryParts = ['[Nativo]', subject]
  if (className) {
    summaryParts.push(`· ${className}`)
  } else if (studentNames.length === 1) {
    summaryParts.push(`· ${studentNames[0]}`)
  } else if (studentNames.length > 1) {
    summaryParts.push(`(${studentNames.length} alunos)`)
  }

  const meetingUrl = (first.meeting_url || '').trim()
  const descriptionLines = [
    `Aula Nativo English — ${subject}`,
    teacherProfile?.full_name ? `Professor(a): ${teacherProfile.full_name}` : '',
    studentNames.length > 0 ? `Aluno(s): ${studentNames.join(', ')}` : '',
    meetingUrl ? `\nLink da Aula (Zoom): ${meetingUrl}` : '',
  ].filter(Boolean)

  const attendeeEmails = new Set()
  if (teacherProfile && isRealAttendeeEmail(teacherProfile.email)) {
    attendeeEmails.add(teacherProfile.email.trim().toLowerCase())
  }
  for (const student of studentProfiles) {
    if (isRealAttendeeEmail(student.email)) {
      attendeeEmails.add(student.email.trim().toLowerCase())
    }
  }

  const attendees = Array.from(attendeeEmails).map((email) => ({ email }))

  return {
    summary: summaryParts.join(' '),
    description: descriptionLines.join('\n'),
    location: meetingUrl || undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees,
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'email', minutes: 240 },
      ],
    },
  }
}

/**
 * Creates or updates Google Calendar events for one or more lesson rows,
 * and stores the resulting `google_event_id` on `public.lessons`.
 */
export const syncLessonsToGoogleCalendar = async (db, lessonRows) => {
  if (!isGoogleCalendarConfigured() || !Array.isArray(lessonRows) || lessonRows.length === 0) {
    return lessonRows
  }

  try {
    const config = getGoogleCalendarConfig()
    const profileIds = Array.from(
      new Set(
        lessonRows
          .flatMap((r) => [r.teacher_id, r.student_id])
          .filter(Boolean)
      )
    )

    const profilesById = new Map()
    if (profileIds.length > 0) {
      const { data: profiles } = await db
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', profileIds)
      for (const p of profiles || []) {
        profilesById.set(p.id, p)
      }
    }

    const sessions = groupLessonRowsIntoSessions(lessonRows)

    for (const sessionRows of sessions) {
      const existingEventId = sessionRows.map((r) => r.google_event_id).find(Boolean) || null
      const eventPayload = buildClassEventPayload({ sessionRows, profilesById })

      let googleEvent = null
      if (existingEventId) {
        googleEvent = await googleCalendarFetch(
          config.calendarId,
          `/events/${encodeURIComponent(existingEventId)}?sendUpdates=all`,
          {
            method: 'PATCH',
            body: JSON.stringify(eventPayload),
          }
        )
      }

      if (!googleEvent || googleEvent.deletedOrMissing) {
        googleEvent = await googleCalendarFetch(
          config.calendarId,
          `/events?sendUpdates=all`,
          {
            method: 'POST',
            body: JSON.stringify(eventPayload),
          }
        )
      }

      const eventId = googleEvent?.id || null
      if (eventId) {
        const rowIds = sessionRows.map((r) => r.id).filter(Boolean)
        for (const r of sessionRows) {
          r.google_event_id = eventId
        }
        if (rowIds.length > 0) {
          await db
            .from('lessons')
            .update({ google_event_id: eventId })
            .in('id', rowIds)
            .catch(() => {})
        }
      }
    }
  } catch (err) {
    console.warn('[google-calendar] Non-fatal lesson sync warning:', err?.message || err)
  }

  return lessonRows
}

/**
 * Deletes one or more Google Calendar events by ID (`sendUpdates=all` so
 * cancelled classes are removed from teachers' and students' personal calendars).
 */
export const deleteGoogleCalendarEvents = async (eventIds, calendarIdOverride = null) => {
  if (!isGoogleCalendarConfigured() || !Array.isArray(eventIds)) return
  const uniqueIds = Array.from(new Set(eventIds.filter(Boolean)))
  if (uniqueIds.length === 0) return

  const config = getGoogleCalendarConfig()
  const targetCalendarId = calendarIdOverride || config.calendarId

  for (const eventId of uniqueIds) {
    try {
      await googleCalendarFetch(
        targetCalendarId,
        `/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        { method: 'DELETE' }
      )
    } catch (err) {
      console.warn('[google-calendar] Non-fatal event delete warning:', err?.message || err)
    }
  }
}

/**
 * Syncs website-created teacher availability slots to the school's availability
 * Google Calendar (without inviting students).
 */
export const syncAvailabilitiesToGoogleCalendar = async (db, availRows) => {
  if (!isGoogleCalendarConfigured() || !Array.isArray(availRows) || availRows.length === 0) {
    return availRows
  }

  try {
    const config = getGoogleCalendarConfig()
    const teacherIds = Array.from(new Set(availRows.map((a) => a.teacher_id).filter(Boolean)))
    const profilesById = new Map()
    if (teacherIds.length > 0) {
      const { data: profiles } = await db
        .from('profiles')
        .select('id, full_name, email')
        .in('id', teacherIds)
      for (const p of profiles || []) {
        profilesById.set(p.id, p)
      }
    }

    for (const avail of availRows) {
      const start = new Date(avail.starts_at)
      const duration = Number(avail.duration_minutes) || 60
      const end = new Date(start.getTime() + duration * 60000)
      const teacher = profilesById.get(avail.teacher_id)
      const teacherName = teacher?.full_name || 'Professor'

      const payload = {
        summary: `🟢 Disponível · ${teacherName}`,
        description: `Horário disponível cadastrado no portal Nativo English para ${teacherName}.`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        transparency: 'transparent',
      }

      const created = await googleCalendarFetch(
        config.availabilityCalendarId,
        `/events?sendUpdates=none`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      )

      if (created?.id && avail.id) {
        avail.google_event_id = created.id
        await db
          .from('teacher_availability')
          .update({ google_event_id: created.id })
          .eq('id', avail.id)
          .catch(() => {})
      }
    }
  } catch (err) {
    console.warn('[google-calendar] Non-fatal availability sync warning:', err?.message || err)
  }

  return availRows
}

export const deleteAvailabilityGoogleEvents = async (eventIds) => {
  const config = getGoogleCalendarConfig()
  return deleteGoogleCalendarEvents(eventIds, config.availabilityCalendarId)
}
