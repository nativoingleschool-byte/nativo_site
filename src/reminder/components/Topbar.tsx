import { BrowserPermission, InstallPromptEvent, Profile } from '../lib/types'
import { Language, supportedLanguages, t } from '../lib/i18n'
import { formatDateTime } from '../lib/utils'
import { LogOut, Bell, BellOff, Download, Globe, Clock, User, Receipt } from 'lucide-react'

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
}: TopbarProps) {
  const isPushEnabled = notificationPermission === 'granted' && profile.push_enabled
  const roleLabel = profile.role === 'admin' 
    ? t(language, 'role_admin') 
    : profile.role === 'teacher' 
    ? t(language, 'role_teacher') 
    : t(language, 'role_student')

  const timeStr = formatDateTime(now.toISOString(), language, appTimeZone)

  return (
    <header className="topbar">
      {/* Left: user identity */}
      <div className="topbar-section">
        <div className="topbar-chip" title={profile.email}>
          <User size={15} />
          <span className="topbar-label">
            {roleLabel}: {profile.full_name.split(' ')[0]}
          </span>
        </div>
      </div>

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
      <div className="topbar-section">
        {/* Live clock + timezone */}
        <div className="topbar-chip">
          <Clock size={14} />
          <span className="topbar-time">{timeStr}</span>
          <select
            className="topbar-select"
            value={appTimeZone}
            onChange={(e) => setAppTimeZone(e.target.value)}
            title={language === 'es' ? 'Zona horaria' : language === 'pt' ? 'Fuso horário' : 'Timezone'}
          >
            {appTimeZones.map((z) => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
          </select>
        </div>

        {/* Language */}
        <div className="topbar-chip">
          <Globe size={14} />
          <select
            className="topbar-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            title={t(language, 'language')}
          >
            {supportedLanguages.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.value.toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Push toggle */}
        <button
          className={`topbar-icon-btn${isPushEnabled ? ' topbar-icon-btn--active' : ''}`}
          onClick={isPushEnabled ? disablePush : requestPushPermission}
          title={isPushEnabled 
            ? (language === 'es' ? 'Desactivar alertas push' : language === 'pt' ? 'Desativar alertas push' : 'Disable push alerts')
            : (language === 'es' ? 'Activar alertas push' : language === 'pt' ? 'Ativar alertas push' : 'Enable push alerts')}
        >
          {isPushEnabled ? <Bell size={16} /> : <BellOff size={16} />}
        </button>

        {/* Install */}
        {!isStandalone && installPrompt && (
          <button
            className="topbar-icon-btn"
            onClick={promptInstall}
            title={language === 'es' ? 'Instalar App' : language === 'pt' ? 'Instalar App' : 'Install App'}
          >
            <Download size={16} />
          </button>
        )}

        {/* Logout */}
        <button
          className="topbar-icon-btn topbar-icon-btn--danger"
          onClick={handleLogout}
          title={language === 'es' ? 'Cerrar sesión' : language === 'pt' ? 'Sair' : 'Log out'}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
