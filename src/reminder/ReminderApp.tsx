import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import AdminCalendar from './components/AdminCalendar'
import './styles.css'
import { getDeviceLanguage, getStoredLanguage, Language, storeLanguage, supportedLanguages, t } from './lib/i18n'
import {
  BrowserPermission,
  InstallPromptEvent,
  Lesson,
  Profile,
  ReminderIntent,
  ReminderNotification,
  UserRole,
} from './lib/types'

type UserFormState = {
  id?: string
  full_name: string
  email: string
  password: string
  role: UserRole
  class_name: string
  speciality: string
  first_class_at: string
  first_class_teacher_id: string
  cpf?: string
  data_pagamento_preferencial?: number
  chave_pix?: string
  cnpj?: string
  taxa_hora_aula?: number
}

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
const NOTIFICATION_KEY = 'lesson-reminder-sent-keys'

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

const localeByLanguage: Record<Language, string> = {
  en: 'en',
  pt: 'pt-BR',
  es: 'es',
}

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

const formatDateTime = (value: string, language: Language, timeZone: string) =>
  new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value))

const formatShortDate = (value: string, language: Language, timeZone: string) =>
  new Intl.DateTimeFormat(localeByLanguage[language], {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value))

const sortByDateAsc = (a: Lesson, b: Lesson) =>
  new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()

const sortByDateDesc = (a: Lesson, b: Lesson) =>
  new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()

const minutesUntil = (from: Date, to: string) => Math.round((new Date(to).getTime() - from.getTime()) / 60000)

const statusLabel = (lesson: Lesson) => {
  if (lesson.teacher_lesson_status === 'student_no_show') return 'Student did not show up'
  if (lesson.teacher_lesson_status === 'happened') return 'Lesson happened'
  if (lesson.teacher_lesson_status === 'not_happened') return 'Lesson did not happen'
  if (lesson.student_lesson_status === 'done') return 'Student marked done'
  if (lesson.student_lesson_status === 'not_done') return 'Student marked not done'
  if (lesson.student_attendance === 'attend') return 'Student confirmed attendance'
  if (lesson.student_attendance === 'cancel') return 'Student requested cancellation'
  return 'Awaiting response'
}

const badgeClass = (value: string) => {
  if (value.includes('confirmed') || value.includes('happened') || value.includes('done')) return 'badge badge-success'
  if (value.includes('cancel') || value.includes('not happen') || value.includes('not done') || value.includes('did not show')) {
    return 'badge badge-danger'
  }
  return 'badge badge-neutral'
}

const applyIntentToLesson = (intent: ReminderIntent): Partial<Lesson> => {
  switch (intent) {
    case 'attend':
      return { student_attendance: 'attend' }
    case 'cancel':
      return { student_attendance: 'cancel' }
    case 'done':
      return { student_lesson_status: 'done' }
    case 'not_done':
      return { student_lesson_status: 'not_done' }
    case 'happened':
      return { teacher_lesson_status: 'happened' }
    case 'not_happened':
      return { teacher_lesson_status: 'not_happened' }
    case 'student_no_show':
      return { teacher_lesson_status: 'student_no_show' }
  }
}

const getStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))

const getStoredNotificationKeys = () => {
  const stored = localStorage.getItem(NOTIFICATION_KEY)
  return stored ? (JSON.parse(stored) as string[]) : []
}

const storeNotificationKeys = (keys: string[]) => {
  localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(keys))
}

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
  <article className="summary-card">
    <span>{label}</span>
    <strong>{value}</strong>
  </article>
)

function ReminderAppInner() {
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
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [adminTab, setAdminTab] = useState<'students' | 'payments' | 'calendar' | 'staff'>('students')
  const [studentTab, setStudentTab] = useState<'account' | 'lessons'>('lessons')
  const [teacherTab, setTeacherTab] = useState<'calendar' | 'worklog' | 'profile'>('calendar')
  const [teacherNotes, setTeacherNotes] = useState('')
  const [uploadingNf, setUploadingNf] = useState(false)
  const [invoices, setInvoices] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [generatedInviteLink, setGeneratedInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState<{ studentId: string; amount: string; dueDate: string } | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'em_dia' | 'pendente' | 'atrasado'>('all')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [createWithSetupLink, setCreateWithSetupLink] = useState(false)
  const [latestSetupLink, setLatestSetupLink] = useState<string | null>(null)
  const [setupCredentials, setSetupCredentials] = useState<{ email: string; password: string } | null>(null)
  const [setupMode, setSetupMode] = useState(false)
  const [setupSigningIn, setSetupSigningIn] = useState(false)
  const [accountForm, setAccountForm] = useState<AccountFormState>(() => defaultAccountForm(null))
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountSaved, setAccountSaved] = useState(false)
  const [managementRole, setManagementRole] = useState<'student' | 'teacher'>('student')
  const [managementUserId, setManagementUserId] = useState<string>('')

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

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
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
      // Clear the credentials immediately so a fast session update doesn't re-run this effect,
      // and always turn off the "opening" state even if the effect is cancelled mid-flight.
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

        setSetupMode(true)
        setLoginForm({ email: creds.email, password: '' })
        const params = new URLSearchParams(window.location.search)
        params.delete('setup_email')
        params.delete('setup_password')
        const nextQuery = params.toString()
        window.history.replaceState({}, document.title, nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname)
      } finally {
        // Important: do not get stuck if session changes quickly during setup sign-in.
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
    setAccountSaved(false)
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

  useEffect(() => {
    if (!managementUserId) {
      const nextId = managementRole === 'student' ? students[0]?.id : teachers[0]?.id
      if (nextId) {
        setManagementUserId(nextId)
      }
    }
  }, [managementUserId, managementRole, students, teachers])

  const managementLessons = useMemo(() => {
    if (!managementUserId) return []
    const filtered =
      managementRole === 'student'
        ? lessons.filter((lesson) => lesson.student_id === managementUserId)
        : lessons.filter((lesson) => lesson.teacher_id === managementUserId)
    return filtered.sort(sortByDateDesc)
  }, [lessons, managementRole, managementUserId])

  const managementAttended = managementLessons.filter((lesson) => lesson.student_attendance === 'attend')
  const managementCancelled = managementLessons.filter((lesson) => lesson.student_attendance === 'cancel')

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

  const requestPushPermission = async () => {
    if (!profile || !('Notification' in window)) {
      setNotificationPermission('unsupported')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)

    if (permission === 'granted') {
      await fetch('/api/me/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ push_enabled: true }),
      })
      await refreshProfile(profile.id)
      if (profile.role === 'admin') {
        await refreshProfiles()
      }
    }
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
    const alterAll = window.confirm('Deseja alterar apenas esta aula ou todas as futuras da recorrência?')
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

  const handleCreateUser = async (event: FormEvent) => {
    event.preventDefault()
    setAppError('')
    setLatestSetupLink(null)

    let createdProfile: Profile | null = null

    try {
      if (createWithSetupLink) {
        const result = await callAdminUsersApi<{ profile: Profile; invite_link: string }>('invite', {
          full_name: userForm.full_name,
          email: userForm.email,
          role: userForm.role,
          class_name: userForm.class_name,
          speciality: userForm.speciality,
        })
        createdProfile = result.profile
        setLatestSetupLink(result.invite_link)
      } else {
        createdProfile = await callAdminUsersApi<Profile>('create', userForm)
      }

      if (createdProfile && createdProfile.role === 'student' && userForm.first_class_at) {
        const teacherId = userForm.first_class_teacher_id || teachers[0]?.id
        if (!teacherId) {
          setAppError('User created, but there is no teacher yet for the first class.')
        } else {
          await createLessonFromDraft({
            subject: `${createdProfile.full_name} class`,
            class_name: createdProfile.class_name ?? '',
            student_ids: [createdProfile.id],
            teacher_id: teacherId,
            starts_at: userForm.first_class_at,
            duration_minutes: 60,
          })
        }
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not create the user.')
      return
    }

    setUserForm(defaultUserForm())
    await refreshProfiles()
  }

  const handleSaveUser = async (updatedUser: Profile & { password?: string }) => {
    setSavingUserId(updatedUser.id)
    try {
      await callAdminUsersApi('update', updatedUser)
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not update the user.')
      setSavingUserId(null)
      return
    }

    await refreshProfiles()
    setSavingUserId(null)
  }

  const handleDeleteUser = async (userId: string) => {
    setAppError('')
    setDeletingUserId(userId)
    const confirmed = window.confirm('Delete this user? This cannot be undone.')
    if (!confirmed) {
      setDeletingUserId(null)
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
          setDeletingUserId(null)
          return
        }
        try {
          await callAdminUsersApi('delete', { id: userId, force: true })
        } catch (forceError) {
          setAppError(forceError instanceof Error ? forceError.message : 'Could not delete the user.')
          setDeletingUserId(null)
          return
        }
      } else {
        setAppError(message)
        setDeletingUserId(null)
        return
      }
    }

    await refreshProfiles()
    await refreshLessons()
    setDeletingUserId(null)
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

  const handleGenerateInviteLink = async (e: any) => {
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
        body: JSON.stringify({ email: inviteEmail })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar link de convite.')
      setGeneratedInviteLink(data.invite_link)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setInviteLoading(false)
    }
  }

  const handleGenerateBoleto = async (e: any) => {
    e.preventDefault()
    if (!invoiceForm) return
    setInvoiceLoading(true)
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      const res = await fetch('/api/billing/generate-boleto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          student_id: invoiceForm.studentId,
          amount: Number(invoiceForm.amount),
          due_date: invoiceForm.dueDate
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar boleto.')
      alert('Boleto gerado com sucesso!')
      setInvoiceForm(null)
      await refreshInvoices()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setInvoiceLoading(false)
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
      alert(err.message)
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
      alert(err.message)
    }
  }

  const handleUpdateAccount = async (event: FormEvent) => {
    event.preventDefault()
    if (!session?.access_token) return
    if (!profile) return

    setAppError('')
    setAccountSaved(false)

    if (accountForm.password && accountForm.password !== accountForm.confirm_password) {
      setAppError('Passwords do not match.')
      return
    }

    setAccountSaving(true)
    try {
      const response = await fetch('/api/me/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          full_name: accountForm.full_name,
          email: accountForm.email,
          password: accountForm.password || undefined,
        }),
      })

      const result = (await response.json()) as { data?: { full_name: string; email: string }; error?: string }
      if (!response.ok) {
        throw new Error(result.error ?? 'Could not update account details.')
      }

      await refreshProfile(profile.id)
      setAccountForm((current) => ({ ...current, password: '', confirm_password: '' }))
      setAccountSaved(true)
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not update account details.')
    } finally {
      setAccountSaving(false)
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
      <div className="login-shell">
        <section className="login-hero">
          <div>
            <p className="eyebrow">Welcome</p>
            <h1>Keep every class organized</h1>
            <p className="muted large-copy">
              This app helps schools, teachers, and students see upcoming classes, stay on time, and keep a clear record of what
              happened in each lesson.
            </p>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <h3>See what’s next</h3>
              <p className="muted">Check upcoming classes and recent lessons in one place.</p>
            </article>
            <article className="feature-card">
              <h3>Stay on time</h3>
              <p className="muted">Get reminders before class so nobody misses an important lesson.</p>
            </article>
            <article className="feature-card">
              <h3>Keep everyone aligned</h3>
              <p className="muted">Students, teachers, and admins can each see the information that matters to them.</p>
            </article>
            <article className="feature-card">
              <h3>Track each class</h3>
              <p className="muted">Mark whether a class happened and keep a simple history of lessons.</p>
            </article>
          </div>
        </section>

        <section className="login-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Login</p>
              <h2>Sign in to your account</h2>
            </div>
          </div>

          <form className="form-card" onSubmit={handleLogin}>
            {setupSigningIn && <p className="muted">{t(language, 'opening_setup_link')}</p>}
            <input
              required
              type="email"
              placeholder="Email"
              value={loginForm.email}
              onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
            />
            <input
              required
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
            />
            {loginError && <p className="error-text">{loginError}</p>}
            {appError && <p className="error-text">{appError}</p>}
            <button className="primary-button">Sign in</button>
          </form>

          <div className="install-note">
            <h3>Getting started</h3>
            <p className="muted">Use the email and password shared with you by your school or admin.</p>
          </div>
        </section>
      </div>
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

  const formatDateTimeLabel = (value: string) => formatDateTime(value, language, appTimeZone)
  const formatShortDateLabel = (value: string) => formatShortDate(value, language, appTimeZone)

  return (
    <div className="app-shell final-shell">
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
                <p className="section-label">Sistema de Gestão Escolar</p>
                <h2>
                  {adminTab === 'students' && 'Student Pool'}
                  {adminTab === 'payments' && 'Payments Page'}
                  {adminTab === 'calendar' && 'Calendar (Visão Semanal)'}
                  {adminTab === 'staff' && 'Staff Control (Folha de Pagamento)'}
                </h2>
              </div>
              <div className="tab-row">
                <button
                  type="button"
                  className={adminTab === 'students' ? 'tab-button tab-button-active' : 'tab-button'}
                  onClick={() => setAdminTab('students')}
                >
                  Student Pool
                </button>
                <button
                  type="button"
                  className={adminTab === 'payments' ? 'tab-button tab-button-active' : 'tab-button'}
                  onClick={() => setAdminTab('payments')}
                >
                  Payments
                </button>
                <button
                  type="button"
                  className={adminTab === 'calendar' ? 'tab-button tab-button-active' : 'tab-button'}
                  onClick={() => setAdminTab('calendar')}
                >
                  Calendar
                </button>
                <button
                  type="button"
                  className={adminTab === 'staff' ? 'tab-button tab-button-active' : 'tab-button'}
                  onClick={() => setAdminTab('staff')}
                >
                  Staff Control
                </button>
              </div>
            </div>

            {adminTab === 'students' && (
              <>
                <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#fff' }}>Gerar Link de Matrícula</h3>
                  <form onSubmit={handleGenerateInviteLink} className="form-grid" style={{ gap: '0.75rem', display: 'flex', alignItems: 'center' }}>
                    <input
                      required
                      type="email"
                      placeholder="E-mail do novo Aluno"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      style={{ flex: 1, padding: '0.75rem 1rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.75rem', color: '#fff' }}
                    />
                    <button className="primary-button" style={{ padding: '0.75rem 1.5rem', whiteSpace: 'nowrap' }} disabled={inviteLoading}>
                      {inviteLoading ? 'Gerando...' : 'Gerar Convite'}
                    </button>
                  </form>
                  {generatedInviteLink && (
                    <div className="credential-card mt-4" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1rem', borderRadius: '1rem', marginTop: '1rem' }}>
                      <p className="section-label" style={{ color: '#10b981', fontWeight: 'bold' }}>Link de Matrícula Gerado</p>
                      <p className="inline-code" style={{ wordBreak: 'break-all', fontSize: '0.85rem', margin: '0.5rem 0', display: 'block', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                        {generatedInviteLink}
                      </p>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void navigator.clipboard.writeText(generatedInviteLink)
                          alert('Link copiado!')
                        }}
                      >
                        Copiar Link
                      </button>
                    </div>
                  )}
                </div>

                <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
                        <th style={{ padding: '1rem' }}>Nome Completo</th>
                        <th style={{ padding: '1rem' }}>E-mail</th>
                        <th style={{ padding: '1rem' }}>CPF</th>
                        <th style={{ padding: '1rem' }}>Vencimento</th>
                        <th style={{ padding: '1rem' }}>Status Financeiro</th>
                        <th style={{ padding: '1rem' }}>Horário Habitual</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => {
                        const studentLessons = lessons.filter(l => l.student_id === student.id)
                        const scheduleText = studentLessons.length > 0 
                          ? formatShortDateLabel(studentLessons[0].starts_at).split(' · ')[1] || 'Agendado'
                          : 'Sem aulas'

                        return (
                          <tr key={student.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                            <td style={{ padding: '1rem', fontWeight: 'bold' }}>{student.full_name}</td>
                            <td style={{ padding: '1rem', color: '#94a3b8' }}>{student.email}</td>
                            <td style={{ padding: '1rem' }}>{student.cpf || 'Não cadastrado'}</td>
                            <td style={{ padding: '1rem' }}>
                              {student.data_pagamento_preferencial ? `Dia ${student.data_pagamento_preferencial}` : 'Não definido'}
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <span className={badgeClass(student.status_pagamento || 'pendente')}>
                                {student.status_pagamento === 'em_dia' && 'Em dia'}
                                {student.status_pagamento === 'atrasado' && 'Atrasado'}
                                {student.status_pagamento === 'pendente' && 'Pendente'}
                                {!student.status_pagamento && 'Pendente'}
                              </span>
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <span 
                                title="Utilize o calendário para alterar horários" 
                                style={{ borderBottom: '1px dotted #64748b', cursor: 'help', color: '#38bdf8' }}
                              >
                                {scheduleText}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                              <button 
                                className="secondary-button" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                onClick={() => {
                                  setSavingUserId(student.id)
                                  setUserForm({
                                    id: student.id,
                                    email: student.email,
                                    full_name: student.full_name,
                                    role: 'student',
                                    class_name: student.class_name || '',
                                    speciality: '',
                                    password: '',
                                    cpf: student.cpf || '',
                                    data_pagamento_preferencial: student.data_pagamento_preferencial || 5,
                                    first_class_at: '',
                                    first_class_teacher_id: ''
                                  })
                                }}
                              >
                                Editar
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {savingUserId && userForm.role === 'student' && (
                  <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="form-card" style={{ maxWidth: '450px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Editar Dados do Estudante</h3>
                      <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input
                          required
                          placeholder="Nome Completo"
                          value={userForm.full_name}
                          onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                        />
                        <input
                          required
                          type="email"
                          placeholder="E-mail"
                          value={userForm.email}
                          onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                        />
                        <input
                          placeholder="CPF"
                          value={userForm.cpf || ''}
                          onChange={(e) => setUserForm({ ...userForm, cpf: e.target.value })}
                        />
                        <select
                          value={userForm.data_pagamento_preferencial || 5}
                          onChange={(e) => setUserForm({ ...userForm, data_pagamento_preferencial: Number(e.target.value) })}
                        >
                          {[1, 5, 10, 15, 20, 25].map(day => (
                            <option key={day} value={day}>Vencimento Dia {day}</option>
                          ))}
                        </select>
                      </div>
                      <div className="button-stack mt-6" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                        <button 
                          className="primary-button" 
                          onClick={async () => {
                            try {
                              const { error } = await supabase
                                .from('profiles')
                                .update({
                                  full_name: userForm.full_name,
                                  email: userForm.email,
                                  cpf: userForm.cpf || null,
                                  data_pagamento_preferencial: userForm.data_pagamento_preferencial
                                })
                                .eq('id', userForm.id)
                              if (error) throw error
                              setSavingUserId(null)
                              await refreshProfiles()
                            } catch (err: any) {
                              alert(err.message)
                            }
                          }}
                        >
                          Salvar
                        </button>
                        <button className="secondary-button" onClick={() => setSavingUserId(null)}>Cancelar</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {adminTab === 'payments' && (
              <>
                <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '1.25rem', borderRadius: '1.25rem', marginBottom: '1.5rem' }}>
                  <div className="form-grid" style={{ display: 'flex', gap: '1rem' }}>
                    <input
                      placeholder="Pesquisar Aluno..."
                      value={paymentSearch}
                      onChange={(e) => setPaymentSearch(e.target.value)}
                      style={{ flex: 2 }}
                    />
                    <select
                      value={paymentFilter}
                      onChange={(e) => setPaymentFilter(e.target.value as any)}
                      style={{ flex: 1 }}
                    >
                      <option value="all">Todos os Status</option>
                      <option value="em_dia">Verde (Em dia)</option>
                      <option value="pendente">Amarelo (Pendente)</option>
                      <option value="atrasado">Vermelho (Atrasado)</option>
                    </select>
                  </div>
                </div>

                <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
                        <th style={{ padding: '1rem' }}>Estudante</th>
                        <th style={{ padding: '1rem' }}>Status Financeiro</th>
                        <th style={{ padding: '1rem' }}>Último Boleto / Link</th>
                        <th style={{ padding: '1rem' }}>NFS-e Emitida</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students
                        .filter(student => {
                          const matchesSearch = student.full_name.toLowerCase().includes(paymentSearch.toLowerCase()) || 
                            student.email.toLowerCase().includes(paymentSearch.toLowerCase())
                          const status = student.status_pagamento || 'pendente'
                          const matchesFilter = paymentFilter === 'all' || status === paymentFilter
                          return matchesSearch && matchesFilter
                        })
                        .map((student) => {
                          const studentInvoices = invoices.filter(inv => inv.student_id === student.id)
                          const lastInvoice = studentInvoices[0]

                          return (
                            <tr key={student.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                              <td style={{ padding: '1rem' }}>
                                <div style={{ fontWeight: 'bold' }}>{student.full_name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{student.email}</div>
                              </td>
                              <td style={{ padding: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: student.status_pagamento === 'em_dia' ? '#10b981' : 
                                                student.status_pagamento === 'pendente' ? '#f59e0b' : '#ef4444'
                                  }} />
                                  <span style={{ fontSize: '0.85rem' }}>
                                    {student.status_pagamento === 'em_dia' && 'Em dia'}
                                    {student.status_pagamento === 'pendente' && 'Pendente'}
                                    {student.status_pagamento === 'atrasado' && 'Atrasado'}
                                    {!student.status_pagamento && 'Pendente'}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '1rem' }}>
                                {lastInvoice ? (
                                  <a 
                                    href={lastInvoice.boleto_url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    style={{ color: '#38bdf8', textDecoration: 'underline', fontSize: '0.85rem' }}
                                  >
                                    Ver Boleto ({lastInvoice.status})
                                  </a>
                                ) : (
                                  <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Nenhum boleto gerado</span>
                                )}
                              </td>
                              <td style={{ padding: '1rem' }}>
                                {lastInvoice?.nfse_url ? (
                                  <a 
                                    href={lastInvoice.nfse_url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    style={{ color: '#10b981', textDecoration: 'underline', fontSize: '0.85rem', fontWeight: 'bold' }}
                                  >
                                    Visualizar NFS-e
                                  </a>
                                ) : (
                                  <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Nenhuma NFS-e disponível</span>
                                )}
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button
                                  className="secondary-button"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                  onClick={() => setInvoiceForm({ studentId: student.id, amount: '340', dueDate: new Date(Date.now() + 5*24*60*60*1000).toISOString().split('T')[0] })}
                                >
                                  Gerar novo boleto
                                </button>
                                <button
                                  className="secondary-button"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', opacity: lastInvoice ? 1 : 0.5 }}
                                  disabled={!lastInvoice}
                                  onClick={async () => {
                                    if (!lastInvoice) return
                                    const nextStatus = prompt('Insira o novo status (pendente, pago, atrasado):', lastInvoice.status)
                                    if (nextStatus && ['pendente', 'pago', 'atrasado'].includes(nextStatus)) {
                                      const { error } = await supabase.from('invoices').update({ status: nextStatus }).eq('id', lastInvoice.id)
                                      if (error) alert(error.message)
                                      else await refreshInvoices()
                                    }
                                  }}
                                >
                                  Modificar
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>

                {invoiceForm && (
                  <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="form-card" style={{ maxWidth: '400px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.25rem' }}>Gerar Boleto (Cora API)</h3>
                      <form onSubmit={handleGenerateBoleto} className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Valor (R$)</label>
                          <input
                            required
                            type="number"
                            placeholder="Valor da cobrança"
                            value={invoiceForm.amount}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Data de Vencimento</label>
                          <input
                            required
                            type="date"
                            value={invoiceForm.dueDate}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                          />
                        </div>
                        <div className="button-stack mt-4" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                          <button type="submit" className="primary-button" disabled={invoiceLoading}>
                            {invoiceLoading ? 'Gerando...' : 'Confirmar e Gerar'}
                          </button>
                          <button type="button" className="secondary-button" onClick={() => setInvoiceForm(null)}>Cancelar</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
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
              <>
                {/* Add New Staff Section */}
                <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#fff' }}>Adicionar Novo Membro da Equipe</h3>
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setAppError('');
                      try {
                        const targetRole = userForm.role === 'student' ? 'teacher' : userForm.role; // Default safety fallback
                        const created = await callAdminUsersApi<Profile>('create', {
                          full_name: userForm.full_name,
                          email: userForm.email,
                          password: userForm.password,
                          role: targetRole,
                          class_name: '',
                          speciality: userForm.speciality || '',
                          chave_pix: userForm.chave_pix || '',
                          cnpj: userForm.cnpj || '',
                          taxa_hora_aula: userForm.taxa_hora_aula || 56.00,
                        });
                        alert(`Membro da equipe ${created.full_name} adicionado com sucesso!`);
                        setUserForm(defaultUserForm());
                        await refreshProfiles();
                      } catch (err: any) {
                        setAppError(err.message || 'Erro ao adicionar membro da equipe.');
                      }
                    }} 
                    className="form-grid" 
                    style={{ gap: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Nome Completo</label>
                      <input
                        required
                        type="text"
                        placeholder="Nome Completo"
                        value={userForm.full_name}
                        onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                        style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>E-mail</label>
                      <input
                        required
                        type="email"
                        placeholder="E-mail de Acesso"
                        value={userForm.email}
                        onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                        style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Senha</label>
                      <input
                        required
                        type="password"
                        placeholder="Senha de Acesso"
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Cargo / Função</label>
                      <select
                        value={userForm.role === 'student' ? 'teacher' : userForm.role}
                        onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                        style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                      >
                        <option value="teacher">Professor (Teacher)</option>
                        <option value="admin">Administrador (Admin)</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Especialidade (Opcional)</label>
                      <input
                        type="text"
                        placeholder="E.g. Business, TOEFL"
                        value={userForm.speciality}
                        onChange={(e) => setUserForm({ ...userForm, speciality: e.target.value })}
                        style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Chave PIX (Professores)</label>
                      <input
                        type="text"
                        placeholder="Celular, E-mail, CPF..."
                        value={userForm.chave_pix || ''}
                        onChange={(e) => setUserForm({ ...userForm, chave_pix: e.target.value })}
                        style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>CNPJ / CPF (Professores)</label>
                      <input
                        type="text"
                        placeholder="CNPJ ou CPF"
                        value={userForm.cnpj || ''}
                        onChange={(e) => setUserForm({ ...userForm, cnpj: e.target.value })}
                        style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Valor/Hora (R$)</label>
                      <input
                        type="number"
                        placeholder="Valor hora aula"
                        value={userForm.taxa_hora_aula || ''}
                        onChange={(e) => setUserForm({ ...userForm, taxa_hora_aula: Number(e.target.value) })}
                        style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'stretch', gridColumn: 'span 1' }}>
                      <button type="submit" className="primary-button" style={{ width: '100%', padding: '0.6rem 1rem' }}>
                        Adicionar Staff
                      </button>
                    </div>
                  </form>
                </div>

                {/* Staff list table */}
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#fff' }}>Lista de Membros da Equipe</h3>
                <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem', marginBottom: '2.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
                        <th style={{ padding: '1rem' }}>Nome Completo</th>
                        <th style={{ padding: '1rem' }}>E-mail</th>
                        <th style={{ padding: '1rem' }}>Função</th>
                        <th style={{ padding: '1rem' }}>CPF/CNPJ</th>
                        <th style={{ padding: '1rem' }}>Chave PIX</th>
                        <th style={{ padding: '1rem' }}>Valor/Hora</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles
                        .filter((p) => p.role === 'admin' || p.role === 'teacher')
                        .map((staff) => {
                          const hourlyRate = staff.taxa_hora_aula ?? (staff.role === 'teacher' ? 56.00 : 0)
                          const currency = staff.moeda_taxa ?? 'BRL'

                          return (
                            <tr key={staff.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                              <td style={{ padding: '1rem', fontWeight: 'bold' }}>{staff.full_name}</td>
                              <td style={{ padding: '1rem', color: '#94a3b8' }}>{staff.email}</td>
                              <td style={{ padding: '1rem' }}>
                                <span className={badgeClass(staff.role === 'admin' ? 'confirmed' : 'rescheduled')}>
                                  {staff.role === 'admin' ? 'Administrador' : 'Professor'}
                                </span>
                              </td>
                              <td style={{ padding: '1rem', color: '#94a3b8' }}>{staff.cnpj || 'Não cadastrado'}</td>
                              <td style={{ padding: '1rem', color: '#94a3b8' }}>{staff.chave_pix || 'Não cadastrada'}</td>
                              <td style={{ padding: '1rem' }}>
                                {staff.role === 'teacher' ? `${currency} ${Number(hourlyRate).toFixed(2)}` : 'N/A'}
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                  <button
                                    className="secondary-button"
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                    onClick={() => {
                                      setSavingUserId(staff.id)
                                      setUserForm({
                                        id: staff.id,
                                        email: staff.email,
                                        full_name: staff.full_name,
                                        role: staff.role,
                                        class_name: '',
                                        speciality: staff.speciality || '',
                                        password: '',
                                        chave_pix: staff.chave_pix || '',
                                        cnpj: staff.cnpj || '',
                                        taxa_hora_aula: Number(staff.taxa_hora_aula || 56.00),
                                        cpf: '',
                                        data_pagamento_preferencial: 5,
                                        first_class_at: '',
                                        first_class_teacher_id: ''
                                      })
                                    }}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    className="secondary-button"
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderColor: '#ef4444', color: '#ef4444' }}
                                    onClick={() => void handleDeleteUser(staff.id)}
                                  >
                                    Excluir
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Edit Modal Overlay */}
                {savingUserId && (userForm.role === 'admin' || userForm.role === 'teacher') && (
                  <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="form-card" style={{ maxWidth: '450px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Editar Dados do Staff</h3>
                      <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input
                          required
                          placeholder="Nome Completo"
                          value={userForm.full_name}
                          onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                        />
                        <input
                          required
                          type="email"
                          placeholder="E-mail"
                          value={userForm.email}
                          onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                        />
                        <select
                          value={userForm.role}
                          onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                        >
                          <option value="teacher">Professor</option>
                          <option value="admin">Administrador</option>
                        </select>
                        <input
                          placeholder="CNPJ ou CPF"
                          value={userForm.cnpj || ''}
                          onChange={(e) => setUserForm({ ...userForm, cnpj: e.target.value })}
                        />
                        <input
                          placeholder="Chave PIX"
                          value={userForm.chave_pix || ''}
                          onChange={(e) => setUserForm({ ...userForm, chave_pix: e.target.value })}
                        />
                        {userForm.role === 'teacher' && (
                          <input
                            type="number"
                            placeholder="Valor da Hora Aula"
                            value={userForm.taxa_hora_aula || ''}
                            onChange={(e) => setUserForm({ ...userForm, taxa_hora_aula: Number(e.target.value) })}
                          />
                        )}
                        <input
                          placeholder="Especialidade"
                          value={userForm.speciality}
                          onChange={(e) => setUserForm({ ...userForm, speciality: e.target.value })}
                        />
                      </div>
                      <div className="button-stack mt-6" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                        <button 
                          className="primary-button" 
                          onClick={async () => {
                            try {
                              const { error } = await supabase
                                .from('profiles')
                                .update({
                                  full_name: userForm.full_name,
                                  email: userForm.email,
                                  role: userForm.role,
                                  cnpj: userForm.cnpj || null,
                                  chave_pix: userForm.chave_pix || null,
                                  taxa_hora_aula: userForm.role === 'teacher' ? userForm.taxa_hora_aula : null,
                                  speciality: userForm.speciality || null
                                })
                                .eq('id', userForm.id)
                              if (error) throw error
                              setSavingUserId(null)
                              await refreshProfiles()
                            } catch (err: any) {
                              alert(err.message)
                            }
                          }}
                        >
                          Salvar
                        </button>
                        <button className="secondary-button" onClick={() => setSavingUserId(null)}>Cancelar</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payroll Section */}
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#fff' }}>Folha de Pagamento (Professores)</h3>
                <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '1.25rem', borderRadius: '1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Mês de Apuração: </span>
                    <strong style={{ color: '#fff' }}>Julho de 2026</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button 
                      className="primary-button" 
                      style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                      onClick={() => void handleBatchUpdatePayout('pago')}
                    >
                      Pagar Todos
                    </button>
                    <button 
                      className="secondary-button" 
                      style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                      onClick={() => void handleBatchUpdatePayout('pendente')}
                    >
                      Pendente Todos
                    </button>
                  </div>
                </div>

                <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
                        <th style={{ padding: '1rem' }}>Professor</th>
                        <th style={{ padding: '1rem' }}>CPF/CNPJ</th>
                        <th style={{ padding: '1rem' }}>Chave PIX</th>
                        <th style={{ padding: '1rem' }}>Horas Trab.</th>
                        <th style={{ padding: '1rem' }}>Valor/Hora</th>
                        <th style={{ padding: '1rem' }}>Total Devido</th>
                        <th style={{ padding: '1rem' }}>Status</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map((teacher) => {
                        const teacherLessons = lessons.filter(l => 
                          l.teacher_id === teacher.id && 
                          l.teacher_lesson_status === 'happened'
                        )
                        const totalMinutes = teacherLessons.reduce((acc, l) => acc + l.duration_minutes, 0)
                        const totalHours = totalMinutes / 60
                        
                        const hourlyRate = teacher.taxa_hora_aula ?? 56.00
                        const currency = teacher.moeda_taxa ?? 'BRL'
                        const amountDue = totalHours * Number(hourlyRate)

                        return (
                          <tr key={teacher.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                            <td style={{ padding: '1rem', fontWeight: 'bold' }}>{teacher.full_name}</td>
                            <td style={{ padding: '1rem', color: '#94a3b8' }}>{teacher.cnpj || 'Não cadastrado'}</td>
                            <td style={{ padding: '1rem', color: '#94a3b8' }}>{teacher.chave_pix || 'Não cadastrada'}</td>
                            <td style={{ padding: '1rem' }}>{totalHours.toFixed(1)}h</td>
                            <td style={{ padding: '1rem' }}>{currency} {Number(hourlyRate).toFixed(2)}</td>
                            <td style={{ padding: '1rem', fontWeight: 'bold', color: '#38bdf8' }}>
                              {currency} {amountDue.toFixed(2)}
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <span className={badgeClass(teacher.status_pagamento_professor === 'pago' ? 'confirmed' : 'pending')}>
                                {teacher.status_pagamento_professor === 'pago' ? 'Pago' : 'Pendente'}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button
                                className="primary-button"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                onClick={() => void handleUpdateTeacherPayout(teacher.id, 'pago')}
                              >
                                Pago
                              </button>
                              <button
                                className="secondary-button"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                onClick={() => void handleUpdateTeacherPayout(teacher.id, 'pendente')}
                              >
                                Pendente
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {isStudent && (
          <section className="panel-grid">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="section-label">Estudante</p>
                  <h2>{studentTab === 'lessons' ? 'Lesson Information' : 'Minha Conta'}</h2>
                </div>
                <div className="tab-row">
                  <button
                    type="button"
                    className={studentTab === 'lessons' ? 'tab-button tab-button-active' : 'tab-button'}
                    onClick={() => setStudentTab('lessons')}
                  >
                    Aulas & Notificações
                  </button>
                  <button
                    type="button"
                    className={studentTab === 'account' ? 'tab-button tab-button-active' : 'tab-button'}
                    onClick={() => setStudentTab('account')}
                  >
                    Dados & Pagamentos
                  </button>
                </div>
              </div>

              {studentTab === 'lessons' ? (
                <div className="split-column animate-fade-in">
                  <section style={{ flex: 1.3 }}>
                    <h3>Lembretes de Aulas Ativas</h3>
                    <div className="list-stack">
                      {/* 4-hour reminders */}
                      {dueStudentFourHourReminders.map((lesson) => (
                        <div key={lesson.id} className={`reminder-card ${focusedLessonId === lesson.id ? 'reminder-card-focus' : ''}`}>
                          <p className="reminder-title">{lesson.subject}</p>
                          <p className="muted">
                            Inicia em {minutesUntil(now, lesson.starts_at)} minutos às {formatShortDateLabel(lesson.starts_at)}
                          </p>
                          <div className="button-row wrap" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                            <button className="primary-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => void updateLesson(lesson.id, { student_attendance: 'attend' })}>
                              Vou comparecer
                            </button>
                            <button className="danger-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => void updateLesson(lesson.id, { student_attendance: 'cancel' })}>
                              Preciso cancelar
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Class-time reminders */}
                      {dueStudentStartReminders.map((lesson) => (
                        <div key={lesson.id} className={`reminder-card ${focusedLessonId === lesson.id ? 'reminder-card-focus' : ''}`}>
                          <p className="reminder-title">{lesson.subject}</p>
                          <p className="muted">Sua aula agendada começou. Confirme se ela aconteceu:</p>
                          <div className="button-row wrap" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                            <button className="primary-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => void updateLesson(lesson.id, { student_lesson_status: 'done' })}>
                              Tive a aula
                            </button>
                            <button className="danger-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => void updateLesson(lesson.id, { student_lesson_status: 'not_done' })}>
                              Não tive a aula
                            </button>
                          </div>
                        </div>
                      ))}

                      {dueStudentFourHourReminders.length === 0 && dueStudentStartReminders.length === 0 && (
                        <p className="empty-state">Nenhum lembrete ou pendência de aula ativa no momento.</p>
                      )}
                    </div>

                    <h3 className="mt-8" style={{ marginTop: '2rem' }}>Minhas Próximas Aulas</h3>
                    <div className="list-stack">
                      {studentUpcomingLessons.map((lesson) => (
                        <div key={lesson.id} className={lessonCardClass(lesson.id)}>
                          <div>
                            <h3>{lesson.subject}</h3>
                            <p className="muted">
                              {formatShortDateLabel(lesson.starts_at)} com {profilesById[lesson.teacher_id]?.full_name}
                            </p>
                          </div>
                          <span className={badgeClass('agendada')}>Agendada</span>
                        </div>
                      ))}
                      {studentUpcomingLessons.length === 0 && <p className="empty-state">Nenhuma aula agendada nos próximos dias.</p>}
                    </div>
                  </section>

                  <section style={{ flex: 0.7 }}>
                    <h3>Configurações de Alerta</h3>
                    <div className="form-card" style={{ background: 'rgba(30,41,59,0.3)', padding: '1rem', borderRadius: '1rem' }}>
                      <p className="muted text-sm" style={{ marginBottom: '1rem' }}>
                        Ative as notificações do sistema para receber avisos sobre aulas 4h antes e no início da aula.
                      </p>
                      <button 
                        className={notificationPermission === 'granted' && profile.push_enabled ? 'danger-button full-width' : 'primary-button full-width'} 
                        onClick={() => {
                          if (notificationPermission === 'granted' && profile.push_enabled) {
                            void disablePush()
                          } else {
                            void requestPushPermission()
                          }
                        }}
                      >
                        {notificationPermission === 'granted' && profile.push_enabled ? 'Desativar Alertas' : 'Ativar Alertas PWA'}
                      </button>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="split-column animate-fade-in">
                  <section style={{ flex: 1 }}>
                    <h3>Dados Cadastrais</h3>
                    <div className="form-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(30,41,59,0.2)', padding: '1.25rem', borderRadius: '1.25rem' }}>
                      <div>
                        <span className="text-xs text-slate-500 font-bold block uppercase tracking-widest">Nome Completo</span>
                        <strong className="text-white text-base">{profile.full_name}</strong>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 font-bold block uppercase tracking-widest">E-mail</span>
                        <strong className="text-white text-base">{profile.email}</strong>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 font-bold block uppercase tracking-widest">CPF</span>
                        <strong className="text-white text-base">{profile.cpf || 'Não cadastrado'}</strong>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 font-bold block uppercase tracking-widest">Dia de Vencimento Preferencial</span>
                        <strong className="text-white text-base">
                          {profile.data_pagamento_preferencial ? `Dia ${profile.data_pagamento_preferencial} de cada mês` : 'Não definido'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 font-bold block uppercase tracking-widest">Status Financeiro</span>
                        <span className={badgeClass(profile.status_pagamento || 'pendente')}>
                          {profile.status_pagamento === 'em_dia' && 'Em dia'}
                          {profile.status_pagamento === 'atrasado' && 'Atrasado'}
                          {profile.status_pagamento === 'pendente' && 'Pendente'}
                          {!profile.status_pagamento && 'Pendente'}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section style={{ flex: 1 }}>
                    <h3>Histórico de Pagamentos</h3>
                    <div className="list-stack">
                      {invoices
                        .filter(inv => inv.student_id === profile.id)
                        .map((inv) => (
                          <div key={inv.id} className="lesson-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(15,23,42,0.4)', border: '1px solid #1e293b', borderRadius: '1rem' }}>
                            <div>
                              <p className="text-white font-bold" style={{ fontSize: '0.9rem' }}>Fatura Nativo English</p>
                              <p className="muted text-xs">{new Date(inv.created_at).toLocaleDateString()}</p>
                              <span className={badgeClass(inv.status)} style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                                {inv.status === 'pago' ? 'Paga' : inv.status === 'atrasado' ? 'Atrasada' : 'Pendente'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                              <a 
                                href={inv.boleto_url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="secondary-button" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                              >
                                Boleto
                              </a>
                              {inv.nfse_url && (
                                <a 
                                  href={inv.nfse_url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="primary-button" 
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: '#10b981', borderColor: '#10b981' }}
                                >
                                  NFS-e
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      {invoices.filter(inv => inv.student_id === profile.id).length === 0 && (
                        <p className="empty-state">Nenhum histórico de pagamentos encontrado.</p>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </article>
          </section>
        )}

        {isTeacher && (
          <section className="panel-grid">
            <article className="panel">
              <div className="panel-header animate-fade-in">
                <div>
                  <p className="section-label">Professor</p>
                  <h2>
                    {teacherTab === 'calendar' && 'Minha Agenda'}
                    {teacherTab === 'worklog' && 'Registro de Trabalho & Notas'}
                    {teacherTab === 'profile' && 'Meu Perfil Professor'}
                  </h2>
                </div>
                <div className="tab-row">
                  <button
                    type="button"
                    className={teacherTab === 'calendar' ? 'tab-button tab-button-active' : 'tab-button'}
                    onClick={() => setTeacherTab('calendar')}
                  >
                    Agenda
                  </button>
                  <button
                    type="button"
                    className={teacherTab === 'worklog' ? 'tab-button tab-button-active' : 'tab-button'}
                    onClick={() => setTeacherTab('worklog')}
                  >
                    Folha & NF
                  </button>
                  <button
                    type="button"
                    className={teacherTab === 'profile' ? 'tab-button tab-button-active' : 'tab-button'}
                    onClick={() => setTeacherTab('profile')}
                  >
                    Dados
                  </button>
                </div>
              </div>

              {teacherTab === 'calendar' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="form-card mb-6" style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#fff' }}>Propor Nova Aula (Aprovação do Admin)</h3>
                    <form 
                      onSubmit={async (e) => {
                        e.preventDefault()
                        const formEl = e.currentTarget
                        const studentId = (formEl.elements.namedItem('studentId') as HTMLSelectElement).value
                        const subject = (formEl.elements.namedItem('subject') as HTMLInputElement).value
                        const start = (formEl.elements.namedItem('start') as HTMLInputElement).value
                        if (!studentId || !subject || !start) return

                        try {
                          const startsAt = new Date(start)
                          const endsAt = new Date(startsAt.getTime() + 60*60*1000) // 1h duration

                          const { error } = await supabase.from('lessons').insert({
                            subject,
                            class_name: 'Custom proposed class',
                            student_id: studentId,
                            teacher_id: profile.id,
                            starts_at: startsAt.toISOString(),
                            ends_at: endsAt.toISOString(),
                            duration_minutes: 60,
                            status: 'proposta_pendente'
                          })
                          if (error) throw error
                          alert('Proposta de aula enviada ao Administrador!')
                          formEl.reset()
                          await refreshLessons()
                        } catch (err: any) {
                          alert(err.message)
                        }
                      }}
                      className="form-grid" 
                      style={{ gap: '0.75rem', display: 'flex', flexWrap: 'wrap' }}
                    >
                      <select name="studentId" required style={{ flex: 1, minWidth: '150px' }}>
                        <option value="">Selecione o Aluno</option>
                        {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select>
                      <input name="subject" required placeholder="Matéria/Tema" style={{ flex: 1, minWidth: '150px' }} />
                      <input name="start" required type="datetime-local" style={{ flex: 1, minWidth: '180px' }} />
                      <button className="primary-button" style={{ padding: '0.75rem 1.5rem' }}>Propor Horário</button>
                    </form>
                  </div>

                  <AdminCalendar
                    lessons={lessons}
                    profilesById={profilesById}
                    students={students}
                    teachers={teachers}
                    timeZone={appTimeZone}
                    role="teacher"
                    currentTeacherId={profile.id}
                    allowCreateUsers={false}
                    allowTeacherChange={false}
                    onCreateLesson={createLessonFromDraft}
                    onUpdateLessonGroup={updateTeacherLessonGroup}
                    onCreateStudentLogin={createStudentLoginFromCalendar}
                    onCreateTeacherLogin={createTeacherLoginFromCalendar}
                  />
                </div>
              )}

              {teacherTab === 'worklog' && (
                <div className="split-column animate-fade-in">
                  <section style={{ flex: 1.3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3>Aulas Ministradas no Mês</h3>
                      <select 
                        value={selectedMonth} 
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        style={{ width: 'auto', padding: '0.4rem 1.5rem' }}
                      >
                        <option value={new Date().getMonth()}>Mês Atual</option>
                        <option value={new Date().getMonth() - 1}>Mês Anterior</option>
                        <option value={new Date().getMonth() - 2}>2 Meses Atrás</option>
                      </select>
                    </div>

                    <div className="list-stack">
                      {lessons
                        .filter(l => {
                          const lessonDate = new Date(l.starts_at)
                          return l.teacher_id === profile.id && 
                            l.teacher_lesson_status === 'happened' && 
                            lessonDate.getMonth() === selectedMonth
                        })
                        .map((lesson) => (
                          <div key={lesson.id} className={lessonCardClass(lesson.id)}>
                            <div>
                              <h3>{lesson.subject}</h3>
                              <p className="muted">
                                Aluno: {profilesById[lesson.student_id]?.full_name} · {formatShortDateLabel(lesson.starts_at)}
                              </p>
                            </div>
                            <span className={badgeClass('confirmed')}>Confirmada</span>
                          </div>
                        ))}
                      {lessons.filter(l => {
                        const lessonDate = new Date(l.starts_at)
                        return l.teacher_id === profile.id && 
                          l.teacher_lesson_status === 'happened' && 
                          lessonDate.getMonth() === selectedMonth
                      }).length === 0 && (
                        <p className="empty-state">Nenhuma aula ministrada encontrada para este mês.</p>
                      )}
                    </div>

                    <h3 className="mt-8" style={{ marginTop: '2rem' }}>Notas e Justificativas ao Admin</h3>
                    <div className="form-card">
                      <textarea
                        placeholder="Escreva aqui quaisquer observações ou justificativas de faltas/ajustes para enviar à administração..."
                        value={teacherNotes}
                        onChange={(e) => setTeacherNotes(e.target.value)}
                        style={{ width: '100%', height: '100px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.75rem', color: '#fff', padding: '0.75rem' }}
                      />
                      <button 
                        className="secondary-button mt-2" 
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => {
                          if (!teacherNotes.trim()) return
                          alert('Notas enviadas com sucesso ao administrador!')
                          setTeacherNotes('')
                        }}
                      >
                        Enviar Notas
                      </button>
                    </div>
                  </section>

                  <section style={{ flex: 0.7 }}>
                    <h3>Envio de Nota Fiscal (MEI)</h3>
                    <div className="form-card" style={{ background: 'rgba(30,41,59,0.3)', padding: '1rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: profile.status_nota_fiscal === 'enviada' ? '#10b981' : '#ef4444'
                        }} />
                        <span className="text-sm">
                          NF Mês Anterior: <strong>{profile.status_nota_fiscal === 'enviada' ? 'Enviada' : 'Pendente'}</strong>
                        </span>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Selecionar Arquivo PDF da Nota</label>
                        <input
                          type="file"
                          accept=".pdf"
                          disabled={uploadingNf}
                          onChange={async (e) => {
                            if (!e.target.files?.[0]) return
                            setUploadingNf(true)
                            setTimeout(async () => {
                              try {
                                const { error } = await supabase
                                  .from('profiles')
                                  .update({ status_nota_fiscal: 'enviada' })
                                  .eq('id', profile.id)
                                if (error) throw error
                                alert('Nota Fiscal enviada com sucesso!')
                                await refreshProfile(profile.id)
                              } catch (err: any) {
                                alert(err.message)
                              } finally {
                                setUploadingNf(false)
                              }
                            }, 1500)
                          }}
                        />
                      </div>
                      <p className="muted tiny-copy">A nota fiscal precisa conter o valor exato acumulado da folha de pagamento.</p>
                    </div>
                  </section>
                </div>
              )}

              {teacherTab === 'profile' && (
                <div className="animate-fade-in" style={{ maxWidth: '500px', margin: '0 auto' }}>
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault()
                      setAccountSaving(true)
                      try {
                        const { error } = await supabase
                          .from('profiles')
                          .update({
                            full_name: accountForm.full_name,
                            email: accountForm.email,
                            chave_pix: (e.currentTarget.elements.namedItem('chavePix') as HTMLInputElement).value,
                            cnpj: (e.currentTarget.elements.namedItem('cnpj') as HTMLInputElement).value
                          })
                          .eq('id', profile.id)
                        if (error) throw error
                        alert('Dados atualizados com sucesso!')
                        await refreshProfile(profile.id)
                      } catch (err: any) {
                        alert(err.message)
                      } finally {
                        setAccountSaving(false)
                      }
                    }}
                    className="form-card" 
                    style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                  >
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: '1rem' }}>
                      <p className="text-amber-400 font-bold text-xs uppercase tracking-widest block mb-1">Atenção MEI</p>
                      <p className="muted text-xs">É obrigatório possuir cadastro ativo de MEI para a prestação de serviços à escola, recebimento dos pagamentos e emissão de NFS-e.</p>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Nome Completo</label>
                      <input
                        required
                        value={accountForm.full_name}
                        onChange={(event) => setAccountForm({ ...accountForm, full_name: event.target.value })}
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">E-mail</label>
                      <input
                        required
                        type="email"
                        value={accountForm.email}
                        onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })}
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">CNPJ MEI</label>
                      <input
                        name="cnpj"
                        placeholder="00.000.000/0001-00"
                        defaultValue={profile.cnpj || ''}
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Chave Pix para Recebimento</label>
                      <input
                        name="chavePix"
                        placeholder="CPF, E-mail ou Telefone"
                        defaultValue={profile.chave_pix || ''}
                      />
                    </div>

                    <button className="primary-button mt-4" disabled={accountSaving} style={{ marginTop: '1rem' }}>
                      {accountSaving ? 'Salvando...' : 'Salvar Dados de Professor'}
                    </button>
                  </form>
                </div>
              )}
            </article>
          </section>
        )}
      </main>
    </div>
  )
}

function EditableUserRow({
  user,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  user: Profile
  onSave: (user: Profile & { password?: string }) => Promise<void>
  onDelete: (userId: string) => Promise<void>
  saving: boolean
  deleting: boolean
}) {
  const [draft, setDraft] = useState<Profile & { password?: string }>(user)

  useEffect(() => {
    setDraft(user)
  }, [user])

  return (
    <div className="user-row">
      <input value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} />
      <input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
      <input
        placeholder="New password"
        value={draft.password ?? ''}
        onChange={(event) => setDraft({ ...draft, password: event.target.value })}
      />
      <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}>
        <option value="student">Student</option>
        <option value="teacher">Teacher</option>
        <option value="admin">Admin</option>
      </select>
      {draft.role === 'student' ? (
        <input value={draft.class_name} onChange={(event) => setDraft({ ...draft, class_name: event.target.value })} />
      ) : (
        <input value={draft.speciality} onChange={(event) => setDraft({ ...draft, speciality: event.target.value })} />
      )}
      <div className="button-stack">
        <button className="secondary-button" disabled={saving || deleting} onClick={() => void onSave(draft)}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button className="danger-button" disabled={saving || deleting} onClick={() => void onDelete(user.id)}>
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

export default function ReminderApp() {
  return (
    <div className="reminder-app-scope bg-[#020617] text-[#e5eefc] min-h-screen">
      <ReminderAppInner />
    </div>
  )
}
