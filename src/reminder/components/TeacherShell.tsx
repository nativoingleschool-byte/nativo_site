import { useState, type ReactNode } from 'react'
import {
  Bell,
  CalendarDays,
  CircleDollarSign,
  LogOut,
  UserRound,
} from 'lucide-react'
import type { AppNotification, Profile } from '../lib/types'
import TeacherNotificationPanel from './TeacherNotificationPanel'

export type TeacherTab = 'calendar' | 'worklog' | 'profile'

type TeacherShellProps = {
  /** Perfil já carregado pelo ReminderApp/Supabase. O shell apenas o exibe. */
  profile: Profile
  /** Aba atualmente selecionada pelo estado existente do ReminderApp. */
  activeTab: TeacherTab
  /** Atualiza a aba sem conhecer a origem dos dados ou regras de negócio. */
  onTabChange: (tab: TeacherTab) => void
  /** Conteúdo da aba selecionada. */
  children: ReactNode
  /** Quantidade de notificações ainda não lidas. */
  unreadNotifications?: number
  /** Abre o painel de notificações existente, quando fornecido. */
  onOpenNotifications?: () => void
  notifications?: AppNotification[]
  onMarkNotificationRead?: (id: string) => void
  onMarkAllNotificationsRead?: () => void
  /** Mantém o logout existente fora do shell. */
  onLogout?: () => void | Promise<void>
  /** Ação opcional do suporte; permanece desacoplada da camada visual. */
  onSupport?: () => void
  /** Texto contextual opcional para cada aba. */
  pageSubtitles?: Partial<Record<TeacherTab, string>>
}

type NavigationItem = {
  id: TeacherTab
  label: string
  icon: typeof CalendarDays
}

const navigationItems: NavigationItem[] = [
  { id: 'calendar', label: 'Agenda', icon: CalendarDays },
  { id: 'worklog', label: 'Financeiro', icon: CircleDollarSign },
  { id: 'profile', label: 'Meu perfil', icon: UserRound },
]

const pageTitles: Record<TeacherTab, string> = {
  calendar: 'Agenda',
  worklog: 'Financeiro',
  profile: 'Meu perfil',
}

const defaultPageSubtitles: Record<TeacherTab, string> = {
  calendar: 'Acompanhe suas aulas e disponibilidade.',
  worklog: 'Demonstrativo e NFS-e MEI.',
  profile: 'Cadastro & Dados Bancários',
}

function getInitials(fullName: string) {
  const initials = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return initials || 'P'
}

function TeacherNavigation({
  activeTab,
  onTabChange,
  mobile = false,
}: {
  activeTab: TeacherTab
  onTabChange: (tab: TeacherTab) => void
  mobile?: boolean
}) {
  return (
    <nav
      className={mobile ? 'teacher-mobile-navigation' : 'teacher-sidebar-navigation'}
      aria-label="Navegação do Portal do Professor"
    >
      {navigationItems.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id

        return (
          <button
            key={id}
            type="button"
            className={
              mobile
                ? `teacher-mobile-navigation__item${isActive ? ' is-active' : ''}`
                : `teacher-sidebar-navigation__item${isActive ? ' is-active' : ''}`
            }
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onTabChange(id)}
          >
            <Icon aria-hidden="true" size={mobile ? 19 : 18} strokeWidth={isActive ? 2.2 : 1.9} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default function TeacherShell({
  profile,
  activeTab,
  onTabChange,
  children,
  unreadNotifications = 0,
  onOpenNotifications,
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onLogout,
  onSupport,
  pageSubtitles,
}: TeacherShellProps) {
  const teacherName = profile.full_name.trim() || 'Professor'
  const pageTitle = pageTitles[activeTab]
  const pageSubtitle = pageSubtitles?.[activeTab] ?? defaultPageSubtitles[activeTab]
  const hasUnreadNotifications = unreadNotifications > 0
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  return (
    <div className="teacher-portal-shell">
      <aside className="teacher-sidebar" aria-label="Portal do Professor">
        <div className="teacher-sidebar__brand">
          <div className="teacher-sidebar__monogram" aria-hidden="true">
            <img src="/hero/logo-white.png" alt="" />
          </div>
          <div className="teacher-sidebar__brand-copy">
            <strong>NATIVO ENGLISH</strong>
            <span>Portal do Professor</span>
          </div>
        </div>

        <TeacherNavigation activeTab={activeTab} onTabChange={onTabChange} />

        <div className="teacher-sidebar__footer">
          <button type="button" className="teacher-sidebar__support" onClick={onSupport}>
            <span className="teacher-sidebar__support-icon" aria-hidden="true">
              ?
            </span>
            <span>Suporte Docente</span>
          </button>
          <span className="teacher-sidebar__version">Nativo English v2.4</span>
        </div>
      </aside>

      <div className="teacher-portal-main">
        <header className="teacher-context-header">
          <div className="teacher-context-header__title-group">
            <span className="teacher-context-header__eyebrow">Portal do Professor</span>
            <div className="teacher-context-header__heading-row">
              <h1>{pageTitle}</h1>
              <span className="teacher-context-header__separator" aria-hidden="true">
                •
              </span>
              <span className="teacher-context-header__subtitle">{pageSubtitle}</span>
            </div>
          </div>

          <div className="teacher-context-header__actions">
            <div className="teacher-notification-anchor">
              <button
                type="button"
                className="teacher-notification-button"
                aria-label={
                  hasUnreadNotifications
                    ? `${unreadNotifications} notificações não lidas`
                    : 'Notificações'
                }
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((open) => !open)
                  onOpenNotifications?.()
                }}
              >
                <Bell aria-hidden="true" size={18} strokeWidth={1.9} />
                {hasUnreadNotifications && (
                  <span className="teacher-notification-button__badge" aria-hidden="true">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <TeacherNotificationPanel
                  notifications={notifications}
                  onClose={() => setNotificationsOpen(false)}
                  onMarkRead={(id) => onMarkNotificationRead?.(id)}
                  onMarkAllRead={() => onMarkAllNotificationsRead?.()}
                />
              )}
            </div>

            <div className="teacher-profile-chip" title={profile.email}>
              <span className="teacher-profile-chip__avatar" aria-hidden="true">
                {getInitials(teacherName)}
              </span>
              <span className="teacher-profile-chip__copy">
                <strong>Prof. {teacherName}</strong>
                <span>{profile.email}</span>
              </span>
            </div>

            {onLogout && (
              <button
                type="button"
                className="teacher-logout-button"
                aria-label="Sair"
                title="Sair"
                onClick={() => void onLogout()}
              >
                <LogOut aria-hidden="true" size={17} strokeWidth={1.9} />
              </button>
            )}
          </div>
        </header>

        <main className="teacher-portal-content">{children}</main>
      </div>

      <div className="teacher-mobile-bottom-bar">
        <TeacherNavigation activeTab={activeTab} onTabChange={onTabChange} mobile />
      </div>
    </div>
  )
}
