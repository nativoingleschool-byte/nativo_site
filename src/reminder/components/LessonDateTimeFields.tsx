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
 const [hour, minute] = time.split(':')
 const updateTime = (nextHour: string, nextMinute: string) => onChange(`${date}T${nextHour}:${nextMinute}`)
 return <div className="reminder-shared-datetime">
   <div className="reminder-shared-datetime__date">
     <label>Data</label>
     <DateTimePicker value={value} language={language} onChange={onChange} dateOnly hideQuickPresets className="reminder-unified-date-picker" required />
   </div>
   <div className="reminder-shared-datetime__time" ref={root}>
     <label>Horário de início</label>
     <div className="reminder-time-entry">
       <input type="time" aria-label="Digite o horário" value={time} onChange={e => onChange(`${date}T${e.target.value}`)} required />
       <button type="button" aria-label="Escolher horas e minutos" aria-expanded={open} onClick={() => setOpen(v=>!v)}><Clock3 size={17}/><ChevronDown size={15}/></button>
     </div>
     {open && <div className="reminder-time-wheel" aria-label="Selecionar horas e minutos">
       <div><strong>Horas</strong><div className="reminder-time-wheel__column" role="listbox" aria-label="Horas">{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(h=><button type="button" key={h} className={h===hour?'is-selected':''} onClick={()=>updateTime(h,minute)}>{h}</button>)}</div></div>
       <div><strong>Minutos</strong><div className="reminder-time-wheel__column" role="listbox" aria-label="Minutos">{Array.from({length:60},(_,i)=>String(i).padStart(2,'0')).map(m=><button type="button" key={m} className={m===minute?'is-selected':''} onClick={()=>updateTime(hour,m)}>{m}</button>)}</div></div>
       <button type="button" className="reminder-time-wheel__done" onClick={()=>setOpen(false)}>Concluído</button>
     </div>}
   </div>
 </div>
}
