import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Language, t } from '../lib/i18n'
import { localeByLanguage } from '../lib/utils'

interface DateTimePickerProps {
  value: string // Format: YYYY-MM-DDTHH:mm
  onChange: (value: string) => void
  language?: Language
  label?: string
  required?: boolean
  className?: string
  style?: React.CSSProperties
  minDate?: string
  maxDate?: string
}

const pad2 = (n: number) => n.toString().padStart(2, '0')

export default function DateTimePicker({
  value,
  onChange,
  language = 'pt',
  label,
  required,
  className = '',
  style,
}: DateTimePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse current value
  const parsed = useMemo(() => {
    const defaultDate = new Date()
    let datePart = `${defaultDate.getFullYear()}-${pad2(defaultDate.getMonth() + 1)}-${pad2(defaultDate.getDate())}`
    let hour24 = 9
    let minute = 0

    if (value && value.includes('T')) {
      const [d, time] = value.split('T')
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        datePart = d
      }
      if (time) {
        const [h, m] = time.split(':').map(Number)
        if (!isNaN(h) && h >= 0 && h <= 23) hour24 = h
        if (!isNaN(m) && m >= 0 && m <= 59) minute = m
      }
    }

    const [year, month, day] = datePart.split('-').map(Number)
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24
    const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM'

    return {
      dateStr: datePart,
      year: isNaN(year) ? defaultDate.getFullYear() : year,
      month: isNaN(month) ? defaultDate.getMonth() + 1 : month,
      day: isNaN(day) ? defaultDate.getDate() : day,
      hour24,
      hour12,
      minute,
      period,
    }
  }, [value])

  // Calendar navigation state
  const [navYear, setNavYear] = useState(parsed.year)
  const [navMonth, setNavMonth] = useState(parsed.month) // 1-12

  // Keep nav in sync when parsed value changes externally
  useEffect(() => {
    setNavYear(parsed.year)
    setNavMonth(parsed.month)
  }, [parsed.year, parsed.month])

  // Close calendar popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowCalendar(false)
      }
    }
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCalendar])

  // Update helper
  const updateDateTime = (newDateStr: string, newHour12: number, newMin: number, newPeriod: 'AM' | 'PM') => {
    const h24 = newPeriod === 'AM' ? (newHour12 === 12 ? 0 : newHour12) : newHour12 === 12 ? 12 : newHour12 + 12
    const formattedTime = `${pad2(h24)}:${pad2(newMin)}`
    onChange(`${newDateStr}T${formattedTime}`)
  }

  // Toggle AM / PM
  const handleTogglePeriod = () => {
    const nextPeriod = parsed.period === 'AM' ? 'PM' : 'AM'
    updateDateTime(parsed.dateStr, parsed.hour12, parsed.minute, nextPeriod)
  }

  // Change Hour
  const handleHourChange = (newHour12: number) => {
    updateDateTime(parsed.dateStr, newHour12, parsed.minute, parsed.period)
  }

  // Change Minute
  const handleMinuteChange = (newMin: number) => {
    updateDateTime(parsed.dateStr, parsed.hour12, newMin, parsed.period)
  }

  // Select Date from Calendar Grid
  const handleSelectDate = (year: number, month: number, day: number) => {
    const newDateStr = `${year}-${pad2(month)}-${pad2(day)}`
    updateDateTime(newDateStr, parsed.hour12, parsed.minute, parsed.period)
    setShowCalendar(false)
  }

  // Quick preset selection
  const handleSelectPresetTime = (h12: number, min: number, period: 'AM' | 'PM') => {
    updateDateTime(parsed.dateStr, h12, min, period)
  }

  // Format date display label
  const formattedDateLabel = useMemo(() => {
    const locale = localeByLanguage[language] || 'pt-BR'
    const dateObj = new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0)
    return dateObj.toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }, [parsed.year, parsed.month, parsed.day, language])

  // Calendar month navigation
  const prevMonth = () => {
    if (navMonth === 1) {
      setNavMonth(12)
      setNavYear((y) => y - 1)
    } else {
      setNavMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (navMonth === 12) {
      setNavMonth(1)
      setNavYear((y) => y + 1)
    } else {
      setNavMonth((m) => m + 1)
    }
  }

  // Month & Year display label
  const monthTitle = useMemo(() => {
    const locale = localeByLanguage[language] || 'pt-BR'
    const dateObj = new Date(navYear, navMonth - 1, 1)
    const label = dateObj.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }, [navYear, navMonth, language])

  // Days of week short headers
  const weekDayHeaders = useMemo(() => {
    const locale = localeByLanguage[language] || 'pt-BR'
    const headers: string[] = []
    const baseSunday = new Date(2026, 7, 2) // Sunday Aug 2 2026
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseSunday)
      d.setDate(baseSunday.getDate() + i)
      headers.push(d.toLocaleDateString(locale, { weekday: 'narrow' }).toUpperCase())
    }
    return headers
  }, [language])

  // Calendar grid calculation
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(navYear, navMonth - 1, 1).getDay() // 0 = Sun
    const daysInMonth = new Date(navYear, navMonth, 0).getDate()
    const daysInPrevMonth = new Date(navYear, navMonth - 1, 0).getDate()

    const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = []

    // Previous month days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevM = navMonth === 1 ? 12 : navMonth - 1
      const prevY = navMonth === 1 ? navYear - 1 : navYear
      cells.push({
        day: daysInPrevMonth - i,
        month: prevM,
        year: prevY,
        isCurrentMonth: false,
      })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        month: navMonth,
        year: navYear,
        isCurrentMonth: true,
      })
    }

    // Next month filling
    const totalSlots = Math.ceil(cells.length / 7) * 7
    const remaining = totalSlots - cells.length
    for (let d = 1; d <= remaining; d++) {
      const nextM = navMonth === 12 ? 1 : navMonth + 1
      const nextY = navMonth === 12 ? navYear + 1 : navYear
      cells.push({
        day: d,
        month: nextM,
        year: nextY,
        isCurrentMonth: false,
      })
    }

    return cells
  }, [navYear, navMonth])

  const today = useMemo(() => {
    const now = new Date()
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    }
  }, [])

  const commonPresets = [
    { label: '08:00 AM', h: 8, m: 0, p: 'AM' as const },
    { label: '09:00 AM', h: 9, m: 0, p: 'AM' as const },
    { label: '10:00 AM', h: 10, m: 0, p: 'AM' as const },
    { label: '11:00 AM', h: 11, m: 0, p: 'AM' as const },
    { label: '01:00 PM', h: 1, m: 0, p: 'PM' as const },
    { label: '02:00 PM', h: 2, m: 0, p: 'PM' as const },
    { label: '03:00 PM', h: 3, m: 0, p: 'PM' as const },
    { label: '04:00 PM', h: 4, m: 0, p: 'PM' as const },
    { label: '05:00 PM', h: 5, m: 0, p: 'PM' as const },
    { label: '06:00 PM', h: 6, m: 0, p: 'PM' as const },
    { label: '07:00 PM', h: 7, m: 0, p: 'PM' as const },
  ]

  return (
    <div ref={containerRef} className={`datetime-picker-wrapper ${className}`} style={{ width: '100%', position: 'relative', ...style }}>
      {label && (
        <label style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', display: 'block' }}>
          {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Date Selector Button */}
        <button
          type="button"
          onClick={() => setShowCalendar((prev) => !prev)}
          style={{
            flex: '1.4',
            minWidth: '180px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.65rem 0.85rem',
            background: '#0f172a',
            border: `1px solid ${showCalendar ? '#6366f1' : '#334155'}`,
            borderRadius: '0.75rem',
            color: '#f8fafc',
            fontSize: '0.88rem',
            fontWeight: 500,
            cursor: 'pointer',
            outline: 'none',
            boxShadow: showCalendar ? '0 0 0 2px rgba(99, 102, 241, 0.25)' : 'none',
            transition: 'all 0.15s ease',
          }}
          title={t(language, 'select_date')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem' }}>📅</span>
            <span>{formattedDateLabel}</span>
          </span>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{showCalendar ? '▲' : '▼'}</span>
        </button>

        {/* Time Selector Controls */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: '#0f172a',
            padding: '0.3rem 0.5rem',
            borderRadius: '0.75rem',
            border: '1px solid #334155',
          }}
        >
          {/* Hour Dropdown */}
          <select
            value={parsed.hour12}
            onChange={(e) => handleHourChange(Number(e.target.value))}
            style={{
              padding: '0.35rem 0.45rem',
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '0.5rem',
              color: '#fff',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
            title={t(language, 'select_time')}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>
                {pad2(h)}
              </option>
            ))}
          </select>

          <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>:</span>

          {/* Minute Dropdown */}
          <select
            value={parsed.minute}
            onChange={(e) => handleMinuteChange(Number(e.target.value))}
            style={{
              padding: '0.35rem 0.45rem',
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '0.5rem',
              color: '#fff',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
            title={t(language, 'select_time')}
          >
            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
              <option key={m} value={m}>
                {pad2(m)}
              </option>
            ))}
          </select>

          {/* AM / PM Toggle Button */}
          <button
            type="button"
            onClick={handleTogglePeriod}
            style={{
              padding: '0.38rem 0.75rem',
              borderRadius: '0.55rem',
              border: parsed.period === 'AM' ? '1px solid #38bdf8' : '1px solid #818cf8',
              background: parsed.period === 'AM' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(99, 102, 241, 0.25)',
              color: parsed.period === 'AM' ? '#38bdf8' : '#a5b4fc',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              transition: 'all 0.15s ease',
              userSelect: 'none',
            }}
            title="Click to toggle AM / PM"
          >
            <span>{parsed.period === 'AM' ? '☀️ AM' : '🌙 PM'}</span>
          </button>
        </div>
      </div>

      {/* Quick Time Presets Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          marginTop: '0.45rem',
          overflowX: 'auto',
          paddingBottom: '0.2rem',
        }}
      >
        <span style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t(language, 'quick_presets') || 'Presets'}:
        </span>
        {commonPresets.map((preset) => {
          const isSelected = parsed.hour12 === preset.h && parsed.minute === preset.m && parsed.period === preset.p
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleSelectPresetTime(preset.h, preset.m, preset.p)}
              style={{
                padding: '0.2rem 0.5rem',
                borderRadius: '0.4rem',
                border: isSelected ? '1px solid #10b981' : '1px solid #334155',
                background: isSelected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                color: isSelected ? '#34d399' : '#94a3b8',
                fontSize: '0.74rem',
                fontWeight: isSelected ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.1s ease',
              }}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      {/* Calendar Popover Dialog */}
      {showCalendar && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 999999,
            background: '#090d16',
            border: '1px solid #334155',
            borderRadius: '1rem',
            padding: '1rem',
            width: '310px',
            boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.8), 0 0 15px rgba(99, 102, 241, 0.15)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {/* Month Header Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <button
              type="button"
              onClick={prevMonth}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.5rem',
                color: '#f8fafc',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              ◀
            </button>
            <strong style={{ fontSize: '0.92rem', color: '#f8fafc' }}>{monthTitle}</strong>
            <button
              type="button"
              onClick={nextMonth}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.5rem',
                color: '#f8fafc',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              ▶
            </button>
          </div>

          {/* Weekday Header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', marginBottom: '0.4rem' }}>
            {weekDayHeaders.map((w, idx) => (
              <span key={idx} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', padding: '0.2rem 0' }}>
                {w}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {calendarCells.map((cell, idx) => {
              const isSelected = cell.year === parsed.year && cell.month === parsed.month && cell.day === parsed.day
              const isToday = cell.year === today.year && cell.month === today.month && cell.day === today.day

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDate(cell.year, cell.month, cell.day)}
                  style={{
                    height: '34px',
                    borderRadius: '0.5rem',
                    border: isToday ? '1px solid #6366f1' : 'none',
                    background: isSelected ? '#4f46e5' : isToday ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                    color: isSelected ? '#fff' : cell.isCurrentMonth ? '#e2e8f0' : '#475569',
                    fontSize: '0.82rem',
                    fontWeight: isSelected || isToday ? 700 : cell.isCurrentMonth ? 500 : 400,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = '#1e293b'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = isToday ? 'rgba(99, 102, 241, 0.2)' : 'transparent'
                    }
                  }}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {/* Bottom Quick Controls */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '0.85rem',
              paddingTop: '0.65rem',
              borderTop: '1px solid #1e293b',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setNavYear(today.year)
                setNavMonth(today.month)
                handleSelectDate(today.year, today.month, today.day)
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#818cf8',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0.2rem 0.4rem',
              }}
            >
              📍 {t(language, 'today_btn') || 'Hoje'}
            </button>

            <button
              type="button"
              onClick={() => setShowCalendar(false)}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.45rem',
                color: '#cbd5e1',
                fontSize: '0.78rem',
                padding: '0.3rem 0.7rem',
                cursor: 'pointer',
              }}
            >
              {t(language, 'close') || 'Fechar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
