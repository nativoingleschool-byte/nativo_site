import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

type Person = { id: string; full_name?: string | null }
type Props = { options: Person[]; value: string[]; onChange: (ids: string[]) => void; multiple?: boolean; placeholder?: string; disabled?: boolean }

export default function PeopleSelect({ options, value, onChange, multiple = false, placeholder = 'Selecionar pessoa', disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (container.current && !container.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const matched = options.filter(p => (p.full_name || '').toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  const selected = options.filter(p => value.includes(p.id))
  const title = multiple ? (selected.length ? selected.map(p => p.full_name).join(', ') : placeholder) : selected[0]?.full_name || placeholder
  const choose = (id: string) => {
    onChange(multiple ? (value.includes(id) ? value.filter(x => x !== id) : [...value, id]) : [id])
    if (!multiple) setOpen(false)
  }
  return <div className="reminder-people-select" ref={container}>
    <button type="button" className="reminder-people-select__trigger" disabled={disabled} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <span title={title}>{title}</span><ChevronDown size={17} className={open ? 'is-open' : ''} aria-hidden="true" />
    </button>
    {open && <div className="reminder-people-select__menu">
      <label className="reminder-people-select__search"><Search size={15} aria-hidden="true"/><input autoFocus type="search" placeholder="Buscar pelo nome..." value={query} onChange={e => setQuery(e.target.value)}/></label>
      <div className="reminder-people-select__options" role="group" aria-label="Selecionar pessoas">
        {matched.map(person => <label key={person.id} className="reminder-people-select__option">
          <input type={multiple ? 'checkbox' : 'radio'} checked={value.includes(person.id)} onChange={() => choose(person.id)}/>
          <span>{person.full_name || 'Sem nome'}</span>
        </label>)}
        {!matched.length && <p className="reminder-people-select__empty">Nenhuma pessoa encontrada.</p>}
      </div>
    </div>}
  </div>
}
