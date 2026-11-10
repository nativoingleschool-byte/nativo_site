import { type ReactNode, useState } from 'react'
import { Bell, BookOpen, CalendarDays, CircleDollarSign, LogOut, UsersRound, Landmark, Menu, X } from 'lucide-react'
import type { Profile, AppNotification } from '../lib/types'
import TeacherNotificationPanel from './TeacherNotificationPanel'
import { trackPageView } from '../../lib/telemetry'
import { ThemeToggle } from '../../lib/theme'

export type AdminSection = 'students' | 'payments' | 'calendar' | 'staff' | 'reconciliation'
const sections = [
  { id: 'students', title: 'Base de Alunos', subtitle: 'Cadastros, matrículas e gestão dos alunos', icon: BookOpen },
  { id: 'payments', title: 'Pagamentos', subtitle: 'Mensalidades e controle financeiro', icon: CircleDollarSign },
  { id: 'calendar', title: 'Calendário', subtitle: 'Aulas e horários da escola', icon: CalendarDays },
  { id: 'staff', title: 'Controle de Staff', subtitle: 'Professores e equipe', icon: UsersRound },
  { id: 'reconciliation', title: 'Conciliação Bancária', subtitle: 'Movimentações e conferência', icon: Landmark },
] as const

type Props = {
  profile: Profile
  activeTab: AdminSection
  onTabChange: (tab: AdminSection) => void
  children: ReactNode
  notifications: AppNotification[]
  onMarkNotificationRead: (id: string) => void
  onMarkAllNotificationsRead: () => void
  onClearNotifications?: () => void
  onDeleteNotification?: (id: string) => void
  onSelectNotification?: (notification: AppNotification) => void
  onLogout: () => void | Promise<void>
}

export default function AdminShell({
  profile,
  activeTab,
  onTabChange,
  children,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onClearNotifications,
  onDeleteNotification,
  onSelectNotification,
  onLogout,
}: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const unread = notifications.filter(n => !n.read_at).length
  const currentSection = sections.find(s => s.id === activeTab) || sections[0]
  const initials = (profile.full_name || 'Admin')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')

  return (
    <div className="teacher-portal-shell admin-shell">
      <aside className={`teacher-sidebar admin-sidebar ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Menu administrativo">
        <div className="teacher-brand">
          <span className="teacher-brand__badge">Nativo</span>
          <div className="teacher-brand__text">
            <strong>Nativo Languages</strong>
            <small>Portal Administrativo</small>
          </div>
          <button className="admin-menu-close" type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu"><X size={18}/></button>
        </div>
        <nav className="teacher-nav">
          {sections.map(s => {
            const Icon = s.icon
            const active = activeTab === s.id
            return (
              <button
                key={s.id}
                type="button"
                className={`teacher-nav__item ${active ? 'is-active' : ''}`}
                onClick={() => {
                  onTabChange(s.id)
                  setMobileMenuOpen(false)
                  trackPageView(`/admin/${s.id}`)
                }}
              >
                <Icon size={18} />
                <span>{s.title}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="teacher-portal-main">
      <header className="teacher-context-header">
        <div>
          <span className="teacher-context-header__kicker">GESTÃO ESCOLAR</span>
          <h1 className="teacher-context-header__title">{currentSection.title}</h1>
          <p className="teacher-context-header__subtitle">{currentSection.subtitle}</p>
        </div>
        <div className="teacher-context-header__actions">
          <button className="admin-menu-toggle" type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Abrir navegação"><Menu size={19}/></button>
          <ThemeToggle />
          <div className="teacher-notification-anchor"><button type="button" className="teacher-notification-button"
            aria-label="Notificações" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={18}/>
            {unread > 0 && <span className="teacher-notification-button__badge">{unread > 9 ? '9+' : unread}</span>}</button>
            {notificationsOpen && <TeacherNotificationPanel
              notifications={notifications}
              onClose={() => setNotificationsOpen(false)}
              onMarkRead={onMarkNotificationRead}
              onMarkAllRead={onMarkAllNotificationsRead}
              onClearAll={onClearNotifications}
              onDeleteNotification={onDeleteNotification}
              onSelectNotification={onSelectNotification}
            />}
          </div>
          <div className="teacher-profile-chip"><span className="teacher-profile-chip__avatar">{initials}</span>
            <span className="teacher-profile-chip__copy"><strong>{profile.full_name || 'Administrador'}</strong><span>{profile.email}</span></span></div>
          <button type="button" className="teacher-logout-button" aria-label="Sair" onClick={() => void onLogout()}><LogOut size={17}/></button>
        </div>
      </header>
      <main className="teacher-portal-body">{children}</main>
      </div>
    </div>
  )
}
