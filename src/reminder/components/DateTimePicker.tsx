import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Language } from '../lib/i18n'

interface DateTimePickerProps {
  value: string
  onChange: (value: string) => void
  language?: Language
  label?: string
  required?: boolean
  className?: string
  style?: React.CSSProperties
  minDate?: string
  maxDate?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const colors = { ink: '#365574', border: '#d8e4ec', surface: '#f3f7fa', muted: '#9fb0c0', active: '#21446c' }
const buttonStyle: React.CSSProperties = { color: colors.ink, border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 10, height: 40, minWidth: 40, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }

export default function DateTimePicker({ value, onChange, language = 'pt', label, required, className = '', style, minDate, maxDate }: DateTimePickerProps) {
  const root = useRef<HTMLDivElement>(null)
  const calendarButton = useRef<HTMLButtonElement>(null)
  const timeButton = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [popupPosition, setPopupPosition] = useState({ top: 12, left: 12 })
  const positionPopup = (button: HTMLButtonElement | null, width: number, estimatedHeight: number) => {
    if (!button) return
    const rect = button.getBoundingClientRect()
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(width, window.innerWidth - 24) - 12))
    const below = window.innerHeight - rect.bottom
    const top = below >= estimatedHeight + 12 ? rect.bottom + 7 : Math.max(12, rect.top - estimatedHeight - 7)
    setPopupPosition({ top, left })
  }
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const date = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : new Date().toLocaleDateString('en-CA')
  const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(11, 16) : '09:00'
  const [year, month, day] = date.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  const [view, setView] = useState({ year, month })
  const locale = language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US'
  const today = new Date()
  const todayDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const selectedDate = date
  const setDate = (nextDate: string) => onChange(`${nextDate}T${time}`)
  const setTime = (hour: number, minute: number) => onChange(`${date}T${pad(hour)}:${pad(minute)}`)
  const withinBounds = (d: string) => (!minDate || d >= minDate) && (!maxDate || d <= maxDate)
  useEffect(() => { setView({ year, month }) }, [year, month])
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) { setCalendarOpen(false); setTimeOpen(false) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const cells = useMemo(() => {
    const offset = new Date(view.year, view.month - 1, 1).getDay()
    const length = new Date(view.year, view.month, 0).getDate()
    const count = Math.ceil((offset + length) / 7) * 7
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(view.year, view.month - 1, i - offset + 1)
      return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, day: d.getDate(), current: d.getMonth() === view.month - 1 }
    })
  }, [view])
  const goMonth = (delta: number) => {
    const d = new Date(view.year, view.month - 1 + delta, 1)
    setView({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(view.year, view.month - 1, 1))
  const dayLabel = new Intl.DateTimeFormat(locale).format(new Date(year, month - 1, day))
  const labels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
  return (
    <div ref={root} className={className} style={{ width: '100%', position: 'relative', ...style }}>
      {label && <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#536b81', fontWeight: 600 }}>{label}{required ? ' *' : ''}</label>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div style={{ position: 'relative', minWidth: 0 }}>
          <span style={{ display: 'block', marginBottom: 9, fontSize: 13, fontWeight: 600, color: '#536b81' }}>{language === 'pt' ? 'Data' : language === 'es' ? 'Fecha' : 'Date'}</span>
          <button ref={calendarButton} type="button" aria-label="Selecionar data" aria-expanded={calendarOpen} onClick={() => { positionPopup(calendarButton.current, 425, 415); setCalendarOpen(!calendarOpen); setTimeOpen(false) }} style={{ ...buttonStyle, width: '100%', height: 52, padding: '0 14px', justifyContent: 'space-between', background: '#fff' }}>
            <span>{dayLabel}</span><CalendarDays size={18} />
          </button>
        </div>
        <div style={{ position: 'relative', minWidth: 0 }}>
          <span style={{ display: 'block', marginBottom: 9, fontSize: 13, fontWeight: 600, color: '#536b81' }}>{language === 'pt' ? 'Horário de início' : language === 'es' ? 'Hora de inicio' : 'Start time'}</span>
          <button ref={timeButton} type="button" aria-label="Selecionar horário" aria-expanded={timeOpen} onClick={() => { positionPopup(timeButton.current, 234, 300); setTimeOpen(!timeOpen); setCalendarOpen(false) }} style={{ ...buttonStyle, width: '100%', height: 52, padding: '0 14px', justifyContent: 'space-between', background: '#fff' }}>
            <span>{time}</span><Clock3 size={19} />
          </button>
        </div>
      </div>
      {calendarOpen && createPortal(
        <div ref={popup} role="dialog" aria-label="Calendário" style={{ position: 'fixed', top: popupPosition.top, left: popupPosition.left, width: 'min(425px, calc(100vw - 24px))', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', boxSizing: 'border-box', maxWidth: '100%', background: '#fff', color: colors.ink, border: `1px solid ${colors.border}`, borderRadius: 19, padding: '15px 17px 12px', boxShadow: '0 18px 40px rgba(34,56,80,.18)', zIndex: 100001 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button type="button" aria-label="Mês anterior" style={buttonStyle} onClick={() => goMonth(-1)}><ChevronLeft size={22}/></button>
            <strong style={{ fontSize: 19, textTransform: 'capitalize' }}>{title}</strong>
            <button type="button" aria-label="Próximo mês" style={buttonStyle} onClick={() => goMonth(1)}><ChevronRight size={22}/></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', textAlign: 'center', gap: 3 }}>
            {labels.map((d, i) => <strong key={i} style={{ fontSize: 13, padding: '8px 0' }}>{d}</strong>)}
            {cells.map((cell) => {
              const active = cell.date === selectedDate
              const allowed = withinBounds(cell.date)
              return <button key={cell.date} type="button" disabled={!allowed} onClick={() => { setDate(cell.date); setCalendarOpen(false) }} style={{ height: 44, border: 0, borderRadius: 10, cursor: allowed ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: active ? 700 : 500, background: active ? colors.active : 'transparent', color: active ? '#fff' : cell.current ? colors.ink : colors.muted, opacity: allowed ? 1 : .4 }}>{cell.day}</button>
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${colors.ink}`, marginTop: 12, paddingTop: 14 }}>
            <button type="button" style={buttonStyle} disabled={!withinBounds(todayDate)} onClick={() => { if (withinBounds(todayDate)) { setDate(todayDate); setView({ year: today.getFullYear(), month: today.getMonth() + 1 }); setCalendarOpen(false) } }}>Hoje</button>
            <button type="button" style={{ ...buttonStyle, padding: '0 14px' }} onClick={() => setCalendarOpen(false)}>Fechar</button>
          </div>
        </div>, document.body
      )}
      {timeOpen && createPortal(
        <div ref={popup} role="dialog" aria-label="Selecionar hora e minuto" style={{ position: 'fixed', left: popupPosition.left, top: popupPosition.top, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', zIndex: 10000, width: 234, maxWidth: '100%', background: '#fff', color: colors.ink, border: `1px solid ${colors.border}`, borderRadius: 18, padding: 14, boxShadow: '0 18px 40px rgba(34,56,80,.18)' }}>
          <strong style={{ display: 'block', textAlign: 'center', marginBottom: 12 }}>Horário</strong>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[{ name: 'Horas', count: 24, value: h, update: (v: number) => setTime(v, m) }, { name: 'Minutos', count: 60, value: m, update: (v: number) => setTime(h, v) }].map((part) => (
              <div key={part.name} style={{ minWidth: 0 }}>
                <span style={{ display: 'block', textAlign: 'center', fontSize: 12, marginBottom: 7 }}>{part.name}</span>
                <div role="listbox" aria-label={part.name} style={{ height: 188, overflowY: 'auto', overscrollBehavior: 'contain', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, scrollbarWidth: 'thin' }}>
                  {Array.from({ length: part.count }, (_, i) => <button type="button" role="option" aria-selected={part.value === i} key={i} onClick={() => part.update(i)} style={{ display: 'block', width: '100%', minHeight: 37, fontSize: 16, border: 0, borderRadius: 7, background: part.value === i ? colors.active : 'transparent', color: part.value === i ? '#fff' : colors.ink, fontWeight: part.value === i ? 700 : 400, cursor: 'pointer' }}>{pad(i)}</button>)}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setTimeOpen(false)} style={{ ...buttonStyle, width: '100%', marginTop: 12 }}>Fechar</button>
        </div>, document.body
      )}
    </div>
  )
}
