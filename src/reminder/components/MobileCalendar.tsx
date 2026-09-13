import React, { useMemo, useRef, useState } from 'react'
import { format, addDays, startOfWeek, isSameDay, setHours, setMinutes, startOfDay, addWeeks, subWeeks } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import { ptBR } from 'date-fns/locale/pt-BR'
import { es as esLocale } from 'date-fns/locale/es'

const locales: Record<string, any> = { en: enUS, pt: ptBR, es: esLocale }

export type CalendarEventItem = {
  id: string
  start: Date
  end: Date
  title: string
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
  onEventDrop?: (event: CalendarEventItem, newStart: Date, newEnd: Date) => void // Kept for API compatibility, though DnD is omitted for mobile simplicity
}

export default function MobileCalendar({
  events,
  language,
  dayStartHour = 5,
  dayEndHour = 22,
  onSelectEvent,
  onSelectSlot,
}: MobileCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const locale = locales[language] || enUS

  const days = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i))
  }, [currentDate])

  const hours = useMemo(() => {
    return Array.from({ length: dayEndHour - dayStartHour }).map((_, i) => dayStartHour + i)
  }, [dayStartHour, dayEndHour])

  const totalMinutes = (dayEndHour - dayStartHour) * 60
  
  const handleSlotClick = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const percentage = y / rect.height
    const clickedMinutes = percentage * totalMinutes
    const hour = Math.floor(clickedMinutes / 60) + dayStartHour
    const minute = Math.floor((clickedMinutes % 60) / 30) * 30
    const slotTime = setMinutes(setHours(day, hour), minute)
    onSelectSlot(slotTime)
  }

  // --- Layout Algorithm ---
  const getPlacedEvents = (dayEvents: CalendarEventItem[]) => {
    if (dayEvents.length === 0) return { maxColumns: 1, placedEvents: [] }
    
    // 1. Sort by start time, then by end time (longer events first)
    const sorted = [...dayEvents].sort((a, b) => {
      const aStart = a.start.getTime()
      const bStart = b.start.getTime()
      if (aStart === bStart) return b.end.getTime() - a.end.getTime()
      return aStart - bStart
    })
    
    // 2. Group overlapping events
    const clusters: CalendarEventItem[][] = []
    let currentCluster: CalendarEventItem[] = []
    let clusterEnd = 0
    
    for (const event of sorted) {
      if (currentCluster.length > 0 && event.start.getTime() >= clusterEnd) {
        clusters.push(currentCluster)
        currentCluster = []
      }
      currentCluster.push(event)
      clusterEnd = Math.max(clusterEnd, event.end.getTime())
    }
    if (currentCluster.length > 0) clusters.push(currentCluster)
    
    let dayMaxCols = 1
    const placed: any[] = []
    
    // 3. Assign columns and spans
    for (const cluster of clusters) {
      const columns: CalendarEventItem[][] = []
      for (const event of cluster) {
        let placedCol = false
        for (let i = 0; i < columns.length; i++) {
          const lastEvent = columns[i][columns[i].length - 1]
          // If the last event in this column ends <= this event starts, they do not overlap
          if (lastEvent.end.getTime() <= event.start.getTime()) {
            columns[i].push(event)
            placedCol = true
            break
          }
        }
        if (!placedCol) columns.push([event])
      }
      
      const numCols = columns.length
      dayMaxCols = Math.max(dayMaxCols, numCols)
      
      const eventColIndex = new Map<CalendarEventItem, number>()
      for (let i = 0; i < numCols; i++) {
        for (const ev of columns[i]) {
          eventColIndex.set(ev, i)
        }
      }
      
      for (const ev of cluster) {
        const colIndex = eventColIndex.get(ev)!
        let colSpan = 1
        
        // Determine how many columns this event can span before hitting an overlapping event
        for (let c = colIndex + 1; c < numCols; c++) {
          const overlaps = columns[c].some(other => {
            return ev.start.getTime() < other.end.getTime() && ev.end.getTime() > other.start.getTime()
          })
          if (overlaps) break
          colSpan++
        }
        
        const d = new Date(ev.start)
        d.setHours(dayStartHour, 0, 0, 0)
        const dayStartMs = d.getTime()
        const startMins = (ev.start.getTime() - dayStartMs) / 60000
        const durationMins = (ev.end.getTime() - ev.start.getTime()) / 60000
        
        placed.push({
          event: ev,
          top: (startMins / totalMinutes) * 100,
          height: (durationMins / totalMinutes) * 100,
          left: (colIndex / numCols) * 100,
          width: (colSpan / numCols) * 100,
          zIndex: colIndex + 1,
        })
      }
    }
    return { maxColumns: dayMaxCols, placedEvents: placed }
  }

  const dayLayouts = useMemo(() => {
    return days.map(day => {
      const dayEvents = events.filter(e => isSameDay(e.start, day))
      return getPlacedEvents(dayEvents)
    })
  }, [days, events, dayStartHour, totalMinutes])

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
        </div>
        <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-800/50 rounded-lg hover:bg-slate-700">
          &gt;
        </button>
      </div>

      {/* Synchronized Scroll Viewport */}
      <div className="flex-1 overflow-auto relative custom-scrollbar bg-[#0f172a]">
        <div className="min-w-full w-max flex flex-col relative h-full">
          
          {/* Day Headers (Sticky Top) */}
          <div className="sticky top-0 z-40 flex bg-[#0f172a]/95 backdrop-blur-sm border-b border-slate-700/50 shadow-sm min-w-full">
            {/* Top-Left Corner (Sticky Top + Left) */}
            <div className="w-[70px] flex-shrink-0 border-r border-slate-700/50 sticky left-0 z-50 bg-[#0f172a]" />
            
            <div className="flex-1 flex">
              {days.map((day, idx) => {
                const isToday = isSameDay(day, new Date())
                const { maxColumns } = dayLayouts[idx]
                const minWidthPx = Math.max(104, maxColumns * 110)

                return (
                  <div key={idx} className={`flex-1 flex flex-col items-center justify-center py-2 border-r border-slate-700/50 relative ${isToday ? 'bg-indigo-500/10' : ''}`} style={{ minWidth: `${minWidthPx}px` }}>
                    {isToday && <div className="absolute top-0 w-full h-[3px] bg-indigo-500" />}
                    <span className={`text-[11px] font-bold uppercase mb-0.5 ${isToday ? 'text-indigo-400' : 'text-slate-400'}`}>
                      {format(day, 'EEE', { locale })}
                    </span>
                    <span className={`text-xl font-bold leading-none ${isToday ? 'text-indigo-400' : 'text-slate-200'}`}>
                      {format(day, 'dd')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Grid Area */}
          <div className="flex flex-1 relative min-h-[900px] min-w-full">
            {/* Time Axis (Sticky Left) */}
            <div className="w-[70px] flex-shrink-0 border-r border-slate-700/50 sticky left-0 bg-[#0f172a] z-30 flex flex-col">
              {hours.map(hour => (
                <div key={hour} className="flex-1 relative border-b border-transparent">
                  <span className="absolute -top-2.5 right-2 text-[11px] font-medium text-slate-400">
                    {format(setHours(startOfDay(currentDate), hour), 'h:mm a')}
                  </span>
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
                          <div className={`text-[11px] font-semibold truncate leading-tight ${textColor}`}>
                            {pe.event.title}
                          </div>
                          {pe.height > 5 && (
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
      </div>
    </div>
  )
}
