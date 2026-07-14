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
  
  const formatDateTimeLabel = (value: string) => {
    // Only show time in the top bar to save space
    const full = formatDateTime(value, language, appTimeZone)
    // Extract just the time part, e.g. "14:30" or "02:30 PM"
    return full.split(', ').pop() || full
  }

  const isPushEnabled = notificationPermission === 'granted' && profile.push_enabled

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-item" title={profile.email}>
          <User size={18} className="muted" />
          <span className="desktop-only font-semibold">{profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}: {profile.full_name.split(' ')[0]}</span>
        </div>
      </div>
      
      <div className="topbar-right">
        {/* Live Clock */}
        <div className="topbar-item bg-panel">
          <Clock size={16} className="muted" />
          <span className="font-mono text-sm">{formatDateTimeLabel(now.toISOString())}</span>
          <select 
            className="compact-select" 
            value={appTimeZone} 
            onChange={(event) => setAppTimeZone(event.target.value)}
            title="Timezone"
          >
            {appTimeZones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
        </div>

        {/* Language Picker */}
        <div className="topbar-item bg-panel">
          <Globe size={16} className="muted" />
          <select 
            className="compact-select" 
            value={language} 
            onChange={(event) => setLanguage(event.target.value as Language)}
            title="Language"
          >
            {supportedLanguages.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Notifications */}
        <button 
          className={`topbar-action-btn ${isPushEnabled ? 'active' : ''}`} 
          onClick={isPushEnabled ? disablePush : requestPushPermission}
          title={isPushEnabled ? "Disable push alerts" : "Enable push alerts"}
        >
          {isPushEnabled ? <Bell size={18} /> : <BellOff size={18} />}
        </button>

        {/* Install */}
        {!isStandalone && installPrompt && (
          <button 
            className="topbar-action-btn"
            onClick={promptInstall}
            title="Install App"
          >
            <Download size={18} />
          </button>
        )}

        {/* Logout */}
        <button 
          className="topbar-action-btn danger"
          onClick={handleLogout}
          title="Log out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
