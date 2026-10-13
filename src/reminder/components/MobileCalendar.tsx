import React, { useMemo, useRef, useState, useEffect } from 'react'
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes, startOfDay, addWeeks, subWeeks } from 'date-fns'
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
  onSelectAgendaEvent?: (event: CalendarEventItem) => void
  onSelectSlot: (start: Date) => void
  onEventDrop?: (event: CalendarEventItem, newStart: Date, newEnd: Date) => void // Kept for API compatibility, though DnD is omitted for mobile simplicity
}

export default function MobileCalendar({
  events,
  language,
  dayStartHour = 0,
  dayEndHour = 24,
  onSelectEvent,
  onSelectAgendaEvent,
  onSelectSlot,
}: MobileCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week' | 'agenda'>('month')
  const locale = locales[language] || enUS
  const today = new Date()

  useEffect(() => {
    if (initialScrolledRef.current || !scrollContainerRef.current) return
    const el = scrollContainerRef.current

    // Check if there are any events earlier than 7am in the visible events
    const hasEarlyEvents = events.some((e) => {
      const h = e.start.getHours()
      return h >= 0 && h < 7
    })

  const monthLabel = format(currentDate, 'MMMM yyyy', { locale })
  const todayKey = format(today, 'yyyy-MM-dd')
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
  const weekLabel = `${format(weekStart, 'd', { locale })} a ${format(weekEnd, "d 'de' MMMM", { locale })}`
  const agendaEvents = Array.from(eventsByDay.values()).flat().sort((a, b) => a.start.getTime() - b.start.getTime())

  return (
    <div className="flex flex-col h-[750px] bg-[#030712] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden font-sans">
      
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#0a0f1c]">
        <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-800/50 rounded-lg hover:bg-slate-700">
          &lt;
        </button>
        <div className="flex items-center gap-4">
          <span className="font-bold text-lg text-slate-200 capitalize">
            {format(currentDate, 'MMMM yyyy', { locale })}
          </span>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm font-semibold text-indigo-400 bg-indigo-500/10 rounded-md hover:bg-indigo-500/20">
            {language === 'pt' ? 'Hoje' : language === 'es' ? 'Hoy' : 'Today'}
          </button>
          <button type="button" className="calendar-nav-button" aria-label="Previous month" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>‹</button>
          <button type="button" className="calendar-nav-button" aria-label="Next month" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>›</button>
          <h3 className="teacher-calendar-month">{monthLabel}</h3>
        </div>
        <div className="teacher-calendar-toolbar-right">
          <div className="calendar-view-switcher" aria-label="Calendar view">
            <button type="button" className={view === 'month' ? 'is-active' : ''} onClick={() => setView('month')}>{language === 'pt' ? 'Mês' : 'Month'}</button>
            <button type="button" className={view === 'week' ? 'is-active' : ''} onClick={() => setView('week')}>{language === 'pt' ? 'Semana' : 'Week'}</button>
            <button type="button" className={view === 'agenda' ? 'is-active' : ''} onClick={() => setView('agenda')}>{language === 'pt' ? 'Agenda' : 'Agenda'}</button>
          </div>
          <button type="button" className="calendar-availability-button" onClick={() => onSelectSlot(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 9, 0, 0))}>
            <span aria-hidden="true">◷</span> {language === 'pt' ? 'Disponibilidade' : 'Availability'}
          </button>
        </div>
        <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-800/50 rounded-lg hover:bg-slate-700">
          &gt;
        </button>
      </div>

      {view === 'month' && <div className="teacher-calendar-grid">
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
              ))}
            </div>

            {/* Days Content */}
            <div className="flex-1 flex relative">
              {/* Horizontal Lines */}
              <div className="absolute inset-0 pointer-events-none flex flex-col">
                {hours.map(hour => (
                  <div key={hour} className="flex-1 border-b border-slate-700/30" />
                ))}
              </div>

              {days.map((day, idx) => {
                const { maxColumns, placedEvents } = dayLayouts[idx]
                const minWidthPx = Math.max(104, maxColumns * 110)

                return (
                  <div 
                    key={idx} 
                    className="flex-1 relative border-r border-slate-700/30 cursor-pointer hover:bg-slate-800/20 transition-colors group"
                    style={{ minWidth: `${minWidthPx}px` }}
                    onClick={(e) => handleSlotClick(day, e)}
                  >
                    {placedEvents.map((pe, eIdx) => {
                      const isBlue = pe.event.color === 'blue'
                      const bgColor = isBlue ? 'bg-blue-500/20' : 'bg-emerald-500/20'
                      const borderColor = isBlue ? 'border-blue-500' : 'border-emerald-500'
                      const textColor = isBlue ? 'text-blue-200' : 'text-emerald-200'

                      return (
                        <div
                          key={eIdx}
                          onClick={(e) => { e.stopPropagation(); onSelectEvent(pe.event) }}
                          className={`absolute rounded-md border-l-[3px] p-1 overflow-hidden transition-all hover:brightness-125 cursor-pointer shadow-sm hover:z-50 ${bgColor} ${borderColor}`}
                          style={{
                            top: `${pe.top}%`,
                            height: `${pe.height}%`,
                            left: `calc(${pe.left}% + 2px)`,
                            width: `calc(${pe.width}% - 4px)`,
                            zIndex: pe.zIndex,
                          }}
                        >
                          <div className={`text-[11px] font-semibold truncate leading-tight ${textColor}`} title={pe.event.title}>
                            {pe.event.title}
                          </div>
                          {pe.event.subtitle && (
                            <div className="text-[10px] text-blue-200/90 truncate leading-tight mt-0.5 font-medium" title={pe.event.subtitle}>
                              {pe.event.subtitle}
                            </div>
                          )}
                          {pe.height > 4 && (
                            <div className="text-[10px] text-slate-400 truncate opacity-90 mt-0.5 leading-tight">
                              {format(pe.event.start, 'h:mm')} - {format(pe.event.end, 'h:mm a')}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>}
      {view === 'week' && <section className="teacher-calendar-list-view" aria-label="Visualização semanal">
        <div className="teacher-calendar-list-view__heading"><span>Semana de {weekLabel}</span><strong>{agendaEvents.length} {agendaEvents.length === 1 ? 'aula nesta semana' : 'aulas nesta semana'}</strong></div>
        {agendaEvents.length === 0 ? <p className="teacher-calendar-empty">Nenhuma aula cadastrada nesta semana</p> : <div className="teacher-calendar-week-list">{agendaEvents.filter((event) => event.start >= weekStart && event.start <= weekEnd).map((event) => <button type="button" key={event.id} className="teacher-calendar-list-event" onClick={() => onSelectEvent(event)}><strong>{format(event.start, "EEEE, d 'de' MMMM", { locale })}</strong><span>{format(event.start, 'HH:mm')} • {event.title}</span></button>)}</div>}
      </section>}
      {view === 'agenda' && <section className="teacher-calendar-list-view" aria-label="Visualização em agenda">
        <div className="teacher-calendar-list-view__heading"><span>Próximos encontros</span><strong>{agendaEvents.length} {agendaEvents.length === 1 ? 'aula cadastrada' : 'aulas cadastradas'}</strong></div>
        {agendaEvents.length === 0 ? <p className="teacher-calendar-empty">Nenhum próximo encontro</p> : <div className="teacher-calendar-week-list">{agendaEvents.map((event) => <button type="button" key={event.id} className="teacher-calendar-list-event" aria-label={event.type === 'lesson' ? `${event.title}: adicionar ao Google Agenda` : undefined} onClick={() => (onSelectAgendaEvent ?? onSelectEvent)(event)}><strong>{format(event.start, "EEEE, d 'de' MMMM", { locale })}</strong><span>{format(event.start, 'HH:mm')} • {event.title}{event.type === 'lesson' ? ' · Adicionar ao Google Agenda' : ''}</span></button>)}</div>}
      </section>}
    </div>
  )
}
