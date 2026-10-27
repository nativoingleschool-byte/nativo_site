import { useState } from 'react'
import { createPortal } from 'react-dom'
import { addMinutes, format } from 'date-fns'
import { CalendarPlus, Check, Clock3, Video, X } from 'lucide-react'
import type { Lesson, Profile, TeacherAvailability, TeacherLessonStatus } from '../lib/types'
import { buildGoogleCalendarInviteUrl, dateTimeLocalToIso, groupLessonsIntoTeacherSessions, isoToDateTimeLocal, type TeacherLessonSession } from '../lib/utils'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { useToast } from '../lib/toast'
import MobileCalendar, { type CalendarEventItem } from './MobileCalendar'

type TeacherAgendaViewProps = {
  profile: Profile
  lessons: Lesson[]
  students: Profile[]
  profilesById: Record<string, Profile>
  availabilities: TeacherAvailability[]
  language: string
  visualPreview: boolean
  pendingConfirmation: TeacherLessonSession | null
  upcomingLessons: TeacherLessonSession[]
  completedCount: number
  accruedAmount: number
  appTimeZone: string
  onUpdateLessonStatus: (lessons: Lesson[], status: TeacherLessonStatus) => Promise<void>
  onOpenLesson: (lesson: Lesson, group?: Lesson[]) => void
  onAddLesson: () => void
  onCreateAvailability?: (draft: { starts_at: string; duration_minutes: number; teacher_id?: string }) => Promise<void>
  onDeleteAvailability?: (options: { id: string; series_id?: string | null; starts_at?: string; series_scope?: 'this' | 'future' }) => Promise<void>
}

const getStudentNames = (lesson: Lesson, profilesById: Record<string, Profile>, students: Profile[]) => {
  if (lesson.lesson_kind === 'substitution') return 'Aula de substituição'
  const student = lesson.student_id ? profilesById[lesson.student_id] : undefined
  const resolvedStudent = student ?? students.find((item) => item.id === lesson.student_id)
  return resolvedStudent?.full_name ?? lesson.class_name ?? 'Aluno'
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))

function SummaryCard({ value, label, tone }: { value: string; label: string; tone: 'blue' | 'teal' | 'amber' }) {
  return (
    <article className={`teacher-summary-card teacher-summary-card--${tone}`}>
      <span className="teacher-summary-card__dot" aria-hidden="true" />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  )
}

export default function TeacherAgendaView({
  profile,
  lessons,
  students,
  profilesById,
  availabilities,
  language,
  visualPreview,
  pendingConfirmation,
  upcomingLessons,
  completedCount,
  accruedAmount,
  appTimeZone,
  onUpdateLessonStatus,
  onOpenLesson,
  onAddLesson,
  onCreateAvailability,
  onDeleteAvailability,
}: TeacherAgendaViewProps) {
  const previewClassStudents = '4 alunos (Ladiele, Adielson, Jadson, Renan)'
  const { toast } = useToast()
  const [previewModal, setPreviewModal] = useState<'details' | 'availability' | null>(null)
  const [previewAvailabilities, setPreviewAvailabilities] = useState(availabilities)
  const [availabilityStartsAt, setAvailabilityStartsAt] = useState('')
  const [availabilityDuration, setAvailabilityDuration] = useState(60)
  const [addingWeekday, setAddingWeekday] = useState<number | null>(null)
  const [slotStart, setSlotStart] = useState('08:00')
  const [slotEnd, setSlotEnd] = useState('11:00')
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  useBodyScrollLock(previewModal !== null)
  const displayedAvailabilities = visualPreview ? previewAvailabilities : availabilities
  const openAvailabilityEditor = (start = new Date()) => {
    setAvailabilityStartsAt(isoToDateTimeLocal(start.toISOString(), appTimeZone))
    setAvailabilityDuration(60)
    setPreviewModal('availability')
  }
  const saveAvailability = async () => {
    if (!availabilityStartsAt || availabilityDuration < 15) {
      toast.error('Informe uma data, horário e duração válidos.')
      return
    }
    const starts_at = dateTimeLocalToIso(availabilityStartsAt, appTimeZone)
    try {
      if (visualPreview) {
        setPreviewAvailabilities((items) => [...items, {
          id: `preview-availability-${Date.now()}`,
          teacher_id: profile.id,
          starts_at,
          duration_minutes: availabilityDuration,
        }])
      } else {
        if (!onCreateAvailability) throw new Error('Não foi possível salvar a disponibilidade.')
        await onCreateAvailability({ starts_at, duration_minutes: availabilityDuration, teacher_id: profile.id })
      }
      toast.success('Disponibilidade salva.')
      setPreviewModal(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a disponibilidade.')
    }
  }
  const saveWeeklySlot = async (weekday: number) => {
    const [sh, sm] = slotStart.split(':').map(Number)
    const [eh, em] = slotEnd.split(':').map(Number)
    const duration = eh * 60 + em - sh * 60 - sm
    if (!Number.isFinite(duration) || duration < 15) {
      toast.error('O horário final deve ser pelo menos 15 minutos depois do início.')
      return
    }
    // Pick the next occurrence of the chosen weekday; one saved block in preview
    // and four upcoming occurrences in the real API until weekly availability is standardized.
    const today = new Date()
    const dayOffset = (weekday - today.getDay() + 7) % 7
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset, sh, sm)
    if (day <= today) day.setDate(day.getDate() + 7)
    const starts_at = dateTimeLocalToIso(isoToDateTimeLocal(day.toISOString(), appTimeZone), appTimeZone)
    try {
      if (visualPreview) {
        setPreviewAvailabilities((items) => [...items.filter(item => item.id !== editingSlotId), { id: editingSlotId || `demo-weekday-${weekday}-${Date.now()}`, teacher_id: profile.id, starts_at, duration_minutes: duration }])
      } else {
        if (!onCreateAvailability) throw new Error('Não foi possível salvar disponibilidade.')
        await onCreateAvailability({ starts_at, duration_minutes: duration, teacher_id: profile.id })
      }
      toast.success('Horário adicionado.')
      setAddingWeekday(null)
      setEditingSlotId(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar horário.')
    }
  }
  const weekdayNames = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']
  const removeAvailability = async (availability: TeacherAvailability) => {
    try {
      if (visualPreview) {
        setPreviewAvailabilities((items) => items.filter((item) => item.id !== availability.id))
      } else {
        if (!onDeleteAvailability) throw new Error('Não foi possível remover a disponibilidade.')
        await onDeleteAvailability({
          id: availability.id,
          series_id: availability.series_id,
          starts_at: availability.starts_at,
          series_scope: 'this',
        })
      }
      toast.success('Disponibilidade removida.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover a disponibilidade.')
    }
  }
  const calendarEvents: CalendarEventItem[] = [
    ...groupLessonsIntoTeacherSessions(lessons.filter((lesson) => lesson.teacher_id === profile.id))
      .map((session) => ({
        id: session.key,
        type: 'lesson' as const,
        start: new Date(session.starts_at),
        end: new Date(session.ends_at || addMinutes(new Date(session.starts_at), session.duration_minutes).toISOString()),
        title: session.subject || 'Aulas de Inglês',
        subtitle: session.student_ids.map((id) => profilesById[id]?.full_name ?? students.find((student) => student.id === id)?.full_name).filter(Boolean).join(', ') || (session.lessons[0].lesson_kind === 'substitution' ? 'Aula de substituição' : `${session.student_ids.length} alunos`),
        color: session.is_happened ? ('green' as const) : ('blue' as const),
        sourceData: { ...session.lessons[0], lessonIds: session.lessons.map((lesson) => lesson.id), lessons: session.lessons },
      })),
    ...displayedAvailabilities
      .filter((availability) => availability.teacher_id === profile.id)
      .map((availability) => ({
        id: `availability-${availability.id}`,
        type: 'availability' as const,
        start: new Date(availability.starts_at),
        end: addMinutes(new Date(availability.starts_at), availability.duration_minutes),
        title: 'Disponibilidade',
        subtitle: 'Horário livre',
        color: 'green' as const,
        sourceData: availability,
      })),
  ]

  const nextLesson = visualPreview
    ? lessons.find((lesson) => lesson.id === 'preview-lesson-next') ?? upcomingLessons[0]?.lessons[0] ?? null
    : upcomingLessons[0]?.lessons[0] ?? null
  const nextLessonGroup = nextLesson
    ? groupLessonsIntoTeacherSessions(lessons)
        .find((session) => session.lessons.some((lesson) => lesson.id === nextLesson.id))?.lessons ?? [nextLesson]
    : []
  const currencyAmount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(accruedAmount)
  const todayLabel = pendingConfirmation
    ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(pendingConfirmation.starts_at))
    : new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date())
  const addLessonToGoogleCalendar = (lesson: Lesson, group: Lesson[] = [lesson]) => {
    const url = buildGoogleCalendarInviteUrl({
      title: `${lesson.subject || 'Aulas de Inglês'} · ${lesson.class_name || 'Aula'}`,
      startsAt: lesson.starts_at,
      durationMinutes: lesson.duration_minutes || 60,
      attendees: visualPreview
        ? ['ericlucas.lucas@gmail.com']
        : group.map((item) => profilesById[item.student_id]?.email ?? students.find((candidate) => candidate.id === item.student_id)?.email).filter((email): email is string => Boolean(email)),
      meetingUrl: lesson.meeting_url,
    })
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  const addNextLessonToGoogleCalendar = () => {
    if (!nextLesson) return
    addLessonToGoogleCalendar(nextLesson)
  }
  const handleSelectCalendarEvent = (event: CalendarEventItem) => {
    if (event.type === 'lesson') {
      const lesson = event.sourceData as Lesson & { lessons?: Lesson[] }
      onOpenLesson(lesson, lesson.lessons ?? [lesson])
    }
  }

  return (
    <div className="teacher-agenda-view">
      {pendingConfirmation && (
        <section className="teacher-confirmation-banner" aria-label="Status da aula pendente">
          <div className="teacher-confirmation-banner__copy">
            <span className="teacher-confirmation-banner__icon" aria-hidden="true">!</span>
            <p>
              <strong>1 aula precisa de confirmação:</strong>{' '}
              {pendingConfirmation.student_ids.map((id) => profilesById[id]?.full_name ?? students.find((student) => student.id === id)?.full_name).filter(Boolean).join(', ') || `${pendingConfirmation.student_ids.length} alunos`} — {todayLabel}, {formatTime(pendingConfirmation.starts_at)} ({pendingConfirmation.subject})
            </p>
          </div>
          <div className="teacher-confirmation-banner__actions">
            <button type="button" className="teacher-status-button teacher-status-button--done" onClick={() => void onUpdateLessonStatus(pendingConfirmation.lessons, 'happened')}>
              Realizada
            </button>
            <button type="button" className="teacher-status-button teacher-status-button--absence"             onClick={() => void onUpdateLessonStatus(pendingConfirmation.lessons, 'student_no_show')}>
              Não compareceu
            </button>
            <button type="button" className="teacher-status-button teacher-status-button--cancel"             onClick={() => void onUpdateLessonStatus(pendingConfirmation.lessons, 'not_happened')}>
              Cancelada
            </button>
          </div>
        </section>
      )}

      {nextLesson && (
        <section className="teacher-next-lesson-card">
          <div className="teacher-next-lesson-card__info">
            <div className="teacher-next-lesson-card__eyebrow">
              <span>PRÓXIMA AULA</span>
              <i aria-hidden="true" />
              <strong>{new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', {
                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              }).format(new Date(nextLesson.starts_at))} – {new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', {
                hour: '2-digit', minute: '2-digit',
              }).format(new Date(nextLesson.ends_at ?? addMinutes(new Date(nextLesson.starts_at), nextLesson.duration_minutes || 60).toISOString()))}</strong>
            </div>
            <div className="teacher-next-lesson-card__title">
              <h2>{visualPreview ? 'Aulas de Inglês · Turma' : `${nextLesson.subject || 'Aulas de Inglês'} · ${nextLesson.class_name || 'Turma'}`}</h2>
              <span>{visualPreview ? previewClassStudents : nextLessonGroup.map((lesson) => getStudentNames(lesson, profilesById, students)).join(', ')}</span>
            </div>
          </div>
          <div className="teacher-next-lesson-card__actions">
            <button type="button" className="teacher-soft-button" onClick={() => setPreviewModal('details')}>Ver detalhes</button>
            <button type="button" className="teacher-join-button" onClick={() => nextLesson.meeting_url && window.open(nextLesson.meeting_url, '_blank', 'noopener,noreferrer')} disabled={!nextLesson.meeting_url}>
              <Video size={14} aria-hidden="true" /> Entrar no Zoom
            </button>
          </div>
        </section>
      )}

      <section className="teacher-summary-grid" aria-label="Resumo do mês">
        <SummaryCard value={String(upcomingLessons.length)} label="próximas aulas" tone="blue" />
        <SummaryCard value={String(completedCount)} label="realizada no mês" tone="teal" />
        <SummaryCard value={currencyAmount} label="apurado até o momento" tone="amber" />
      </section>

      <section className="teacher-calendar-card" aria-label="Calendário mensal">
        <div className="teacher-calendar-card__header">
          <div>
            <span className="teacher-calendar-card__eyebrow">AGENDA DO PROFESSOR</span>
            <h2>Calendário de aulas</h2>
          </div>
          <div className="teacher-calendar-card__actions">
            <button type="button" className="teacher-availability-button" onClick={() => openAvailabilityEditor()}>
              <Clock3 size={14} aria-hidden="true" /> Disponibilidade
            </button>
            <button type="button" className="teacher-new-lesson-button" onClick={onAddLesson}>
              <CalendarPlus size={15} aria-hidden="true" /> Nova aula
            </button>
          </div>
        </div>
        <MobileCalendar
            events={calendarEvents}
            language={visualPreview ? 'pt' : language}
            onSelectEvent={handleSelectCalendarEvent}
            onSelectAgendaEvent={(event) => {
              if (event.type === 'lesson') {
                const lesson = event.sourceData as Lesson & { lessons?: Lesson[] }
                addLessonToGoogleCalendar(lesson, lesson.lessons ?? [lesson])
              }
              else handleSelectCalendarEvent(event)
            }}
            onSelectSlot={openAvailabilityEditor}
          />
      </section>

      {previewModal && createPortal(
        <div className="teacher-reference-preview-portal">
          <div className="reference-modal-backdrop" role="presentation" onClick={() => setPreviewModal(null)}>
            <section className={`reference-modal reference-agenda-modal${previewModal === 'availability' ? ' reference-availability-modal' : ''}`} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="reference-modal-close" aria-label="Fechar" onClick={() => setPreviewModal(null)}><X size={18} /></button>
            {previewModal === 'details' && nextLesson && <>
              <span className="reference-kicker">DETALHES DA AULA</span>
              <h2>{visualPreview ? 'Aulas de Inglês · Turma' : `${nextLesson.subject || 'Aulas de Inglês'} · ${nextLesson.class_name || 'Turma'}`}</h2>
              <p className="reference-agenda-modal-date">{visualPreview
                ? 'Hoje · 20:00 – 21:00'
                : new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(nextLesson.starts_at))}</p>
              <div className="reference-detail-grid">
                {visualPreview ? <>
                  <span>Nível<strong>Fluência</strong></span>
                  <span>Alunos<strong>Ladiele, Adielson, Jadson e Renan</strong></span>
                  <span>Sala virtual<strong>Zoom</strong></span>
                  <span>Honorário previsto<strong>R$ 56,00</strong></span>
                </> : <>
                  <span>Alunos<strong>{nextLessonGroup.map((lesson) => getStudentNames(lesson, profilesById, students)).join(', ')}</strong></span>
                  <span>Duração<strong>{nextLesson.duration_minutes || 60} min</strong></span>
                  <span>Status<strong>{nextLesson.teacher_lesson_status === 'happened'
                    ? 'Realizada'
                    : nextLesson.teacher_lesson_status === 'student_no_show'
                      ? 'Não compareceu'
                      : nextLesson.teacher_lesson_status === 'not_happened'
                        ? 'Cancelada'
                        : 'Agendada'}</strong></span>
                  <span>Sala virtual<strong>{nextLesson.meeting_url ? 'Link disponível' : 'Não informada'}</strong></span>
                </>}
              </div>
              <div className="reference-agenda-modal-actions">
                <button type="button" onClick={() => setPreviewModal(null)}>Fechar</button>
                {!visualPreview && <button type="button" onClick={() => { setPreviewModal(null); onOpenLesson(nextLesson, nextLessonGroup) }}>Editar aula</button>}
                <button type="button" onClick={addNextLessonToGoogleCalendar}>Adicionar ao Google Agenda</button>
                <button type="button" className="reference-primary-button" onClick={() => nextLesson.meeting_url && window.open(nextLesson.meeting_url, '_blank', 'noopener,noreferrer')} disabled={!nextLesson.meeting_url}><Video size={15} /> Entrar no Zoom</button>
              </div>
            </>}
            {previewModal === 'availability' && <>
              <div className="teacher-weekly-availability-heading"><h2>Disponibilidade semanal</h2><span className="teacher-weekly-availability-badge">Recorrente</span></div>
              <p className="reference-availability-intro">Defina e gerencie os horários recorrentes em que você está livre para aulas.</p>
              <div className="teacher-weekly-availability-days">
                {[1,2,3,4,5,6,0].map((weekday) => {
                  const daySlots = displayedAvailabilities
                    .filter((slot) => slot.teacher_id === profile.id && new Date(slot.starts_at).getDay() === weekday)
                    .sort((left,right) => left.starts_at.localeCompare(right.starts_at))
                  return <section className="teacher-weekly-availability-day" key={weekday}>
                    <div className="teacher-weekly-availability-day__header">
                      <strong>{weekdayNames[weekday]}</strong>
                      <button type="button" onClick={() => { setEditingSlotId(null); setAddingWeekday(addingWeekday === weekday ? null : weekday) }}>+ Adicionar horário</button>
                    </div>
                    {daySlots.length === 0 && <div className="teacher-weekly-availability-empty-row"><p className="teacher-weekly-availability-empty">Nenhum horário cadastrado</p><span>Indisponível</span></div>}
                    {daySlots.map((slot) => {
                      const start = new Date(slot.starts_at)
                      const end = addMinutes(start, slot.duration_minutes)
                      return <div className="teacher-weekly-availability-slot" key={slot.id}>
                        <span className="teacher-weekly-availability-dot" />
                        <strong>{format(start,'HH:mm')} às {format(end,'HH:mm')}</strong>
                        <div className="teacher-weekly-availability-slot__actions"><button type="button" onClick={() => {setEditingSlotId(slot.id);setSlotStart(format(start,'HH:mm'));setSlotEnd(format(end,'HH:mm'));setAddingWeekday(weekday)}}>Editar</button><button type="button" onClick={() => void removeAvailability(slot)}>Remover</button></div>
                      </div>
                    })}
                    {addingWeekday === weekday && <div className="teacher-weekly-availability-editor">
                      <label>Início<input type="time" value={slotStart} onChange={(event) => setSlotStart(event.target.value)}/></label>
                      <label>Término<input type="time" value={slotEnd} onChange={(event) => setSlotEnd(event.target.value)}/></label>
                      <button type="button" onClick={() => void saveWeeklySlot(weekday)}>{editingSlotId ? 'Salvar horário' : 'Adicionar'}</button>
                      <button type="button" onClick={() => {setAddingWeekday(null);setEditingSlotId(null)}}>Cancelar</button>
                    </div>}
                  </section>
                })}
              </div>
              <div className="reference-agenda-modal-actions">
                <span className="teacher-weekly-availability-caption">Horários sincronizados com sua grade da coordenação</span>
                <button type="button" className="teacher-weekly-availability-close" onClick={() => setPreviewModal(null)}>Fechar</button>
                <button type="button" className="reference-primary-button" onClick={() => setPreviewModal(null)}>Salvar</button>
              </div>
            </>}            </section>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
