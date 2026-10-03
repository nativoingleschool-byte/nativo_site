import React, { useMemo, useState } from 'react'
import { addMonths, addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import { ptBR } from 'date-fns/locale/pt-BR'
import { es as esLocale } from 'date-fns/locale/es'

const locales: Record<string, any> = { en: enUS, pt: ptBR, es: esLocale }

export type CalendarEventItem = {
  id: string
  type?: 'lesson' | 'availability'
  start: Date
  end: Date
  title: string
  subtitle?: string
  color?: 'blue' | 'green'
  sourceData: any
}

interface MobileCalendarProps {
  events: CalendarEventItem[]
  language: string
  dayStartHour?: number
  dayEndHour?: number
  onSelectEvent: (event: CalendarEventItem) => void
  onSelectSlot: (start: Date) => void
  onEventDrop?: (event: CalendarEventItem, newStart: Date, newEnd: Date) => void
}

/**
 * Grade mensal do portal docente.
 *
 * A camada abaixo é apenas a apresentação do calendário: os eventos continuam
 * vindo do mesmo array, os cliques continuam chamando os mesmos callbacks e
 * nenhuma regra de persistência ou consulta foi alterada.
 */
export default function MobileCalendar({
  events,
  language,
  onSelectEvent,
  onSelectSlot,
}: MobileCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const locale = locales[language] || enUS
  const today = new Date()

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    const days: Date[] = []
    let cursor = gridStart
    while (cursor <= gridEnd) {
      days.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return days
  }, [currentDate])

  const weekDays = useMemo(() => {
    const monday = startOfWeek(currentDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
  }, [currentDate])

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEventItem[]>()
    events.forEach((event) => {
      const key = format(event.start, 'yyyy-MM-dd')
      const current = grouped.get(key) || []
      current.push(event)
      grouped.set(key, current)
    })
    grouped.forEach((items) => items.sort((a, b) => a.start.getTime() - b.start.getTime()))
    return grouped
  }, [events])

  const monthLabel = format(currentDate, 'MMMM yyyy', { locale })
  const todayKey = format(today, 'yyyy-MM-dd')

  return (
    <div className="teacher-calendar-shell" aria-label={language === 'pt' ? 'Calendário mensal' : 'Monthly calendar'}>
      <div className="teacher-calendar-toolbar">
        <div className="teacher-calendar-toolbar-left">
          <button type="button" className="calendar-today-button" onClick={() => setCurrentDate(new Date())}>
            {language === 'pt' ? 'Hoje' : language === 'es' ? 'Hoy' : 'Today'}
          </button>
          <button type="button" className="calendar-nav-button" aria-label="Previous month" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>‹</button>
          <button type="button" className="calendar-nav-button" aria-label="Next month" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>›</button>
          <h3 className="teacher-calendar-month">{monthLabel}</h3>
        </div>
        <div className="teacher-calendar-toolbar-right">
          <div className="calendar-view-switcher" aria-label="Calendar view">
            <button type="button" className="is-active">{language === 'pt' ? 'Mês' : 'Month'}</button>
            <button type="button">{language === 'pt' ? 'Semana' : 'Week'}</button>
            <button type="button">{language === 'pt' ? 'Agenda' : 'Agenda'}</button>
          </div>
          <button type="button" className="calendar-availability-button" onClick={() => onSelectSlot(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 9, 0, 0))}>
            <span aria-hidden="true">◷</span> {language === 'pt' ? 'Disponibilidade' : 'Availability'}
          </button>
        </div>
      </div>

      <div className="teacher-calendar-grid">
        <div className="teacher-calendar-weekdays">
          {weekDays.map((day) => (
            <div key={format(day, 'EEE')} className="teacher-calendar-weekday">{format(day, 'EEEE', { locale })}</div>
          ))}
        </div>
        <div className="teacher-calendar-days">
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const dayEvents = eventsByDay.get(key) || []
            const isToday = key === todayKey
            const outsideMonth = !isSameMonth(day, currentDate)
            return (
              <div
                key={key}
                className={`teacher-calendar-day${outsideMonth ? ' is-outside' : ''}${isToday ? ' is-today' : ''}`}
                onClick={(event) => {
                  if (event.target === event.currentTarget) onSelectSlot(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0))
                }}
              >
                <div className="teacher-calendar-date-row">
                  <span className="teacher-calendar-date">{format(day, 'd')}</span>
                  {isToday && <span className="teacher-calendar-today-label">Hoje</span>}
                </div>
                <div className="teacher-calendar-events">
                  {dayEvents.slice(0, 3).map((event) => (
                    <button
                      type="button"
                      key={event.id}
                      className={`teacher-calendar-event ${event.color === 'green' ? 'is-green' : event.type === 'availability' ? 'is-gold' : 'is-blue'}`}
                      onClick={(clickEvent) => { clickEvent.stopPropagation(); onSelectEvent(event) }}
                      title={event.subtitle ? `${event.title} — ${event.subtitle}` : event.title}
                    >
                      <strong>{format(event.start, 'HH:mm')} • {event.title}</strong>
                      {event.subtitle && <span>{event.subtitle}</span>}
                    </button>
                  ))}
                  {dayEvents.length > 3 && <span className="teacher-calendar-more">+{dayEvents.length - 3} mais</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
