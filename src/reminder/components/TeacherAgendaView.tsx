import { addMinutes, format } from 'date-fns'
import { CalendarPlus, Check, Clock3, Video, X } from 'lucide-react'
import type { Lesson, Profile, TeacherAvailability, TeacherLessonStatus } from '../lib/types'
import MobileCalendar, { type CalendarEventItem } from './MobileCalendar'

type TeacherAgendaViewProps = {
  profile: Profile
  lessons: Lesson[]
  students: Profile[]
  profilesById: Record<string, Profile>
  availabilities: TeacherAvailability[]
  language: string
  pendingConfirmation: Lesson | null
  upcomingLessons: Lesson[]
  completedCount: number
  accruedAmount: number
  onUpdateLessonStatus: (lessonId: string, status: TeacherLessonStatus) => Promise<void>
  onOpenLesson: (lesson: Lesson) => void
  onAddLesson: () => void
  onAddAvailability: () => void
}

const getStudentNames = (lesson: Lesson, profilesById: Record<string, Profile>, students: Profile[]) => {
  const student = profilesById[lesson.student_id] ?? students.find((item) => item.id === lesson.student_id)
  return student?.full_name ?? lesson.class_name ?? 'Aluno'
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
  pendingConfirmation,
  upcomingLessons,
  completedCount,
  accruedAmount,
  onUpdateLessonStatus,
  onOpenLesson,
  onAddLesson,
  onAddAvailability,
}: TeacherAgendaViewProps) {
  const visualPreview = typeof window !== 'undefined' && window.location.hostname.startsWith('nativo-site-git-refactor-teach-')
  const previewClassStudents = '4 alunos (Ladiele, Adielson, Jadson, Renan)'
  const calendarEvents: CalendarEventItem[] = [
    ...(visualPreview ? [] : lessons
      .filter((lesson) => lesson.teacher_id === profile.id)
      .map((lesson) => ({
        id: lesson.id,
        type: 'lesson' as const,
        start: new Date(lesson.starts_at),
        end: new Date(lesson.ends_at ?? addMinutes(new Date(lesson.starts_at), lesson.duration_minutes || 60).toISOString()),
        title: lesson.subject || 'Aulas de Inglês',
        subtitle: getStudentNames(lesson, profilesById, students),
        color: lesson.teacher_lesson_status === 'happened' ? ('green' as const) : ('blue' as const),
        sourceData: lesson,
      }))),
    ...(visualPreview ? [] : availabilities
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
      }))),
  ]

  const nextLesson = (visualPreview ? lessons.find((lesson) => lesson.id === 'preview-lesson-next') : upcomingLessons[0])
    ?? lessons.find((lesson) => lesson.teacher_id === profile.id)
    ?? null
  const currencyAmount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(accruedAmount)
  const todayLabel = pendingConfirmation
    ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(pendingConfirmation.starts_at))
    : new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date())

  return (
    <div className="teacher-agenda-view">
      {pendingConfirmation && (
        <section className="teacher-confirmation-banner" aria-label="Status da aula pendente">
          <div className="teacher-confirmation-banner__copy">
            <span className="teacher-confirmation-banner__icon" aria-hidden="true">!</span>
            <p>
              <strong>1 aula precisa de confirmação:</strong>{' '}
              {visualPreview ? 'Adielson Pires' : getStudentNames(pendingConfirmation, profilesById, students)} — {visualPreview ? '7 de set.' : todayLabel}, {visualPreview ? '20:00' : formatTime(pendingConfirmation.starts_at)} ({visualPreview ? 'Turma Fluência' : pendingConfirmation.subject})
            </p>
          </div>
          <div className="teacher-confirmation-banner__actions">
            <button type="button" className="teacher-status-button teacher-status-button--done" onClick={() => void onUpdateLessonStatus(pendingConfirmation.id, 'happened')}>
              <Check size={13} aria-hidden="true" /> Realizada
            </button>
            <button type="button" className="teacher-status-button teacher-status-button--absence" onClick={() => void onUpdateLessonStatus(pendingConfirmation.id, 'student_no_show')}>
              Não compareceu
            </button>
            <button type="button" className="teacher-status-button teacher-status-button--cancel" onClick={() => void onUpdateLessonStatus(pendingConfirmation.id, 'not_happened')}>
              <X size={13} aria-hidden="true" /> Cancelada
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
              <strong>{visualPreview ? 'Hoje • 20:00 – 21:00' : `${format(new Date(nextLesson.starts_at), "'Hoje' • HH:mm")} – ${format(new Date(nextLesson.ends_at ?? addMinutes(new Date(nextLesson.starts_at), nextLesson.duration_minutes || 60).toISOString()), 'HH:mm')}`}</strong>
            </div>
            <div className="teacher-next-lesson-card__title">
              <h2>{visualPreview ? 'Aulas de Inglês · Turma' : `${nextLesson.subject || 'Aulas de Inglês'} · ${nextLesson.class_name || 'Turma'}`}</h2>
              <span>{visualPreview ? previewClassStudents : getStudentNames(nextLesson, profilesById, students)}</span>
            </div>
          </div>
          <div className="teacher-next-lesson-card__actions">
            <button type="button" className="teacher-soft-button" onClick={() => onOpenLesson(nextLesson)}>Ver detalhes</button>
            <button type="button" className="teacher-join-button" onClick={() => window.open('https://meet.google.com', '_blank', 'noopener,noreferrer')}>
              <Video size={14} aria-hidden="true" /> Entrar na aula
            </button>
          </div>
        </section>
      )}

      <section className="teacher-summary-grid" aria-label="Resumo do mês">
        <SummaryCard value={String(visualPreview ? 3 : upcomingLessons.length)} label="próximas aulas" tone="blue" />
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
            <button type="button" className="teacher-availability-button" onClick={onAddAvailability}>
              <Clock3 size={14} aria-hidden="true" /> Disponibilidade
            </button>
            <button type="button" className="teacher-new-lesson-button" onClick={onAddLesson}>
              <CalendarPlus size={15} aria-hidden="true" /> Nova aula
            </button>
          </div>
        </div>
        <MobileCalendar
          events={calendarEvents}
          language={language}
          onSelectEvent={(event) => {
            if (event.type === 'lesson') onOpenLesson(event.sourceData as Lesson)
          }}
          onSelectSlot={onAddAvailability}
        />
      </section>
    </div>
  )
}
