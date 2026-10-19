import { type ReactNode, useState } from 'react'
import { Bell, BookOpen, CalendarDays, CircleDollarSign, LogOut, UsersRound, Landmark, Menu, X } from 'lucide-react'
import type { Profile, AppNotification } from '../lib/types'
import TeacherNotificationPanel from './TeacherNotificationPanel'

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
  onLogout: () => void | Promise<void>
}

export default function AdminShell({ profile, activeTab, onTabChange, children, notifications, onMarkNotificationRead, onMarkAllNotificationsRead, onLogout }: Props) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const active = sections.find(item => item.id === activeTab) || sections[0]
  const initials = (profile.full_name || 'Administrador').split(/\s+/).slice(0,2).map(p => p.charAt(0).toUpperCase()).join('')
  const unread = notifications.filter(n => !n.read_at).length
  const nav = (mobile = false) => <nav aria-label="Navegação administrativa" className={mobile ? 'admin-mobile-nav' : 'teacher-sidebar-navigation'}>
    {sections.map(({ id, title, icon: Icon }) => <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined}
      className={mobile ? `admin-mobile-nav__item${activeTab === id ? ' is-active' : ''}` : `teacher-sidebar-navigation__item${activeTab === id ? ' is-active' : ''}`}
      onClick={() => {onTabChange(id);setMobileMenuOpen(false)}}>
      <Icon aria-hidden="true" size={18} strokeWidth={activeTab === id ? 2.2 : 1.9}/><span>{title}</span>
    </button>)}
  </nav>
  return <div className="teacher-portal-shell admin-portal-shell">
    <aside className="teacher-sidebar" aria-label="Portal do Administrador">
      <div className="teacher-sidebar__brand">
        <div className="teacher-sidebar__monogram"><img src="/hero/logo-white.png" alt=""/></div>
        <div className="teacher-sidebar__brand-copy"><strong>NATIVO <em className="teacher-brand-english">ENGLISH</em></strong><span>Portal Administrativo</span></div>
      </div>
      {nav()}
      <div className="teacher-sidebar__footer"><span className="teacher-sidebar__version">Nativo English · Administração</span></div>
    </aside>
    <div className="teacher-portal-main">
      <header className="teacher-context-header">
        <div className="teacher-context-header__title-group"><div className="teacher-context-header__heading-row">
          <h1>{active.title}</h1><span className="teacher-context-header__separator" aria-hidden="true">•</span>
          <span className="teacher-context-header__subtitle">{active.subtitle}</span>
        </div></div>
        <div className="teacher-context-header__actions">
          <button className="admin-menu-toggle" type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Abrir navegação"><Menu size={19}/></button>
          <div className="teacher-notification-anchor"><button type="button" className="teacher-notification-button"
            aria-label="Notificações" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={18}/>
            {unread > 0 && <span className="teacher-notification-button__badge">{unread > 9 ? '9+' : unread}</span>}</button>
            {notificationsOpen && <TeacherNotificationPanel notifications={notifications} onClose={() => setNotificationsOpen(false)}
              onMarkRead={onMarkNotificationRead} onMarkAllRead={onMarkAllNotificationsRead}/>}
          </div>
          <div className="teacher-profile-chip"><span className="teacher-profile-chip__avatar">{initials}</span>
            <span className="teacher-profile-chip__copy"><strong>{profile.full_name || 'Administrador'}</strong><span>{profile.email}</span></span></div>
          <button type="button" className="teacher-logout-button" aria-label="Sair" onClick={() => void onLogout()}><LogOut size={17}/></button>
        </div>
      </header>
      {mobileMenuOpen && <div className="admin-mobile-menu">{nav(true)}<button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar"><X size={16}/></button></div>}
      <main className="teacher-portal-content admin-portal-content">{children}</main>
    </div>
  </div>
}
