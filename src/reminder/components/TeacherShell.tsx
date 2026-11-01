import { type ReactNode, useState } from 'react'
import {
  Bell,
  CalendarDays,
  CircleHelp,
  Clock3,
  LogOut,
  UserRound,
} from 'lucide-react'
import type { AppNotification, Profile } from '../lib/types'
import TeacherNotificationPanel from './TeacherNotificationPanel'
import { trackPageView } from '../../lib/telemetry'
import { ThemeToggle } from '../../lib/theme'

export type TeacherTab = 'calendar' | 'worklog' | 'profile'

export type TeacherShellProps = {
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
  onClearNotifications?: () => void
  onDeleteNotification?: (id: string) => void
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
  { id: 'worklog', label: 'Aulas & Registro', icon: Clock3 },
  { id: 'profile', label: 'Financeiro', icon: UserRound },
]

const pageTitles: Record<TeacherTab, string> = {
  calendar: 'Minha Agenda',
  worklog: 'Aulas & Registro',
  profile: 'Financeiro',
}

const defaultPageSubtitles: Record<TeacherTab, string> = {
  calendar: 'Visualize e gerencie os horários das suas aulas',
  worklog: 'Confirme a realização das aulas e acompanhe o histórico',
  profile: 'Consulte seus pagamentos e envie notas fiscais',
}

function getInitials(name?: string | null): string {
  if (!name) return 'PR'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'PR'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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
            onClick={() => {
              trackPageView(`/teacher/${id}`)
              onTabChange(id)
            }}
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
  onClearNotifications,
  onDeleteNotification,
  onLogout,
  onSupport,
  pageSubtitles,
}: TeacherShellProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const teacherName = profile.full_name || profile.email?.split('@')[0] || 'Professor'
  const hasUnreadNotifications = unreadNotifications > 0
  const pageTitle = pageTitles[activeTab]
  const pageSubtitle = pageSubtitles?.[activeTab] ?? defaultPageSubtitles[activeTab]

  return (
    <div className="teacher-portal-shell">
      <aside className="teacher-sidebar" aria-label="Menu principal do professor">
        <div className="teacher-sidebar__brand">
          <div className="teacher-sidebar__monogram" aria-hidden="true">
            <img src="/hero/logo-white.png" alt="" />
          </div>
          <div className="teacher-sidebar__brand-copy">
            <strong>
              NATIVO <em className="teacher-brand-english">ENGLISH</em>
            </strong>
            <span>Portal do Professor</span>
          </div>
        </div>

        <TeacherNavigation activeTab={activeTab} onTabChange={onTabChange} />

        <div className="teacher-sidebar__footer">
          {onSupport && (
            <button
              type="button"
              className="teacher-sidebar__support-button"
              onClick={onSupport}
              aria-label="Ajuda e Suporte"
            >
              <CircleHelp aria-hidden="true" size={17} />
              <span>Ajuda e Suporte</span>
            </button>
          )}

          <span className="teacher-sidebar__version">Nativo English · Professor</span>
        </div>
      </aside>

      <div className="teacher-portal-main">
        <header className="teacher-context-header" aria-label="Cabeçalho contextual">
          <div className="teacher-context-header__title-group">
            <div className="teacher-context-header__heading-row">
              <h1 className="teacher-context-header__title">{pageTitle}</h1>
              <span className="teacher-context-header__separator" aria-hidden="true">
                •
              </span>
              <span className="teacher-context-header__subtitle">{pageSubtitle}</span>
            </div>
          </div>

          <div className="teacher-context-header__actions">
            <ThemeToggle />

            <div className="teacher-notification-anchor">
              <button
                type="button"
                className="teacher-notification-button"
                aria-label={
                  hasUnreadNotifications
                    ? `Notificações (${unreadNotifications} novas)`
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
                  onClearAll={onClearNotifications}
                  onDeleteNotification={onDeleteNotification}
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
                onClick={() => void onLogout()}
                aria-label="Sair da conta"
                title="Sair da conta"
              >
                <LogOut aria-hidden="true" size={17} />
              </button>
            )}
          </div>
        </header>

        <main className="teacher-portal-content" tabIndex={-1}>
          {children}
        </main>

        <TeacherNavigation activeTab={activeTab} onTabChange={onTabChange} mobile />
      </div>
    </div>
  )
}
