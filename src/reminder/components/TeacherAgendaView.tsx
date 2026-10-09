import { useState } from 'react'
import { addMinutes, format } from 'date-fns'
import { CalendarPlus, Check, Clock3, Video, X } from 'lucide-react'
import type { Lesson, Profile, TeacherAvailability, TeacherLessonStatus } from '../lib/types'
import { buildGoogleCalendarInviteUrl } from '../lib/utils'
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
  onCreatePreviewLesson?: (draft: { subject: string; class_name: string; student_ids: string[]; teacher_id: string; starts_at: string; duration_minutes: number }) => Promise<void>
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
  onCreatePreviewLesson,
  onAddAvailability,
}: TeacherAgendaViewProps) {
  const visualPreview = typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app') && (window.location.hostname.startsWith('nativo-site-') || window.location.hostname.startsWith('lesslesson-reminder-')) && new URLSearchParams(window.location.search).has('preview')
  const previewClassStudents = '4 alunos (Ladiele, Adielson, Jadson, Renan)'
  const [previewModal, setPreviewModal] = useState<'details' | 'new' | 'availability' | null>(null)
  const [availabilityEditorOpen, setAvailabilityEditorOpen] = useState(false)
  const [previewStudents, setPreviewStudents] = useState(['Ladiele Rodrigues'])
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
  const nextLessonStudent = nextLesson ? profilesById[nextLesson.student_id] ?? students.find((item) => item.id === nextLesson.student_id) : null
  const addNextLessonToGoogleCalendar = () => {
    if (!nextLesson) return
    const url = buildGoogleCalendarInviteUrl({
      title: `${nextLesson.subject} · ${nextLesson.class_name}`,
      startsAt: nextLesson.starts_at,
      durationMinutes: nextLesson.duration_minutes || 60,
      attendees: visualPreview
        ? ['ericlucas.lucas@gmail.com']
        : nextLessonStudent?.email ? [nextLessonStudent.email] : [],
      meetingUrl: nextLesson.meeting_url,
    })
    window.open(url, '_blank', 'noopener,noreferrer')
  }

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
            <button type="button" className="teacher-soft-button" onClick={() => visualPreview ? setPreviewModal('details') : onOpenLesson(nextLesson)}>Ver detalhes</button>
            <button type="button" className="teacher-join-button" onClick={() => nextLesson.meeting_url && window.open(nextLesson.meeting_url, '_blank', 'noopener,noreferrer')} disabled={!nextLesson.meeting_url}>
              <Video size={14} aria-hidden="true" /> Entrar no Zoom
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
            <button type="button" className="teacher-availability-button" onClick={() => visualPreview ? setPreviewModal('availability') : onAddAvailability()}>
              <Clock3 size={14} aria-hidden="true" /> Disponibilidade
            </button>
            <button type="button" className="teacher-new-lesson-button" onClick={() => visualPreview ? setPreviewModal('new') : onAddLesson()}>
              <CalendarPlus size={15} aria-hidden="true" /> Nova aula
            </button>
          </div>
        </div>
        <MobileCalendar
          events={calendarEvents}
          language={visualPreview ? 'pt' : language}
          onSelectEvent={(event) => {
            if (event.type === 'lesson') onOpenLesson(event.sourceData as Lesson)
          }}
            onSelectSlot={() => visualPreview ? setPreviewModal('availability') : onAddAvailability()}
          />
      </section>

      {visualPreview && previewModal && (
        <div className="reference-modal-backdrop" role="presentation" onClick={() => setPreviewModal(null)}>
          <section className={`reference-modal reference-agenda-modal${previewModal === 'availability' ? ' reference-availability-modal' : ''}`} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="reference-modal-close" aria-label="Fechar" onClick={() => setPreviewModal(null)}><X size={18} /></button>
            {previewModal === 'details' && <>
              <span className="reference-kicker">DETALHES DA AULA</span>
              <h2>Aulas de Inglês · Turma</h2>
              <p className="reference-agenda-modal-date">Hoje · 20:00 – 21:00</p>
              <div className="reference-detail-grid"><span>Nível<strong>Fluência</strong></span><span>Alunos<strong>Ladiele, Adielson, Jadson e Renan</strong></span><span>Sala virtual<strong>Zoom</strong></span><span>Honorário previsto<strong>R$ 56,00</strong></span></div>
              <div className="reference-agenda-modal-actions"><button type="button" onClick={() => setPreviewModal(null)}>Fechar</button><button type="button" onClick={addNextLessonToGoogleCalendar}>Adicionar ao Google Agenda</button><button type="button" className="reference-primary-button" onClick={() => nextLesson.meeting_url && window.open(nextLesson.meeting_url, '_blank', 'noopener,noreferrer')} disabled={!nextLesson.meeting_url}><Video size={15} /> Entrar no Zoom</button></div>
            </>}
            {previewModal === 'new' && <>
              <span className="reference-kicker">AGENDA DO PROFESSOR</span>
              <h2>Adicionar Nova Aula</h2>
              <div className="reference-modal-form-grid reference-new-lesson-grid"><label className="is-wide">Título do Encontro / Módulo<input defaultValue="Aulas de Inglês · Turma Fluência" /></label><label>Data<input type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><label>Horário de Início<input type="time" defaultValue="20:00" /></label><label className="is-wide">Link da aula (Zoom, opcional)<input defaultValue="https://zoom.us/j/00000000000" /></label><div className="is-wide reference-student-checkboxes"><span>Alunos</span>{['Ladiele Rodrigues', 'Adielson Pires', 'Jadson Bibiano', 'Renan Vasconcelos'].map((name) => <label key={name}><input type="checkbox" checked={previewStudents.includes(name)} onChange={(event) => setPreviewStudents((current) => event.target.checked ? [...new Set([...current, name])] : current.filter((item) => item !== name))} />{name}</label>)}</div></div>
              <div className="reference-agenda-modal-actions"><button type="button" onClick={() => setPreviewModal(null)}>Cancelar</button><button type="button" className="reference-primary-button" onClick={() => { const selectedIds = students.filter((student) => previewStudents.includes(student.full_name)).map((student) => student.id); void onCreatePreviewLesson?.({ subject: 'Aulas de Inglês', class_name: 'Turma Fluência', student_ids: selectedIds.length > 0 ? selectedIds : students.slice(0, 1).map((student) => student.id), teacher_id: profile.id, starts_at: new Date().toISOString(), duration_minutes: 60 }); setPreviewModal(null) }}>Salvar</button></div>
            </>}
            {previewModal === 'availability' && <>
              <span className="reference-kicker">AGENDA DO PROFESSOR</span>
              <h2>Disponibilidade semanal</h2>
              <p className="reference-availability-intro">Define e gerencie os horários recorrentes em que você está livre para aulas.</p>
              <span className="reference-availability-badge">Recorrente</span>
              <div className="reference-availability-list reference-availability-list--full">
                {[
                  ['Segunda-feira', ['08:00 às 11:00', '19:00 às 22:00']],
                  ['Terça-feira', []],
                  ['Quarta-feira', ['08:00 às 11:00', '19:00 às 22:00']],
                  ['Quinta-feira', []],
                  ['Sexta-feira', []],
                ].map(([day, slots]) => <div className="reference-availability-day" key={day as string}>
                  <strong>{day as string}</strong>
                  <button type="button" onClick={() => setAvailabilityEditorOpen(true)}>+ Adicionar horário</button>
                  {(slots as string[]).length > 0 ? (slots as string[]).map((slot) => <span className="reference-availability-slot" key={slot}><i />{slot} <small>{slot.startsWith('08') ? '(Manhã)' : '(Noite)'}</small><button type="button" onClick={() => setAvailabilityEditorOpen(true)}>Editar</button><button type="button">Remover</button></span>) : <span className="reference-availability-empty">Nenhum horário cadastrado <small>Indisponível</small></span>}
                </div>)}
              </div>
              <p className="reference-availability-sync">Horários sincronizados com sua grade da coordenação</p>
              <div className="reference-agenda-modal-actions"><button type="button" onClick={() => setPreviewModal(null)}>Fechar</button><button type="button" className="reference-primary-button" onClick={() => setPreviewModal(null)}>Salvar</button></div>
              {availabilityEditorOpen && <div className="reference-availability-editor"><label>Dia da semana<select defaultValue="segunda"><option value="segunda">Segunda-feira</option><option value="terca">Terça-feira</option><option value="quarta">Quarta-feira</option><option value="quinta">Quinta-feira</option><option value="sexta">Sexta-feira</option></select></label><label>Início<input type="time" defaultValue="09:00" /></label><label>Término<input type="time" defaultValue="12:00" /></label><label className="reference-checkbox"><input type="checkbox" defaultChecked /><span>Repetir semanalmente</span></label><button type="button" className="reference-primary-button" onClick={() => setAvailabilityEditorOpen(false)}>Salvar horário</button></div>}
            </>}
          </section>
        </div>
      )}
    </div>
  )
}
