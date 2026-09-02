import { FormEvent, useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Lesson, Profile, TeacherAvailability } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { localeByLanguage } from '../lib/utils'
import { useToast } from '../lib/toast'
import DateTimePicker from './DateTimePicker'

type LessonDraft = {
  subject: string
  starts_at: string
  duration_minutes: number
  student_ids: string[]
  teacher_id: string
  class_name: string
}

type LessonUpdateDraft = LessonDraft & {
  lesson_ids: string[]
}

type NewUserDraft = {
  full_name: string
  email: string
  password: string
  class_name?: string
  speciality?: string
}

type CalendarGroup = {
  key: string
  lessonIds: string[]
  subject: string
  class_name: string
  starts_at: string
  duration_minutes: number
  teacher_id: string
  student_ids: string[]
}

const pad2 = (value: number) => value.toString().padStart(2, '0')
const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
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

const getDateKeyParts = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return { year, month, day }
}

const formatDateKey = (date: Date) => dateKeyFormatter.format(date)

const utcDateFromKey = (dateKey: string) => {
  const { year, month, day } = getDateKeyParts(dateKey)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

const addDaysToDateKey = (dateKey: string, days: number) => {
  const date = utcDateFromKey(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDateKey(date)
}

const weekdayIndexFromDateKey = (dateKey: string) => (utcDateFromKey(dateKey).getUTCDay() + 6) % 7
const startOfWeekDateKey = (dateKey: string) => addDaysToDateKey(dateKey, -weekdayIndexFromDateKey(dateKey))

const getZonedParts = (date: Date, timeZone: string) => {
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
}

const todayDateKeyInTimeZone = (timeZone: string) => {
  const parts = getZonedParts(new Date(), timeZone)
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

const getTimeZoneOffsetMinutes = (date: Date, timeZone: string) => {
  const parts = getZonedParts(date, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return (asUtc - date.getTime()) / 60000
}

const zonedDateTimeToUtcIso = (dateTimeLocal: string, timeZone: string) => {
  const [datePart, timePart] = dateTimeLocal.split('T')
  const { year, month, day } = getDateKeyParts(datePart)
  const [hour, minute] = timePart.split(':').map(Number)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  let offset = getTimeZoneOffsetMinutes(new Date(utcGuess), timeZone)
  let timestamp = utcGuess + offset * 60000
  const nextOffset = getTimeZoneOffsetMinutes(new Date(timestamp), timeZone)
  if (nextOffset !== offset) {
    timestamp = utcGuess + nextOffset * 60000
  }
  return new Date(timestamp).toISOString()
}

const formatWeekLabel = (weekStart: string, language: Language = 'pt') => {
  const weekEnd = addDaysToDateKey(weekStart, 6)
  const locale = localeByLanguage[language] || 'en'
  const formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${formatter.format(utcDateFromKey(weekStart))} - ${formatter.format(utcDateFromKey(weekEnd))}`
}

const groupKeyForLesson = (lesson: Lesson) =>
  [lesson.subject, lesson.class_name, lesson.teacher_id, lesson.starts_at, lesson.duration_minutes].join('|')

export default function AdminCalendar({
  lessons,
  profilesById,
  students,
  teachers,
  timeZone,
  language = 'pt',
  role,
  currentTeacherId,
  allowCreateUsers,
  allowTeacherChange,
  onCreateLesson,
  onUpdateLessonGroup,
  onDeleteLessonGroup,
  onCreateStudentLogin,
  onCreateTeacherLogin,
  availabilities = [],
  onCreateAvailability,
  onDeleteAvailability,
}: {
  lessons: Lesson[]
  profilesById: Record<string, Profile>
  students: Profile[]
  teachers: Profile[]
  timeZone: string
  language?: Language
  role: 'admin' | 'teacher'
  currentTeacherId?: string
  allowCreateUsers: boolean
  allowTeacherChange: boolean
  onCreateLesson: (draft: LessonDraft) => Promise<void>
  onUpdateLessonGroup: (draft: LessonUpdateDraft) => Promise<void>
  onDeleteLessonGroup?: (lessonIds: string[]) => Promise<void>
  onCreateStudentLogin: (draft: NewUserDraft) => Promise<Profile>
  onCreateTeacherLogin: (draft: NewUserDraft) => Promise<Profile>
  availabilities?: TeacherAvailability[]
  onCreateAvailability?: (draft: { starts_at: string; duration_minutes: number; teacher_id?: string; repeat_weeks?: number; series_id?: string | null }) => Promise<void>
  onDeleteAvailability?: (options: { id: string; series_id?: string | null; starts_at?: string; series_scope?: 'this' | 'future' }) => Promise<void>
}) {
  const { toast } = useToast()
  const [calendarMode, setCalendarMode] = useState<'classes' | 'availability'>('classes')
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(role === 'teacher' && currentTeacherId ? currentTeacherId : 'all')

  // Availability Modal states
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false)
  const [selectedAvailability, setSelectedAvailability] = useState<TeacherAvailability | null>(null)
  const [availabilityStartsAt, setAvailabilityStartsAt] = useState('')
  const [availabilityDuration, setAvailabilityDuration] = useState(60)
  const [availabilityRecurrenceType, setAvailabilityRecurrenceType] = useState<'single' | 'weekly'>('single')
  const [availabilityRepeatWeeks, setAvailabilityRepeatWeeks] = useState(4)
  const [availabilityTeacherId, setAvailabilityTeacherId] = useState(currentTeacherId ?? teachers[0]?.id ?? '')
  const [availabilityDeleteScope, setAvailabilityDeleteScope] = useState<'this' | 'future'>('this')
  const [isSubmittingAvailability, setIsSubmittingAvailability] = useState(false)

  const [weekStart, setWeekStart] = useState(() => startOfWeekDateKey(todayDateKeyInTimeZone(timeZone)))
  const [showModal, setShowModal] = useState(false)
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [repeatWeekly, setRepeatWeekly] = useState(false)
  const [repeatCount, setRepeatCount] = useState(4)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(students[0] ? [students[0].id] : [])
  const [initialDraftState, setInitialDraftState] = useState<string>('')
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
  const calendarCardRef = useRef<HTMLDivElement>(null)
  const [createStudent, setCreateStudent] = useState(false)
  const [createTeacher, setCreateTeacher] = useState(false)
  const [studentDraft, setStudentDraft] = useState<NewUserDraft>({ full_name: '', email: '', password: '', class_name: '' })
  const [teacherDraft, setTeacherDraft] = useState<NewUserDraft>({ full_name: '', email: '', password: '', speciality: '' })
  const [draft, setDraft] = useState<Omit<LessonDraft, 'student_ids'>>({
    subject: '',
    starts_at: '',
    duration_minutes: 60,
    teacher_id: currentTeacherId ?? teachers[0]?.id ?? '',
    class_name: '',
  })

  const gridRef = useRef<HTMLDivElement>(null)
  const [activeMobileRange, setActiveMobileRange] = useState<number>(0)
  const todayKey = useMemo(() => todayDateKeyInTimeZone(timeZone), [timeZone])

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDaysToDateKey(weekStart, index)), [weekStart])
  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })),
    [students],
  )
  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })),
    [teachers],
  )
  const dayLabels = useMemo(
    () => {
      const locale = localeByLanguage[language] || 'en'
      return days.map((day) => ({
        key: day,
        short: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utcDateFromKey(day)),
        day: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utcDateFromKey(day)),
      }))
    },
    [days, language],
  )
  const slotMinutes = 30
  const startHour = 6
  const endHour = 22
  const slotCount = ((endHour - startHour) * 60) / slotMinutes
  const slots = useMemo(() => Array.from({ length: slotCount }, (_, idx) => startHour * 60 + idx * slotMinutes), [slotCount])
  const weekEnd = useMemo(() => addDaysToDateKey(weekStart, 7), [weekStart])

  const visibleLessons = role === 'teacher' && currentTeacherId ? lessons.filter((lesson) => lesson.teacher_id === currentTeacherId) : lessons

  const lessonsThisWeek = useMemo(
    () =>
      visibleLessons.filter((lesson) => {
        const zoned = getZonedParts(new Date(lesson.starts_at), timeZone)
        const dateKey = `${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}`
        return dateKey >= weekStart && dateKey < weekEnd
      }),
    [visibleLessons, timeZone, weekStart, weekEnd],
  )

  const groupsThisWeek = useMemo(() => {
    const map = new Map<string, CalendarGroup>()
    for (const lesson of lessonsThisWeek) {
      const key = groupKeyForLesson(lesson)
      const current = map.get(key)
      if (current) {
        current.lessonIds.push(lesson.id)
        current.student_ids.push(lesson.student_id)
      } else {
        map.set(key, {
          key,
          lessonIds: [lesson.id],
          subject: lesson.subject,
          class_name: lesson.class_name,
          starts_at: lesson.starts_at,
          duration_minutes: lesson.duration_minutes,
          teacher_id: lesson.teacher_id,
          student_ids: [lesson.student_id],
        })
      }
    }
    return Array.from(map.values())
  }, [lessonsThisWeek])

  const groupsByDay = useMemo(() => {
    const grouped: Record<string, CalendarGroup[]> = Object.fromEntries(days.map((day) => [day, []]))
    for (const group of groupsThisWeek) {
      const zoned = getZonedParts(new Date(group.starts_at), timeZone)
      const key = `${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}`
      grouped[key] = grouped[key] ? [...grouped[key], group] : [group]
    }
    return grouped
  }, [days, groupsThisWeek, timeZone])

  const groupLayouts = useMemo(() => {
    const layouts: Record<string, { column: number; totalColumns: number }> = {}
    for (const day of days) {
      const dayGroups = groupsByDay[day] ?? []
      for (const group of dayGroups) {
        const start = getZonedParts(new Date(group.starts_at), timeZone)
        const startMinutes = start.hour * 60 + start.minute
        const endMinutes = startMinutes + group.duration_minutes
        const overlaps = dayGroups
          .filter((other) => {
            const otherStart = getZonedParts(new Date(other.starts_at), timeZone)
            const otherStartMinutes = otherStart.hour * 60 + otherStart.minute
            const otherEndMinutes = otherStartMinutes + other.duration_minutes
            return startMinutes < otherEndMinutes && otherStartMinutes < endMinutes
          })
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime() || a.key.localeCompare(b.key))
        const column = overlaps.findIndex((item) => item.key === group.key)
        layouts[group.key] = { column: Math.max(column, 0), totalColumns: Math.max(overlaps.length, 1) }
      }
    }
    return layouts
  }, [days, groupsByDay, timeZone])

  const availabilitiesThisWeek = useMemo(() => {
    return availabilities.filter((a) => {
      if (role === 'teacher' && currentTeacherId) {
        if (a.teacher_id !== currentTeacherId) return false
      } else if (role === 'admin' && selectedTeacherId && selectedTeacherId !== 'all') {
        if (a.teacher_id !== selectedTeacherId) return false
      }
      const zoned = getZonedParts(new Date(a.starts_at), timeZone)
      const dateKey = `${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}`
      return dateKey >= weekStart && dateKey < weekEnd
    })
  }, [availabilities, role, currentTeacherId, selectedTeacherId, timeZone, weekStart, weekEnd])

  const availabilitiesByDay = useMemo(() => {
    const grouped: Record<string, TeacherAvailability[]> = Object.fromEntries(days.map((day) => [day, []]))
    for (const item of availabilitiesThisWeek) {
      const zoned = getZonedParts(new Date(item.starts_at), timeZone)
      const key = `${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}`
      grouped[key] = grouped[key] ? [...grouped[key], item] : [item]
    }
    return grouped
  }, [days, availabilitiesThisWeek, timeZone])

  // Partial Overlap Sub-division: Split availability slot into booked (🟣) and remaining free (🟢) segments
  type AvailabilitySegment = {
    key: string
    parent_id: string
    starts_at: string
    duration_minutes: number
    is_booked: boolean
    lesson?: Lesson
    parent_availability: TeacherAvailability
  }

  const computeAvailabilitySegments = (
    availability: TeacherAvailability,
    allLessons: Lesson[]
  ): AvailabilitySegment[] => {
    const aStart = new Date(availability.starts_at).getTime()
    const aEnd = aStart + (availability.duration_minutes || 60) * 60000

    const overlappingLessons = allLessons.filter((l) => {
      if (l.teacher_id !== availability.teacher_id) return false
      if (l.teacher_lesson_status === 'not_happened') return false
      const lStart = new Date(l.starts_at).getTime()
      const lEnd = lStart + (l.duration_minutes || 60) * 60000
      return aStart < lEnd && lStart < aEnd
    })

    if (overlappingLessons.length === 0) {
      return [
        {
          key: `${availability.id}-full`,
          parent_id: availability.id,
          starts_at: availability.starts_at,
          duration_minutes: availability.duration_minutes || 60,
          is_booked: false,
          parent_availability: availability,
        },
      ]
    }

    const timestampsSet = new Set<number>([aStart, aEnd])
    for (const l of overlappingLessons) {
      const lStart = new Date(l.starts_at).getTime()
      const lEnd = lStart + (l.duration_minutes || 60) * 60000
      if (lStart > aStart && lStart < aEnd) timestampsSet.add(lStart)
      if (lEnd > aStart && lEnd < aEnd) timestampsSet.add(lEnd)
    }

    const sortedTimestamps = Array.from(timestampsSet).sort((a, b) => a - b)
    const segments: AvailabilitySegment[] = []

    for (let i = 0; i < sortedTimestamps.length - 1; i++) {
      const segStart = sortedTimestamps[i]
      const segEnd = sortedTimestamps[i + 1]
      const segDurationMin = Math.round((segEnd - segStart) / 60000)
      if (segDurationMin <= 0) continue

      const coveringLesson = overlappingLessons.find((l) => {
        const lStart = new Date(l.starts_at).getTime()
        const lEnd = lStart + (l.duration_minutes || 60) * 60000
        return lStart <= segStart && segEnd <= lEnd
      })

      segments.push({
        key: `${availability.id}-${segStart}-${segEnd}`,
        parent_id: availability.id,
        starts_at: new Date(segStart).toISOString(),
        duration_minutes: segDurationMin,
        is_booked: !!coveringLesson,
        lesson: coveringLesson,
        parent_availability: availability,
      })
    }

    return segments
  }

  const availabilitySegmentsByDay = useMemo(() => {
    const grouped: Record<string, AvailabilitySegment[]> = Object.fromEntries(days.map((day) => [day, []]))
    for (const day of days) {
      const dayAvails = availabilitiesByDay[day] ?? []
      const segs: AvailabilitySegment[] = []
      for (const avail of dayAvails) {
        segs.push(...computeAvailabilitySegments(avail, visibleLessons))
      }
      grouped[day] = segs
    }
    return grouped
  }, [days, availabilitiesByDay, visibleLessons])

  const availabilityLayouts = useMemo(() => {
    const layouts: Record<string, { column: number; totalColumns: number }> = {}
    for (const day of days) {
      const daySegs = availabilitySegmentsByDay[day] ?? []
      for (const seg of daySegs) {
        const start = getZonedParts(new Date(seg.starts_at), timeZone)
        const startMinutes = start.hour * 60 + start.minute
        const endMinutes = startMinutes + seg.duration_minutes
        const overlaps = daySegs
          .filter((other) => {
            const otherStart = getZonedParts(new Date(other.starts_at), timeZone)
            const otherStartMinutes = otherStart.hour * 60 + otherStart.minute
            const otherEndMinutes = otherStartMinutes + other.duration_minutes
            return startMinutes < otherEndMinutes && otherStartMinutes < endMinutes
          })
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime() || a.key.localeCompare(b.key))
        const column = overlaps.findIndex((item) => item.key === seg.key)
        layouts[seg.key] = { column: Math.max(column, 0), totalColumns: Math.max(overlaps.length, 1) }
      }
    }
    return layouts
  }, [days, availabilitySegmentsByDay, timeZone])

  // Helper to check if an entire availability slot has an active overlapping class
  const getSlotConflict = (availability: TeacherAvailability) => {
    const aStart = new Date(availability.starts_at).getTime()
    const aEnd = aStart + (availability.duration_minutes || 60) * 60000

    const overlappingLesson = visibleLessons.find((l) => {
      if (l.teacher_id !== availability.teacher_id) return false
      if (l.teacher_lesson_status === 'not_happened') return false
      const lStart = new Date(l.starts_at).getTime()
      const lEnd = lStart + (l.duration_minutes || 60) * 60000
      return aStart < lEnd && lStart < aEnd
    })

    return overlappingLesson
  }

  const openCreateAvailability = (dayKey: string, minutesFromMidnight: number) => {
    const hours = Math.floor(minutesFromMidnight / 60)
    const minutes = minutesFromMidnight % 60
    setSelectedAvailability(null)
    setAvailabilityStartsAt(`${dayKey}T${pad2(hours)}:${pad2(minutes)}`)
    setAvailabilityDuration(60)
    setAvailabilityRecurrenceType('single')
    setAvailabilityRepeatWeeks(4)
    setAvailabilityTeacherId(
      role === 'teacher' && currentTeacherId
        ? currentTeacherId
        : selectedTeacherId !== 'all'
        ? selectedTeacherId
        : sortedTeachers[0]?.id || ''
    )
    setShowAvailabilityModal(true)
  }

  const openViewAvailability = (availability: TeacherAvailability) => {
    setSelectedAvailability(availability)
    const zoned = getZonedParts(new Date(availability.starts_at), timeZone)
    setAvailabilityStartsAt(`${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}T${pad2(zoned.hour)}:${pad2(zoned.minute)}`)
    setAvailabilityDuration(availability.duration_minutes || 60)
    setAvailabilityDeleteScope('this')
    setAvailabilityTeacherId(availability.teacher_id)
    setShowAvailabilityModal(true)
  }

  const closeAvailabilityModal = () => {
    setShowAvailabilityModal(false)
    setSelectedAvailability(null)
    setIsSubmittingAvailability(false)
  }

  const handleSaveAvailability = async (e: FormEvent) => {
    e.preventDefault()
    if (!onCreateAvailability) return
    setIsSubmittingAvailability(true)
    try {
      const utcIso = zonedDateTimeToUtcIso(availabilityStartsAt, timeZone)
      const repeatCount = availabilityRecurrenceType === 'weekly' ? availabilityRepeatWeeks : 1
      const targetTeacherId = role === 'teacher' && currentTeacherId ? currentTeacherId : availabilityTeacherId
      await onCreateAvailability({
        starts_at: utcIso,
        duration_minutes: availabilityDuration,
        teacher_id: targetTeacherId,
        repeat_weeks: repeatCount,
      })
      toast.success(t(language, 'availability_added_success') || 'Horário de disponibilidade adicionado com sucesso!')

      // Auto-switch to availability view
      setCalendarMode('availability')

      // Ensure week includes this slot if outside active week
      const slotDateKey = availabilityStartsAt.split('T')[0]
      if (slotDateKey && (slotDateKey < weekStart || slotDateKey >= weekEnd)) {
        setWeekStart(startOfWeekDateKey(slotDateKey))
      }

      closeAvailabilityModal()
    } catch (err: unknown) {
      console.error('Error creating availability:', err)
      const errMsg = err instanceof Error ? err.message : 'Erro ao adicionar disponibilidade.'
      toast.error(errMsg)
    } finally {
      setIsSubmittingAvailability(false)
    }
  }

  const handleDeleteAvailabilitySlot = async (availability: TeacherAvailability, scope: 'this' | 'future') => {
    if (!onDeleteAvailability) return
    setIsSubmittingAvailability(true)
    try {
      await onDeleteAvailability({
        id: availability.id,
        series_id: availability.series_id,
        starts_at: availability.starts_at,
        series_scope: scope,
      })
      toast.success(t(language, 'availability_deleted_success') || 'Horário de disponibilidade removido com sucesso!')
      closeAvailabilityModal()
    } catch (err: unknown) {
      console.error('Error deleting availability:', err)
      const errMsg = err instanceof Error ? err.message : 'Erro ao remover disponibilidade.'
      toast.error(errMsg)
    } finally {
      setIsSubmittingAvailability(false)
    }
  }

  const handleDeleteAppointment = async () => {
    if (!editingGroup || !onDeleteLessonGroup) return
    if (!window.confirm(t(language, 'delete_appointment_confirm') || t(language, 'delete_lesson_confirm'))) {
      return
    }
    setSaving(true)
    try {
      await onDeleteLessonGroup(editingGroup.lessonIds)
      toast.success(t(language, 'lesson_deleted_success') || 'Agendamento de aula excluído com sucesso!')
      closeModal()
    } catch (err: unknown) {
      console.error('Error deleting appointment:', err)
      const errMsg = err instanceof Error ? err.message : 'Erro ao excluir aula.'
      toast.error(errMsg)
    } finally {
      setSaving(false)
    }
  }

  const resetDrafts = () => {
    setCreateStudent(false)
    setCreateTeacher(false)
    setRepeatWeekly(false)
    setRepeatCount(4)
    setStudentDraft({ full_name: '', email: '', password: '', class_name: '' })
    setTeacherDraft({ full_name: '', email: '', password: '', speciality: '' })
  }

  const openCreate = (dayKey: string, minutesFromMidnight: number) => {
    const hours = Math.floor(minutesFromMidnight / 60)
    const minutes = minutesFromMidnight % 60
    resetDrafts()
    setEditingGroupKey(null)
    const newDraft = {
      subject: '',
      starts_at: `${dayKey}T${pad2(hours)}:${pad2(minutes)}`,
      duration_minutes: 60,
      teacher_id: role === 'teacher' && currentTeacherId ? currentTeacherId : sortedTeachers[0]?.id ?? '',
      class_name: '',
    }
    const initialSts = sortedStudents[0] ? [sortedStudents[0].id] : []
    setDraft(newDraft)
    setSelectedStudentIds(initialSts)
    setInitialDraftState(JSON.stringify({ draft: newDraft, selectedStudentIds: initialSts }))
    setShowModal(true)
  }

  const openEdit = (group: CalendarGroup) => {
    resetDrafts()
    setEditingGroupKey(group.key)
    const zoned = getZonedParts(new Date(group.starts_at), timeZone)
    const newDraft = {
      subject: group.subject,
      starts_at: `${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}T${pad2(zoned.hour)}:${pad2(zoned.minute)}`,
      duration_minutes: group.duration_minutes,
      teacher_id: group.teacher_id,
      class_name: group.class_name,
    }
    setDraft(newDraft)
    setSelectedStudentIds(group.student_ids)
    setInitialDraftState(JSON.stringify({ draft: newDraft, selectedStudentIds: group.student_ids }))
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingGroupKey(null)
    setSaving(false)
    setShowUnsavedWarning(false)
  }

  const addStudent = (studentId: string) => {
    if (!studentId) return
    setSelectedStudentIds((current) => (current.includes(studentId) ? current : [...current, studentId]))
  }

  const removeStudent = (studentId: string) => {
    setSelectedStudentIds((current) => current.filter((id) => id !== studentId))
  }

  const editingGroup = editingGroupKey ? groupsThisWeek.find((group) => group.key === editingGroupKey) ?? null : null

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      let teacherId = draft.teacher_id
      let className = draft.class_name
      let nextStudentIds = [...selectedStudentIds]

      if (createStudent) {
        const createdStudent = await onCreateStudentLogin(studentDraft)
        nextStudentIds = Array.from(new Set([...nextStudentIds, createdStudent.id]))
        className = createdStudent.class_name || className
      }

      if (createTeacher) {
        const createdTeacher = await onCreateTeacherLogin(teacherDraft)
        teacherId = createdTeacher.id
      }

      if (!className && nextStudentIds[0]) {
        className = profilesById[nextStudentIds[0]]?.class_name ?? ''
      }

      if (!editingGroup) {
        const occurrences = repeatWeekly ? Math.max(1, repeatCount) : 1
        for (let index = 0; index < occurrences; index += 1) {
          const [datePart, timePart] = draft.starts_at.split('T')
          const repeatedDate = addDaysToDateKey(datePart, index * 7)
          await onCreateLesson({
            subject: draft.subject,
            starts_at: zonedDateTimeToUtcIso(`${repeatedDate}T${timePart}`, timeZone),
            duration_minutes: draft.duration_minutes,
            student_ids: nextStudentIds,
            teacher_id: role === 'teacher' && currentTeacherId ? currentTeacherId : teacherId,
            class_name: className,
          })
        }
      } else {
        await onUpdateLessonGroup({
          lesson_ids: editingGroup.lessonIds,
          subject: draft.subject,
          starts_at: zonedDateTimeToUtcIso(draft.starts_at, timeZone),
          duration_minutes: draft.duration_minutes,
          student_ids: nextStudentIds,
          teacher_id: role === 'teacher' && currentTeacherId ? currentTeacherId : teacherId,
          class_name: className,
        })
      }

      closeModal()
    } catch {
      setSaving(false)
    }
  }

  const scrollToDay = (dayIndex: number) => {
    if (!gridRef.current) return
    const container = gridRef.current
    const timeColWidth = 46
    const availableWidth = container.clientWidth - timeColWidth
    const dayColWidth = availableWidth / 3
    const targetScroll = Math.max(0, dayIndex * dayColWidth)
    container.scrollTo({ left: targetScroll, behavior: 'smooth' })
  }

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return
    const todayIndex = days.indexOf(todayKey)
    if (todayIndex >= 0) {
      const targetIndex = todayIndex >= 5 ? 4 : todayIndex >= 3 ? 3 : 0
      const rangeIdx = todayIndex >= 5 ? 2 : todayIndex >= 3 ? 1 : 0
      setActiveMobileRange(rangeIdx)
      const timer = setTimeout(() => {
        scrollToDay(targetIndex)
      }, 80)
      return () => clearTimeout(timer)
    } else {
      setActiveMobileRange(0)
      const timer = setTimeout(() => {
        scrollToDay(0)
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [days, todayKey])

  const handleGridScroll = () => {
    if (!gridRef.current || (typeof window !== 'undefined' && window.innerWidth >= 768)) return
    const container = gridRef.current
    const timeColWidth = 46
    const availableWidth = container.clientWidth - timeColWidth
    const dayColWidth = availableWidth / 3
    const scrollPos = container.scrollLeft
    const activeIdx = Math.round(scrollPos / dayColWidth)
    if (activeIdx >= 4) {
      setActiveMobileRange(2)
    } else if (activeIdx >= 2) {
      setActiveMobileRange(1)
    } else {
      setActiveMobileRange(0)
    }
  }

  return (
    <div className="calendar-shell">
      <div className="calendar-toolbar">
        <div>
          <p className="section-label">{calendarMode === 'availability' ? t(language, 'availability_title') : t(language, 'calendar')}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{formatWeekLabel(weekStart, language)}</h3>
            
            {/* View Mode Switcher */}
            <div
              className="calendar-view-toggle"
              style={{
                display: 'inline-flex',
                background: 'rgba(15, 23, 42, 0.8)',
                padding: '0.2rem',
                borderRadius: '0.75rem',
                border: '1px solid #334155',
              }}
            >
              <button
                type="button"
                className={`calendar-toggle-btn ${calendarMode === 'classes' ? 'active' : ''}`}
                onClick={() => setCalendarMode('classes')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '0.55rem',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: calendarMode === 'classes' ? '#2563eb' : 'transparent',
                  color: calendarMode === 'classes' ? '#fff' : '#94a3b8',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span>📅</span>
                <span>{t(language, 'classes_view')}</span>
              </button>
              <button
                type="button"
                className={`calendar-toggle-btn ${calendarMode === 'availability' ? 'active' : ''}`}
                onClick={() => setCalendarMode('availability')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '0.55rem',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: calendarMode === 'availability' ? '#059669' : 'transparent',
                  color: calendarMode === 'availability' ? '#fff' : '#94a3b8',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span>⏱️</span>
                <span>{t(language, 'availability_view')}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="button-row wrap" style={{ alignItems: 'center' }}>
          {calendarMode === 'availability' && role === 'admin' && (
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              style={{
                padding: '0.45rem 0.85rem',
                background: '#090d16',
                border: '1px solid #334155',
                borderRadius: '0.6rem',
                color: '#fff',
                fontSize: '0.84rem',
                fontWeight: 600,
              }}
            >
              <option value="all">
                {t(language, 'all_teachers_filter') || '👥 Todos os Professores'}
              </option>
              {sortedTeachers.map((tItem) => (
                <option key={tItem.id} value={tItem.id}>
                  👨‍🏫 {tItem.full_name}
                </option>
              ))}
            </select>
          )}

          {calendarMode === 'availability' && (
            <button
              type="button"
              className="primary-button"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#059669', borderColor: '#10b981' }}
              onClick={() => openCreateAvailability(days[0], 9 * 60)}
            >
              <span>+</span>
              <span>{t(language, 'add_availability')}</span>
            </button>
          )}

          <button className="ghost-button" type="button" onClick={() => setWeekStart((current) => addDaysToDateKey(current, -7))}>
            {t(language, 'prev_week')}
          </button>
          <button className="ghost-button" type="button" onClick={() => setWeekStart(startOfWeekDateKey(todayDateKeyInTimeZone(timeZone)))}>
            {t(language, 'this_week')}
          </button>
          <button className="ghost-button" type="button" onClick={() => setWeekStart((current) => addDaysToDateKey(current, 7))}>
            {t(language, 'next_week')}
          </button>
        </div>
      </div>

      <div className="calendar-mobile-nav">
        <button
          type="button"
          className={`calendar-mobile-nav-btn ${activeMobileRange === 0 ? 'active' : ''}`}
          onClick={() => {
            setActiveMobileRange(0)
            scrollToDay(0)
          }}
        >
          {dayLabels[0]?.short} - {dayLabels[2]?.short}
        </button>
        <button
          type="button"
          className={`calendar-mobile-nav-btn ${activeMobileRange === 1 ? 'active' : ''}`}
          onClick={() => {
            setActiveMobileRange(1)
            scrollToDay(3)
          }}
        >
          {dayLabels[3]?.short} - {dayLabels[5]?.short}
        </button>
        <button
          type="button"
          className={`calendar-mobile-nav-btn ${activeMobileRange === 2 ? 'active' : ''}`}
          onClick={() => {
            setActiveMobileRange(2)
            scrollToDay(4)
          }}
        >
          {dayLabels[4]?.short} - {dayLabels[6]?.short}
        </button>
      </div>

      <div ref={gridRef} onScroll={handleGridScroll} className="calendar-grid">
        <div className="calendar-header-spacer" />
        {dayLabels.map((label) => {
          const isToday = label.key === todayKey
          return (
            <div key={label.key} className={`calendar-header-cell ${isToday ? 'calendar-header-cell-today' : ''}`}>
              <strong>{label.short}</strong>
              <span className="muted tiny-copy">{label.day}</span>
              {isToday && <span className="calendar-today-badge">{t(language, 'today_badge')}</span>}
            </div>
          )
        })}

        <div className="calendar-time-column">
          {slots.map((minute) => {
            const hour = Math.floor(minute / 60)
            const mins = minute % 60
            const isHour = mins === 0
            return (
              <div key={minute} className={`calendar-time-slot ${isHour ? 'calendar-time-slot-hour' : ''}`}>
                {isHour ? `${pad2(hour)}:00` : ''}
              </div>
            )
          })}
        </div>

        {days.map((day) => {
          const dayGroups = groupsByDay[day] ?? []
          const dayAvailabilities = availabilitiesByDay[day] ?? []

          return (
            <div key={day} className="calendar-day-column">
              {slots.map((minute) => (
                <button
                  key={minute}
                  type="button"
                  className="calendar-slot"
                  onClick={() => {
                    if (calendarMode === 'availability') {
                      openCreateAvailability(day, minute)
                    } else {
                      openCreate(day, minute)
                    }
                  }}
                  aria-label={`${calendarMode === 'availability' ? t(language, 'add_availability') : 'Create class'} on ${day} at ${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`}
                />
              ))}

              {/* CLASSES VIEW */}
              {calendarMode === 'classes' &&
                dayGroups.map((group) => {
                  const start = getZonedParts(new Date(group.starts_at), timeZone)
                  const minutesFromMidnight = start.hour * 60 + start.minute
                  const startIndex = Math.floor((minutesFromMidnight - startHour * 60) / slotMinutes)
                  const span = Math.max(1, Math.ceil(group.duration_minutes / slotMinutes))
                  const teacherName = profilesById[group.teacher_id]?.full_name ?? t(language, 'teacher')
                  const studentsForGroup = group.student_ids.map((id) => profilesById[id]?.full_name ?? t(language, 'role_student'))
                  const confirmedCount = group.lessonIds.filter((lessonId) => {
                    const lesson = lessons.find((item) => item.id === lessonId)
                    return lesson?.student_attendance === 'attend'
                  }).length
                  const cancelledCount = group.lessonIds.filter((lessonId) => {
                    const lesson = lessons.find((item) => item.id === lessonId)
                    return lesson?.student_attendance === 'cancel'
                  }).length
                  const totalStudents = group.lessonIds.length

                  let groupStatus: 'confirmed' | 'cancelled' | 'partial' | 'pending' = 'pending'
                  let statusLabel = t(language, 'pending')
                  let eventClass = 'calendar-event-neutral'

                  if (cancelledCount > 0 && cancelledCount < totalStudents) {
                    groupStatus = 'partial'
                    statusLabel = t(language, 'status_partial_text')
                      .replace('{cancelled}', String(cancelledCount))
                      .replace('{total}', String(totalStudents))
                    eventClass = 'calendar-event-warning'
                  } else if (cancelledCount === totalStudents && totalStudents > 0) {
                    groupStatus = 'cancelled'
                    statusLabel = t(language, 'status_cancelled_text')
                      .replace('{cancelled}', String(cancelledCount))
                      .replace('{total}', String(totalStudents))
                    eventClass = 'calendar-event-danger'
                  } else if (confirmedCount === totalStudents && totalStudents > 0) {
                    groupStatus = 'confirmed'
                    statusLabel = t(language, 'status_confirmed_text')
                      .replace('{confirmed}', String(confirmedCount))
                      .replace('{total}', String(totalStudents))
                    eventClass = 'calendar-event-success'
                  } else {
                    groupStatus = 'pending'
                    statusLabel = t(language, 'status_pending_text')
                      .replace('{confirmed}', String(confirmedCount))
                      .replace('{total}', String(totalStudents))
                    eventClass = 'calendar-event-neutral'
                  }

                  const layout = groupLayouts[group.key] ?? { column: 0, totalColumns: 1 }
                  if (startIndex < 0 || startIndex >= slotCount) return null

                  return (
                    <button
                      key={group.key}
                      type="button"
                      className={`calendar-event ${eventClass}`}
                      style={{
                        gridRow: `${startIndex + 1} / span ${span}`,
                        width: `calc(${100 / layout.totalColumns}% - 8px)`,
                        marginLeft: `calc(${(100 / layout.totalColumns) * layout.column}% + 4px)`,
                      }}
                      title={`${group.subject} • ${studentsForGroup.join(', ')} ${t(language, 'with_word')} ${teacherName} (${statusLabel})`}
                      onClick={() => openEdit(group)}
                    >
                      <div className="calendar-event-header">
                        <strong className="calendar-event-title">{group.subject}</strong>
                        <span className={`calendar-status-dot calendar-status-dot-${groupStatus}`} title={statusLabel} />
                      </div>
                      {span > 1 && (
                        <div className="calendar-event-details">
                          <span className="muted tiny-copy calendar-event-sub">{teacherName}</span>
                          <span className="muted tiny-copy calendar-event-sub">
                            {studentsForGroup.length} {studentsForGroup.length === 1 ? t(language, 'student_singular') : t(language, 'student_plural')}
                          </span>
                        </div>
                      )}
                    </button>
                  )
                })}

              {/* AVAILABILITY VIEW */}
              {calendarMode === 'availability' &&
                (availabilitySegmentsByDay[day] ?? []).map((segment) => {
                  const start = getZonedParts(new Date(segment.starts_at), timeZone)
                  const minutesFromMidnight = start.hour * 60 + start.minute
                  const startIndex = Math.floor((minutesFromMidnight - startHour * 60) / slotMinutes)
                  const span = Math.max(1, Math.ceil(segment.duration_minutes / slotMinutes))
                  if (startIndex < 0 || startIndex >= slotCount) return null

                  const isBooked = segment.is_booked
                  const teacherProfile = profilesById[segment.parent_availability.teacher_id]
                  const conflictLesson = segment.lesson
                  const layout = availabilityLayouts[segment.key] ?? { column: 0, totalColumns: 1 }

                  return (
                    <button
                      key={segment.key}
                      type="button"
                      className={`calendar-event ${isBooked ? 'calendar-event-booked' : 'calendar-event-available'}`}
                      style={{
                        gridRow: `${startIndex + 1} / span ${span}`,
                        width: `calc(${100 / layout.totalColumns}% - 8px)`,
                        marginLeft: `calc(${(100 / layout.totalColumns) * layout.column}% + 4px)`,
                      }}
                      onClick={() => openViewAvailability(segment.parent_availability)}
                      title={
                        isBooked && conflictLesson
                          ? `${t(language, 'occupied_slot')}: ${conflictLesson.subject} (${profilesById[conflictLesson.student_id]?.full_name || ''})`
                          : `${t(language, 'available_slot')} (${teacherProfile?.full_name || ''})`
                      }
                    >
                      <div className="calendar-event-header">
                        <strong className="calendar-event-title" style={{ color: isBooked ? '#c7d2fe' : '#34d399' }}>
                          {isBooked && conflictLesson ? `🟣 ${conflictLesson.subject || t(language, 'occupied_slot')}` : `🟢 ${t(language, 'available_slot')}`}
                        </strong>
                        <span className={`calendar-status-dot ${isBooked ? 'calendar-status-dot-booked' : 'calendar-status-dot-available'}`} />
                      </div>
                      {span > 1 && (
                        <div className="calendar-event-details">
                          {isBooked && conflictLesson ? (
                            <>
                              <span className="muted tiny-copy calendar-event-sub" style={{ color: '#e0e7ff' }}>
                                👤 {profilesById[conflictLesson.student_id]?.full_name ?? t(language, 'role_student')}
                              </span>
                              <span className="muted tiny-copy calendar-event-sub" style={{ color: '#a5b4fc' }}>
                                {segment.duration_minutes} min • {teacherProfile?.full_name ?? t(language, 'teacher')}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="muted tiny-copy calendar-event-sub" style={{ color: '#a7f3d0' }}>
                                {segment.duration_minutes} min {segment.duration_minutes < (segment.parent_availability.duration_minutes || 60) ? `(${t(language, 'available_remaining')})` : ''}
                              </span>
                              <span className="muted tiny-copy calendar-event-sub" style={{ color: '#6ee7b7', fontWeight: 600 }}>
                                👨‍🏫 {teacherProfile?.full_name || t(language, 'teacher')}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
            </div>
          )
        })}
      </div>

      {/* LEGEND */}
      {calendarMode === 'classes' ? (
        <div className="calendar-legend">
          <span className="calendar-legend-title">{t(language, 'legend_title')}</span>
          <div className="calendar-legend-items">
            <div className="calendar-legend-item">
              <span className="calendar-status-dot calendar-status-dot-confirmed" />
              <span>{t(language, 'legend_confirmed')}</span>
            </div>
            <div className="calendar-legend-item">
              <span className="calendar-status-dot calendar-status-dot-partial" />
              <span>{t(language, 'legend_partial')}</span>
            </div>
            <div className="calendar-legend-item">
              <span className="calendar-status-dot calendar-status-dot-cancelled" />
              <span>{t(language, 'legend_cancelled')}</span>
            </div>
            <div className="calendar-legend-item">
              <span className="calendar-status-dot calendar-status-dot-pending" />
              <span>{t(language, 'legend_pending')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="calendar-legend">
          <span className="calendar-legend-title">{t(language, 'availability_title')}</span>
          <div className="calendar-legend-items">
            <div className="calendar-legend-item">
              <span className="calendar-status-dot calendar-status-dot-available" />
              <span>{t(language, 'availability_legend_free')}</span>
            </div>
            <div className="calendar-legend-item">
              <span className="calendar-status-dot calendar-status-dot-booked" />
              <span>{t(language, 'availability_legend_booked')}</span>
            </div>
          </div>
        </div>
      )}

      {/* CLASSES CREATE / EDIT MODAL */}
      {showModal && createPortal(
        <div
          className="reminder-app-scope modal-overlay"
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(2, 6, 23, 0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
          onClick={(e) => {
            if (calendarCardRef.current && !calendarCardRef.current.contains(e.target as Node)) {
              const currentSt = JSON.stringify({ draft, selectedStudentIds })
              const isDirty = initialDraftState && currentSt !== initialDraftState
              if (isDirty) {
                setShowUnsavedWarning(true)
                const btn = calendarCardRef.current.querySelector('.button-row') || calendarCardRef.current.querySelector('.primary-button')
                btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              } else {
                closeModal()
              }
            }
          }}
        >
          <div ref={calendarCardRef} className="modal-card" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="panel-header">
              <div>
                <p className="section-label">{editingGroup ? t(language, 'edit_class') : t(language, 'new_class')}</p>
                <h2>{editingGroup ? t(language, 'update_class') : t(language, 'create_class')}</h2>
              </div>
            </div>

            <form className="form-card" onSubmit={submitCreate}>
              <input required placeholder={t(language, 'subject_placeholder')} value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />

              <DateTimePicker
                value={draft.starts_at}
                onChange={(val) => setDraft({ ...draft, starts_at: val })}
                language={language}
                label={t(language, 'start_time_label') || 'Data e Horário de Início'}
                required
              />

              <div className="form-grid">
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', display: 'block' }}>
                    {t(language, 'duration_minutes') || 'Duração (minutos)'}
                  </label>
                  <select
                    value={draft.duration_minutes}
                    onChange={(event) => setDraft({ ...draft, duration_minutes: Number(event.target.value) })}
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min (1h)</option>
                    <option value={90}>90 min (1h30)</option>
                    <option value={120}>120 min (2h)</option>
                  </select>
                </div>
              </div>

              {!editingGroup && (
                <div className="calendar-form-section">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={repeatWeekly} onChange={(event) => setRepeatWeekly(event.target.checked)} />
                    {t(language, 'repeat_every_week')}
                  </label>
                  {repeatWeekly && (
                    <div className="form-grid">
                      <input type="number" min={2} max={52} value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))} />
                      <div className="field-note">
                        <p className="muted">{t(language, 'repeat_count_hint')}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="calendar-form-section">
                <h3>{t(language, 'students_participating').replace('{count}', String(selectedStudentIds.length))}</h3>
                <select
                  value=""
                  onChange={(event) => {
                    addStudent(event.target.value)
                    event.target.value = ''
                  }}
                >
                  <option value="">{t(language, 'select_student_add')}</option>
                  {sortedStudents.map((student) => (
                    <option key={student.id} value={student.id} disabled={selectedStudentIds.includes(student.id)}>
                      {student.full_name} {selectedStudentIds.includes(student.id) ? t(language, 'added_label') : ''}
                    </option>
                  ))}
                </select>

                {selectedStudentIds.length > 0 && (
                  <div className="selected-students-list">
                    {selectedStudentIds.map((studentId) => {
                      const student = profilesById[studentId]
                      const studentName = student?.full_name ?? t(language, 'role_student')

                      let attendanceStatus: 'attend' | 'cancel' | 'pending' = 'pending'
                      if (editingGroup) {
                        const lesson = lessons.find(
                          (item) => editingGroup.lessonIds.includes(item.id) && item.student_id === studentId,
                        )
                        if (lesson?.student_attendance === 'attend') attendanceStatus = 'attend'
                        else if (lesson?.student_attendance === 'cancel') attendanceStatus = 'cancel'
                      }

                      const dotColorClass =
                        attendanceStatus === 'attend'
                          ? 'calendar-status-dot-confirmed'
                          : attendanceStatus === 'cancel'
                          ? 'calendar-status-dot-cancelled'
                          : 'calendar-status-dot-pending'

                      const statusTitle =
                        attendanceStatus === 'attend'
                          ? t(language, 'confirmed_badge')
                          : attendanceStatus === 'cancel'
                          ? t(language, 'status_not_happened')
                          : t(language, 'pending')

                      return (
                        <div key={studentId} className="selected-student-chip">
                          <span className={`calendar-status-dot ${dotColorClass}`} title={statusTitle} />
                          <span className="selected-student-name">{studentName}</span>
                          <button
                            type="button"
                            className="chip-remove-button"
                            onClick={() => removeStudent(studentId)}
                            title={t(language, 'remove_student_title').replace('{name}', studentName)}
                            aria-label={t(language, 'remove_student_title').replace('{name}', studentName)}
                          >
                            &times;
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {allowCreateUsers && (
                <div className="calendar-form-section">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={createStudent} onChange={(event) => setCreateStudent(event.target.checked)} />
                    {t(language, 'create_student_login')}
                  </label>
                  {createStudent && (
                    <div className="form-grid">
                      <input
                        required
                        placeholder={t(language, 'student_full_name')}
                        value={studentDraft.full_name}
                        onChange={(event) => setStudentDraft({ ...studentDraft, full_name: event.target.value })}
                      />
                      <input
                        type="email"
                        placeholder={t(language, 'student_email_opt')}
                        value={studentDraft.email}
                        onChange={(event) => setStudentDraft({ ...studentDraft, email: event.target.value })}
                      />
                      <input
                        required
                        type="password"
                        placeholder={t(language, 'student_password')}
                        value={studentDraft.password}
                        onChange={(event) => setStudentDraft({ ...studentDraft, password: event.target.value })}
                      />
                      <input
                        placeholder={t(language, 'class_label_opt')}
                        value={studentDraft.class_name ?? ''}
                        onChange={(event) => setStudentDraft({ ...studentDraft, class_name: event.target.value })}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="calendar-form-section">
                <h3>{t(language, 'teacher')}</h3>
                {allowCreateUsers && allowTeacherChange && (
                  <label className="checkbox-row">
                    <input type="checkbox" checked={createTeacher} onChange={(event) => setCreateTeacher(event.target.checked)} />
                    {t(language, 'create_teacher_login')}
                  </label>
                )}

                {allowTeacherChange && !createTeacher ? (
                  <select value={draft.teacher_id} onChange={(event) => setDraft({ ...draft, teacher_id: event.target.value })}>
                    {sortedTeachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.full_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="field-note">
                    <p className="muted">{profilesById[currentTeacherId ?? draft.teacher_id]?.full_name ?? t(language, 'current_teacher')}</p>
                  </div>
                )}

                {allowCreateUsers && createTeacher && (
                  <div className="form-grid">
                    <input
                      required
                      placeholder={t(language, 'teacher_full_name')}
                      value={teacherDraft.full_name}
                      onChange={(event) => setTeacherDraft({ ...teacherDraft, full_name: event.target.value })}
                    />
                    <input
                      type="email"
                      placeholder={t(language, 'teacher_email_opt')}
                      value={teacherDraft.email}
                      onChange={(event) => setTeacherDraft({ ...teacherDraft, email: event.target.value })}
                    />
                    <input
                      required
                      type="password"
                      placeholder={t(language, 'teacher_password')}
                      value={teacherDraft.password}
                      onChange={(event) => setTeacherDraft({ ...teacherDraft, password: event.target.value })}
                    />
                    <input
                      placeholder={t(language, 'speciality_opt')}
                      value={teacherDraft.speciality ?? ''}
                      onChange={(event) => setTeacherDraft({ ...teacherDraft, speciality: event.target.value })}
                    />
                  </div>
                )}
              </div>

              {showUnsavedWarning && (
                <div
                  className="animate-fade-in"
                  style={{
                    background: 'rgba(245, 158, 11, 0.2)',
                    border: '1px solid #f59e0b',
                    borderRadius: '0.75rem',
                    padding: '0.85rem 1rem',
                    marginTop: '1rem',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    color: '#fbbf24',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    boxShadow: '0 0 20px rgba(245, 158, 11, 0.25)',
                  }}
                >
                  <span style={{ fontSize: '1.3rem' }}>⚠️</span>
                  <span>{t(language, 'save_or_cancel_first')}</span>
                </div>
              )}

              <div className="button-row wrap" style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
                {editingGroup && onDeleteLessonGroup && (
                  <button
                    type="button"
                    className="ghost-button"
                    style={{ color: '#ef4444', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    disabled={saving}
                    onClick={handleDeleteAppointment}
                  >
                    🗑️ {t(language, 'delete_class_btn') || 'Excluir Aula'}
                  </button>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                  <button className="secondary-button" type="button" onClick={closeModal} disabled={saving}>
                    {t(language, 'cancel')}
                  </button>
                  <button className="primary-button" type="submit" disabled={saving || selectedStudentIds.length === 0}>
                    {saving ? (editingGroup ? t(language, 'saving_label') : t(language, 'creating_label')) : editingGroup ? t(language, 'save_class_btn') : t(language, 'create_class_btn')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* AVAILABILITY MODAL */}
      {showAvailabilityModal && createPortal(
        <div
          className="reminder-app-scope modal-overlay"
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(2, 6, 23, 0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeAvailabilityModal()
            }
          }}
        >
          <div className="modal-card" style={{ maxWidth: '480px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="panel-header">
              <div>
                <p className="section-label">{t(language, 'availability_title')}</p>
                <h2>{selectedAvailability ? t(language, 'manage_availability_modal') : t(language, 'add_availability')}</h2>
              </div>
            </div>

            {selectedAvailability ? (
              // VIEW / DELETE EXISTING AVAILABILITY SLOT
              <div className="form-card" style={{ gap: '1.25rem' }}>
                {(() => {
                  const conflict = getSlotConflict(selectedAvailability)
                  const isBooked = !!conflict
                  const teacherProf = profilesById[selectedAvailability.teacher_id]

                  return (
                    <>
                      <div
                        style={{
                          padding: '1rem',
                          borderRadius: '0.75rem',
                          background: isBooked ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          border: `1px solid ${isBooked ? '#818cf8' : '#10b981'}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <strong style={{ fontSize: '1rem', color: isBooked ? '#c7d2fe' : '#34d399' }}>
                            {isBooked ? `🟣 ${t(language, 'occupied_slot')}` : `🟢 ${t(language, 'available_slot')}`}
                          </strong>
                          <span className={`calendar-status-dot ${isBooked ? 'calendar-status-dot-booked' : 'calendar-status-dot-available'}`} />
                        </div>

                        {isBooked && (
                          <div style={{ fontSize: '0.9rem', color: '#e2e8f0', marginTop: '0.25rem' }}>
                            <p style={{ margin: '0.2rem 0' }}>
                              <strong>Matéria:</strong> {conflict.subject || 'Aula'}
                            </p>
                            <p style={{ margin: '0.2rem 0' }}>
                              <strong>Aluno:</strong> {profilesById[conflict.student_id]?.full_name || 'Aluno'}
                            </p>
                          </div>
                        )}

                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                          <p style={{ margin: '0.2rem 0' }}>
                            <strong>Professor:</strong> {teacherProf?.full_name || t(language, 'teacher')}
                          </p>
                          <p style={{ margin: '0.2rem 0' }}>
                            <strong>Início:</strong> {availabilityStartsAt.replace('T', ' ')} ({selectedAvailability.duration_minutes} min)
                          </p>
                          {selectedAvailability.series_id && (
                            <p style={{ margin: '0.2rem 0', color: '#38bdf8' }}>
                              🔁 <strong>{t(language, 'every_week')}</strong> (Horário recorrente)
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Deletion Scope Selector if part of a recurring series */}
                      {selectedAvailability.series_id && (
                        <div style={{ padding: '0.85rem', background: '#0f172a', borderRadius: '0.65rem', border: '1px solid #334155' }}>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                            {t(language, 'delete_scope_prompt')}
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.84rem', color: '#cbd5e1' }}>
                              <input
                                type="radio"
                                name="delete_scope"
                                checked={availabilityDeleteScope === 'this'}
                                onChange={() => setAvailabilityDeleteScope('this')}
                              />
                              <span>{t(language, 'delete_only_this')}</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.84rem', color: '#cbd5e1' }}>
                              <input
                                type="radio"
                                name="delete_scope"
                                checked={availabilityDeleteScope === 'future'}
                                onChange={() => setAvailabilityDeleteScope('future')}
                              />
                              <span>{t(language, 'delete_this_and_future')}</span>
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="button-row wrap" style={{ justifyContent: 'space-between', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="ghost-button"
                          style={{ color: '#ef4444', borderColor: '#ef4444' }}
                          disabled={isSubmittingAvailability}
                          onClick={() => {
                            if (window.confirm(t(language, 'delete_availability_confirm'))) {
                              void handleDeleteAvailabilitySlot(selectedAvailability, availabilityDeleteScope)
                            }
                          }}
                        >
                          🗑️ {t(language, 'remove_availability')}
                        </button>
                        <button type="button" className="secondary-button" onClick={closeAvailabilityModal}>
                          {t(language, 'close')}
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : (
              // CREATE NEW AVAILABILITY SLOT
              <form className="form-card" onSubmit={handleSaveAvailability}>
                <DateTimePicker
                  value={availabilityStartsAt}
                  onChange={(val) => setAvailabilityStartsAt(val)}
                  language={language}
                  label={t(language, 'start_time_label') || 'Data e Horário de Início'}
                  required
                />

                <div className="form-grid">
                  <div>
                    <label style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', display: 'block' }}>
                      {t(language, 'duration_minutes') || 'Duração (minutos)'}
                    </label>
                    <select
                      value={availabilityDuration}
                      onChange={(e) => setAvailabilityDuration(Number(e.target.value))}
                    >
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min (1h)</option>
                      <option value={90}>90 min (1h30)</option>
                      <option value={120}>120 min (2h)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', display: 'block' }}>
                      {t(language, 'recurrence_type')}
                    </label>
                    <select
                      value={availabilityRecurrenceType}
                      onChange={(e) => setAvailabilityRecurrenceType(e.target.value as 'single' | 'weekly')}
                    >
                      <option value="single">{t(language, 'only_this_day')}</option>
                      <option value="weekly">{t(language, 'every_week')}</option>
                    </select>
                  </div>
                </div>

                {availabilityRecurrenceType === 'weekly' && (
                  <div>
                    <label style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', display: 'block' }}>
                      {t(language, 'repeat_duration')}
                    </label>
                    <select
                      value={availabilityRepeatWeeks}
                      onChange={(e) => setAvailabilityRepeatWeeks(Number(e.target.value))}
                    >
                      <option value={4}>4 semanas (1 mês)</option>
                      <option value={8}>8 semanas (2 meses)</option>
                      <option value={12}>12 semanas (3 meses)</option>
                    </select>
                  </div>
                )}

                {role === 'admin' && (
                  <div>
                    <label style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', display: 'block' }}>
                      {t(language, 'teacher')}
                    </label>
                    <select
                      value={availabilityTeacherId}
                      onChange={(e) => setAvailabilityTeacherId(e.target.value)}
                    >
                      {sortedTeachers.map((tch) => (
                        <option key={tch.id} value={tch.id}>
                          {tch.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="button-row wrap" style={{ marginTop: '0.5rem' }}>
                  <button className="secondary-button" type="button" onClick={closeAvailabilityModal} disabled={isSubmittingAvailability}>
                    {t(language, 'cancel')}
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={isSubmittingAvailability}
                    style={{ background: '#059669', borderColor: '#10b981' }}
                  >
                    {isSubmittingAvailability ? t(language, 'saving_label') : t(language, 'set_available_btn')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
