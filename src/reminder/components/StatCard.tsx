import { Users, GraduationCap, Briefcase, CalendarDays, Clock, History, Bell, Wifi } from 'lucide-react'

function getIcon(label: string) {
  const l = label.toLowerCase()
  if (l === 'users') return Users
  if (l === 'students') return GraduationCap
  if (l === 'teachers') return Briefcase
  if (l === 'lessons') return CalendarDays
  if (l.includes('upcoming')) return Clock
  if (l.includes('past')) return History
  if (l.includes('pending') || l.includes('reminders')) return Bell
  if (l.includes('push')) return Wifi
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
