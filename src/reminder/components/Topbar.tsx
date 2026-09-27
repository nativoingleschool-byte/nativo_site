import { BrowserPermission, InstallPromptEvent, Profile } from '../lib/types'
import { Language, supportedLanguages, t } from '../lib/i18n'
import { formatDateTime } from '../lib/utils'
import { LogOut, Bell, BellOff, Download, Globe, Clock, User, Receipt, Settings, X } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
const appTimeZones = [
  { value: 'America/Sao_Paulo', label: 'BRT' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'EST' },
  { value: 'Europe/London', label: 'GMT' },
  { value: 'Europe/Paris', label: 'CET' },
  { value: 'Asia/Dubai', label: 'GST' },
  { value: 'Asia/Tokyo', label: 'JST' },
  { value: 'Australia/Sydney', label: 'AET' },
]

interface TopbarProps {
  profile: Profile
  language: Language
  setLanguage: (lang: Language) => void
  appTimeZone: string
  setAppTimeZone: (tz: string) => void
  now: Date
  notificationPermission: BrowserPermission
  requestPushPermission: () => Promise<void>
  disablePush: () => Promise<void>
  isStandalone: boolean
  installPrompt: InstallPromptEvent | null
  promptInstall: () => Promise<void>
  handleLogout: () => Promise<void>
  adminTab?: 'students' | 'payments' | 'calendar' | 'staff' | 'reconciliation'
  setAdminTab?: (tab: 'students' | 'payments' | 'calendar' | 'staff' | 'reconciliation') => void
  teacherTab?: 'calendar' | 'worklog' | 'profile'
}

export default function Topbar({
  profile,
  language,
  setLanguage,
  appTimeZone,
  setAppTimeZone,
  now,
  notificationPermission,
  requestPushPermission,
  disablePush,
  isStandalone,
  installPrompt,
  promptInstall,
  handleLogout,
  adminTab,
  setAdminTab,
  teacherTab,
}: TopbarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false)
      }
    }
    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSettingsOpen])

  const isPushEnabled = notificationPermission === 'granted' && profile.push_enabled
  const roleLabel = profile.role === 'admin' 
    ? t(language, 'role_admin') 
    : profile.role === 'teacher' 
    ? t(language, 'role_teacher') 
    : t(language, 'role_student')

  const timeStr = formatDateTime(now.toISOString(), language, appTimeZone)

  return (
    <header className="topbar">
      {/* Left: generated teacher context; the original identity remains for admin/student roles. */}
      {profile.role === 'teacher' ? (
        <div className="topbar-section teacher-topbar-context">
          <div className="teacher-topbar-mark">N</div>
          <div className="teacher-topbar-copy">
            <strong>{teacherTab === 'worklog' ? t(language, 'tab_worklog_nf') : teacherTab === 'profile' ? t(language, 'tab_profile_data') : t(language, 'tab_schedule')}</strong>
            <span>• {roleLabel}: {profile.full_name.split(' ')[0]}</span>
          </div>
        </div>
      ) : (
        <div className="topbar-section">
          <div className="topbar-chip" title={profile.email}>
            <User size={15} />
            <span className="topbar-label">
              {roleLabel}: {profile.full_name.split(' ')[0]}
            </span>
          </div>
        </div>
      )}

      {/* Center: Admin Navigation Bar */}
      {profile.role === 'admin' && adminTab && setAdminTab && (
        <nav className="topbar-section hidden lg:flex items-center gap-1.5">
          <button
            type="button"
            className={adminTab === 'students' ? 'tab-button tab-button-active text-xs py-1 px-3' : 'tab-button text-xs py-1 px-3'}
            onClick={() => setAdminTab('students')}
          >
            {t(language, 'student_pool')}
          </button>
          <button
            type="button"
            className={adminTab === 'payments' ? 'tab-button tab-button-active text-xs py-1 px-3' : 'tab-button text-xs py-1 px-3'}
            onClick={() => setAdminTab('payments')}
          >
            {t(language, 'payments')}
          </button>
          <button
            type="button"
            className={adminTab === 'calendar' ? 'tab-button tab-button-active text-xs py-1 px-3' : 'tab-button text-xs py-1 px-3'}
            onClick={() => setAdminTab('calendar')}
          >
            {t(language, 'calendar')}
          </button>
          <button
            type="button"
            className={adminTab === 'staff' ? 'tab-button tab-button-active text-xs py-1 px-3' : 'tab-button text-xs py-1 px-3'}
            onClick={() => setAdminTab('staff')}
          >
            {t(language, 'staff_control')}
          </button>
          <button
            type="button"
            className={adminTab === 'reconciliation' ? 'tab-button tab-button-active text-xs py-1 px-3 flex items-center gap-1.5' : 'tab-button text-xs py-1 px-3 flex items-center gap-1.5'}
            onClick={() => setAdminTab('reconciliation')}
          >
            <Receipt size={14} />
            <span>{t(language, 'bank_reconciliation')}</span>
          </button>
        </nav>
      )}

      {/* Mobile Admin Nav Selector */}
      {profile.role === 'admin' && adminTab && setAdminTab && (
        <div className="lg:hidden">
          <select
            className="topbar-select text-xs bg-slate-900/90 border border-slate-700/60 rounded px-2 py-1"
            value={adminTab}
            onChange={(e) => setAdminTab(e.target.value as any)}
          >
            <option value="students">{t(language, 'student_pool')}</option>
            <option value="payments">{t(language, 'payments')}</option>
            <option value="calendar">{t(language, 'calendar')}</option>
            <option value="staff">{t(language, 'staff_control')}</option>
            <option value="reconciliation">{t(language, 'bank_reconciliation')}</option>
          </select>
        </div>
      )}

      {/* Right: controls */}
      <div className="topbar-section" style={{ position: 'relative' }} ref={settingsRef}>
        {profile.role === 'teacher' && (
          <>
            <button type="button" className="teacher-notification-button" aria-label={language === 'pt' ? 'Notificações' : 'Notifications'} title={language === 'pt' ? 'Notificações' : 'Notifications'}>
              <Bell size={18} strokeWidth={1.7} />
            </button>
            <span className="teacher-topbar-divider" />
            <div className="teacher-avatar">{profile.full_name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
            <div className="teacher-profile-copy">
              <strong>{profile.full_name}</strong>
              <span>{profile.email}</span>
            </div>
          </>
        )}
        <button
          className="topbar-icon-btn"
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          title={language === 'es' ? 'Ajustes' : language === 'pt' ? 'Configurações' : 'Settings'}
        >
          {isSettingsOpen ? <X size={16} /> : <Settings size={16} />}
        </button>

        {isSettingsOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: 'rgba(15, 23, 42, 0.98)',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            borderRadius: '12px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minWidth: '220px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(16px)',
            zIndex: 100
          }}>
            {/* Live clock + timezone */}
            <div className="topbar-chip" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} />
                <span className="topbar-time" style={{ display: 'inline' }}>{timeStr}</span>
              </div>
              <select
                className="topbar-select"
                value={appTimeZone}
                onChange={(e) => setAppTimeZone(e.target.value)}
                title={language === 'es' ? 'Zona horaria' : language === 'pt' ? 'Fuso horário' : 'Timezone'}
                style={{ display: 'inline', width: 'auto' }}
              >
                {appTimeZones.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div className="topbar-chip" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Globe size={14} />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>{t(language, 'language')}</span>
              </div>
              <select
                className="topbar-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                {supportedLanguages.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.value.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              {/* Push toggle */}
              <button
                className={`topbar-icon-btn${isPushEnabled ? ' topbar-icon-btn--active' : ''}`}
                onClick={isPushEnabled ? disablePush : requestPushPermission}
                title={isPushEnabled 
                  ? (language === 'es' ? 'Desactivar alertas push' : language === 'pt' ? 'Desativar alertas push' : 'Disable push alerts')
                  : (language === 'es' ? 'Activar alertas push' : language === 'pt' ? 'Ativar alertas push' : 'Enable push alerts')}
                style={{ flex: 1, width: 'auto' }}
              >
                {isPushEnabled ? <Bell size={16} /> : <BellOff size={16} />}
              </button>

              {/* Install */}
              {!isStandalone && installPrompt && (
                <button
                  className="topbar-icon-btn"
                  onClick={promptInstall}
                  title={language === 'es' ? 'Instalar App' : language === 'pt' ? 'Instalar App' : 'Install App'}
                  style={{ flex: 1, width: 'auto' }}
                >
                  <Download size={16} />
                </button>
              )}

              {/* Logout */}
              <button
                className="topbar-icon-btn topbar-icon-btn--danger"
                onClick={handleLogout}
                title={language === 'es' ? 'Cerrar sesión' : language === 'pt' ? 'Sair' : 'Log out'}
                style={{ flex: 1, width: 'auto' }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
