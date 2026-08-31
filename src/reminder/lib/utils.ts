import { Language } from './i18n'
import { Lesson, ReminderIntent } from './types'

export const localeByLanguage: Record<Language, string> = {
  en: 'en',
  pt: 'pt-BR',
  es: 'es',
}

export const formatDateTime = (value: string, language: Language, timeZone: string) =>
  new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value))

export const formatShortDate = (value: string, language: Language, timeZone: string) =>
  new Intl.DateTimeFormat(localeByLanguage[language], {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value))

export const sortByDateAsc = (a: Lesson, b: Lesson) =>
  new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()

export const sortByDateDesc = (a: Lesson, b: Lesson) =>
  new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()

export const minutesUntil = (from: Date, to: string) => Math.round((new Date(to).getTime() - from.getTime()) / 60000)

export const statusLabel = (lesson: Lesson) => {
  if (lesson.teacher_lesson_status === 'student_no_show') return 'Student did not show up'
  if (lesson.teacher_lesson_status === 'happened') return 'Lesson happened'
  if (lesson.teacher_lesson_status === 'not_happened') return 'Lesson did not happen'
  if (lesson.student_lesson_status === 'done') return 'Student marked done'
  if (lesson.student_lesson_status === 'not_done') return 'Student marked not done'
  if (lesson.student_attendance === 'attend') return 'Student confirmed attendance'
  if (lesson.student_attendance === 'cancel') return 'Student requested cancellation'
  return 'Awaiting response'
}

export const badgeClass = (value: string) => {
  if (value.includes('confirmed') || value.includes('happened') || value.includes('done')) return 'badge badge-success'
  if (value.includes('cancel') || value.includes('not happen') || value.includes('not done') || value.includes('did not show')) {
    return 'badge badge-danger'
  }
  return 'badge badge-neutral'
}

export const applyIntentToLesson = (intent: ReminderIntent): Partial<Lesson> => {
  switch (intent) {
    case 'attend':
      return { student_attendance: 'attend' }
    case 'cancel':
      return { student_attendance: 'cancel' }
    case 'done':
      return { student_lesson_status: 'done' }
    case 'not_done':
      return { student_lesson_status: 'not_done' }
    case 'happened':
      return { teacher_lesson_status: 'happened' }
    case 'not_happened':
      return { teacher_lesson_status: 'not_happened' }
    case 'student_no_show':
      return { teacher_lesson_status: 'student_no_show' }
  }
}

export const getStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))

const NOTIFICATION_KEY = 'lesson-reminder-sent-keys'

export const getStoredNotificationKeys = () => {
  const stored = localStorage.getItem(NOTIFICATION_KEY)
  return stored ? (JSON.parse(stored) as string[]) : []
}

export const storeNotificationKeys = (keys: string[]) => {
  localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(keys))
}

const pad2 = (value: number) => value.toString().padStart(2, '0')

const zonedPartsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

export const getZonedParts = (date: Date, timeZone: string) => {
  try {
    const parts = zonedPartsFormatter(timeZone).formatToParts(date)
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return {
      year: Number(byType.year),
      month: Number(byType.month),
      day: Number(byType.day),
      hour: Number(byType.hour),
      minute: Number(byType.minute),
      second: Number(byType.second),
    }
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    }
  }
}

export const isoToDateTimeLocal = (isoString?: string | null, timeZone = 'UTC'): string => {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''
  const parts = getZonedParts(date, timeZone)
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}`
}

export const dateTimeLocalToIso = (dateTimeLocal: string, timeZone = 'UTC'): string => {
  if (!dateTimeLocal) return new Date().toISOString()
  if (dateTimeLocal.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateTimeLocal)) {
    return new Date(dateTimeLocal).toISOString()
  }
  const [datePart, timePart = '00:00'] = dateTimeLocal.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)

  try {
    const parts = getZonedParts(new Date(utcGuess), timeZone)
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    const offset = (asUtc - utcGuess) / 60000
    let timestamp = utcGuess - offset * 60000
    const nextParts = getZonedParts(new Date(timestamp), timeZone)
    const nextAsUtc = Date.UTC(nextParts.year, nextParts.month - 1, nextParts.day, nextParts.hour, nextParts.minute, nextParts.second)
    const nextOffset = (nextAsUtc - timestamp) / 60000
    if (nextOffset !== offset) {
      timestamp = utcGuess - nextOffset * 60000
    }
    return new Date(timestamp).toISOString()
  } catch {
    return new Date(utcGuess).toISOString()
  }
}

