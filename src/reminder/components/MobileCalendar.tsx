import React, { useMemo, useState } from 'react'
import {
  addMonths,
  addDays,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns'
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
  defaultView?: 'month' | 'week' | 'agenda'
  hideAvailabilityLayer?: boolean
  syncStatusLabel?: string
  onSelectEvent: (event: CalendarEventItem) => void
  onSelectAgendaEvent?: (event: CalendarEventItem) => void
  onSelectSlot: (start: Date) => void
  onEventDrop?: (event: CalendarEventItem, newStart: Date, newEnd: Date) => void
}

export default function MobileCalendar({
  events,
  language,
  dayStartHour = 7,
  dayEndHour = 22,
  defaultView = 'month',
  hideAvailabilityLayer = false,
  syncStatusLabel,
  onSelectEvent,
  onSelectAgendaEvent,
  onSelectSlot,
}: MobileCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week' | 'agenda'>(defaultView)
  const [showLessons, setShowLessons] = useState(true)
  const [showAvailabilities, setShowAvailabilities] = useState(true)

  const locale = locales[language] || enUS
  const today = new Date()
  const todayKey = format(today, 'yyyy-MM-dd')

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const isAvail = event.type === 'availability'
      if (isAvail && (hideAvailabilityLayer || !showAvailabilities)) return false
      if (!isAvail && !showLessons) return false
      return true
    })
  }, [events, hideAvailabilityLayer, showAvailabilities, showLessons])

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
    filteredEvents.forEach((event) => {
      const key = format(event.start, 'yyyy-MM-dd')
      const current = grouped.get(key) || []
      current.push(event)
      grouped.set(key, current)
    })
    grouped.forEach((items) => items.sort((a, b) => a.start.getTime() - b.start.getTime()))
    return grouped
  }, [filteredEvents])

  const monthLabel = format(currentDate, 'MMMM yyyy', { locale })
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
  const weekLabel = `${format(weekStart, 'd', { locale })} a ${format(weekEnd, "d 'de' MMMM", { locale })}`
  const agendaEvents = Array.from(eventsByDay.values())
    .flat()
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  const weekEvents = agendaEvents.filter((event) => event.start >= weekStart && event.start <= weekEnd)
  const upcomingAgendaEvents = agendaEvents.filter((event) => event.start >= today)

  // Compute visible hour rows for the Google Calendar Week Time-Grid
  const gridHours = useMemo(() => {
    let minHour = Math.max(6, Math.min(8, dayStartHour || 7))
    let maxHour = Math.min(23, Math.max(21, dayEndHour || 22))
    weekEvents.forEach((evt) => {
      const h = evt.start.getHours()
      if (h < minHour) minHour = h
      if (h > maxHour) maxHour = h
    })
    const hours: number[] = []
    for (let h = minHour; h <= maxHour; h++) {
      hours.push(h)
    }
    return hours
  }, [dayStartHour, dayEndHour, weekEvents])

  const handlePrev = () => {
    if (view === 'week') {
      setCurrentDate(subWeeks(currentDate, 1))
    } else {
      setCurrentDate(subMonths(currentDate, 1))
    }
  }

  const handleNext = () => {
    if (view === 'week') {
      setCurrentDate(addWeeks(currentDate, 1))
    } else {
      setCurrentDate(addMonths(currentDate, 1))
    }
  }

  const resolvedSyncLabel =
    syncStatusLabel ||
    (language === 'pt'
      ? 'Google Agenda: Sincronizado'
      : language === 'es'
        ? 'Google Calendar: Sincronizado'
        : 'Google Calendar: Synced')

  return (
    <div className="teacher-calendar-shell" aria-label={language === 'pt' ? 'Calendário mensal' : 'Monthly calendar'}>
      <div className="teacher-calendar-toolbar">
        <div className="teacher-calendar-toolbar-left">
          <button type="button" className="calendar-today-button" onClick={() => setCurrentDate(new Date())}>
            {language === 'pt' ? 'Hoje' : language === 'es' ? 'Hoy' : 'Today'}
          </button>
          <button type="button" className="calendar-nav-button" aria-label="Previous period" onClick={handlePrev}>
            ‹
          </button>
          <button type="button" className="calendar-nav-button" aria-label="Next period" onClick={handleNext}>
            ›
          </button>
          <h3 className="teacher-calendar-month">{view === 'week' ? weekLabel : monthLabel}</h3>

          <span
            className="gcal-sync-pill"
            title={
              language === 'pt'
                ? 'As aulas são sincronizadas automaticamente com o Google Agenda pessoal do professor e dos alunos'
                : 'Classes are automatically synced with teacher and student personal Google Calendars'
            }
          >
            <span className="gcal-sync-pill__dot" aria-hidden="true" />
            {resolvedSyncLabel}
          </span>
        </div>

        <div className="teacher-calendar-toolbar-right">
          {!hideAvailabilityLayer && (
            <div className="gcal-layer-toggles" aria-label={language === 'pt' ? 'Camadas do calendário' : 'Calendar layers'}>
              <label className="gcal-layer-toggle">
                <input
                  type="checkbox"
                  checked={showLessons}
                  onChange={(e) => setShowLessons(e.target.checked)}
                />
                <span className="gcal-layer-swatch gcal-layer-swatch--lesson" aria-hidden="true" />
                <span>{language === 'pt' ? 'Aulas' : language === 'es' ? 'Clases' : 'Classes'}</span>
              </label>
              <label className="gcal-layer-toggle">
                <input
                  type="checkbox"
                  checked={showAvailabilities}
                  onChange={(e) => setShowAvailabilities(e.target.checked)}
                />
                <span className="gcal-layer-swatch gcal-layer-swatch--avail" aria-hidden="true" />
                <span>{language === 'pt' ? 'Disponibilidade' : language === 'es' ? 'Disponibilidad' : 'Availability'}</span>
              </label>
            </div>
          )}

          <div className="calendar-view-switcher" aria-label="Calendar view">
            <button type="button" className={view === 'month' ? 'is-active' : ''} onClick={() => setView('month')}>
              {language === 'pt' ? 'Mês' : language === 'es' ? 'Mes' : 'Month'}
            </button>
            <button type="button" className={view === 'week' ? 'is-active' : ''} onClick={() => setView('week')}>
              {language === 'pt' ? 'Semana' : 'Week'}
            </button>
            <button type="button" className={view === 'agenda' ? 'is-active' : ''} onClick={() => setView('agenda')}>
              {language === 'pt' ? 'Agenda' : 'Agenda'}
            </button>
          </div>
          {!hideAvailabilityLayer && (
            <button
              type="button"
              className="calendar-availability-button"
              onClick={() => onSelectSlot(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 9, 0, 0))}
            >
              <span aria-hidden="true">◷</span> {language === 'pt' ? 'Disponibilidade' : 'Availability'}
            </button>
          )}
        </div>
      </div>

      {/* MONTH VIEW */}
      {view === 'month' && (
        <div className="teacher-calendar-grid">
          <div className="teacher-calendar-weekdays">
            {weekDays.map((day) => (
              <div key={format(day, 'EEE')} className="teacher-calendar-weekday">
                {format(day, 'EEEE', { locale })}
              </div>
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
                    if (event.target === event.currentTarget) {
                      onSelectSlot(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0))
                    }
                  }}
                >
                  <div className="teacher-calendar-date-row">
                    <span className="teacher-calendar-date">{format(day, 'd')}</span>
                    {isToday && (
                      <span className="teacher-calendar-today-label">
                        {language === 'pt' ? 'Hoje' : language === 'es' ? 'Hoy' : 'Today'}
                      </span>
                    )}
                  </div>
                  <div className="teacher-calendar-events">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        type="button"
                        key={event.id}
                        className={`teacher-calendar-event ${
                          event.type === 'availability'
                            ? 'is-avail-pill'
                            : event.color === 'green'
                              ? 'is-green'
                              : 'is-blue'
                        }`}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          onSelectEvent(event)
                        }}
                        title={event.subtitle ? `${event.title} — ${event.subtitle}` : event.title}
                      >
                        <strong>
                          {format(event.start, 'HH:mm')} • {event.title}
                        </strong>
                        {event.subtitle && <span>{event.subtitle}</span>}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="teacher-calendar-more">+{dayEvents.length - 3} mais</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* GOOGLE CALENDAR WEEK TIME-GRID VIEW */}
      {view === 'week' && (
        <section className="teacher-calendar-list-view gcal-week-view" aria-label="Visualização semanal">
          <div className="teacher-calendar-list-view__heading">
            <span>Semana de {weekLabel}</span>
            <strong>
              {weekEvents.length} {weekEvents.length === 1 ? 'evento nesta semana' : 'eventos nesta semana'}
            </strong>
          </div>

          <div className="gcal-week-grid-container">
            <div className="gcal-week-header-row">
              <div className="gcal-week-time-gutter-header">GMT</div>
              {weekDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const isToday = key === todayKey
                return (
                  <div key={key} className={`gcal-week-day-header${isToday ? ' is-today' : ''}`}>
                    <span className="gcal-week-day-name">{format(day, 'EEE', { locale }).toUpperCase()}</span>
                    <span className={`gcal-week-day-number${isToday ? ' is-today' : ''}`}>
                      {format(day, 'd')}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="gcal-week-scroll-body">
              {gridHours.map((hour) => (
                <div key={hour} className="gcal-week-hour-row">
                  <div className="gcal-week-time-label">{String(hour).padStart(2, '0')}:00</div>
                  {weekDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd')
                    const isToday = key === todayKey
                    const dayEvts = (eventsByDay.get(key) || []).filter(
                      (evt) => evt.start.getHours() === hour
                    )
                    return (
                      <div
                        key={`${key}-${hour}`}
                        className={`gcal-week-slot${isToday ? ' is-today' : ''}`}
                        onClick={(e) => {
                          if (e.target === e.currentTarget) {
                            onSelectSlot(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0))
                          }
                        }}
                      >
                        {dayEvts.map((event) => {
                          const isAvail = event.type === 'availability'
                          const hasZoom = Boolean(event.sourceData?.meeting_url)
                          return (
                            <button
                              type="button"
                              key={event.id}
                              className={`gcal-week-event ${
                                isAvail
                                  ? 'gcal-week-event--avail'
                                  : event.color === 'green'
                                    ? 'gcal-week-event--done'
                                    : 'gcal-week-event--lesson'
                              }`}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation()
                                onSelectEvent(event)
                              }}
                              title={event.subtitle ? `${event.title} — ${event.subtitle}` : event.title}
                            >
                              <div className="gcal-week-event__top">
                                <strong>
                                  {format(event.start, 'HH:mm')} · {event.title}
                                </strong>
                                {!isAvail && (
                                  <span className="gcal-week-event__badge">
                                    {hasZoom ? 'Zoom · GCal ✓' : 'GCal ✓'}
                                  </span>
                                )}
                              </div>
                              {event.subtitle && (
                                <span className="gcal-week-event__subtitle">{event.subtitle}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* AGENDA VIEW */}
      {view === 'agenda' && (
        <section className="teacher-calendar-list-view" aria-label="Visualização em agenda">
          <div className="teacher-calendar-list-view__heading">
            <span>Próximos encontros</span>
            <strong>
              {upcomingAgendaEvents.length}{' '}
              {upcomingAgendaEvents.length === 1 ? 'aula cadastrada' : 'aulas cadastradas'}
            </strong>
          </div>
          {upcomingAgendaEvents.length === 0 ? (
            <p className="teacher-calendar-empty">Nenhum próximo encontro</p>
          ) : (
            <div className="teacher-calendar-week-list">
              {upcomingAgendaEvents.map((event) => {
                const isLesson = event.type === 'lesson'
                const meetingUrl = event.sourceData?.meeting_url
                return (
                  <div key={event.id} className="gcal-agenda-row">
                    <button
                      type="button"
                      className="teacher-calendar-list-event"
                      aria-label={isLesson ? `${event.title}: adicionar ao Google Agenda` : undefined}
                      onClick={() => (onSelectAgendaEvent ?? onSelectEvent)(event)}
                    >
                      <strong>{format(event.start, "EEEE, d 'de' MMMM", { locale })}</strong>
                      <span>
                        {format(event.start, 'HH:mm')} • {event.title}
                        {event.subtitle ? ` (${event.subtitle})` : ''}
                        {isLesson ? ' · Sincronizado com Google Agenda ✓' : ''}
                      </span>
                    </button>
                    {isLesson && meetingUrl && (
                      <a
                        href={meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="gcal-agenda-zoom-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Entrar no Zoom
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
