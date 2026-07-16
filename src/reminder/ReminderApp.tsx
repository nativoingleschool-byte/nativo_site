import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import AdminCalendar from './components/AdminCalendar'
import './styles.css'
import { ToastProvider, useToast } from './lib/toast'
import { getDeviceLanguage, getStoredLanguage, Language, storeLanguage, t } from './lib/i18n'
import {
  BrowserPermission,
  InstallPromptEvent,
  Lesson,
  Profile,
  ReminderIntent,
  ReminderNotification,
  UserRole,
  UserFormState,
} from './lib/types'
import {
  formatShortDate,
  sortByDateAsc,
  sortByDateDesc,
  minutesUntil,
  statusLabel,
  badgeClass,
  applyIntentToLesson,
  getStandaloneMode,
  getStoredNotificationKeys,
  storeNotificationKeys,
} from './lib/utils'

import StatCard from './components/StatCard'
import LoginPanel from './components/LoginPanel'
import Topbar from './components/Topbar'
import AdminStudentsTab from './components/AdminStudentsTab'
import AdminPaymentsTab from './components/AdminPaymentsTab'
import AdminStaffTab from './components/AdminStaffTab'
import StudentPanel from './components/StudentPanel'
import TeacherPanel from './components/TeacherPanel'
import { registerAppServiceWorker } from './pwa'

type AccountFormState = {
  full_name: string
  email: string
  password: string
  confirm_password: string
}

type PendingLink = {
  lessonId: string | null
  intent: ReminderIntent | null
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

const defaultUserForm = (): UserFormState => ({
  full_name: '',
  email: '',
  password: '',
  role: 'student',
  class_name: '',
  speciality: '',
  first_class_at: '',
  first_class_teacher_id: '',
  cpf: '',
  data_pagamento_preferencial: 5,
  chave_pix: '',
  cnpj: '',
  taxa_hora_aula: 56.00,
})

const defaultAccountForm = (profile: Profile | null): AccountFormState => ({
  full_name: profile?.full_name ?? '',
  email: profile?.email ?? '',
  password: '',
  confirm_password: '',
})

function ReminderAppInner() {
  const { toast } = useToast()
  const [language, setLanguage] = useState<Language>(() => getStoredLanguage() ?? getDeviceLanguage())
  const [appTimeZone, setAppTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [appError, setAppError] = useState('')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [userForm, setUserForm] = useState<UserFormState>(defaultUserForm())
  const [notificationPermission, setNotificationPermission] = useState<BrowserPermission>(() =>
    'Notification' in window ? Notification.permission : 'unsupported',
  )
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(getStandaloneMode())
  const [focusedLessonId, setFocusedLessonId] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())
  const [pendingLink, setPendingLink] = useState<PendingLink>({ lessonId: null, intent: null })
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [adminTab, setAdminTab] = useState<'students' | 'payments' | 'calendar' | 'staff'>('students')
  const [studentTab, setStudentTab] = useState<'account' | 'lessons' | 'invoices'>('lessons')
  const [teacherTab, setTeacherTab] = useState<'calendar' | 'worklog' | 'profile'>('calendar')
  const [teacherNotes, setTeacherNotes] = useState('')
  const [uploadingNf, setUploadingNf] = useState(false)
  const [invoices, setInvoices] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [generatedInviteLink, setGeneratedInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'em_dia' | 'pendente' | 'atrasado'>('all')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [createWithSetupLink, setCreateWithSetupLink] = useState(false)
  const [latestSetupLink, setLatestSetupLink] = useState<string | null>(null)
  const [setupCredentials, setSetupCredentials] = useState<{ email: string; password: string } | null>(null)
  const [setupSigningIn, setSetupSigningIn] = useState(false)
  const [accountForm, setAccountForm] = useState<AccountFormState>(() => defaultAccountForm(null))
  const [accountSaving, setAccountSaving] = useState(false)
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [updatePasswordError, setUpdatePasswordError] = useState('')

  const renderResetPasswordModal = () => {
    if (!showResetPasswordModal) return null
    return (
      <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="form-card" style={{ maxWidth: '400px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#fff' }}>
            {language === 'es' ? 'Actualizar Contraseña' : language === 'en' ? 'Update Password' : 'Atualizar Senha'}
          </h3>
          
          <form onSubmit={async (e) => {
            e.preventDefault();
            setUpdatePasswordError('');
            if (newPassword !== confirmNewPassword) {
              setUpdatePasswordError(language === 'es' ? 'Las contraseñas no coinciden.' : language === 'en' ? 'Passwords do not match.' : 'As senhas não coincidem.');
              return;
            }
            setUpdatingPassword(true);
            try {
              const { error } = await supabase.auth.updateUser({ password: newPassword });
              if (error) throw error;
              toast.success(language === 'es' ? 'Contraseña actualizada con éxito.' : language === 'en' ? 'Password updated successfully.' : 'Senha atualizada com sucesso.');
              setShowResetPasswordModal(false);
              setNewPassword('');
              setConfirmNewPassword('');
            } catch (err: any) {
              setUpdatePasswordError(err.message || 'Erro ao atualizar senha.');
            } finally {
              setUpdatingPassword(false);
            }
          }}>
            <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <input
                required
                type="password"
                placeholder={language === 'es' ? 'Nueva Contraseña' : language === 'en' ? 'New Password' : 'Nova Senha'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '0.75rem 1rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.75rem', color: '#fff' }}
              />
              <input
                required
                type="password"
                placeholder={language === 'es' ? 'Confirmar Nueva Contraseña' : language === 'en' ? 'Confirm New Password' : 'Confirmar Nova Senha'}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                style={{ width: '100%', padding: '0.75rem 1rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.75rem', color: '#fff' }}
              />
              {updatePasswordError && <p className="error-text">{updatePasswordError}</p>}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="primary-button" style={{ flex: 1 }} disabled={updatingPassword}>
                {updatingPassword ? (language === 'es' ? 'Guardando...' : language === 'en' ? 'Saving...' : 'Salvando...') : (language === 'es' ? 'Guardar Senha' : language === 'en' ? 'Save Password' : 'Salvar Senha')}
              </button>
              <button 
                type="button" 
                className="secondary-button" 
                onClick={() => {
                  setShowResetPasswordModal(false);
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}
              >
                {language === 'es' ? 'Cancelar' : language === 'en' ? 'Cancel' : 'Cancelar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }


  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('triggerPasswordReset') === 'true') {
      setShowResetPasswordModal(true)
      sessionStorage.removeItem('triggerPasswordReset')
      if (window.location.hash) {
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }
  }, [])

  useEffect(() => {
    void registerAppServiceWorker()
  }, [])

  useEffect(() => {
    storeLanguage(language)
  }, [language])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const lessonId = params.get('lessonId')
    const intent = params.get('intent') as ReminderIntent | null
    const setupEmail = params.get('setup_email')
    const setupPassword = params.get('setup_password')

    if (lessonId || intent) {
      setPendingLink({ lessonId, intent })
    }

    if (setupEmail && setupPassword) {
      setSetupCredentials({ email: setupEmail, password: setupPassword })
    }

    if (lessonId || intent) {
      params.delete('lessonId')
      params.delete('intent')
      const nextQuery = params.toString()
      window.history.replaceState({}, document.title, nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname)
    }
  }, [])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }

    const handleInstalled = () => {
      setInstallPrompt(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let active = true

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session)
      setLoading(false)
    }

    void loadSession()

    if (window.location.hash.includes('type=recovery')) {
      setShowResetPasswordModal(true)
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPasswordModal(true)
      }
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!setupCredentials || setupSigningIn || loading || session || !isSupabaseConfigured) return

    let cancelled = false

    const runSetupSignIn = async () => {
      const creds = setupCredentials
      setSetupCredentials(null)
      setSetupSigningIn(true)

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: creds.email, password: creds.password })
        })
        const data = await response.json()
        if (cancelled) return

        if (!response.ok) {
          setLoginError(data.error || 'This setup link is invalid or has expired.')
          return
        }

        const { error } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        })

        if (error) throw error

        setLoginForm({ email: creds.email, password: '' })
        const params = new URLSearchParams(window.location.search)
        params.delete('setup_email')
        params.delete('setup_password')
        const nextQuery = params.toString()
        window.history.replaceState({}, document.title, nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname)
      } finally {
        if (!cancelled) {
          setSetupSigningIn(false)
        }
      }
    }

    void runSetupSignIn()

    return () => {
      cancelled = true
    }
  }, [setupCredentials, setupSigningIn, loading, session])

  const refreshProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) throw error
    setProfile(data as Profile)
    return data as Profile
  }

  const refreshProfiles = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (error) throw error
    setProfiles((data ?? []) as Profile[])
  }

  const refreshLessons = async () => {
    const { data, error } = await supabase.from('lessons').select('*').order('starts_at', { ascending: true })
    if (error) throw error
    setLessons((data ?? []) as Lesson[])
  }

  const refreshInvoices = async () => {
    const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
    if (error) throw error
    setInvoices(data ?? [])
  }

  useEffect(() => {
    if (!session?.user || !isSupabaseConfigured) {
      setProfile(null)
      setProfiles([])
      setLessons([])
      setInvoices([])
      return
    }

    let cancelled = false

    const loadData = async () => {
      try {
        const currentProfile = await refreshProfile(session.user.id)
        if (cancelled) return
        if (currentProfile.role === 'admin') {
          await refreshProfiles()
          await refreshInvoices()
        } else {
          setProfiles([currentProfile])
          if (currentProfile.role === 'student') {
            await refreshInvoices()
          }
        }
        if (cancelled) return
        await refreshLessons()
        setAppError('')
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setAppError('The app could not load data from Supabase. Check the environment variables and database setup.')
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    setAccountForm(defaultAccountForm(profile))
  }, [profile?.id])

  useEffect(() => {
    if (!session?.user?.id) return

    const channel = supabase
      .channel(`db-changes-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lessons' }, () => {
        void refreshLessons()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload: any) => {
        const changedId = payload?.new?.id || payload?.old?.id
        if (profile?.role === 'admin') {
          void refreshProfiles()
        }
        if (changedId && changedId === session.user.id) {
          void refreshProfile(session.user.id)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        void refreshInvoices()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [session?.user?.id, profile?.role])

  useEffect(() => {
    if (!pendingLink.lessonId || !pendingLink.intent || !session?.user) return

    const targetLesson = lessons.find((lesson) => lesson.id === pendingLink.lessonId)
    if (!targetLesson) return

    const changes = applyIntentToLesson(pendingLink.intent)
    setFocusedLessonId(pendingLink.lessonId)
    void updateLesson(targetLesson.id, changes)
    setPendingLink({ lessonId: null, intent: null })
  }, [pendingLink, lessons, session])

  const profilesById = useMemo(
    () => Object.fromEntries(profiles.map((item) => [item.id, item])),
    [profiles],
  )

  const students = profiles.filter((item) => item.role === 'student')
  const teachers = profiles.filter((item) => item.role === 'teacher')

  useEffect(() => {
    if (!userForm.first_class_teacher_id && teachers[0]) {
      setUserForm((current) => ({ ...current, first_class_teacher_id: teachers[0].id }))
    }
  }, [userForm.first_class_teacher_id, teachers])

  const visibleLessons = useMemo(() => {
    if (!profile) return []
    if (profile.role === 'admin') return [...lessons]
    if (profile.role === 'teacher') return lessons.filter((lesson) => lesson.teacher_id === profile.id)
    return lessons.filter((lesson) => lesson.student_id === profile.id)
  }, [lessons, profile])

  const studentPastLessons = profile?.role === 'student'
    ? visibleLessons.filter((lesson) => new Date(lesson.starts_at) < now).sort(sortByDateDesc).slice(0, 3)
    : []

  const studentUpcomingLessons = profile?.role === 'student'
    ? visibleLessons.filter((lesson) => new Date(lesson.starts_at) >= now).sort(sortByDateAsc).slice(0, 4)
    : []

  const teacherPastWeek = profile?.role === 'teacher'
    ? visibleLessons
        .filter((lesson) => {
          const lessonTime = new Date(lesson.starts_at).getTime()
          return lessonTime < now.getTime() && lessonTime >= now.getTime() - ONE_WEEK_MS
        })
        .sort(sortByDateDesc)
    : []

  const teacherUpcomingTenDays = profile?.role === 'teacher'
    ? visibleLessons
        .filter((lesson) => {
          const lessonTime = new Date(lesson.starts_at).getTime()
          return lessonTime >= now.getTime() && lessonTime <= now.getTime() + TEN_DAYS_MS
        })
        .sort(sortByDateAsc)
    : []

  const dueStudentFourHourReminders = profile?.role === 'student'
    ? visibleLessons
        .filter((lesson) => {
          const lessonTime = new Date(lesson.starts_at).getTime()
          return now.getTime() >= lessonTime - FOUR_HOURS_MS && now.getTime() < lessonTime && lesson.student_attendance === null
        })
        .sort(sortByDateAsc)
    : []

  const dueStudentStartReminders = profile?.role === 'student'
    ? visibleLessons
        .filter((lesson) => now.getTime() >= new Date(lesson.starts_at).getTime() && lesson.student_lesson_status === null)
        .sort(sortByDateAsc)
    : []

  const dueTeacherFourHourReminders = profile?.role === 'teacher'
    ? visibleLessons
        .filter((lesson) => {
          const lessonTime = new Date(lesson.starts_at).getTime()
          return now.getTime() >= lessonTime - FOUR_HOURS_MS && now.getTime() < lessonTime
        })
        .sort(sortByDateAsc)
    : []

  const dueTeacherStartReminders = profile?.role === 'teacher'
    ? visibleLessons
        .filter((lesson) => now.getTime() >= new Date(lesson.starts_at).getTime() && lesson.teacher_lesson_status === null)
        .sort(sortByDateAsc)
    : []

  const trackedLessons = lessons
    .filter(
      (lesson) =>
        lesson.student_attendance !== null || lesson.student_lesson_status !== null || lesson.teacher_lesson_status !== null,
    )
    .sort(sortByDateDesc)

  const reminderCount =
    dueStudentFourHourReminders.length +
    dueStudentStartReminders.length +
    dueTeacherFourHourReminders.length +
    dueTeacherStartReminders.length

  const dueNotifications = useMemo(() => {
    if (!profile) return []

    const reminderList: ReminderNotification[] = []

    if (profile.role === 'student') {
      for (const lesson of dueStudentFourHourReminders) {
        reminderList.push({
          key: `${profile.id}-${lesson.id}-student-4h`,
          title: 'Lesson reminder',
          body: `${lesson.subject} starts in ${minutesUntil(now, lesson.starts_at)} minutes.`,
          lessonId: lesson.id,
          userId: profile.id,
          actions: [
            { action: 'attend', title: 'I will attend' },
            { action: 'cancel', title: 'I need to cancel' },
          ],
          intentMap: { attend: 'attend', cancel: 'cancel' },
        })
      }

      for (const lesson of dueStudentStartReminders) {
        reminderList.push({
          key: `${profile.id}-${lesson.id}-student-start`,
          title: 'Class-time reminder',
          body: `${lesson.subject} is due now. Confirm whether the class was done.`,
          lessonId: lesson.id,
          userId: profile.id,
          actions: [
            { action: 'done', title: 'I did my class' },
            { action: 'not_done', title: 'I did not do it' },
          ],
          intentMap: { done: 'done', not_done: 'not_done' },
        })
      }
    }

    if (profile.role === 'teacher') {
      for (const lesson of dueTeacherFourHourReminders) {
        const student = profilesById[lesson.student_id]
        reminderList.push({
          key: `${profile.id}-${lesson.id}-teacher-4h`,
          title: 'Upcoming lesson reminder',
          body: `${student?.full_name ?? 'Student'} has ${lesson.student_attendance ?? 'not replied'} for ${lesson.subject}.`,
          lessonId: lesson.id,
          userId: profile.id,
          actions: [{ action: 'open', title: 'Open lesson' }],
          intentMap: {},
        })
      }

      for (const lesson of dueTeacherStartReminders) {
        reminderList.push({
          key: `${profile.id}-${lesson.id}-teacher-start`,
          title: 'Teacher class check',
          body: `${lesson.subject} is due now. Record what happened.`,
          lessonId: lesson.id,
          userId: profile.id,
          actions: [
            { action: 'happened', title: 'Class happened' },
            { action: 'not_happened', title: 'Did not happen' },
            { action: 'student_no_show', title: "Student didn't show" },
          ],
          intentMap: {
            happened: 'happened',
            not_happened: 'not_happened',
            student_no_show: 'student_no_show',
          },
        })
      }
    }

    return reminderList
  }, [
    dueStudentFourHourReminders,
    dueStudentStartReminders,
    dueTeacherFourHourReminders,
    dueTeacherStartReminders,
    now,
    profile,
    profilesById,
  ])

  useEffect(() => {
    if (!profile || notificationPermission !== 'granted' || !profile.push_enabled || dueNotifications.length === 0) {
      return
    }

    const storedKeys = getStoredNotificationKeys()
    const newNotifications = dueNotifications.filter((item) => !storedKeys.includes(item.key))
    if (newNotifications.length === 0) return

    const sendNotifications = async () => {
      const registration = await navigator.serviceWorker.ready

      for (const notification of newNotifications) {
        const payload = {
          title: notification.title,
          options: {
            body: notification.body,
            tag: notification.key,
            renotify: true,
            icon: '/app-icon.svg',
            badge: '/app-icon.svg',
            data: {
              baseUrl: `${window.location.origin}/?lessonId=${encodeURIComponent(notification.lessonId)}`,
              intentMap: notification.intentMap,
            },
            actions: notification.actions,
          },
        }

        if (registration.active) {
          registration.active.postMessage({ type: 'SHOW_NOTIFICATION', payload })
        } else {
          await registration.showNotification(notification.title, payload.options)
        }
      }

      storeNotificationKeys([...storedKeys, ...newNotifications.map((item) => item.key)])
    }

    void sendNotifications()
  }, [dueNotifications, notificationPermission, profile])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setLoginError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginForm.email, password: loginForm.password })
      })
      const data = await response.json()

      if (!response.ok) {
        setLoginError(data.error || 'Falha na autenticação.')
        return
      }

      const { error } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      })

      if (error) {
        setLoginError(error.message)
      }
    } catch (err: any) {
      setLoginError(err.message || 'Erro de conexão com o servidor.')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setFocusedLessonId(null)
  }

  const requestPushPermission = (): Promise<void> => {
    if (!profile || !('Notification' in window)) {
      setNotificationPermission('unsupported')
      toast.info("As notificações push não são suportadas por este navegador. Em iOS, adicione o app à Tela de Início primeiro.")
      return Promise.resolve()
    }

    let hasResolved = false
    const handlePermissionResult = (permission: NotificationPermission) => {
      if (hasResolved) return
      hasResolved = true

      setNotificationPermission(permission)

      if (permission === 'granted') {
        fetch('/api/me/preferences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({ push_enabled: true }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error('Falha ao registrar preferência de push no servidor.')
            }
            return refreshProfile(profile.id)
          })
          .then(() => {
            if (profile.role === 'admin') {
              return refreshProfiles()
            }
          })
          .then(() => {
            toast.success("Alertas push ativados com sucesso!")
          })
          .catch((err) => {
            toast.error("Erro ao salvar preferência de push: " + err.message)
          })
      } else if (permission === 'denied') {
        toast.error("Permissão negada. Redefina as permissões de notificação nas configurações do navegador.")
      }
    }

    try {
      // Trigger requestPermission synchronously to preserve user gesture in Chrome/Firefox
      const permissionPromise = Notification.requestPermission(handlePermissionResult)
      if (permissionPromise && typeof permissionPromise.then === 'function') {
        permissionPromise.then(handlePermissionResult).catch((err) => {
          toast.error("Erro ao solicitar permissão de push: " + err.message)
        })
      }
    } catch (err: any) {
      toast.error("Erro ao iniciar permissão de push: " + err.message)
    }

    return Promise.resolve()
  }

  const disablePush = async () => {
    if (!profile) return
    await fetch('/api/me/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ push_enabled: false }),
    })
    await refreshProfile(profile.id)
    if (profile.role === 'admin') {
      await refreshProfiles()
    }
  }

  const promptInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') {
      setIsStandalone(true)
      setInstallPrompt(null)
    }
  }

  const updateLesson = async (lessonId: string, changes: Partial<Lesson>) => {
    const { error } = await supabase.from('lessons').update(changes).eq('id', lessonId)
    if (error) {
      setAppError(error.message)
      return
    }
    await refreshLessons()
  }

  const callAdminUsersApi = async <T,>(action: 'create' | 'invite' | 'update' | 'delete', payload: unknown): Promise<T> => {
    if (!session?.access_token) {
      throw new Error('You are not signed in.')
    }

    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, payload }),
    })

    const result = (await response.json()) as { data?: T; error?: string }
    if (!response.ok) {
      throw new Error(result.error ?? 'Request failed.')
    }

    if (!result.data) {
      throw new Error('Unexpected API response.')
    }

    return result.data
  }

  const callLessonsApi = async <T,>(action: 'create_group' | 'update_group', payload: unknown): Promise<T> => {
    if (!session?.access_token) {
      throw new Error('You are not signed in.')
    }

    const response = await fetch('/api/lessons/manage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, payload }),
    })

    const result = (await response.json()) as { data?: T; error?: string }
    if (!response.ok) {
      throw new Error(result.error ?? 'Request failed.')
    }

    if (!result.data) {
      throw new Error('Unexpected API response.')
    }

    return result.data
  }

  const createLessonFromDraft = async (draft: {
    subject: string
    class_name: string
    student_ids: string[]
    teacher_id: string
    starts_at: string
    duration_minutes: number
  }) => {
    setAppError('')

    const payload = {
      ...draft,
      starts_at: /[zZ]$|[+-]\d{2}:\d{2}$/.test(draft.starts_at) ? draft.starts_at : new Date(draft.starts_at).toISOString(),
    }

    try {
      await callLessonsApi('create_group', payload)
      await refreshLessons()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not create the class.')
      throw error
    }
  }

  const updateTeacherLessonGroup = async (draft: {
    lesson_ids: string[]
    student_ids: string[]
    subject: string
    class_name: string
    teacher_id: string
    starts_at: string
    duration_minutes: number
  }) => {
    window.confirm('Deseja alterar apenas esta aula ou todas as futuras da recorrência?')
    await updateLessonGroup(draft)
  }

  const updateLessonGroup = async (draft: {
    lesson_ids: string[]
    student_ids: string[]
    subject: string
    class_name: string
    teacher_id: string
    starts_at: string
    duration_minutes: number
  }) => {
    setAppError('')

    const payload = {
      ...draft,
      starts_at: /[zZ]$|[+-]\d{2}:\d{2}$/.test(draft.starts_at) ? draft.starts_at : new Date(draft.starts_at).toISOString(),
    }

    try {
      await callLessonsApi('update_group', payload)
      await refreshLessons()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not update the class.')
      throw error
    }
  }

  const handleDeleteUser = async (userId: string) => {
    setAppError('')
    const confirmed = window.confirm('Delete this user? This cannot be undone.')
    if (!confirmed) {
      return
    }

    try {
      await callAdminUsersApi('delete', { id: userId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete the user.'
      if (message.includes('linked to lessons')) {
        const force = window.confirm('This user has lessons. Delete the user AND all linked lessons?')
        if (!force) {
          setAppError(message)
          return
        }
        try {
          await callAdminUsersApi('delete', { id: userId, force: true })
        } catch (forceError) {
          setAppError(forceError instanceof Error ? forceError.message : 'Could not delete the user.')
          return
        }
      } else {
        setAppError(message)
        return
      }
    }

    await refreshProfiles()
    await refreshLessons()
  }

  const createStudentLoginFromCalendar = async (draft: {
    full_name: string
    email: string
    password: string
    class_name?: string
  }) => {
    setAppError('')
    try {
      const created = await callAdminUsersApi<Profile>('create', {
        full_name: draft.full_name,
        email: draft.email,
        password: draft.password,
        role: 'student',
        class_name: draft.class_name ?? '',
        speciality: '',
      })
      await refreshProfiles()
      return created
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not create the student login.')
      throw error
    }
  }

  const createTeacherLoginFromCalendar = async (draft: {
    full_name: string
    email: string
    password: string
    speciality?: string
  }) => {
    setAppError('')
    try {
      const created = await callAdminUsersApi<Profile>('create', {
        full_name: draft.full_name,
        email: draft.email,
        password: draft.password,
        role: 'teacher',
        class_name: '',
        speciality: draft.speciality ?? '',
      })
      await refreshProfiles()
      return created
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not create the teacher login.')
      throw error
    }
  }

  const handleGenerateInviteLink = async (e: any, isGlobal?: boolean) => {
    e.preventDefault()
    setInviteLoading(true)
    setGeneratedInviteLink('')
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      const res = await fetch('/api/admin/invite-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          email: isGlobal ? undefined : inviteEmail,
          is_global: isGlobal ? true : undefined
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar link de convite.')
      setGeneratedInviteLink(data.invite_link)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setInviteLoading(false)
    }
  }



  const handleUpdateTeacherPayout = async (teacherId: string, status: 'pago' | 'pendente') => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status_pagamento_professor: status })
        .eq('id', teacherId)
      if (error) throw error
      await refreshProfiles()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleBatchUpdatePayout = async (status: 'pago' | 'pendente') => {
    try {
      const teacherIds = teachers.map(t => t.id)
      const { error } = await supabase
        .from('profiles')
        .update({ status_pagamento_professor: status })
        .in('id', teacherIds)
      if (error) throw error
      await refreshProfiles()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  if (loading) {
    return (
      <div className="login-shell">
        <section className="login-panel">
          <h2>Loading app...</h2>
        </section>
      </div>
    )
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="login-shell">
        <section className="login-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Setup required</p>
              <h2>Supabase environment variables are missing</h2>
            </div>
          </div>
          <div className="install-note">
            <p className="muted">
              Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, then deploy to Vercel and
              run the demo seed script.
            </p>
          </div>
        </section>
      </div>
    )
  }

  if (!session || !profile) {
    return (
      <>
        <LoginPanel
          language={language}
          setupSigningIn={setupSigningIn}
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          loginError={loginError}
          appError={appError}
          handleLogin={handleLogin}
        />
        {renderResetPasswordModal()}
      </>
    )
  }

  const isAdmin = profile.role === 'admin'
  const isTeacher = profile.role === 'teacher'
  const isStudent = profile.role === 'student'

  const summaryCards = isAdmin
    ? [
        { label: 'Users', value: profiles.length },
        { label: 'Students', value: students.length },
        { label: 'Teachers', value: teachers.length },
        { label: 'Lessons', value: lessons.length },
      ]
    : [
        { label: 'Upcoming lessons', value: isTeacher ? teacherUpcomingTenDays.length : studentUpcomingLessons.length },
        { label: 'Past lessons', value: isTeacher ? teacherPastWeek.length : studentPastLessons.length },
        { label: 'Pending reminders', value: reminderCount },
        { label: 'Push status', value: profile.push_enabled ? 'Enabled' : 'Disabled' },
      ]

  const lessonCardClass = (lessonId: string) =>
    focusedLessonId === lessonId ? 'lesson-card lesson-card-focus' : 'lesson-card'

  const formatShortDateLabel = (value: string) => formatShortDate(value, language, appTimeZone)

  return (
    <div className="reminder-app-scope">
      <div className="app-shell final-shell">
      <Topbar
        profile={profile}
        language={language}
        setLanguage={setLanguage}
        appTimeZone={appTimeZone}
        setAppTimeZone={setAppTimeZone}
        now={now}
        notificationPermission={notificationPermission}
        requestPushPermission={requestPushPermission}
        disablePush={disablePush}
        isStandalone={isStandalone}
        installPrompt={installPrompt}
        promptInstall={promptInstall}
        handleLogout={handleLogout}
      />

      <main className="main-content">
        <section className="summary-grid">
          {summaryCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} />
          ))}
        </section>

        {appError && (
          <section className="panel">
            <p className="error-text">{appError}</p>
          </section>
        )}

        {isAdmin && (
          <section className="panel">
            <div className="panel-header animate-fade-in">
              <div>
                <p className="section-label">{t(language, 'school_management')}</p>
                <h2>
                  {adminTab === 'students' && t(language, 'student_pool')}
                  {adminTab === 'payments' && t(language, 'payments')}
                  {adminTab === 'calendar' && t(language, 'calendar')}
                  {adminTab === 'staff' && t(language, 'staff_control')}
                </h2>
              </div>
              {/* Mobile Tab Dropdown */}
              <div className="mobile-tab-select">
                <select
                  value={adminTab}
                  onChange={(e) => setAdminTab(e.target.value as any)}
                >
                  <option value="students">{t(language, 'student_pool')}</option>
                  <option value="payments">{t(language, 'payments')}</option>
                  <option value="calendar">{t(language, 'calendar')}</option>
                  <option value="staff">{t(language, 'staff_control')}</option>
                </select>
              </div>

              {/* Desktop Tab Buttons */}
              <div className="tab-row desktop-only">
                <button
                  type="button"
                  className={adminTab === 'students' ? 'tab-button tab-button-active' : 'tab-button'}
                  onClick={() => setAdminTab('students')}
                >
                  {t(language, 'student_pool')}
                </button>
                <button
                  type="button"
                  className={adminTab === 'payments' ? 'tab-button tab-button-active' : 'tab-button'}
                  onClick={() => setAdminTab('payments')}
                >
                  {t(language, 'payments')}
                </button>
                <button
                  type="button"
                  className={adminTab === 'calendar' ? 'tab-button tab-button-active' : 'tab-button'}
                  onClick={() => setAdminTab('calendar')}
                >
                  {t(language, 'calendar')}
                </button>
                <button
                  type="button"
                  className={adminTab === 'staff' ? 'tab-button tab-button-active' : 'tab-button'}
                  onClick={() => setAdminTab('staff')}
                >
                  {t(language, 'staff_control')}
                </button>
              </div>
            </div>

            {adminTab === 'students' && (
              <AdminStudentsTab
                language={language}
                inviteEmail={inviteEmail}
                setInviteEmail={setInviteEmail}
                handleGenerateInviteLink={handleGenerateInviteLink}
                inviteLoading={inviteLoading}
                generatedInviteLink={generatedInviteLink}
                students={students}
                lessons={lessons}
                appTimeZone={appTimeZone}
                savingUserId={savingUserId}
                setSavingUserId={setSavingUserId}
                userForm={userForm}
                setUserForm={setUserForm}
                refreshProfiles={refreshProfiles}
                invoices={invoices}
              />
            )}

            {adminTab === 'payments' && (
              <AdminPaymentsTab
                language={language}
                paymentSearch={paymentSearch}
                setPaymentSearch={setPaymentSearch}
                paymentFilter={paymentFilter}
                setPaymentFilter={setPaymentFilter}
                students={students}
                invoices={invoices}
                refreshInvoices={refreshInvoices}
              />
            )}

            {adminTab === 'calendar' && (
              <>
                <AdminCalendar
                  lessons={lessons}
                  profilesById={profilesById}
                  students={students}
                  teachers={teachers}
                  timeZone={appTimeZone}
                  role="admin"
                  allowCreateUsers
                  allowTeacherChange
                  onCreateLesson={createLessonFromDraft}
                  onUpdateLessonGroup={updateLessonGroup}
                  onCreateStudentLogin={createStudentLoginFromCalendar}
                  onCreateTeacherLogin={createTeacherLoginFromCalendar}
                />

                <div className="list-stack">
                  <h3>Tracked outcomes</h3>
                  {trackedLessons.map((lesson) => (
                    <div key={lesson.id} className={lessonCardClass(lesson.id)}>
                      <div>
                        <h3>{lesson.subject}</h3>
                        <p className="muted">
                          {profilesById[lesson.student_id]?.full_name} with {profilesById[lesson.teacher_id]?.full_name}
                        </p>
                        <p className="muted">{formatShortDateLabel(lesson.starts_at)}</p>
                      </div>
                      <div className="status-stack">
                        <span className={badgeClass(statusLabel(lesson))}>{statusLabel(lesson)}</span>
                        <span className={badgeClass(lesson.student_attendance ? `student ${lesson.student_attendance}` : 'pending')}>
                          Student 4h: {lesson.student_attendance ?? 'pending'}
                        </span>
                        <span className={badgeClass(lesson.student_lesson_status ? `student ${lesson.student_lesson_status}` : 'pending')}>
                          Student at start: {lesson.student_lesson_status ?? 'pending'}
                        </span>
                        <span className={badgeClass(lesson.teacher_lesson_status ?? 'pending')}>
                          Teacher at start: {lesson.teacher_lesson_status ?? 'pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {adminTab === 'staff' && (
              <AdminStaffTab
                language={language}
                userForm={userForm}
                setUserForm={setUserForm}
                profiles={profiles}
                teachers={teachers}
                lessons={lessons}
                savingUserId={savingUserId}
                setSavingUserId={setSavingUserId}
                callAdminUsersApi={callAdminUsersApi}
                refreshProfiles={refreshProfiles}
                refreshLessons={refreshLessons}
                handleDeleteUser={handleDeleteUser}
                handleBatchUpdatePayout={handleBatchUpdatePayout}
                handleUpdateTeacherPayout={handleUpdateTeacherPayout}
                setAppError={setAppError}
              />
            )}
          </section>
        )}

        {isStudent && (
          <StudentPanel
            language={language}
            profile={profile}
            lessons={lessons}
            invoices={invoices}
            appTimeZone={appTimeZone}
            focusedLessonId={focusedLessonId}
            now={now}
            updateLesson={updateLesson}
            profilesById={profilesById}
            notificationPermission={notificationPermission}
            disablePush={disablePush}
            requestPushPermission={requestPushPermission}
            studentTab={studentTab}
            setStudentTab={setStudentTab}
            dueStudentFourHourReminders={dueStudentFourHourReminders}
            dueStudentStartReminders={dueStudentStartReminders}
            refreshProfile={refreshProfile}
          />
        )}

        {isTeacher && (
          <TeacherPanel
            language={language}
            teacherTab={teacherTab}
            setTeacherTab={setTeacherTab}
            students={students}
            teachers={teachers}
            profile={profile}
            lessons={lessons}
            appTimeZone={appTimeZone}
            createLessonFromDraft={createLessonFromDraft}
            updateTeacherLessonGroup={updateTeacherLessonGroup}
            createStudentLoginFromCalendar={createStudentLoginFromCalendar}
            createTeacherLoginFromCalendar={createTeacherLoginFromCalendar}
            profilesById={profilesById}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            teacherNotes={teacherNotes}
            setTeacherNotes={setTeacherNotes}
            uploadingNf={uploadingNf}
            setUploadingNf={setUploadingNf}
            refreshProfile={refreshProfile}
            refreshLessons={refreshLessons}
            accountForm={accountForm}
            setAccountForm={setAccountForm}
            accountSaving={accountSaving}
            setAccountSaving={setAccountSaving}
            focusedLessonId={focusedLessonId}
          />
        )}
      </main>
      </div>
      {renderResetPasswordModal()}
    </div>
  )
}

export default function ReminderApp() {
  return (
    <ToastProvider>
      <div className="reminder-app-scope bg-[#020617] text-[#e5eefc] min-h-screen">
        <ReminderAppInner />
      </div>
    </ToastProvider>
  )
}
