import { Users, GraduationCap, Briefcase, CalendarDays, Clock, History, Bell, Wifi } from 'lucide-react'

function getIcon(label: string) {
  const l = label.toLowerCase()
  if (l.includes('user') || l.includes('usuár') || l.includes('usuario')) return Users
  if (l.includes('student') || l.includes('alun') || l.includes('estudiant')) return GraduationCap
  if (l.includes('teacher') || l.includes('professor') || l.includes('profesor')) return Briefcase
  if (l.includes('upcoming') || l.includes('próxim')) return Clock
  if (l.includes('past') || l.includes('passad')) return History
  if (l.includes('pending') || l.includes('pendent') || l.includes('lembrete') || l.includes('recordator') || l.includes('reminder')) return Bell
  if (l.includes('push') || l.includes('alerta')) return Wifi
  if (l.includes('lesson') || l.includes('aula') || l.includes('clase')) return CalendarDays
  return CalendarDays
}

export default function StatCard({ label, value }: { label: string; value: string | number }) {
  const Icon = getIcon(label)
  return (
    <article className="summary-card">
      <div className="summary-card-header">
        <Icon size={20} className="summary-card-icon" />
        <span>{label}</span>
      </div>
      <strong className="summary-card-value">{value}</strong>
    </article>
  )
}
