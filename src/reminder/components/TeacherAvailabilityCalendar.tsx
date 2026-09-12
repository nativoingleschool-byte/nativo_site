import React, { useState, useMemo, useCallback } from 'react'
import { Calendar, dateFnsLocalizer, Views, Event as RbcEvent, SlotInfo } from 'react-big-calendar'
import withDragAndDrop, { EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import { ptBR } from 'date-fns/locale/pt-BR'
import { es as esLocale } from 'date-fns/locale/es'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { Lesson, Profile, TeacherAvailability } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { useToast } from '../lib/toast'

const locales = {
  'en': enUS,
  'pt': ptBR,
  'es': esLocale,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

const DnDCalendar = withDragAndDrop(Calendar as any)

type CalendarEvent = RbcEvent & {
  id: string
  type: 'lesson' | 'availability'
  sourceData: Lesson | TeacherAvailability
}

// --- Timezone Spoofing Helpers ---
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

// Converts a real UTC date string to a JS Date object whose local time matches the target timezone
const shiftToAppTimeZone = (utcIso: string, timeZone: string): Date => {
  const realDate = new Date(utcIso)
  const parts = getZonedParts(realDate, timeZone)
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

// Converts a JS Date object whose local time represents a time in the target timezone back to a real UTC date string
const shiftFromAppTimeZoneToUtcIso = (fakeLocalDate: Date, timeZone: string): string => {
  const year = fakeLocalDate.getFullYear()
  const month = fakeLocalDate.getMonth() + 1
  const day = fakeLocalDate.getDate()
  const hour = fakeLocalDate.getHours()
  const minute = fakeLocalDate.getMinutes()
  
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  
  const getTimeZoneOffsetMinutes = (date: Date, tz: string) => {
    const p = getZonedParts(date, tz)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    return (asUtc - date.getTime()) / 60000
  }
  
  let offset = getTimeZoneOffsetMinutes(new Date(utcGuess), timeZone)
  let timestamp = utcGuess + offset * 60000
  const nextOffset = getTimeZoneOffsetMinutes(new Date(timestamp), timeZone)
  if (nextOffset !== offset) {
    timestamp = utcGuess + nextOffset * 60000
  }
  return new Date(timestamp).toISOString()
}

interface TeacherAvailabilityCalendarProps {
  lessons: Lesson[]
  availabilities: TeacherAvailability[]
  timeZone: string
  language: Language
  currentTeacherId?: string
  role?: 'teacher' | 'admin'
  onCreateAvailability?: (draft: { starts_at: string; duration_minutes: number; teacher_id?: string; repeat_weeks?: number; series_id?: string | null }) => Promise<void>
  onDeleteAvailability?: (options: { id: string; series_id?: string | null; starts_at?: string; series_scope?: 'this' | 'future' }) => Promise<void>
  onEditLesson?: (lesson: Lesson) => void 
  onCreateLessonSlot?: (startUtc: string, durationMinutes: number) => void
  onEditAvailability?: (avail: TeacherAvailability) => void
  profilesById: Record<string, Profile>
}

export default function TeacherAvailabilityCalendar({
  lessons,
  availabilities,
  timeZone,
  language,
  currentTeacherId,
  role = 'teacher',
  onCreateAvailability,
  onDeleteAvailability,
  onEditLesson,
  onCreateLessonSlot,
  onEditAvailability,
  profilesById
}: TeacherAvailabilityCalendarProps) {
  const { toast } = useToast()

  const events = useMemo<CalendarEvent[]>(() => {
    const evts: CalendarEvent[] = []

    // 1. Map lessons (read-only)
    const visibleLessons = currentTeacherId ? lessons.filter(l => l.teacher_id === currentTeacherId) : lessons
    visibleLessons.forEach(lesson => {
      const start = shiftToAppTimeZone(lesson.starts_at, timeZone)
      const end = new Date(start.getTime() + (lesson.duration_minutes || 60) * 60000)
      
      const studentObj = profilesById[lesson.student_id]
      const studentName = studentObj?.full_name || lesson.class_name || 'Aluno'
      const teacherName = role === 'admin' ? (profilesById[lesson.teacher_id]?.full_name || 'Teacher') + ' - ' : ''
      
      evts.push({
        id: `lesson-${lesson.id}`,
        type: 'lesson',
        title: `${teacherName}${studentName} - ${lesson.subject}`,
        start,
        end,
        sourceData: lesson
      })
    })

    // 2. Map availabilities (draggable)
    const visibleAvailabilities = currentTeacherId ? availabilities.filter(a => a.teacher_id === currentTeacherId) : availabilities
    visibleAvailabilities.forEach(avail => {
      const start = shiftToAppTimeZone(avail.starts_at, timeZone)
      const end = new Date(start.getTime() + (avail.duration_minutes || 60) * 60000)
      const teacherName = role === 'admin' ? (profilesById[avail.teacher_id]?.full_name || 'Teacher') : ''

      evts.push({
        id: `avail-${avail.id}`,
        type: 'availability',
        title: role === 'admin' ? `🟢 ${teacherName}` : (t(language, 'available_status') || 'Available'),
        start,
        end,
        sourceData: avail
      })
    })

    return evts
  }, [lessons, availabilities, timeZone, currentTeacherId, profilesById, language, role])

  const handleSelectSlot = useCallback(async (slotInfo: SlotInfo) => {
    const utcStart = shiftFromAppTimeZoneToUtcIso(slotInfo.start, timeZone)
    const durationMinutes = Math.round((slotInfo.end.getTime() - slotInfo.start.getTime()) / 60000)
    
    if (role === 'admin' && onCreateLessonSlot) {
      onCreateLessonSlot(utcStart, durationMinutes)
      return
    }

    if (!onCreateAvailability) return
    try {
      await onCreateAvailability({
        starts_at: utcStart,
        duration_minutes: durationMinutes,
        teacher_id: currentTeacherId
      })
      toast.success(t(language, 'availability_created') || 'Availability added')
    } catch (err: any) {
      toast.error(err.message || 'Error creating availability')
    }
  }, [onCreateAvailability, onCreateLessonSlot, role, timeZone, currentTeacherId, language, toast])

  const handleEventDrop = useCallback(async (args: EventInteractionArgs<CalendarEvent>) => {
    const { event, start, end } = args
    if (event.type === 'lesson') {
      toast.error('Classes cannot be rescheduled by dragging. Please click to edit.')
      return
    }

    const avail = event.sourceData as TeacherAvailability
    const utcStart = shiftFromAppTimeZoneToUtcIso(start as Date, timeZone)
    const durationMinutes = Math.round(((end as Date).getTime() - (start as Date).getTime()) / 60000)

    try {
      if (onDeleteAvailability && onCreateAvailability) {
        await onDeleteAvailability({ id: avail.id })
        await onCreateAvailability({
          starts_at: utcStart,
          duration_minutes: durationMinutes,
          teacher_id: currentTeacherId || avail.teacher_id
        })
        toast.success('Availability updated')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating availability')
    }
  }, [onDeleteAvailability, onCreateAvailability, timeZone, currentTeacherId, toast])

  const handleEventResize = useCallback(async (args: EventInteractionArgs<CalendarEvent>) => {
    const { event, start, end } = args
    if (event.type === 'lesson') {
      toast.error('Classes cannot be resized by dragging. Please click to edit.')
      return
    }

    const avail = event.sourceData as TeacherAvailability
    const utcStart = shiftFromAppTimeZoneToUtcIso(start as Date, timeZone)
    const durationMinutes = Math.round(((end as Date).getTime() - (start as Date).getTime()) / 60000)

    try {
      if (onDeleteAvailability && onCreateAvailability) {
        await onDeleteAvailability({ id: avail.id })
        await onCreateAvailability({
          starts_at: utcStart,
          duration_minutes: durationMinutes,
          teacher_id: currentTeacherId || avail.teacher_id
        })
        toast.success('Availability resized')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error resizing availability')
    }
  }, [onDeleteAvailability, onCreateAvailability, timeZone, currentTeacherId, toast])

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    if (event.type === 'lesson') {
      if (onEditLesson) {
        onEditLesson(event.sourceData as Lesson)
      } else {
        toast.info('Click edit on the list view to modify this class.')
      }
    } else {
      const avail = event.sourceData as TeacherAvailability
      if (role === 'admin' && onEditAvailability) {
        onEditAvailability(avail)
      } else {
        if (window.confirm('Delete this availability block?')) {
          if (onDeleteAvailability) {
            onDeleteAvailability({ id: avail.id }).then(() => {
              toast.success('Availability removed')
            }).catch((err) => {
              toast.error(err.message || 'Error removing availability')
            })
          }
        }
      }
    }
  }, [onEditLesson, onDeleteAvailability, onEditAvailability, role, toast])

  const eventPropGetter = useCallback((event: CalendarEvent) => {
    if (event.type === 'lesson') {
      return {
        className: 'rbc-event-lesson'
      }
    }
    return {
      className: 'rbc-event-availability'
    }
  }, [])

  return (
    <div className="calendar-container w-[calc(100%+32px)] -ml-4 sm:w-full sm:ml-0 h-[750px] bg-slate-900/60 rounded-none sm:rounded-2xl border-y sm:border border-slate-700/50 p-1 sm:p-4 shadow-xl backdrop-blur-md">
      <DnDCalendar
        localizer={localizer}
        events={events}
        defaultView={Views.WEEK}
        views={[Views.MONTH, Views.WEEK, Views.DAY]}
        step={30}
        timeslots={2}
        selectable
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        onEventDrop={handleEventDrop}
        onEventResize={handleEventResize}
        eventPropGetter={eventPropGetter}
        draggableAccessor={(event: CalendarEvent) => event.type === 'availability'}
        resizableAccessor={(event: CalendarEvent) => event.type === 'availability'}
        className="google-calendar-clone"
        messages={{
          today: t(language, 'today') || 'Today',
          previous: '<',
          next: '>',
          month: t(language, 'month') || 'Month',
          week: t(language, 'week') || 'Week',
          day: t(language, 'day') || 'Day',
        }}
      />
    </div>
  )
}
