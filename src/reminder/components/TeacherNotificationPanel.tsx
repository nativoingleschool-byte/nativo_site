import { Bell, CheckCheck, CircleDollarSign, Info, CalendarDays, X } from 'lucide-react'
import type { AppNotification } from '../lib/types'

type TeacherNotificationPanelProps = {
  notifications: AppNotification[]
  onClose: () => void
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
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
}: TeacherNotificationPanelProps) {
  const unreadCount = notifications.filter((item) => !item.read_at).length
  const openNotification = (notification: AppNotification) => {
    if (!notification.read_at) onMarkRead(notification.id)
    if (notification.action_url) {
      window.location.assign(notification.action_url)
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
      {unreadCount > 0 && (
        <button type="button" className="teacher-notification-popover__mark-all" onClick={onMarkAllRead}>
          <CheckCheck size={14} /> Marcar todas como lidas
        </button>
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
            <button
              type="button"
              key={notification.id}
              className={`teacher-notification-item${notification.read_at ? '' : ' is-unread'}`}
              onClick={() => openNotification(notification)}
            >
              <span className="teacher-notification-item__icon"><Icon size={15} /></span>
              <span className="teacher-notification-item__content">
                <strong>{notification.title}</strong>
                <span>{notification.body}</span>
                <small>{formatNotificationDate(notification.created_at)}</small>
              </span>
              {!notification.read_at && <span className="teacher-notification-item__dot" aria-label="Não lida" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
