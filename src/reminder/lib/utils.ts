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

export type TeacherLessonSession = {
  key: string
  starts_at: string
  ends_at: string
  duration_minutes: number
  subject: string
  class_name: string
  student_ids: string[]
  lessons: Lesson[]
  teacher_id: string
  is_happened: boolean
  is_cancelled: boolean
  is_scheduled: boolean
  is_no_show: boolean
}

export const groupLessonsIntoTeacherSessions = (lessons: Lesson[]): TeacherLessonSession[] => {
  const map = new Map<string, Lesson[]>()

  lessons.forEach((l) => {
    if (!l.starts_at) return
    const key = `${l.teacher_id || 'no-teacher'}|${l.starts_at}`
    const existing = map.get(key) || []
    existing.push(l)
    map.set(key, existing)
  })

  const sessions: TeacherLessonSession[] = []

  map.forEach((groupedLessons, key) => {
    const first = groupedLessons[0]
    const maxDuration = Math.max(...groupedLessons.map((l) => l.duration_minutes || 60))
    const studentIds = Array.from(new Set(groupedLessons.map((l) => l.student_id).filter(Boolean)))

    const is_happened = groupedLessons.some(
      (l) => l.teacher_lesson_status === 'happened' || l.status === 'concluida'
    )

    const is_cancelled = groupedLessons.every(
      (l) => l.status === 'cancelada' || l.teacher_lesson_status === 'not_happened' || l.status === 'proposta_pendente'
    )

    const is_no_show =
      !is_happened &&
      !is_cancelled &&
      groupedLessons.every((l) => l.teacher_lesson_status === 'student_no_show')

    const is_scheduled = !is_happened && !is_cancelled && !is_no_show
    const startsAtDate = first.starts_at ? new Date(first.starts_at) : new Date()
    const computedEndsAt = first.ends_at || new Date(startsAtDate.getTime() + maxDuration * 60000).toISOString()

    sessions.push({
      key,
      starts_at: first.starts_at,
      ends_at: computedEndsAt,
      duration_minutes: maxDuration,
      subject: first.subject || '',
      class_name: first.class_name || '',
      student_ids: studentIds,
      lessons: groupedLessons,
      teacher_id: first.teacher_id,
      is_happened,
      is_cancelled,
      is_scheduled,
      is_no_show,
    })
  })

  return sessions.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
}

/**
 * Safely converts a base64 data URL, blob URL, or regular HTTP URL into a Blob URL
 * that can be opened in a new tab or downloaded without browser security blocks.
 */
export const getBlobUrlFromDataOrHttp = (dataOrHttpUrl: string): { blobUrl: string; isBlob: boolean; mimeType: string } => {
  if (!dataOrHttpUrl) {
    return { blobUrl: '', isBlob: false, mimeType: 'application/pdf' }
  }

  if (dataOrHttpUrl.startsWith('data:')) {
    try {
      const parts = dataOrHttpUrl.split(',')
      const mimeMatch = parts[0].match(/data:(.*?);/)
      const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf'
      const base64Data = (parts[1] || '').trim().replace(/\s/g, '')
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Uint8Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const blob = new Blob([byteNumbers], { type: mimeType })
      const blobUrl = URL.createObjectURL(blob)
      return { blobUrl, isBlob: true, mimeType }
    } catch (err) {
      console.error('Failed to parse data URL into Blob:', err)
      return { blobUrl: dataOrHttpUrl, isBlob: false, mimeType: 'application/pdf' }
    }
  }

  return { blobUrl: dataOrHttpUrl, isBlob: false, mimeType: 'application/pdf' }
}

/**
 * Safely opens a file in a new browser tab/window.
 * Handles data: URLs by converting to origin-scoped blob URLs to prevent "about:blank" / "Untitled" issues.
 */
export const openFileFromDataOrUrl = (dataOrHttpUrl: string, fallbackFileName = 'Nota_Fiscal.pdf'): void => {
  if (!dataOrHttpUrl) return

  const { blobUrl, isBlob, mimeType } = getBlobUrlFromDataOrHttp(dataOrHttpUrl)

  const extension = mimeType.includes('png')
    ? '.png'
    : mimeType.includes('jpeg') || mimeType.includes('jpg')
    ? '.jpg'
    : mimeType.includes('image')
    ? '.img'
    : '.pdf'

  const fileName = fallbackFileName.endsWith(extension)
    ? fallbackFileName
    : `${fallbackFileName.replace(/\.[^/.]+$/, '')}${extension}`

  try {
    const win = window.open(blobUrl, '_blank')
    if (!win || win.closed || typeof win.closed === 'undefined') {
      // Popup was blocked or window could not be opened: fallback to downloading
      downloadFileFromDataOrUrl(dataOrHttpUrl, fileName)
      return
    }

    if (isBlob) {
      // Revoke blob URL after 2 minutes to free memory while allowing preview to load
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl)
        } catch {}
      }, 120000)
    }
  } catch (err) {
    console.error('Error opening window for file:', err)
    downloadFileFromDataOrUrl(dataOrHttpUrl, fileName)
  }
}

/**
 * Downloads a file directly to the user's computer.
 */
export const downloadFileFromDataOrUrl = (dataOrHttpUrl: string, fileName = 'Nota_Fiscal.pdf'): void => {
  if (!dataOrHttpUrl) return

  const { blobUrl, isBlob, mimeType } = getBlobUrlFromDataOrHttp(dataOrHttpUrl)

  const extension = mimeType.includes('png')
    ? '.png'
    : mimeType.includes('jpeg') || mimeType.includes('jpg')
    ? '.jpg'
    : mimeType.includes('image')
    ? '.img'
    : '.pdf'

  const safeFileName = fileName.endsWith(extension)
    ? fileName
    : `${fileName.replace(/\.[^/.]+$/, '')}${extension}`

  try {
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = safeFileName
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    if (isBlob) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl)
        } catch {}
      }, 60000)
    }
  } catch (err) {
    console.error('Error triggering download:', err)
    window.open(dataOrHttpUrl, '_blank')
  }
}

