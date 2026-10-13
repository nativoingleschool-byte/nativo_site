import { FormEvent, useEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from 'lucide-react'
import { Lesson, Profile, TeacherAttendance, TeacherLessonStatus, TeacherNote, TeacherAvailability, TeacherInvoice } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { formatShortDate, badgeClass, isoToDateTimeLocal, dateTimeLocalToIso, groupLessonsIntoTeacherSessions, TeacherLessonSession, openFileFromDataOrUrl, downloadFileFromDataOrUrl, buildGoogleCalendarInviteUrl } from '../lib/utils'
import { supabase } from '../lib/supabase'
import TeacherAvailabilityCalendar from './TeacherAvailabilityCalendar'
import TeacherAgendaView from './TeacherAgendaView'
import TeacherReferenceProfileView from './TeacherReferenceProfileView'
import TeacherLiveFinanceView from './TeacherLiveFinanceView'
import TeacherLiveProfileView, { type TeacherProfileDetails } from './TeacherLiveProfileView'
import { useToast } from '../lib/toast'
import DateTimePicker from './DateTimePicker'
import { trackEvent } from '../../lib/telemetry'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'

interface TeacherPanelProps {
  language: Language
  visualPreviewMode: boolean
  teacherTab: 'calendar' | 'worklog' | 'profile'
  setTeacherTab: (tab: 'calendar' | 'worklog' | 'profile') => void
  /** Quando true, a navegação fica sob responsabilidade do TeacherShell. */
  hideShellHeader?: boolean
  students: Profile[]
  teachers: Profile[]
  profile: Profile
  lessons: Lesson[]
  appTimeZone: string
  createLessonFromDraft: (draft: {
    subject: string
    class_name: string
    student_ids: string[]
    teacher_id: string
    starts_at: string
    duration_minutes: number
    meeting_url?: string | null
  }) => Promise<void>
  updateTeacherLessonGroup: (draft: {
    lesson_ids: string[]
    student_ids: string[]
    subject: string
    class_name: string
    teacher_id: string
    starts_at: string
    duration_minutes: number
    meeting_url?: string | null
    teacher_lesson_status?: TeacherLessonStatus
  }) => Promise<void>
  onDeleteLessonGroup?: (lessonIds: string[]) => Promise<void>
  createStudentLoginFromCalendar: (draft: {
    full_name: string
    email: string
    password: string
    class_name?: string
  }) => Promise<Profile>
  createTeacherLoginFromCalendar: (draft: {
    full_name: string
    email: string
    password: string
    speciality?: string
  }) => Promise<Profile>
  createTeacherSingleLesson?: (draft: {
    subject: string
    class_name?: string
    student_id: string
    teacher_id?: string
    starts_at: string
    duration_minutes: number
    meeting_url?: string | null
    teacher_lesson_status?: TeacherLessonStatus
  }) => Promise<Lesson | undefined>
  updateTeacherSingleLesson?: (draft: {
    lesson_id: string
    subject?: string
    class_name?: string
    student_id?: string
    teacher_id?: string
    starts_at?: string
    duration_minutes?: number
    meeting_url?: string | null
    teacher_attendance?: TeacherAttendance
    teacher_lesson_status?: TeacherLessonStatus
  }) => Promise<Lesson | undefined>
  deleteTeacherSingleLesson?: (lessonId: string) => Promise<void>
  profilesById: Record<string, Profile>
  selectedMonth: number
  setSelectedMonth: (month: number) => void
  teacherNotes: string
  setTeacherNotes: (notes: string) => void
  uploadingNf: boolean
  setUploadingNf: (uploading: boolean) => void
  refreshProfile: (userId: string) => Promise<Profile>
  refreshProfiles?: () => Promise<void>
  refreshLessons: () => Promise<void>
  accountSaving: boolean
  setAccountSaving: (saving: boolean) => void
  focusedLessonId: string | null
  teacherNotesList?: TeacherNote[]
  onCreateTeacherNote?: (note: string, monthKey?: string) => Promise<void>
  onDeleteTeacherNote?: (noteId: string) => Promise<void>
  refreshTeacherNotes?: () => Promise<void>
  availabilities?: TeacherAvailability[]
  onCreateAvailability?: (draft: { starts_at: string; duration_minutes: number; teacher_id?: string; repeat_weeks?: number; series_id?: string | null }) => Promise<void>
  onDeleteAvailability?: (options: { id: string; series_id?: string | null; starts_at?: string; series_scope?: 'this' | 'future' }) => Promise<void>
  refreshAvailabilities?: () => Promise<void>
  teacherInvoices?: TeacherInvoice[]
  refreshTeacherInvoices?: () => Promise<void>
}

export default function TeacherPanel({
  language,
  visualPreviewMode,
  teacherTab,
  setTeacherTab,
  hideShellHeader = false,
  students,
  teachers,
  profile,
  lessons,
  appTimeZone,
  createLessonFromDraft,
  updateTeacherLessonGroup,
  onDeleteLessonGroup,
  createStudentLoginFromCalendar,
  createTeacherLoginFromCalendar,
  createTeacherSingleLesson,
  updateTeacherSingleLesson,
  deleteTeacherSingleLesson,
  profilesById,
  selectedMonth,
  setSelectedMonth,
  teacherNotes,
  setTeacherNotes,
  uploadingNf,
  setUploadingNf,
  refreshProfile,
  refreshProfiles,
  refreshLessons,
  accountSaving,
  setAccountSaving,
  focusedLessonId,
  teacherNotesList = [],
  onCreateTeacherNote,
  onDeleteTeacherNote,
  refreshTeacherNotes,
  availabilities = [],
  onCreateAvailability,
  onDeleteAvailability,
  refreshAvailabilities,
  teacherInvoices = [],
  refreshTeacherInvoices,
}: TeacherPanelProps) {
  const { toast } = useToast()
  const modalLanguage: Language = visualPreviewMode ? 'pt' : language
  const formatShortDateLabel = (value: string) => formatShortDate(value, language, appTimeZone)

  // A NFS-e acompanha o ciclo real do mês, independentemente do mês visual
  // selecionado no calendário de aulas: se a nota ainda está pendente,
  // trabalhamos com o mês anterior; depois do envio, a referência passa para
  // o mês atual. Isso evita referências artificiais como 2027 vindas de
  // selectedMonth, que pertence somente à navegação do calendário.
  const nfReferenceDate = useMemo(() => {
    const date = new Date()
    if (profile.status_nota_fiscal !== 'enviada') date.setMonth(date.getMonth() - 1)
    return date
  }, [profile.status_nota_fiscal])
  const nfReferenceMonthKey = `${nfReferenceDate.getFullYear()}-${String(nfReferenceDate.getMonth() + 1).padStart(2, '0')}`
  const nfReferenceMonthLabel = new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(nfReferenceDate)

  const [isSendingNotes, setIsSendingNotes] = useState(false)

  // Worklog Month & Filter states
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')
  // Modals for adding and editing classes
  const [showAddLessonModal, setShowAddLessonModal] = useState(false)
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Add Lesson Form State
  const [newLessonStudentId, setNewLessonStudentId] = useState('')
  const [newLessonStudentIds, setNewLessonStudentIds] = useState<string[]>([])
  const [newLessonStudentName, setNewLessonStudentName] = useState('')
  const [addStudentMode, setAddStudentMode] = useState<'select' | 'custom'>('select')
  const [newLessonStudentsOpen, setNewLessonStudentsOpen] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [newLessonSubject, setNewLessonSubject] = useState('')
  const [newLessonStartsAt, setNewLessonStartsAt] = useState('')
  const [newLessonMeetingUrl, setNewLessonMeetingUrl] = useState('')
  const [newLessonDuration, setNewLessonDuration] = useState(60)
  const [newLessonStatus, setNewLessonStatus] = useState<TeacherLessonStatus>('happened')

  // Edit Lesson Form State
  const [editLessonStudentId, setEditLessonStudentId] = useState('')
  const [editLessonStudentIds, setEditLessonStudentIds] = useState<string[]>([])
  const [editLessonIds, setEditLessonIds] = useState<string[]>([])
  const [editLessonStudentName, setEditLessonStudentName] = useState('')
  const [editStudentsOpen, setEditStudentsOpen] = useState(false)
  const [editStudentSearch, setEditStudentSearch] = useState('')
  const [editLessonSubject, setEditLessonSubject] = useState('')
  const [editLessonStartsAt, setEditLessonStartsAt] = useState('')
  const [editLessonDuration, setEditLessonDuration] = useState(60)
  const [editLessonMeetingUrl, setEditLessonMeetingUrl] = useState('')
  const [editLessonStatus, setEditLessonStatus] = useState<TeacherLessonStatus>('happened')
  const [attendanceLessons, setAttendanceLessons] = useState<Lesson[]>([])
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, boolean>>({})
  useBodyScrollLock(showAddLessonModal || Boolean(editingLesson) || attendanceLessons.length > 0)

  // Propose Class Form State
  const [proposeStudentId, setProposeStudentId] = useState('')
  const [proposeSubject, setProposeSubject] = useState('')
  const [proposeStartsAt, setProposeStartsAt] = useState('')

  const addModalRef = useRef<HTMLDivElement>(null)
  const editModalRef = useRef<HTMLDivElement>(null)

  const sortedStudents = useMemo(() => {
    const map = new Map<string, Profile>()

    // 1. Students passed via prop
    students.forEach((s) => {
      if (s && s.id) map.set(s.id, s)
    })

    // 2. Profiles in profilesById with role student
    Object.values(profilesById).forEach((p) => {
      if (p && p.id && p.role === 'student') {
        map.set(p.id, p)
      }
    })

    // 3. Any student found in lessons
    lessons.forEach((l) => {
      if (l.student_id && !map.has(l.student_id)) {
        const studentProfile = profilesById[l.student_id]
        if (studentProfile) {
          map.set(l.student_id, studentProfile)
        }
      }
    })

    return Array.from(map.values()).sort((a, b) =>
      (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
    )
  }, [students, profilesById, lessons])

  const selectedStudents = useMemo(
    () => sortedStudents.filter((student) => newLessonStudentIds.includes(student.id)),
    [sortedStudents, newLessonStudentIds]
  )
  const selectedClassName = selectedStudents[0]?.class_name?.trim() || ''
  const classStudents = useMemo(
    () => selectedStudents.length
      ? sortedStudents.filter((student) => (student.class_name?.trim() || '') === selectedClassName)
      : sortedStudents,
    [selectedClassName, selectedStudents.length, sortedStudents]
  )
  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLocaleLowerCase()
    if (!query) return classStudents
    return classStudents.filter((student) =>
      `${student.full_name} ${student.class_name || ''}`.toLocaleLowerCase().includes(query)
    )
  }, [classStudents, studentSearch])
  // Do not hide valid students when a lesson has a stale or different class label.
  const editClassStudents = sortedStudents
  const filteredEditStudents = useMemo(() => {
    const query = editStudentSearch.trim().toLocaleLowerCase()
    if (!query) return editClassStudents
    return editClassStudents.filter((student) =>
      `${student.full_name} ${student.class_name || ''}`.toLocaleLowerCase().includes(query)
    )
  }, [editClassStudents, editStudentSearch])
  const editCurrentStudentName = profilesById[editLessonStudentId]?.full_name || 'Aluno Atual'
  const showEditStudentFallback = Boolean(
    editLessonStudentId
    && !sortedStudents.some((student) => student.id === editLessonStudentId)
    && editCurrentStudentName.toLocaleLowerCase().includes(editStudentSearch.trim().toLocaleLowerCase())
  )

  // Filter lessons for this teacher
  const teacherLessons = useMemo(
    () => lessons.filter((l) => l.teacher_id === profile.id),
    [lessons, profile.id]
  )

  // Filter today's lessons for quick attendance bar
  const teacherTodayLessons = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: appTimeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const todayZoned = formatter.format(new Date())

    const todaysLessons = teacherLessons
      .filter((l) => {
        if (!l.starts_at) return false
        const lessonDate = formatter.format(new Date(l.starts_at))
        return lessonDate === todayZoned
      })
    return groupLessonsIntoTeacherSessions(todaysLessons)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  }, [teacherLessons, appTimeZone])

  const lastUnmarkedClass = useMemo(() => {
    const now = new Date()
    return groupLessonsIntoTeacherSessions(teacherLessons).find((session) =>
      new Date(session.starts_at) < now && session.lessons.every((lesson) => !lesson.teacher_lesson_status)
    ) ?? null
  }, [teacherLessons])

  const teacherUpcomingLessons = useMemo(() => {
    const now = Date.now()
    return groupLessonsIntoTeacherSessions(teacherLessons)
      .filter((session) => new Date(session.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  }, [teacherLessons])

  const handleUpdateTodayLessonStatus = async (lessonId: string, status: TeacherLessonStatus) => {
    if (status === 'happened') {
      const target = lessons.find((lesson) => lesson.id === lessonId)
      if (!target) return
      const promptLessons = groupLessonsIntoTeacherSessions(teacherLessons)
        .find((session) => session.lessons.some((lesson) => lesson.id === target.id))?.lessons ?? [target]
      setAttendanceLessons(promptLessons)
      setAttendanceDraft(Object.fromEntries(promptLessons.map((lesson) => [lesson.id, lesson.teacher_attendance === 'present'])))
      return
    }
    try {
      const sessionLessons = groupLessonsIntoTeacherSessions(teacherLessons)
        .find((session) => session.lessons.some((lesson) => lesson.id === lessonId))?.lessons ?? []
      const lessonIds = sessionLessons.length > 0 ? sessionLessons.map((lesson) => lesson.id) : [lessonId]
      if (updateTeacherSingleLesson) {
        for (const id of lessonIds) {
          await updateTeacherSingleLesson({ lesson_id: id, teacher_lesson_status: status })
        }
      } else {
        const { error } = await supabase.from('lessons').update({ teacher_lesson_status: status }).in('id', lessonIds)
        if (error) throw error
      }
      void trackEvent('lesson_status_update', { lesson_id: lessonId, status, source: 'quick_bar' }, { userRole: 'teacher', userId: profile.id })
      await refreshLessons()
      toast.success(
        status === 'student_no_show'
          ? (language === 'es' ? 'Marcado como no compareció' : language === 'en' ? 'Marked as student no-show' : 'Marcado como não compareceu.')
          : (language === 'es' ? 'Clase cancelada' : language === 'en' ? 'Lesson canceled' : 'Aula cancelada.')
      )
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar aula.')
    }
  }

  const saveAttendance = async () => {
    if (attendanceLessons.length === 0) return
    try {
      for (const lesson of attendanceLessons) {
        const teacherAttendance: TeacherAttendance = attendanceDraft[lesson.id] ? 'present' : 'absent'
        if (updateTeacherSingleLesson) {
          await updateTeacherSingleLesson({ lesson_id: lesson.id, teacher_lesson_status: 'happened', teacher_attendance: teacherAttendance })
        } else {
          const { error } = await supabase.from('lessons').update({ teacher_lesson_status: 'happened', teacher_attendance: teacherAttendance }).eq('id', lesson.id)
          if (error) throw error
        }
      }
      await refreshLessons()
      setAttendanceLessons([])
      setAttendanceDraft({})
      toast.success('Presença registrada com sucesso.')
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível registrar a presença.')
    }
  }

  // Filter notes for this teacher
  const myNotes = useMemo(
    () => teacherNotesList.filter((n) => n.teacher_id === profile.id),
    [teacherNotesList, profile.id]
  )

  // Generate available months list from teacher lessons
  const availableMonths = useMemo(() => {
    const monthsMap = new Map<string, string>()
    const currentMonthKey = new Date().toISOString().slice(0, 7)
    teacherLessons.forEach((l) => {
      if (l.starts_at) {
        const key = l.starts_at.slice(0, 7)
        if (key <= currentMonthKey && !monthsMap.has(key)) {
          const [yr, mo] = key.split('-')
          const dObj = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 1)
          const monthLabel = dObj.toLocaleDateString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en', {
            month: 'long',
            year: 'numeric',
          })
          monthsMap.set(key, monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1))
        }
      }
    })

    if (!monthsMap.has(currentMonthKey)) {
      const dObj = new Date()
      const monthLabel = dObj.toLocaleDateString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en', {
        month: 'long',
        year: 'numeric',
      })
      monthsMap.set(currentMonthKey, monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1))
    }

    return Array.from(monthsMap.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [teacherLessons, language])

  // Active Month Key
  const activeMonthKey = useMemo(() => {
    if (selectedMonthKey && availableMonths.some(([k]) => k === selectedMonthKey)) {
      return selectedMonthKey
    }
    return new Date().toISOString().slice(0, 7)
  }, [selectedMonthKey, availableMonths])

  // Month lessons list
  const monthLessons = useMemo(() => {
    return teacherLessons
      .filter((l) => l.starts_at && l.starts_at.slice(0, 7) === activeMonthKey)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
  }, [teacherLessons, activeMonthKey])

  // Group month lessons into unique sessions for accurate hourly calculations (groups count as 1 session)
  const monthSessions = useMemo(
    () => groupLessonsIntoTeacherSessions(monthLessons),
    [monthLessons]
  )

  const payableSessions = useMemo(
    () => monthSessions.filter((s) => s.is_happened || s.is_no_show),
    [monthSessions]
  )
  const completedSessions = useMemo(
    () => monthSessions.filter((s) => s.is_happened),
    [monthSessions]
  )
  const scheduledSessions = useMemo(
    () => monthSessions.filter((s) => s.is_scheduled),
    [monthSessions]
  )
  const issueSessions = useMemo(
    () => monthSessions.filter((s) => s.is_no_show || s.is_cancelled),
    [monthSessions]
  )

  const totalMinutes = useMemo(
    () => payableSessions.reduce((acc, s) => acc + s.duration_minutes, 0),
    [payableSessions]
  )
  const totalHours = totalMinutes / 60
  const hourlyRate = profile.taxa_hora_aula ?? 56.0
  const currency = profile.moeda_taxa ?? 'BRL'
  const totalAmount = totalHours * Number(hourlyRate)
  const invoiceReferenceAmount = useMemo(() => {
    const referenceLessons = teacherLessons.filter((lesson) => lesson.starts_at?.slice(0, 7) === nfReferenceMonthKey)
    return groupLessonsIntoTeacherSessions(referenceLessons)
      .filter((session) => session.is_happened || session.is_no_show)
      .reduce((sum, session) => sum + (session.duration_minutes / 60) * Number(hourlyRate), 0)
  }, [teacherLessons, nfReferenceMonthKey, hourlyRate])

  // Open Add Lesson Modal
  const handleOpenAddLesson = () => {
    if ((!students || students.length === 0) && refreshProfiles) {
      void refreshProfiles().catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os alunos.')
      })
    }
    const defaultStudent = visualPreviewMode ? '' : sortedStudents[0]?.id || '__NEW__'
    setNewLessonStudentId(defaultStudent)
    setNewLessonStudentIds(defaultStudent && defaultStudent !== '__NEW__' ? [defaultStudent] : [])
    setStudentSearch('')
    setNewLessonStudentName('')
    setNewLessonMeetingUrl('')
    setAddStudentMode('select')
    setNewLessonStudentsOpen(false)
    setNewLessonSubject(visualPreviewMode ? 'Aulas de Inglês · Turma Fluência' : t(language, 'individual_class'))
    setNewLessonDuration(60)
    setNewLessonStatus('happened')

    // Set initial date within active month
    const now = new Date()
    setNewLessonStartsAt(isoToDateTimeLocal(now.toISOString(), appTimeZone))
    setShowAddLessonModal(true)
  }

  // Submit Add Lesson
  const handleAddLessonSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const isCustom = newLessonStudentId === '__NEW__' || !newLessonStudentId
    const selectedStudentIds = isCustom ? [] : newLessonStudentIds.filter(Boolean)
    const studentIdentifier = isCustom ? newLessonStudentName.trim() : selectedStudentIds[0]
    if (!studentIdentifier || !newLessonSubject.trim() || !newLessonStartsAt) {
      toast.error(t(language, 'fill_required_fields'))
      return
    }

    setIsSubmitting(true)
    try {
      const utcIso = dateTimeLocalToIso(newLessonStartsAt, appTimeZone)
      const studentProfile = sortedStudents.find((student) => student.id === newLessonStudentId)
      const className = studentProfile?.class_name || ''

      if (selectedStudentIds.length > 1) {
        await createLessonFromDraft({
          student_ids: selectedStudentIds,
          teacher_id: profile.id,
          subject: newLessonSubject.trim(),
          class_name: sortedStudents.find((student) => student.id === selectedStudentIds[0])?.class_name || '',
          starts_at: utcIso,
          duration_minutes: newLessonDuration,
          meeting_url: newLessonMeetingUrl.trim() || null,
        })
      } else if (createTeacherSingleLesson) {
        await createTeacherSingleLesson({
          student_id: studentIdentifier,
          teacher_id: profile.id,
          subject: newLessonSubject.trim(),
          class_name: className,
          starts_at: utcIso,
          duration_minutes: newLessonDuration,
          meeting_url: newLessonMeetingUrl.trim() || null,
          teacher_lesson_status: newLessonStatus,
        })
      } else {
        // Direct API fallback
        const sessionData = await supabase.auth.getSession()
        const token = sessionData.data.session?.access_token
        if (!token) throw new Error(t(language, 'unauthenticated_error'))

        const res = await fetch('/api/lessons/manage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'create_lesson',
            payload: {
              student_id: studentIdentifier,
              student_name: isCustom ? newLessonStudentName.trim() : undefined,
              teacher_id: profile.id,
              subject: newLessonSubject.trim(),
              class_name: className,
              starts_at: utcIso,
              duration_minutes: newLessonDuration,
              meeting_url: newLessonMeetingUrl.trim() || null,
              teacher_lesson_status: newLessonStatus,
            },
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: t(language, 'error_adding_lesson') }))
          throw new Error(err.error || t(language, 'error_adding_lesson'))
        }
        await refreshLessons()
      }

      if (refreshProfiles) {
        void refreshProfiles()
      }
      toast.success(t(language, 'lesson_added_success'))
      setShowAddLessonModal(false)
      setNewLessonStudentName('')
    } catch (err: any) {
      toast.error(err.message || t(language, 'error_adding_lesson'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open Edit Lesson Modal
  const handleOpenEditLesson = (lesson: Lesson, group: Lesson[] = [lesson]) => {
    setEditingLesson(lesson)
    setEditLessonStudentId(lesson.student_id)
    setEditLessonStudentIds(Array.from(new Set(group.map((item) => item.student_id).filter(Boolean))))
    setEditLessonIds(group.map((item) => item.id))
    setEditStudentsOpen(false)
    setEditStudentSearch('')
    setEditLessonSubject(lesson.subject)
    setEditLessonDuration(lesson.duration_minutes || 60)
    setEditLessonMeetingUrl(lesson.meeting_url ?? '')
    setEditLessonStatus(lesson.teacher_lesson_status ?? null)
    setEditLessonStartsAt(isoToDateTimeLocal(lesson.starts_at, appTimeZone))
  }

  // Submit Edit Lesson
  const handleEditLessonSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingLesson) return
    if (!editLessonStudentIds.length || !editLessonSubject.trim() || !editLessonStartsAt) {
      toast.error(t(language, 'fill_required_fields'))
      return
    }

    setIsSubmitting(true)
    try {
      const utcIso = dateTimeLocalToIso(editLessonStartsAt, appTimeZone)
      const studentProfile = profilesById[editLessonStudentIds[0]]
      const className = studentProfile?.class_name || editingLesson.class_name || ''

      if (editLessonIds.length > 1 || editLessonStudentIds.length > 1) {
        await updateTeacherLessonGroup({
          lesson_ids: editLessonIds,
          student_ids: editLessonStudentIds,
          subject: editLessonSubject.trim(),
          class_name: className,
          teacher_id: profile.id,
          starts_at: utcIso,
          duration_minutes: editLessonDuration,
          meeting_url: editLessonMeetingUrl.trim() || null,
          teacher_lesson_status: editLessonStatus,
        })
      } else if (updateTeacherSingleLesson) {
        await updateTeacherSingleLesson({
          lesson_id: editingLesson.id,
          student_id: editLessonStudentIds[0],
          teacher_id: profile.id,
          subject: editLessonSubject.trim(),
          class_name: className,
          starts_at: utcIso,
          duration_minutes: editLessonDuration,
          meeting_url: editLessonMeetingUrl.trim() || null,
          teacher_lesson_status: editLessonStatus,
        })
      } else {
        // Direct API fallback
        const sessionData = await supabase.auth.getSession()
        const token = sessionData.data.session?.access_token
        if (!token) throw new Error(t(language, 'unauthenticated_error'))

        const res = await fetch('/api/lessons/manage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'update_lesson',
            payload: {
              lesson_id: editingLesson.id,
              student_id: editLessonStudentIds[0],
              teacher_id: profile.id,
              subject: editLessonSubject.trim(),
              class_name: className,
              starts_at: utcIso,
              duration_minutes: editLessonDuration,
              meeting_url: editLessonMeetingUrl.trim() || null,
              teacher_lesson_status: editLessonStatus,
            },
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: t(language, 'error_updating_lesson') }))
          throw new Error(err.error || t(language, 'error_updating_lesson'))
        }
        await refreshLessons()
      }

      toast.success(t(language, 'lesson_updated_success'))
      setEditingLesson(null)
    } catch (err: any) {
      toast.error(err.message || t(language, 'error_updating_lesson'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Quick Status Change directly from list (supports single lesson or session group)
  const handleQuickStatusChange = async (target: Lesson | Lesson[], newStatus: TeacherLessonStatus) => {
    try {
      const targetLessons = Array.isArray(target) ? target : [target]
      const lessonIds = targetLessons.map((l) => l.id)

      if (newStatus === 'happened') {
        setAttendanceLessons(targetLessons)
        setAttendanceDraft(Object.fromEntries(targetLessons.map((lesson) => [lesson.id, lesson.teacher_attendance === 'present'])))
        return
      }

      if (visualPreviewMode) {
        if (!updateTeacherSingleLesson) throw new Error('Preview lesson updates are unavailable.')
        for (const lesson of targetLessons) {
          await updateTeacherSingleLesson({ lesson_id: lesson.id, teacher_lesson_status: newStatus })
        }
        toast.success(t(language, 'lesson_status_updated'))
        return
      }

      if (updateTeacherSingleLesson && lessonIds.length === 1) {
        await updateTeacherSingleLesson({
          lesson_id: lessonIds[0],
          teacher_lesson_status: newStatus,
        })
      } else if (updateTeacherLessonGroup && targetLessons.length > 1) {
        const firstLesson = targetLessons[0]
        await updateTeacherLessonGroup({
          lesson_ids: lessonIds,
          student_ids: targetLessons.map((lesson) => lesson.student_id),
          subject: firstLesson.subject,
          class_name: firstLesson.class_name,
          teacher_id: firstLesson.teacher_id,
          starts_at: firstLesson.starts_at,
          duration_minutes: firstLesson.duration_minutes,
          meeting_url: firstLesson.meeting_url,
          teacher_lesson_status: newStatus,
        })
      } else {
        const { error } = await supabase
          .from('lessons')
          .update({
            teacher_lesson_status: newStatus,
          })
          .in('id', lessonIds)

        if (error) throw error
        await refreshLessons()
      }
      toast.success(t(language, 'lesson_status_updated'))
    } catch (err: any) {
      toast.error(err.message || t(language, 'error_updating_status'))
    }
  }

  // Delete Lesson / Session Group
  const handleDeleteSession = async (lessonIds: string[]) => {
    const confirmed = window.confirm(t(language, 'delete_lesson_confirm'))
    if (!confirmed) return

    setIsSubmitting(true)
    try {
      for (const id of lessonIds) {
        if (deleteTeacherSingleLesson) {
          await deleteTeacherSingleLesson(id)
        } else {
          const sessionData = await supabase.auth.getSession()
          const token = sessionData.data.session?.access_token
          if (!token) throw new Error(t(language, 'unauthenticated_error'))

          const res = await fetch('/api/lessons/manage', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: 'delete_lesson',
              payload: { lesson_id: id },
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: t(language, 'error_deleting_lesson') }))
            throw new Error(err.error || t(language, 'error_deleting_lesson'))
          }
        }
      }
      await refreshLessons()
      toast.success(t(language, 'lesson_deleted_success'))
      if (editingLesson) {
        setEditingLesson(null)
      }
    } catch (err: any) {
      toast.error(err.message || t(language, 'error_deleting_lesson'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleProposeClass = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!proposeStudentId || !proposeSubject || !proposeStartsAt) return

    try {
      const startsAt = new Date(proposeStartsAt)

      const { error } = await supabase.from('lessons').insert({
        subject: proposeSubject,
        class_name: 'Custom proposed class',
        student_id: proposeStudentId,
        teacher_id: profile.id,
        starts_at: startsAt.toISOString(),
        duration_minutes: 60,
      })
      if (error) throw error
      toast.success(t(language, 'proposal_sent_success'))
      setProposeSubject('')
      setProposeStartsAt('')
      await refreshLessons()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erro ao propor aula.'
      toast.error(errMsg)
    }
  }

  const handleUploadNf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return
    if (visualPreviewMode) {
      toast.info('O envio de NFS-e fica desativado na preview.')
      e.target.value = ''
      return
    }
    const file = e.target.files[0]
    setUploadingNf(true)
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error(t(language, 'unauthenticated_error'))

      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const fileDataUrl = reader.result as string

          const activeMonthKey = nfReferenceMonthKey

          const res = await fetch('/api/me/upload-nf', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              status_nota_fiscal: 'enviada',
              nota_fiscal_url: fileDataUrl,
              month_key: activeMonthKey,
              file_name: file.name || 'Nota_Fiscal.pdf',
            }),
          })

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: t(language, 'error_uploading_nf') }))
            throw new Error(err.error || t(language, 'error_uploading_nf'))
          }

          void trackEvent(
            'teacher_nf_uploaded',
            {
              month_key: activeMonthKey,
              file_name: file.name || 'Nota_Fiscal.pdf',
              file_size_kb: Math.round(file.size / 1024),
            },
            { userRole: 'teacher', userId: profile.id }
          )

          toast.success(t(language, 'nf_upload_success'))
          await refreshProfile(profile.id)
          await refreshTeacherInvoices?.()
        } catch (err: any) {
          toast.error(err.message)
        } finally {
          setUploadingNf(false)
        }
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      toast.error(err.message)
      setUploadingNf(false)
    }
  }

  const handleSaveTeacherData = async (details: TeacherProfileDetails) => {
    setAccountSaving(true)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession?.access_token) throw new Error(t(language, 'unauthenticated_error'))
      const response = await fetch('/api/me/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify(details),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Could not update teacher data.' }))
        throw new Error(result.error || 'Could not update teacher data.')
      }
      toast.success(t(language, 'data_updated_success'))
      await refreshProfile(profile.id)
    } catch (err: any) {
      toast.error(err.message)
      throw err
    } finally {
      setAccountSaving(false)
    }
  }

  return (
    <section className="flex flex-col w-full gap-6">
      <article className={hideShellHeader ? 'panel teacher-panel-content-only' : 'panel'}>
        {!hideShellHeader && <div className="panel-header animate-fade-in">
          <div>
            <p className="section-label">{t(language, 'role_teacher')}</p>
            <h2>
              {teacherTab === 'calendar' && t(language, 'my_schedule')}
              {teacherTab === 'worklog' && t(language, 'worklog_notes')}
              {teacherTab === 'profile' && t(language, 'teacher_profile_title')}
            </h2>
          </div>
          {/* Mobile Tab Dropdown */}
          <div className="mobile-tab-select">
            <select value={teacherTab} onChange={(e) => setTeacherTab(e.target.value as any)}>
              <option value="calendar">{t(language, 'tab_schedule')}</option>
              <option value="worklog">{t(language, 'tab_worklog_nf')}</option>
              <option value="profile">{t(language, 'tab_profile_data')}</option>
            </select>
          </div>

          {/* Desktop Tab Buttons */}
          <div className="tab-row desktop-only">
            <button
              type="button"
              className={teacherTab === 'calendar' ? 'tab-button tab-button-active' : 'tab-button'}
              onClick={() => setTeacherTab('calendar')}
            >
              {t(language, 'tab_schedule')}
            </button>
            <button
              type="button"
              className={teacherTab === 'worklog' ? 'tab-button tab-button-active' : 'tab-button'}
              onClick={() => setTeacherTab('worklog')}
            >
              {t(language, 'tab_worklog_nf')}
            </button>
            <button
              type="button"
              className={teacherTab === 'profile' ? 'tab-button tab-button-active' : 'tab-button'}
              onClick={() => setTeacherTab('profile')}
            >
              {t(language, 'tab_profile_data')}
            </button>
          </div>
        </div>}

        {teacherTab === 'calendar' && hideShellHeader && (
          <TeacherAgendaView
            profile={profile}
            lessons={lessons}
            students={students}
            profilesById={profilesById}
            availabilities={availabilities}
            language={language}
            visualPreview={visualPreviewMode}
            pendingConfirmation={lastUnmarkedClass}
            upcomingLessons={teacherUpcomingLessons}
            completedCount={completedSessions.length}
            accruedAmount={totalAmount}
            appTimeZone={appTimeZone}
            onUpdateLessonStatus={handleQuickStatusChange}
            onOpenLesson={handleOpenEditLesson}
            onAddLesson={handleOpenAddLesson}
            onCreateAvailability={onCreateAvailability}
            onDeleteAvailability={onDeleteAvailability}
          />
        )}

        {teacherTab === 'calendar' && !hideShellHeader && (
          <div className="space-y-6 animate-fade-in">
            {lastUnmarkedClass && (
              <div
                className="form-card mb-6"
                style={{
                  background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.15), rgba(153, 27, 27, 0.05))',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '1.25rem',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>⚠️</span>
                    {language === 'es' ? 'Atención: Clase anterior sin marcar' : language === 'en' ? "Warning: Unmarked Past Class" : 'Atenção: Aula anterior não marcada'}
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(() => {
                    const session = lastUnmarkedClass
                    const l = session.lessons[0]
                    const studentName = session.student_ids.map((id) => profilesById[id]?.full_name || students.find((student) => student.id === id)?.full_name).filter(Boolean).join(', ') || `${session.student_ids.length} alunos`
                    const timeStr = formatShortDate(session.starts_at, language, appTimeZone)

                    return (
                      <div
                        key={session.key}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                          padding: '0.85rem 1rem',
                          borderRadius: '0.75rem',
                          background: 'rgba(15, 23, 42, 0.75)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <div style={{ minWidth: '180px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.92rem' }}>{studentName}</span>
                          </div>
                          <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                            {timeStr} • {l.subject}
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', borderColor: '#10b981' }}
                            onClick={() => handleQuickStatusChange(session.lessons, 'happened')}
                          >
                            {language === 'es' ? '✓ Realizada' : language === 'en' ? '✓ Happened' : '✓ Realizada'}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', borderColor: '#f59e0b' }}
                            onClick={() => handleQuickStatusChange(session.lessons, 'student_no_show')}
                          >
                            {language === 'es' ? '⚠️ No compareció' : language === 'en' ? '⚠️ No-Show' : '⚠️ Não compareceu'}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                            onClick={() => handleQuickStatusChange(session.lessons, 'not_happened')}
                          >
                            {language === 'es' ? '✕ Cancelada' : language === 'en' ? '✕ Canceled' : '✕ Cancelada'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* Calendar Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary-button"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#059669', borderColor: '#10b981' }}
                onClick={() => {
                  toast.info(t(language, 'tap_calendar_to_add') || 'Tap any empty slot on the calendar grid below to add availability.')
                }}
              >
                <span>+</span>
                <span>{t(language, 'add_availability')}</span>
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={handleOpenAddLesson}
              >
                <span>+</span>
                <span>{t(language, 'add_class')}</span>
              </button>
            </div>

            <TeacherAvailabilityCalendar
              lessons={lessons}
              availabilities={availabilities}
              timeZone={appTimeZone}
              language={language}
              currentTeacherId={profile.id}
              onCreateAvailability={onCreateAvailability}
              onDeleteAvailability={onDeleteAvailability}
              onEditLesson={handleOpenEditLesson}
              profilesById={profilesById}
            />

            {teacherTodayLessons.length > 0 && (
              <div
                className="form-card mb-6 mt-6"
                style={{
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.75))',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  borderRadius: '1.25rem',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>⚡</span>
                    {language === 'es' ? 'Clases de Hoy (Chamada Rápida)' : language === 'en' ? "Today's Classes (Quick Attendance)" : 'Aulas de Hoje (Chamada Rápida)'}
                  </h3>
                  <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                    {teacherTodayLessons.length} {language === 'es' ? 'clase(s)' : language === 'en' ? 'class(es)' : 'aula(s)'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {teacherTodayLessons.map((session) => {
                    const l = session.lessons[0]
                    const studentName = session.student_ids.map((id) => profilesById[id]?.full_name || students.find((student) => student.id === id)?.full_name).filter(Boolean).join(', ') || `${session.student_ids.length} alunos`
                    const timeStr = formatShortDate(session.starts_at, language, appTimeZone)

                    return (
                      <div
                        key={session.key}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                          padding: '0.85rem 1rem',
                          borderRadius: '0.75rem',
                          background: 'rgba(15, 23, 42, 0.75)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <div style={{ minWidth: '180px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.92rem' }}>{studentName}</span>
                            {session.lessons.some((lesson) => lesson.teacher_lesson_status) && (
                              <span className={badgeClass(l.teacher_lesson_status)} style={{ fontSize: '0.7rem' }}>
                                {session.is_happened ? '✓ Realizada' : session.is_no_show ? '⚠️ Não Compareceu' : session.is_cancelled ? '✕ Cancelada' : 'Agendada'}
                              </span>
                            )}
                          </div>
                          <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                            {timeStr} • {l.subject}
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className={session.is_happened ? 'primary-button' : 'secondary-button'}
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', background: session.is_happened ? '#10b981' : undefined, borderColor: '#10b981' }}
                            onClick={() => handleQuickStatusChange(session.lessons, 'happened')}
                          >
                            {language === 'es' ? '✓ Realizada' : language === 'en' ? '✓ Happened' : '✓ Realizada'}
                          </button>
                          <button
                            type="button"
                            className={session.is_no_show ? 'primary-button' : 'secondary-button'}
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', background: session.is_no_show ? '#f59e0b' : undefined, borderColor: '#f59e0b', color: session.is_no_show ? '#000' : undefined }}
                            onClick={() => handleQuickStatusChange(session.lessons, 'student_no_show')}
                          >
                            {language === 'es' ? '⚠️ No compareció' : language === 'en' ? '⚠️ No-Show' : '⚠️ Não compareceu'}
                          </button>
                          <button
                            type="button"
                            className={session.is_cancelled ? 'danger-button' : 'secondary-button'}
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                            onClick={() => handleQuickStatusChange(session.lessons, 'not_happened')}
                          >
                            {language === 'es' ? '✕ Cancelada' : language === 'en' ? '✕ Canceled' : '✕ Cancelada'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div
              className="form-card mb-6 mt-6"
              style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '1.5rem' }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#fff' }}>
                {t(language, 'propose_new_class_title')}
              </h3>
              <form onSubmit={handleProposeClass} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <select
                    value={proposeStudentId}
                    onChange={(e) => setProposeStudentId(e.target.value)}
                    required
                    style={{ flex: 1, minWidth: '160px' }}
                  >
                    <option value="">{t(language, 'select_student')}</option>
                    {sortedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} {s.class_name ? `(${s.class_name})` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder={t(language, 'subject_topic')}
                    value={proposeSubject}
                    onChange={(e) => setProposeSubject(e.target.value)}
                    style={{ flex: 1, minWidth: '160px' }}
                  />
                </div>

                <DateTimePicker
                  value={proposeStartsAt}
                  onChange={(val) => setProposeStartsAt(val)}
                  language={language}
                  label={t(language, 'date_and_time')}
                  required
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="primary-button" type="submit" style={{ padding: '0.65rem 1.5rem' }}>
                    {t(language, 'propose_time_btn')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {teacherTab === 'worklog' && (
          <TeacherLiveFinanceView
            language={language}
            profile={profile}
            profilesById={profilesById}
            monthKey={activeMonthKey}
            months={availableMonths}
            onMonthChange={setSelectedMonthKey}
            monthSessions={monthSessions}
            completedSessions={completedSessions}
            scheduledSessions={scheduledSessions}
            issueSessions={issueSessions}
            payableCount={payableSessions.length}
            totalHours={totalHours}
            totalAmount={totalAmount}
            hourlyRate={Number(hourlyRate)}
            currency={currency}
            notesDraft={teacherNotes}
            setNotesDraft={setTeacherNotes}
            notes={myNotes}
            isSendingNotes={isSendingNotes}
            setIsSendingNotes={setIsSendingNotes}
            onCreateNote={onCreateTeacherNote}
            onDeleteNote={onDeleteTeacherNote}
            appTimeZone={appTimeZone}
            invoiceReferenceMonth={nfReferenceMonthKey}
            invoiceReferenceLabel={nfReferenceMonthLabel}
            invoiceAmount={invoiceReferenceAmount}
            invoices={teacherInvoices.filter((invoice) => invoice.teacher_id === profile.id)}
            uploadingInvoice={uploadingNf}
            onUploadInvoice={handleUploadNf}
            onUpdateStatus={handleQuickStatusChange}
            onEditLesson={handleOpenEditLesson}
            onDeleteLessons={handleDeleteSession}
            onAddLesson={handleOpenAddLesson}
          />
        )}
        {teacherTab === 'profile' && visualPreviewMode && <TeacherReferenceProfileView />}

        {teacherTab === 'profile' && !visualPreviewMode && (
          <TeacherLiveProfileView
            profile={profile}
            language={language}
            saving={accountSaving}
            onSave={handleSaveTeacherData}
          />
        )}
      </article>

      {/* Modal: Adicionar Aula ao Mês */}
      {showAddLessonModal &&
        createPortal(
          <div
            className="reminder-app-scope modal-overlay teacher-preview-dialog-backdrop"
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99999,
              background: 'rgba(2, 6, 23, 0.8)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              overflow: 'hidden',
            }}
            onClick={(e) => {
              if (addModalRef.current && !addModalRef.current.contains(e.target as Node)) {
                setShowAddLessonModal(false)
              }
            }}
          >
            <div
              ref={addModalRef}
              className="modal-card animate-fade-in teacher-preview-functional-modal teacher-preview-add-modal teacher-lesson-form-modal"
              style={{
                maxWidth: '520px',
                width: '100%',
                maxHeight: 'calc(100dvh - 24px)',
                overflow: 'hidden',
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '1.5rem',
                padding: '2rem',
              }}
            >
              <div className="panel-header teacher-preview-dialog-header" style={{ marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
                <div>
                  <p className="section-label">{t(modalLanguage, 'tab_worklog_nf')}</p>
                  <h2 style={{ fontSize: '1.4rem' }}>Adicionar Nova Aula</h2>
                </div>
                <button type="button" className="teacher-preview-dialog-close" aria-label="Fechar" onClick={() => setShowAddLessonModal(false)}><X size={19} /></button>
              </div>

              <form onSubmit={handleAddLessonSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="teacher-student-field">
                  <div className="teacher-student-field__heading">
                    <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest">Alunos</label>
                  </div>

                  {addStudentMode === 'select' && <div className="teacher-student-dropdown">
                    <button
                      type="button"
                      className="teacher-student-dropdown__trigger"
                      onClick={() => {
                        if (newLessonStudentsOpen) {
                          setNewLessonStudentsOpen(false)
                          setStudentSearch('')
                        } else {
                          setStudentSearch('')
                          setNewLessonStudentsOpen(true)
                        }
                      }}
                      aria-expanded={newLessonStudentsOpen}
                    >
                      <span>
                        {selectedStudents.length === 0
                          ? 'Selecionar alunos da turma'
                          : `${selectedStudents.length} aluno${selectedStudents.length === 1 ? '' : 's'} selecionado${selectedStudents.length === 1 ? '' : 's'}`}
                      </span>
                      <ChevronDown size={15} />
                    </button>
                    {newLessonStudentsOpen && <div className="teacher-student-dropdown__menu" role="group" aria-label="Selecionar alunos">
                      <label className="teacher-student-dropdown__search">
                        <Search size={14} aria-hidden="true" />
                        <input
                          type="search"
                          value={studentSearch}
                          onChange={(event) => setStudentSearch(event.target.value)}
                          placeholder="Buscar aluno..."
                          aria-label="Buscar aluno"
                        />
                      </label>
                      {selectedClassName && <span className="teacher-student-dropdown__class">Turma: {selectedClassName}</span>}
                      <div className="teacher-student-dropdown__results">
                        {filteredStudents.length > 0 ? filteredStudents.map((student) => (
                          <label key={student.id}>
                            <input
                              type="checkbox"
                              checked={newLessonStudentIds.includes(student.id)}
                              onChange={() => {
                                setNewLessonStudentIds((current) => {
                                  const next = current.includes(student.id)
                                    ? current.filter((id) => id !== student.id)
                                    : [...current, student.id]
                                  setNewLessonStudentId(next[0] || '')
                                  return next
                                })
                                setNewLessonStudentName('')
                              }}
                            />
                            <span>{student.full_name}</span>
                            {student.class_name && <small>{student.class_name}</small>}
                          </label>
                        )) : <p className="teacher-student-dropdown__empty">{classStudents.length ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado nesta turma.'}</p>}
                      </div>
                    </div>}
                  </div>}

                  {(addStudentMode === 'custom' || (!visualPreviewMode && sortedStudents.length === 0)) && (
                    <div style={{ marginTop: '0.65rem' }}>
                      <input
                        required
                        placeholder="Digite o nome do aluno (ex: Lucas Silva)"
                        value={newLessonStudentName}
                        onChange={(e) => setNewLessonStudentName(e.target.value)}
                        style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #38bdf8', borderRadius: '0.6rem', color: '#fff' }}
                      />
                      <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem', marginBottom: 0 }}>
                        {sortedStudents.length > 0
                          ? 'Digite o nome do novo aluno acima.'
                          : 'Carregando lista de alunos. Você também pode digitar o nome do aluno diretamente.'}
                      </p>
                    </div>
                  )}
                  {visualPreviewMode && sortedStudents.length === 0 && (
                    <p className="teacher-student-field__empty">Nenhum aluno cadastrado para selecionar.</p>
                  )}
                </div>

                <div className="teacher-preview-dialog-field teacher-preview-dialog-subject">
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Título do Encontro / Módulo</label>
                  <input
                    required
                    placeholder=""
                    value={newLessonSubject}
                    onChange={(e) => setNewLessonSubject(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  />
                </div>

                <div className="teacher-preview-dialog-date-time">
                  <label className="teacher-modal-field-label">{modalLanguage === 'pt' ? 'Data' : modalLanguage === 'es' ? 'Fecha' : 'Date'}</label>
                  <input type="date" value={newLessonStartsAt.slice(0, 10)} onChange={(event) => setNewLessonStartsAt(`${event.target.value}T${newLessonStartsAt.slice(11, 16) || '20:00'}`)} required />
                  <label className="teacher-modal-field-label teacher-preview-dialog-time-label">{modalLanguage === 'pt' ? 'Horário de início' : modalLanguage === 'es' ? 'Hora de inicio' : 'Start time'}</label>
                  <input type="time" value={newLessonStartsAt.slice(11, 16)} onChange={(event) => setNewLessonStartsAt(`${newLessonStartsAt.slice(0, 10)}T${event.target.value}`)} required />
                </div>

                <div className="teacher-preview-dialog-field teacher-preview-dialog-link">
                  <label className="teacher-modal-field-label">Link da aula <span>(opcional)</span></label>
                  <input type="url" placeholder="https://meet.google.com/..." value={newLessonMeetingUrl} onChange={(event) => setNewLessonMeetingUrl(event.target.value)} />
                </div>

                <div className="teacher-modal-extra-field teacher-lesson-form-duration teacher-preview-dialog-extra">
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(modalLanguage, 'duration_minutes_label')} *</label>
                    <input
                      required
                      type="number"
                      min={15}
                      step={5}
                      value={newLessonDuration}
                      onChange={(e) => setNewLessonDuration(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                    />
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
                      {[30, 45, 60, 90].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setNewLessonDuration(mins)}
                          style={{
                            flex: 1,
                            padding: '0.2rem',
                            borderRadius: '0.3rem',
                            fontSize: '0.72rem',
                            background: newLessonDuration === mins ? '#38bdf8' : 'rgba(51, 65, 85, 0.4)',
                            color: newLessonDuration === mins ? '#0f172a' : '#cbd5e1',
                            fontWeight: newLessonDuration === mins ? 'bold' : 'normal',
                          }}
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  </div>

                <div className="teacher-modal-extra-field teacher-lesson-form-status teacher-preview-dialog-extra">
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(modalLanguage, 'status')}</label>
                  <select
                    value={newLessonStatus || 'agendada'}
                    onChange={(e) => setNewLessonStatus(e.target.value === 'agendada' ? null : (e.target.value as TeacherLessonStatus))}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  >
                    <option value="happened">{t(language, 'status_happened')}</option>
                    <option value="student_no_show">{t(language, 'status_student_noshow')}</option>
                    <option value="not_happened">{t(language, 'status_not_happened')}</option>
                    <option value="agendada">{t(language, 'scheduled_badge')}</option>
                  </select>
                </div>

                <div className="button-row teacher-preview-dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowAddLessonModal(false)}
                    disabled={isSubmitting}
                  >
                    {t(modalLanguage, 'cancel')}
                  </button>
                  <button type="submit" className="primary-button" disabled={isSubmitting}>
                    {isSubmitting ? t(modalLanguage, 'saving_label') : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {attendanceLessons.length > 0 && createPortal(
        <div className="reminder-app-scope modal-overlay teacher-preview-dialog-backdrop teacher-preview-attendance-backdrop" role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(2, 6, 23, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflow: 'hidden' }}>
          <div className="modal-card animate-fade-in teacher-preview-attendance-modal" style={{ maxWidth: '460px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
            <button type="button" className="teacher-preview-dialog-close" aria-label="Fechar" onClick={() => { setAttendanceLessons([]); setAttendanceDraft({}) }}><X size={19} /></button>
            <div className="panel-header teacher-preview-dialog-header" style={{ marginBottom: '1.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
              <div><p className="section-label">CHAMADA DA AULA</p><h2 style={{ fontSize: '1.4rem' }}>Quem compareceu?</h2></div>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>Marque os alunos presentes. Os desmarcados serão registrados como faltantes.</p>
            <div className="teacher-preview-attendance-list" style={{ display: 'grid', gap: '0.5rem' }}>
              {attendanceLessons.map((lesson) => {
                const student = profilesById[lesson.student_id] || students.find((item) => item.id === lesson.student_id)
                return <label key={lesson.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.75rem', border: '1px solid #334155', borderRadius: '0.65rem', color: '#f8fafc', cursor: 'pointer' }}>
                  <input type="checkbox" checked={Boolean(attendanceDraft[lesson.id])} onChange={(event) => setAttendanceDraft((current) => ({ ...current, [lesson.id]: event.target.checked }))} />
                  <span>{student?.full_name || lesson.class_name || 'Aluno'}</span>
                </label>
              })}
            </div>
            <div className="teacher-preview-dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="button" className="secondary-button" onClick={() => { setAttendanceLessons([]); setAttendanceDraft({}) }}>Cancelar</button>
              <button type="button" className="primary-button" onClick={() => void saveAttendance()}>Salvar presença</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Modal: Modificar Aula */}
      {editingLesson &&
        createPortal(
          <div
            className="reminder-app-scope modal-overlay teacher-preview-dialog-backdrop"
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99999,
              background: 'rgba(2, 6, 23, 0.8)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              overflow: 'hidden',
            }}
            onClick={(e) => {
              if (editModalRef.current && !editModalRef.current.contains(e.target as Node)) {
                setEditingLesson(null)
              }
            }}
          >
            <div
              ref={editModalRef}
              className="modal-card animate-fade-in teacher-preview-functional-modal teacher-preview-edit-modal teacher-edit-modal-layout teacher-lesson-form-modal"
              style={{
                maxWidth: '520px',
                width: '100%',
                maxHeight: 'calc(100dvh - 24px)',
                overflow: 'hidden',
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '1.5rem',
                padding: '2rem',
              }}
            >
              <div className="panel-header teacher-preview-dialog-header" style={{ marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
                <div>
                  <p className="section-label">{t(modalLanguage, 'adjust_class_label')}</p>
                  <h2 style={{ fontSize: '1.4rem' }}>Detalhes da aula</h2>
                </div>
                <button type="button" className="teacher-preview-dialog-close" aria-label="Fechar" onClick={() => setEditingLesson(null)}><X size={19} /></button>
              </div>

              <form onSubmit={handleEditLessonSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="teacher-preview-dialog-student">
                  <label className="teacher-modal-field-label">Alunos</label>
                  <div className="teacher-student-dropdown">
                    <button
                      type="button"
                      className="teacher-student-dropdown__trigger"
                      onClick={() => {
                        setEditStudentSearch('')
                        setEditStudentsOpen((open) => !open)
                      }}
                      aria-expanded={editStudentsOpen}
                    >
                      <span>{editLessonStudentIds.map((id) =>
                        sortedStudents.find((student) => student.id === id)?.full_name
                        || profilesById[id]?.full_name
                        || 'Aluno Atual'
                      ).join(', ') || 'Selecionar alunos'}</span>
                      <ChevronDown size={15} />
                    </button>
                    {editStudentsOpen && <div className="teacher-student-dropdown__menu" role="group" aria-label="Selecionar alunos">
                      <label className="teacher-student-dropdown__search">
                        <Search size={14} aria-hidden="true" />
                        <input
                          type="search"
                          value={editStudentSearch}
                          onChange={(event) => setEditStudentSearch(event.target.value)}
                          placeholder="Buscar aluno..."
                          aria-label="Buscar aluno"
                        />
                      </label>
                      <div className="teacher-student-dropdown__results">
                        {filteredEditStudents.map((student) => (
                          <label key={student.id}>
                            <input
                              type="checkbox"
                              checked={editLessonStudentIds.includes(student.id)}
                              onChange={(event) => {
                                setEditLessonStudentIds((current) => {
                                  const next = event.target.checked
                                    ? [...current, student.id]
                                    : current.filter((id) => id !== student.id)
                                  setEditLessonStudentId(next[0] ?? '')
                                  return next
                                })
                              }}
                            />
                            <span>{student.full_name}</span>
                            {student.class_name && <small>{student.class_name}</small>}
                          </label>
                        ))}
                        {showEditStudentFallback && (
                          <label>
                            <input type="checkbox" checked={editLessonStudentIds.includes(editLessonStudentId)} onChange={(event) => {
                              setEditLessonStudentIds((current) => event.target.checked
                                ? Array.from(new Set([...current, editLessonStudentId]))
                                : current.filter((id) => id !== editLessonStudentId))
                            }} />
                            <span>{editCurrentStudentName}</span>
                            {editingLesson?.class_name && <small>{editingLesson.class_name}</small>}
                          </label>
                        )}
                        {filteredEditStudents.length === 0 && !showEditStudentFallback && <p className="teacher-student-dropdown__empty">
                          {editClassStudents.length ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado nesta turma.'}
                        </p>}
                      </div>
                    </div>}
                  </div>
                </div>

                <div className="teacher-preview-dialog-field teacher-preview-dialog-subject">
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Título do Encontro / Módulo</label>
                  <input
                    required
                    value={editLessonSubject}
                    onChange={(e) => setEditLessonSubject(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  />
                </div>

                <div className="teacher-preview-dialog-date-time">
                  <label className="teacher-modal-field-label">{modalLanguage === 'pt' ? 'Data' : modalLanguage === 'es' ? 'Fecha' : 'Date'}</label>
                  <input type="date" value={editLessonStartsAt.slice(0, 10)} onChange={(event) => setEditLessonStartsAt(`${event.target.value}T${editLessonStartsAt.slice(11, 16) || '20:00'}`)} required />
                  <label className="teacher-modal-field-label teacher-preview-dialog-time-label">{modalLanguage === 'pt' ? 'Horário de início' : modalLanguage === 'es' ? 'Hora de inicio' : 'Start time'}</label>
                  <input type="time" value={editLessonStartsAt.slice(11, 16)} onChange={(event) => setEditLessonStartsAt(`${editLessonStartsAt.slice(0, 10)}T${event.target.value}`)} required />
                </div>

                <div className="teacher-preview-dialog-field teacher-preview-dialog-link">
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Link da aula (opcional)</label>
                  <input
                    type="url"
                    value={editLessonMeetingUrl}
                    onChange={(e) => setEditLessonMeetingUrl(e.target.value)}
                    placeholder="https://zoom.us/j/..."
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  />
                </div>

                <div className="teacher-modal-extra-field teacher-lesson-form-duration teacher-preview-dialog-extra">
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(modalLanguage, 'duration_minutes_label')} *</label>
                    <input
                      required
                      type="number"
                      min={15}
                      step={5}
                      value={editLessonDuration}
                      onChange={(e) => setEditLessonDuration(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                    />
                  </div>

                <div className="teacher-modal-extra-field teacher-lesson-form-status teacher-preview-dialog-extra">
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(modalLanguage, 'status')}</label>
                  <select
                    value={editLessonStatus || 'agendada'}
                    onChange={(e) => setEditLessonStatus(e.target.value === 'agendada' ? null : (e.target.value as TeacherLessonStatus))}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  >
                    <option value="happened">{t(modalLanguage, 'status_happened')}</option>
                    <option value="student_no_show">{t(modalLanguage, 'status_student_noshow')}</option>
                    <option value="not_happened">{t(modalLanguage, 'status_not_happened')}</option>
                    <option value="agendada">{t(modalLanguage, 'scheduled_badge')}</option>
                  </select>
                </div>

                <div
                  className="button-row teacher-preview-dialog-actions"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginTop: '1.25rem',
                    borderTop: '1px solid #1e293b',
                    paddingTop: '1rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleDeleteSession([editingLesson.id])}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '0.5rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                    disabled={isSubmitting}
                  >
                    🗑️ {t(modalLanguage, 'delete_class_btn')}
                  </button>

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        const student = profilesById[editLessonStudentId]
                        const url = buildGoogleCalendarInviteUrl({
                          title: `${editLessonSubject} · ${editingLesson.class_name || 'Aula'}`,
                          startsAt: dateTimeLocalToIso(editLessonStartsAt, appTimeZone),
                          durationMinutes: editLessonDuration,
                          attendees: student?.email ? [student.email] : [],
                          meetingUrl: editingLesson.meeting_url,
                        })
                        window.open(url, '_blank', 'noopener,noreferrer')
                      }}
                    >
                      Adicionar ao Google Agenda
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setEditingLesson(null)}
                      disabled={isSubmitting}
                    >
                      {t(modalLanguage, 'cancel')}
                    </button>
                    <button type="submit" className="primary-button" disabled={isSubmitting}>
                      {isSubmitting ? t(modalLanguage, 'saving_label') : t(modalLanguage, 'save_changes_btn')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </section>
  )
}
