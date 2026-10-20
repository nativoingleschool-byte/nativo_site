import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Clock3 } from 'lucide-react'
import DateTimePicker from './DateTimePicker'
import type { Language } from '../lib/i18n'

export default function LessonDateTimeFields({ value, onChange, language = 'pt' }: { value: string; onChange: (next: string) => void; language?: Language }) {
 const [open, setOpen] = useState(false)
 const root = useRef<HTMLDivElement>(null)
 const date = value.slice(0,10)
 const time = value.slice(11,16) || '20:00'
 useEffect(() => {
   if (!open) return
   const close = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false) }
   document.addEventListener('pointerdown',close)
   return () => document.removeEventListener('pointerdown',close)
 },[open])
 const times = Array.from({length:48},(_,i) => `${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`)
 if (!times.includes(time)) times.push(time)
 times.sort()
 return <div className="reminder-shared-datetime">
   <div className="reminder-shared-datetime__date">
     <label>Data</label>
     <DateTimePicker value={value} language={language} onChange={onChange} dateOnly hideQuickPresets className="reminder-unified-date-picker" required />
   </div>
   <div className="reminder-shared-datetime__time" ref={root}>
     <label>Horário de início</label>
     <button type="button" className="reminder-time-trigger" aria-expanded={open} onClick={() => setOpen(v=>!v)}>
        <span>{time}</span><Clock3 size={17} aria-hidden="true"/><ChevronDown size={15} aria-hidden="true"/>
     </button>
     {open && <div className="reminder-time-menu" role="listbox" aria-label="Selecionar horário">
       {times.map(t => <button type="button" role="option" aria-selected={t===time} key={t} className={t===time?'is-selected':''} onClick={() => { onChange(`${date}T${t}`);setOpen(false) }}>{t}</button>)}
     </div>}
   </div>
 </div>
}
