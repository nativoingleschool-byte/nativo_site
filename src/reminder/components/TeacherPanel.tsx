import { FormEvent, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Lesson, Profile, AccountFormState, TeacherLessonStatus } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { formatShortDate, badgeClass, isoToDateTimeLocal, dateTimeLocalToIso, groupLessonsIntoTeacherSessions, TeacherLessonSession } from '../lib/utils'
import { supabase } from '../lib/supabase'
import AdminCalendar from './AdminCalendar'
import { useToast } from '../lib/toast'

interface TeacherPanelProps {
  language: Language
  teacherTab: 'calendar' | 'worklog' | 'profile'
  setTeacherTab: (tab: 'calendar' | 'worklog' | 'profile') => void
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
  }) => Promise<void>
  updateTeacherLessonGroup: (draft: {
    lesson_ids: string[]
    student_ids: string[]
    subject: string
    class_name: string
    teacher_id: string
    starts_at: string
    duration_minutes: number
  }) => Promise<void>
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
    teacher_lesson_status?: TeacherLessonStatus
    status?: 'agendada' | 'concluida' | 'cancelada'
  }) => Promise<Lesson | undefined>
  updateTeacherSingleLesson?: (draft: {
    lesson_id: string
    subject?: string
    class_name?: string
    student_id?: string
    teacher_id?: string
    starts_at?: string
    duration_minutes?: number
    teacher_lesson_status?: TeacherLessonStatus
    status?: 'agendada' | 'concluida' | 'cancelada'
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
  accountForm: AccountFormState
  setAccountForm: React.Dispatch<React.SetStateAction<AccountFormState>>
  accountSaving: boolean
  setAccountSaving: (saving: boolean) => void
  focusedLessonId: string | null
}

export default function TeacherPanel({
  language,
  teacherTab,
  setTeacherTab,
  students,
  teachers,
  profile,
  lessons,
  appTimeZone,
  createLessonFromDraft,
  updateTeacherLessonGroup,
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
  accountForm,
  setAccountForm,
  accountSaving,
  setAccountSaving,
  focusedLessonId,
}: TeacherPanelProps) {
  const { toast } = useToast()
  const formatShortDateLabel = (value: string) => formatShortDate(value, language, appTimeZone)

  // Worklog Month & Filter states
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'happened' | 'scheduled' | 'issues'>('all')

  // Modals for adding and editing classes
  const [showAddLessonModal, setShowAddLessonModal] = useState(false)
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Add Lesson Form State
  const [newLessonStudentId, setNewLessonStudentId] = useState('')
  const [newLessonStudentName, setNewLessonStudentName] = useState('')
  const [addStudentMode, setAddStudentMode] = useState<'select' | 'custom'>('select')
  const [newLessonSubject, setNewLessonSubject] = useState('')
  const [newLessonStartsAt, setNewLessonStartsAt] = useState('')
  const [newLessonDuration, setNewLessonDuration] = useState(60)
  const [newLessonStatus, setNewLessonStatus] = useState<TeacherLessonStatus>('happened')

  // Edit Lesson Form State
  const [editLessonStudentId, setEditLessonStudentId] = useState('')
  const [editLessonStudentName, setEditLessonStudentName] = useState('')
  const [editLessonSubject, setEditLessonSubject] = useState('')
  const [editLessonStartsAt, setEditLessonStartsAt] = useState('')
  const [editLessonDuration, setEditLessonDuration] = useState(60)
  const [editLessonStatus, setEditLessonStatus] = useState<TeacherLessonStatus>('happened')

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

  // Filter lessons for this teacher
  const teacherLessons = useMemo(
    () => lessons.filter((l) => l.teacher_id === profile.id),
    [lessons, profile.id]
  )

  // Generate available months list from teacher lessons
  const availableMonths = useMemo(() => {
    const monthsMap = new Map<string, string>()
    teacherLessons.forEach((l) => {
      if (l.starts_at) {
        const key = l.starts_at.slice(0, 7)
        if (!monthsMap.has(key)) {
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

    const currentMonthKey = new Date().toISOString().slice(0, 7)
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
    return availableMonths[0]?.[0] || new Date().toISOString().slice(0, 7)
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
    () => completedSessions.reduce((acc, s) => acc + s.duration_minutes, 0),
    [completedSessions]
  )
  const totalHours = totalMinutes / 60
  const hourlyRate = profile.taxa_hora_aula ?? 56.0
  const currency = profile.moeda_taxa ?? 'BRL'
  const totalAmount = totalHours * Number(hourlyRate)

  // Filtered sessions for display
  const displayedSessions = useMemo(() => {
    if (statusFilter === 'happened') return completedSessions
    if (statusFilter === 'scheduled') return scheduledSessions
    if (statusFilter === 'issues') return issueSessions
    return monthSessions
  }, [monthSessions, completedSessions, scheduledSessions, issueSessions, statusFilter])

  const lessonCardClass = (sessionId: string) =>
    focusedLessonId === sessionId ? 'lesson-card lesson-card-focus' : 'lesson-card'

  // Open Add Lesson Modal
  const handleOpenAddLesson = () => {
    if ((!students || students.length === 0) && refreshProfiles) {
      void refreshProfiles()
    }
    const defaultStudent = sortedStudents[0]?.id || '__NEW__'
    setNewLessonStudentId(defaultStudent)
    setNewLessonStudentName('')
    setNewLessonSubject(t(language, 'individual_class'))
    setNewLessonDuration(60)
    setNewLessonStatus('happened')

    // Set initial date within active month
    const now = new Date()
    const currentMonthPrefix = now.toISOString().slice(0, 7)
    let initialDateStr = ''
    if (activeMonthKey === currentMonthPrefix) {
      initialDateStr = isoToDateTimeLocal(now.toISOString(), appTimeZone)
    } else {
      const [yr, mo] = activeMonthKey.split('-')
      const targetDate = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 15, 14, 0, 0)
      initialDateStr = isoToDateTimeLocal(targetDate.toISOString(), appTimeZone)
    }
    setNewLessonStartsAt(initialDateStr)
    setShowAddLessonModal(true)
  }

  // Submit Add Lesson
  const handleAddLessonSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const isCustom = newLessonStudentId === '__NEW__' || !newLessonStudentId
    const studentIdentifier = isCustom ? newLessonStudentName.trim() : newLessonStudentId
    if (!studentIdentifier || !newLessonSubject.trim() || !newLessonStartsAt) {
      toast.error(t(language, 'fill_required_fields'))
      return
    }

    setIsSubmitting(true)
    try {
      const utcIso = dateTimeLocalToIso(newLessonStartsAt, appTimeZone)
      const studentProfile = profilesById[newLessonStudentId]
      const className = studentProfile?.class_name || ''

      if (createTeacherSingleLesson) {
        await createTeacherSingleLesson({
          student_id: studentIdentifier,
          teacher_id: profile.id,
          subject: newLessonSubject.trim(),
          class_name: className,
          starts_at: utcIso,
          duration_minutes: newLessonDuration,
          teacher_lesson_status: newLessonStatus,
          status: newLessonStatus === 'happened' ? 'concluida' : 'agendada',
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
              teacher_lesson_status: newLessonStatus,
              status: newLessonStatus === 'happened' ? 'concluida' : 'agendada',
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
  const handleOpenEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson)
    setEditLessonStudentId(lesson.student_id)
    setEditLessonSubject(lesson.subject)
    setEditLessonDuration(lesson.duration_minutes || 60)
    setEditLessonStatus(lesson.teacher_lesson_status ?? null)
    setEditLessonStartsAt(isoToDateTimeLocal(lesson.starts_at, appTimeZone))
  }

  // Submit Edit Lesson
  const handleEditLessonSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingLesson) return
    if (!editLessonStudentId || !editLessonSubject.trim() || !editLessonStartsAt) {
      toast.error(t(language, 'fill_required_fields'))
      return
    }

    setIsSubmitting(true)
    try {
      const utcIso = dateTimeLocalToIso(editLessonStartsAt, appTimeZone)
      const studentProfile = profilesById[editLessonStudentId]
      const className = studentProfile?.class_name || editingLesson.class_name || ''

      if (updateTeacherSingleLesson) {
        await updateTeacherSingleLesson({
          lesson_id: editingLesson.id,
          student_id: editLessonStudentId,
          teacher_id: profile.id,
          subject: editLessonSubject.trim(),
          class_name: className,
          starts_at: utcIso,
          duration_minutes: editLessonDuration,
          teacher_lesson_status: editLessonStatus,
          status: editLessonStatus === 'happened' ? 'concluida' : editLessonStatus === 'not_happened' ? 'cancelada' : 'agendada',
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
              student_id: editLessonStudentId,
              teacher_id: profile.id,
              subject: editLessonSubject.trim(),
              class_name: className,
              starts_at: utcIso,
              duration_minutes: editLessonDuration,
              teacher_lesson_status: editLessonStatus,
              status: editLessonStatus === 'happened' ? 'concluida' : editLessonStatus === 'not_happened' ? 'cancelada' : 'agendada',
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

      if (updateTeacherSingleLesson && lessonIds.length === 1) {
        await updateTeacherSingleLesson({
          lesson_id: lessonIds[0],
          teacher_lesson_status: newStatus,
          status: newStatus === 'happened' ? 'concluida' : newStatus === 'not_happened' ? 'cancelada' : 'agendada',
        })
      } else {
        const { error } = await supabase
          .from('lessons')
          .update({
            teacher_lesson_status: newStatus,
            status: newStatus === 'happened' ? 'concluida' : newStatus === 'not_happened' ? 'cancelada' : 'agendada',
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
    const formEl = e.currentTarget
    const studentId = (formEl.elements.namedItem('studentId') as HTMLSelectElement).value
    const subject = (formEl.elements.namedItem('subject') as HTMLInputElement).value
    const start = (formEl.elements.namedItem('start') as HTMLInputElement).value
    if (!studentId || !subject || !start) return

    try {
      const startsAt = new Date(start)

      const { error } = await supabase.from('lessons').insert({
        subject,
        class_name: 'Custom proposed class',
        student_id: studentId,
        teacher_id: profile.id,
        starts_at: startsAt.toISOString(),
        duration_minutes: 60,
        status: 'proposta_pendente',
      })
      if (error) throw error
      toast.success(t(language, 'proposal_sent_success'))
      formEl.reset()
      await refreshLessons()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleUploadNf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return
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

          const res = await fetch('/api/me/upload-nf', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              status_nota_fiscal: 'enviada',
              nota_fiscal_url: fileDataUrl,
            }),
          })

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: t(language, 'error_uploading_nf') }))
            throw new Error(err.error || t(language, 'error_uploading_nf'))
          }

          toast.success(t(language, 'nf_upload_success'))
          await refreshProfile(profile.id)
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

  const handleSaveTeacherData = async (e: FormEvent) => {
    e.preventDefault()
    setAccountSaving(true)
    const targetForm = e.currentTarget as HTMLFormElement
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: accountForm.full_name,
          email: accountForm.email,
          chave_pix: (targetForm.elements.namedItem('chavePix') as HTMLInputElement).value,
          cnpj: (targetForm.elements.namedItem('cnpj') as HTMLInputElement).value,
        })
        .eq('id', profile.id)
      if (error) throw error
      toast.success(t(language, 'data_updated_success'))
      await refreshProfile(profile.id)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setAccountSaving(false)
    }
  }

  return (
    <section className="panel-grid">
      <article className="panel">
        <div className="panel-header animate-fade-in">
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
        </div>

        {teacherTab === 'calendar' && (
          <div className="space-y-6 animate-fade-in">
            <div
              className="form-card mb-6"
              style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '1.5rem' }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#fff' }}>
                {t(language, 'propose_new_class_title')}
              </h3>
              <form onSubmit={handleProposeClass} className="form-grid" style={{ gap: '0.75rem', display: 'flex', flexWrap: 'wrap' }}>
                <select name="studentId" required style={{ flex: 1, minWidth: '150px' }}>
                  <option value="">{t(language, 'select_student')}</option>
                  {sortedStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} {s.class_name ? `(${s.class_name})` : ''}
                    </option>
                  ))}
                </select>
                <input name="subject" required placeholder={t(language, 'subject_topic')} style={{ flex: 1, minWidth: '150px' }} />
                <input name="start" required type="datetime-local" style={{ flex: 1, minWidth: '180px' }} />
                <button className="primary-button" style={{ padding: '0.75rem 1.5rem' }}>
                  {t(language, 'propose_time_btn')}
                </button>
              </form>
            </div>

            <AdminCalendar
              lessons={lessons}
              profilesById={profilesById}
              students={sortedStudents}
              teachers={teachers}
              timeZone={appTimeZone}
              language={language}
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
            <section style={{ flex: 1.4 }}>
              {/* Header with Month Selector & Add Lesson Button */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.25rem',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff', margin: 0 }}>{t(language, 'classes_taught_month')}</h3>
                  <p className="muted text-xs">{t(language, 'manage_classes_subtitle')}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <select
                    value={activeMonthKey}
                    onChange={(e) => setSelectedMonthKey(e.target.value)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#090d16',
                      border: '1px solid #334155',
                      borderRadius: '0.6rem',
                      color: '#fff',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                    }}
                  >
                    {availableMonths.map(([mKey, mLabel]) => (
                      <option key={mKey} value={mKey}>
                        {mLabel}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="primary-button"
                    style={{ padding: '0.5rem 1.1rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    onClick={handleOpenAddLesson}
                  >
                    <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
                    <span>{t(language, 'add_class')}</span>
                  </button>
                </div>
              </div>

              {/* Monthly KPI Summary Bar */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '0.85rem', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t(language, 'classes_conducted')}
                  </span>
                  <strong style={{ fontSize: '1.3rem', color: '#fff' }}>
                    {completedSessions.length} <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'normal' }}>/ {monthSessions.length}</span>
                  </strong>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '0.85rem', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t(language, 'total_hours_worked')}
                  </span>
                  <strong style={{ fontSize: '1.3rem', color: '#38bdf8' }}>{totalHours.toFixed(1)}h</strong>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '0.85rem', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t(language, 'calculated_amount')}
                  </span>
                  <strong style={{ fontSize: '1.3rem', color: '#10b981' }}>
                    {currency === 'BRL' ? 'R$' : currency} {totalAmount.toFixed(2)}
                  </strong>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '0.85rem', borderRadius: '0.75rem', textAlign: 'center', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t(language, 'payments')}
                  </span>
                  <span className={badgeClass(profile.status_pagamento_professor === 'pago' ? 'confirmed' : 'pending')} style={{ marginTop: '4px', display: 'inline-block' }}>
                    {profile.status_pagamento_professor === 'pago' ? `${t(language, 'paid')} ✓` : t(language, 'pending')}
                  </span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div
                style={{
                  display: 'flex',
                  gap: '0.4rem',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
                  paddingBottom: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: statusFilter === 'all' ? '#38bdf8' : 'transparent',
                    color: statusFilter === 'all' ? '#0f172a' : '#94a3b8',
                  }}
                >
                  {t(language, 'all_filter')} ({monthSessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('happened')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: statusFilter === 'happened' ? '#10b981' : 'transparent',
                    color: statusFilter === 'happened' ? '#0f172a' : '#94a3b8',
                  }}
                >
                  {t(language, 'status_happened')} ({completedSessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('scheduled')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: statusFilter === 'scheduled' ? '#818cf8' : 'transparent',
                    color: statusFilter === 'scheduled' ? '#0f172a' : '#94a3b8',
                  }}
                >
                  {t(language, 'scheduled_badge')} ({scheduledSessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('issues')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: statusFilter === 'issues' ? '#f59e0b' : 'transparent',
                    color: statusFilter === 'issues' ? '#0f172a' : '#94a3b8',
                  }}
                >
                  {t(language, 'issues_filter')} ({issueSessions.length})
                </button>
              </div>

              {/* Lessons List with Quick Actions & Modify Button */}
              <div className="list-stack">
                {displayedSessions.map((session) => {
                  const studentNames = session.student_ids
                    .map((id) => profilesById[id]?.full_name || t(language, 'role_student'))
                    .join(', ')

                  const isHappened = session.is_happened
                  const isNoShow = session.is_no_show
                  const isNotHappened = session.is_cancelled
                  const isScheduled = session.is_scheduled

                  const sessionHours = (session.duration_minutes || 60) / 60
                  const sessionValue = isHappened ? sessionHours * Number(hourlyRate) : 0
                  const allLessonIds = session.lessons.map((l) => l.id)

                  return (
                    <div
                      key={session.key}
                      className={lessonCardClass(session.key)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        padding: '1rem',
                        background: isHappened ? 'rgba(16, 185, 129, 0.05)' : 'rgba(15, 23, 42, 0.6)',
                        border: isHappened ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(148, 163, 184, 0.12)',
                        borderRadius: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong style={{ fontSize: '1rem', color: '#fff' }}>{session.subject || t(language, 'individual_class')}</strong>
                            {session.class_name && (
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(51, 65, 85, 0.5)', padding: '0.1rem 0.4rem', borderRadius: '0.3rem' }}>
                                {session.class_name}
                              </span>
                            )}
                            {session.student_ids.length > 1 && (
                              <span className="badge badge-confirmed" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
                                👥 Turma ({session.student_ids.length} alunos)
                              </span>
                            )}
                          </div>
                          <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                            {session.student_ids.length > 1 ? (
                              <span>👥 <strong>{studentNames}</strong> · 📅 {formatShortDateLabel(session.starts_at)} ({session.duration_minutes || 60} min)</span>
                            ) : (
                              <span>👤 {t(language, 'student_colon')} <strong style={{ color: '#38bdf8' }}>{studentNames}</strong> · 📅 {formatShortDateLabel(session.starts_at)} ({session.duration_minutes || 60} min)</span>
                            )}
                          </p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span
                            className={badgeClass(
                              isHappened ? 'confirmed' : isNoShow ? 'pending' : isNotHappened ? 'danger' : 'secondary'
                            )}
                          >
                            {isHappened ? `${t(language, 'status_happened')}` : isNoShow ? t(language, 'status_student_noshow') : isNotHappened ? t(language, 'status_not_happened') : t(language, 'scheduled_badge')}
                          </span>

                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: isHappened ? '#10b981' : '#64748b' }}>
                            {currency === 'BRL' ? 'R$' : currency} {sessionValue.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Card Actions Toolbar */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderTop: '1px solid rgba(148, 163, 184, 0.08)',
                          paddingTop: '0.6rem',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        {/* Quick Status Buttons */}
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', marginRight: '0.2rem' }}>{t(language, 'status')}:</span>
                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(session.lessons, 'happened')}
                            style={{
                              padding: '0.25rem 0.55rem',
                              borderRadius: '0.4rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: isHappened ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
                              color: isHappened ? '#0f172a' : '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                            }}
                            title={t(language, 'status_happened')}
                          >
                            ✓ {t(language, 'status_happened')}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(session.lessons, 'student_no_show')}
                            style={{
                              padding: '0.25rem 0.55rem',
                              borderRadius: '0.4rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: isNoShow ? '#f59e0b' : 'rgba(245, 158, 11, 0.12)',
                              color: isNoShow ? '#0f172a' : '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                            }}
                            title={t(language, 'status_student_noshow')}
                          >
                            {t(language, 'status_student_noshow')}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(session.lessons, 'not_happened')}
                            style={{
                              padding: '0.25rem 0.55rem',
                              borderRadius: '0.4rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: isNotHappened ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                              color: isNotHappened ? '#fff' : '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                            }}
                            title={t(language, 'status_not_happened')}
                          >
                            {t(language, 'status_not_happened')}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(session.lessons, null)}
                            style={{
                              padding: '0.25rem 0.55rem',
                              borderRadius: '0.4rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: isScheduled ? '#6366f1' : 'rgba(99, 102, 241, 0.12)',
                              color: isScheduled ? '#fff' : '#818cf8',
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                            }}
                            title={t(language, 'scheduled_badge')}
                          >
                            {t(language, 'scheduled_badge')}
                          </button>
                        </div>

                        {/* Edit and Delete Buttons */}
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditLesson(session.lessons[0])}
                            className="secondary-button"
                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                          >
                            ✏️ {t(language, 'edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(allLessonIds)}
                            style={{
                              padding: '0.3rem 0.55rem',
                              fontSize: '0.78rem',
                              background: 'transparent',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              borderRadius: '0.5rem',
                            }}
                            title={t(language, 'delete_class_btn')}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {displayedSessions.length === 0 && (
                  <div
                    style={{
                      padding: '2.5rem 1rem',
                      textAlign: 'center',
                      background: 'rgba(15, 23, 42, 0.3)',
                      borderRadius: '1rem',
                      border: '1px dashed #334155',
                    }}
                  >
                    <p className="empty-state" style={{ margin: 0, marginBottom: '0.75rem' }}>
                      {t(language, 'no_classes_month_empty')}
                    </p>
                    <button
                      type="button"
                      className="primary-button"
                      style={{ padding: '0.4rem 1rem', fontSize: '0.82rem' }}
                      onClick={handleOpenAddLesson}
                    >
                      + {t(language, 'add_class')}
                    </button>
                  </div>
                )}
              </div>

              {/* Justifications to Admin */}
              <h3 className="mt-8" style={{ marginTop: '2rem' }}>
                {t(language, 'notes_to_admin_title')}
              </h3>
              <div className="form-card">
                <textarea
                  placeholder={t(language, 'notes_placeholder')}
                  value={teacherNotes}
                  onChange={(e) => setTeacherNotes(e.target.value)}
                  style={{ width: '100%', height: '100px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.75rem', color: '#fff', padding: '0.75rem' }}
                />
                <button
                  className="secondary-button mt-2"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => {
                    if (!teacherNotes.trim()) return
                    toast.success(t(language, 'notes_sent_success'))
                    setTeacherNotes('')
                  }}
                >
                  {t(language, 'send_notes_btn')}
                </button>
              </div>
            </section>

            {/* MEI Invoice Upload Section */}
            <section style={{ flex: 0.8 }}>
              <h3>{t(language, 'nf_submission_title')}</h3>
              <div className="form-card" style={{ background: 'rgba(30,41,59,0.3)', padding: '1rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: profile.status_nota_fiscal === 'enviada' ? '#10b981' : '#ef4444',
                      }}
                    />
                    <span className="text-sm">
                      {t(language, 'nf_previous_month')} <strong>{profile.status_nota_fiscal === 'enviada' ? t(language, 'nf_status_sent') : t(language, 'nf_status_pending')}</strong>
                    </span>
                  </div>

                  {profile.nota_fiscal_url && (
                    <button
                      type="button"
                      className="primary-button"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#0284c7' }}
                      onClick={() => {
                        try {
                          const url = profile.nota_fiscal_url!
                          if (url.startsWith('data:')) {
                            const parts = url.split(',')
                            const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf'
                            const bstr = atob(parts[1])
                            let n = bstr.length
                            const u8arr = new Uint8Array(n)
                            while (n--) {
                              u8arr[n] = bstr.charCodeAt(n)
                            }
                            const blob = new Blob([u8arr], { type: mime })
                            const blobUrl = URL.createObjectURL(blob)
                            const win = window.open(blobUrl, '_blank')
                            if (!win) {
                              const a = document.createElement('a')
                              a.href = blobUrl
                              a.download = `Nota_Fiscal_${profile.full_name.replace(/\s+/g, '_')}.pdf`
                              a.click()
                            }
                          } else {
                            window.open(url, '_blank')
                          }
                        } catch (e) {
                          window.open(profile.nota_fiscal_url!, '_blank')
                        }
                      }}
                    >
                      {t(language, 'view_sent_file')}
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    {profile.status_nota_fiscal === 'enviada' ? t(language, 'replace_resend_nf') : t(language, 'select_nf_file')}
                  </label>
                  <input type="file" accept=".pdf,image/*" disabled={uploadingNf} onChange={handleUploadNf} />
                </div>
                <p className="muted tiny-copy">{t(language, 'nf_exact_value_notice')}</p>
              </div>
            </section>
          </div>
        )}

        {teacherTab === 'profile' && (
          <div className="animate-fade-in" style={{ maxWidth: '500px', margin: '0 auto' }}>
            <form onSubmit={handleSaveTeacherData} className="form-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: '1rem' }}>
                <p className="text-amber-400 font-bold text-xs uppercase tracking-widest block mb-1">{t(language, 'teacher_mei_alert_title')}</p>
                <p className="muted text-xs">
                  {t(language, 'teacher_mei_alert_desc')}
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'full_name')}</label>
                <input
                  required
                  value={accountForm.full_name}
                  onChange={(event) => setAccountForm({ ...accountForm, full_name: event.target.value })}
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'email_optional')}</label>
                <input
                  required
                  type="email"
                  value={accountForm.email}
                  onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })}
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'cnpj_label')}</label>
                <input name="cnpj" placeholder="00.000.000/0001-00" defaultValue={profile.cnpj || ''} />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'pix_label')}</label>
                <input name="chavePix" placeholder="CPF, E-mail..." defaultValue={profile.chave_pix || ''} />
              </div>

              <button className="primary-button mt-4" disabled={accountSaving} style={{ marginTop: '1rem' }}>
                {accountSaving ? t(language, 'saving_label') : t(language, 'save_teacher_data_btn')}
              </button>
            </form>
          </div>
        )}
      </article>

      {/* Modal: Adicionar Aula ao Mês */}
      {showAddLessonModal &&
        createPortal(
          <div
            className="reminder-app-scope modal-overlay"
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
              overflowY: 'auto',
            }}
            onClick={(e) => {
              if (addModalRef.current && !addModalRef.current.contains(e.target as Node)) {
                setShowAddLessonModal(false)
              }
            }}
          >
            <div
              ref={addModalRef}
              className="modal-card animate-fade-in"
              style={{
                maxWidth: '520px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '1.5rem',
                padding: '2rem',
              }}
            >
              <div className="panel-header" style={{ marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
                <div>
                  <p className="section-label">{t(language, 'tab_worklog_nf')}</p>
                  <h2 style={{ fontSize: '1.4rem' }}>{t(language, 'add_class')}</h2>
                </div>
              </div>

              <form onSubmit={handleAddLessonSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest">{t(language, 'student_colon')} *</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (newLessonStudentId === '__NEW__') {
                          setNewLessonStudentId(sortedStudents[0]?.id || '')
                          setNewLessonStudentName('')
                        } else {
                          setNewLessonStudentId('__NEW__')
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#38bdf8',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      {newLessonStudentId === '__NEW__' ? '← Selecionar da lista' : '+ Digitar nome do aluno'}
                    </button>
                  </div>

                  <select
                    required
                    value={newLessonStudentId}
                    onChange={(e) => {
                      setNewLessonStudentId(e.target.value)
                      if (e.target.value !== '__NEW__') {
                        setNewLessonStudentName('')
                      }
                    }}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  >
                    <option value="">{t(language, 'select_student')}...</option>
                    {sortedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} {s.class_name ? `(${s.class_name})` : ''}
                      </option>
                    ))}
                    <option value="__NEW__">✍️ + Digitar outro aluno...</option>
                  </select>

                  {(newLessonStudentId === '__NEW__' || sortedStudents.length === 0) && (
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
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'subject_topic')} *</label>
                  <input
                    required
                    placeholder={t(language, 'subject_placeholder')}
                    value={newLessonSubject}
                    onChange={(e) => setNewLessonSubject(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  />
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                    {['Conversação', 'Inglês Geral', 'Business English', 'Gramática', 'Reforço'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNewLessonSubject(preset)}
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.4rem',
                          fontSize: '0.72rem',
                          background: 'rgba(51, 65, 85, 0.4)',
                          color: '#cbd5e1',
                          border: '1px solid rgba(148, 163, 184, 0.1)',
                        }}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'date_and_time')} *</label>
                    <input
                      required
                      type="datetime-local"
                      value={newLessonStartsAt}
                      onChange={(e) => setNewLessonStartsAt(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'duration_minutes_label')} *</label>
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
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'status')}</label>
                  <select
                    value={newLessonStatus || 'agendada'}
                    onChange={(e) => setNewLessonStatus(e.target.value === 'agendada' ? null : (e.target.value as TeacherLessonStatus))}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  >
                    <option value="happened">✓ {t(language, 'status_happened')}</option>
                    <option value="student_no_show">{t(language, 'status_student_noshow')}</option>
                    <option value="not_happened">{t(language, 'status_not_happened')}</option>
                    <option value="agendada">{t(language, 'scheduled_badge')}</option>
                  </select>
                </div>

                <div className="button-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowAddLessonModal(false)}
                    disabled={isSubmitting}
                  >
                    {t(language, 'cancel')}
                  </button>
                  <button type="submit" className="primary-button" disabled={isSubmitting}>
                    {isSubmitting ? t(language, 'saving_label') : t(language, 'add_class')}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Modificar Aula */}
      {editingLesson &&
        createPortal(
          <div
            className="reminder-app-scope modal-overlay"
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
              overflowY: 'auto',
            }}
            onClick={(e) => {
              if (editModalRef.current && !editModalRef.current.contains(e.target as Node)) {
                setEditingLesson(null)
              }
            }}
          >
            <div
              ref={editModalRef}
              className="modal-card animate-fade-in"
              style={{
                maxWidth: '520px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '1.5rem',
                padding: '2rem',
              }}
            >
              <div className="panel-header" style={{ marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
                <div>
                  <p className="section-label">{t(language, 'adjust_class_label')}</p>
                  <h2 style={{ fontSize: '1.4rem' }}>{t(language, 'modify_class_details')}</h2>
                </div>
              </div>

              <form onSubmit={handleEditLessonSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'student_colon')} *</label>
                  <select
                    required
                    value={editLessonStudentId}
                    onChange={(e) => setEditLessonStudentId(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  >
                    <option value="">{t(language, 'select_student')}...</option>
                    {sortedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} {s.class_name ? `(${s.class_name})` : ''}
                      </option>
                    ))}
                    {editLessonStudentId && !sortedStudents.some((s) => s.id === editLessonStudentId) && (
                      <option value={editLessonStudentId}>
                        {profilesById[editLessonStudentId]?.full_name || 'Aluno Atual'}
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'subject_topic')} *</label>
                  <input
                    required
                    value={editLessonSubject}
                    onChange={(e) => setEditLessonSubject(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  />
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'date_and_time')} *</label>
                    <input
                      required
                      type="datetime-local"
                      value={editLessonStartsAt}
                      onChange={(e) => setEditLessonStartsAt(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'duration_minutes_label')} *</label>
                    <input
                      required
                      type="number"
                      min={15}
                      step={5}
                      value={editLessonDuration}
                      onChange={(e) => setEditLessonDuration(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                    />
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
                      {[30, 45, 60, 90].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setEditLessonDuration(mins)}
                          style={{
                            flex: 1,
                            padding: '0.2rem',
                            borderRadius: '0.3rem',
                            fontSize: '0.72rem',
                            background: editLessonDuration === mins ? '#38bdf8' : 'rgba(51, 65, 85, 0.4)',
                            color: editLessonDuration === mins ? '#0f172a' : '#cbd5e1',
                            fontWeight: editLessonDuration === mins ? 'bold' : 'normal',
                          }}
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">{t(language, 'status')}</label>
                  <select
                    value={editLessonStatus || 'agendada'}
                    onChange={(e) => setEditLessonStatus(e.target.value === 'agendada' ? null : (e.target.value as TeacherLessonStatus))}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.6rem', color: '#fff' }}
                  >
                    <option value="happened">✓ {t(language, 'status_happened')}</option>
                    <option value="student_no_show">{t(language, 'status_student_noshow')}</option>
                    <option value="not_happened">{t(language, 'status_not_happened')}</option>
                    <option value="agendada">{t(language, 'scheduled_badge')}</option>
                  </select>
                </div>

                <div
                  className="button-row"
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
                    🗑️ {t(language, 'delete_class_btn')}
                  </button>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setEditingLesson(null)}
                      disabled={isSubmitting}
                    >
                      {t(language, 'cancel')}
                    </button>
                    <button type="submit" className="primary-button" disabled={isSubmitting}>
                      {isSubmitting ? t(language, 'saving_label') : t(language, 'save_changes_btn')}
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

