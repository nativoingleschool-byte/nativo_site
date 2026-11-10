import { Bell, CheckCheck, CircleDollarSign, Info, CalendarDays, Trash2, X } from 'lucide-react'
import type { AppNotification } from '../lib/types'

type TeacherNotificationPanelProps = {
  notifications: AppNotification[]
  onClose: () => void
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onClearAll?: () => void
  onDeleteNotification?: (id: string) => void
  onSelectNotification?: (notification: AppNotification) => void
}

const iconForType = (type: string) => {
  if (type.includes('lesson') || type.includes('calendar')) return CalendarDays
  if (type.includes('invoice') || type.includes('finance')) return CircleDollarSign
  return Info
}

const formatNotificationDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

export default function TeacherNotificationPanel({
  notifications,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onDeleteNotification,
  onSelectNotification,
}: TeacherNotificationPanelProps) {
  const unreadCount = notifications.filter((item) => !item.read_at).length
  const openNotification = (notification: AppNotification) => {
    if (!notification.read_at) onMarkRead(notification.id)
    if (onSelectNotification) {
      onSelectNotification(notification)
      onClose()
      return
    }
    if (notification.action_url) {
      if (notification.action_url.startsWith('/') || notification.action_url.startsWith(window.location.origin)) {
        window.history.pushState({}, '', notification.action_url)
        window.dispatchEvent(new PopStateEvent('popstate'))
      } else {
        window.location.assign(notification.action_url)
      }
      onClose()
    }
  }

  return (
    <div className="teacher-notification-popover" role="dialog" aria-label="Notificações" onClick={(event) => event.stopPropagation()}>
      <div className="teacher-notification-popover__header">
        <div>
          <span className="teacher-notification-popover__kicker">CENTRAL DE AVISOS</span>
          <h2>Notificações</h2>
        </div>
        <button type="button" className="teacher-notification-popover__close" onClick={onClose} aria-label="Fechar notificações">
          <X size={16} />
        </button>
      </div>
      {(unreadCount > 0 || (notifications.length > 0 && onClearAll)) && (
        <div className="teacher-notification-popover__actions">
          {unreadCount > 0 ? (
            <button type="button" className="teacher-notification-popover__action" onClick={onMarkAllRead}>
              <CheckCheck size={14} /> Marcar todas como lidas
            </button>
          ) : <span />}
          {notifications.length > 0 && onClearAll && (
            <button
              type="button"
              className="teacher-notification-popover__action teacher-notification-popover__action--danger"
              onClick={onClearAll}
              title="Excluir todas as notificações da lista"
            >
              <Trash2 size={13} /> Limpar todas
            </button>
          )}
        </div>
      )}
      <div className="teacher-notification-popover__list">
        {notifications.length === 0 ? (
          <div className="teacher-notification-popover__empty">
            <Bell size={20} />
            <strong>Nenhuma notificação</strong>
            <span>Você está em dia por enquanto.</span>
          </div>
        ) : notifications.map((notification) => {
          const Icon = iconForType(notification.type)
          return (
            <div
              key={notification.id}
              className={`teacher-notification-item${notification.read_at ? '' : ' is-unread'}`}
              onClick={() => openNotification(notification)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openNotification(notification)
                }
              }}
            >
              <span className="teacher-notification-item__icon"><Icon size={15} /></span>
              <span className="teacher-notification-item__content">
                <strong>{notification.title}</strong>
                <span>{notification.body}</span>
                <small>{formatNotificationDate(notification.created_at)}</small>
              </span>
              <span className="teacher-notification-item__aside">
                {!notification.read_at && <span className="teacher-notification-item__dot" aria-label="Não lida" />}
                {onDeleteNotification && (
                  <button
                    type="button"
                    className="teacher-notification-item__delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteNotification(notification.id)
                    }}
                    aria-label="Excluir notificação"
                    title="Excluir notificação"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
