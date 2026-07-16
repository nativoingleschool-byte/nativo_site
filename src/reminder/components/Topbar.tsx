import { BrowserPermission, InstallPromptEvent, Profile } from '../lib/types'
import { Language, supportedLanguages, t } from '../lib/i18n'
import { formatDateTime } from '../lib/utils'
import { LogOut, Bell, BellOff, Download, Globe, Clock, User } from 'lucide-react'

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
}: TopbarProps) {
  const isPushEnabled = notificationPermission === 'granted' && profile.push_enabled

  const timeStr = formatDateTime(now.toISOString(), language, appTimeZone)

  return (
    <header className="topbar">
      {/* Left: user identity */}
      <div className="topbar-section">
        <div className="topbar-chip" title={profile.email}>
          <User size={15} />
          <span className="topbar-label">
            {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}: {profile.full_name.split(' ')[0]}
          </span>
        </div>
      </div>

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
            title="Timezone"
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
          title={isPushEnabled ? 'Disable push alerts' : 'Enable push alerts'}
        >
          {isPushEnabled ? <Bell size={16} /> : <BellOff size={16} />}
        </button>

        {/* Install */}
        {!isStandalone && installPrompt && (
          <button
            className="topbar-icon-btn"
            onClick={promptInstall}
            title="Install App"
          >
            <Download size={16} />
          </button>
        )}

        {/* Logout */}
        <button
          className="topbar-icon-btn topbar-icon-btn--danger"
          onClick={handleLogout}
          title="Log out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
