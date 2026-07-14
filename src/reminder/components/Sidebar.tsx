import { BrowserPermission, InstallPromptEvent, Profile } from '../lib/types'
import { Language, supportedLanguages, t } from '../lib/i18n'
import { formatDateTime } from '../lib/utils'

const appTimeZones = [
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
]

interface SidebarProps {
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

export default function Sidebar({
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
}: SidebarProps) {
  const isAdmin = profile.role === 'admin'
  const isTeacher = profile.role === 'teacher'
  const isStudent = profile.role === 'student'

  const formatDateTimeLabel = (value: string) => formatDateTime(value, language, appTimeZone)

  return (
    <aside className="sidebar">
      <div>
        <p className="eyebrow">Signed in as {profile.role}</p>
        <h1>{profile.full_name}</h1>
        <p className="muted">
          {isAdmin && 'Manage the school users, schedule lessons, and track lesson outcomes across the whole app.'}
          {isTeacher && 'See your weekly teaching schedule and record lesson outcomes with your students.'}
          {isStudent && 'Review your lessons, respond to reminders, and mark whether classes happened.'}
        </p>
      </div>

      <div className="clock-panel">
        <p className="section-label">{t(language, 'language')}</p>
        <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
          {supportedLanguages.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="clock-panel">
        <p className="section-label">Live time</p>
        <div className="feature-status">
          <h2>{formatDateTimeLabel(now.toISOString())}</h2>
          <select value={appTimeZone} onChange={(event) => setAppTimeZone(event.target.value)}>
            {appTimeZones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
        </div>
        <p className="muted">Reminder cards appear automatically when the lesson enters the 4-hour window or starts.</p>
      </div>

      <div className="clock-panel">
        <p className="section-label">Device features</p>
        <div className="feature-status">
          <span>Push alerts</span>
          <strong>{notificationPermission === 'granted' && profile.push_enabled ? 'On' : 'Off'}</strong>
        </div>
        <div className="feature-status">
          <span>Install mode</span>
          <strong>{isStandalone ? 'Installed' : 'Browser'}</strong>
        </div>
        <div className="button-stack">
          {notificationPermission !== 'granted' || !profile.push_enabled ? (
            <button className="primary-button" onClick={requestPushPermission}>
              Enable push alerts
            </button>
          ) : (
            <button className="secondary-button" onClick={disablePush}>
              Disable push alerts
            </button>
          )}

          {!isStandalone && installPrompt ? (
            <button className="secondary-button" onClick={promptInstall}>
              Install app
            </button>
          ) : (
            <p className="muted tiny-copy">
              {!isStandalone
                ? 'If Chrome does not show an install prompt yet, use Add to Home Screen from the browser menu.'
                : 'The app is already running in installed mode.'}
            </p>
          )}
        </div>
      </div>

      <div className="clock-panel">
        <p className="section-label">Session</p>
        <p className="muted">
          Email: <span className="inline-code">{profile.email}</span>
        </p>
        <button className="danger-button full-width" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </aside>
  )
}
