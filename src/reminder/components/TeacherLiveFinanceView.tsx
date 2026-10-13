import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Clock3, FileUp, Info, Pencil, ReceiptText, Trash2, X } from 'lucide-react'
import type { FormEvent, ChangeEvent } from 'react'
import type { Lesson, Profile, TeacherInvoice, TeacherLessonStatus, TeacherNote } from '../lib/types'
import type { TeacherLessonSession } from '../lib/utils'
import { formatShortDate, openFileFromDataOrUrl, downloadFileFromDataOrUrl } from '../lib/utils'
import { Language, t } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'

type TeacherLiveFinanceViewProps = {
  language: Language
  profile: Profile
  profilesById: Record<string, Profile>
  monthKey: string
  months: [string, string][]
  onMonthChange: (monthKey: string) => void
  monthSessions: TeacherLessonSession[]
  completedSessions: TeacherLessonSession[]
  scheduledSessions: TeacherLessonSession[]
  issueSessions: TeacherLessonSession[]
  payableCount: number
  totalHours: number
  totalAmount: number
  hourlyRate: number
  currency: string
  notesDraft: string
  setNotesDraft: (note: string) => void
  notes: TeacherNote[]
  isSendingNotes: boolean
  setIsSendingNotes: (sending: boolean) => void
  onCreateNote?: (note: string, monthKey?: string) => Promise<void>
  onDeleteNote?: (noteId: string) => Promise<void>
  appTimeZone: string
  invoiceReferenceMonth: string
  invoiceReferenceLabel: string
  invoiceAmount: number
  invoices: TeacherInvoice[]
  uploadingInvoice: boolean
  onUploadInvoice: (event: ChangeEvent<HTMLInputElement>) => void
  onUpdateStatus: (lessons: Lesson[], status: TeacherLessonStatus) => Promise<void>
  onEditLesson: (lesson: Lesson, group?: Lesson[]) => void
  onDeleteLessons: (lessonIds: string[]) => Promise<void>
  onAddLesson: () => void
}

type SessionFilter = 'all' | 'done' | 'scheduled' | 'issues'

const localeFor = (language: Language) => language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US'

export default function TeacherLiveFinanceView({
  language,
  profile,
  profilesById,
  monthKey,
  months,
  onMonthChange,
  monthSessions,
  completedSessions,
  scheduledSessions,
  issueSessions,
  payableCount,
  totalHours,
  totalAmount,
  hourlyRate,
  currency,
  notesDraft,
  setNotesDraft,
  notes,
  isSendingNotes,
  setIsSendingNotes,
  onCreateNote,
  onDeleteNote,
  appTimeZone,
  invoiceReferenceMonth,
  invoiceReferenceLabel,
  invoiceAmount,
  invoices,
  uploadingInvoice,
  onUploadInvoice,
  onUpdateStatus,
  onEditLesson,
  onDeleteLessons,
  onAddLesson,
}: TeacherLiveFinanceViewProps) {
  const { toast } = useToast()
  const [filter, setFilter] = useState<SessionFilter>('all')
  const [selectedSession, setSelectedSession] = useState<TeacherLessonSession | null>(null)
  useBodyScrollLock(selectedSession !== null)

  const sessions = filter === 'done'
    ? completedSessions
    : filter === 'scheduled'
      ? scheduledSessions
      : filter === 'issues'
        ? issueSessions
        : monthSessions
  const formatMoney = (amount: number) => new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'BRL',
  }).format(amount)
  const myInvoices = [...invoices]
  if (profile.nota_fiscal_url && !myInvoices.some((invoice) => invoice.file_url === profile.nota_fiscal_url)) {
    myInvoices.unshift({
      id: `profile-nf-${profile.id}`,
      teacher_id: profile.id,
      month_key: invoiceReferenceMonth,
      file_url: profile.nota_fiscal_url,
      file_name: `Nota_Fiscal_${invoiceReferenceMonth}_${profile.full_name.replace(/\s+/g, '_')}.pdf`,
      status: profile.status_nota_fiscal || 'enviada',
      created_at: new Date().toISOString(),
    })
  }
  const monthLabel = months.find(([key]) => key === monthKey)?.[1] ?? monthKey

  const submitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const note = notesDraft.trim()
    if (!note || !onCreateNote) return
    setIsSendingNotes(true)
    try {
      await onCreateNote(note, monthKey)
      setNotesDraft('')
      toast.success(t(language, 'notes_sent_success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar observação.')
    } finally {
      setIsSendingNotes(false)
    }
  }

  const deleteNote = async (note: TeacherNote) => {
    if (!onDeleteNote || !window.confirm(t(language, 'delete_note_confirm'))) return
    try {
      await onDeleteNote(note.id)
      toast.success(t(language, 'note_deleted_success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir observação.')
    }
  }

  const deleteSession = async (session: TeacherLessonSession) => {
    await onDeleteLessons(session.lessons.map((lesson) => lesson.id))
  }

  return (
    <main className="teacher-reference-content teacher-reference-finance">
      <section className="reference-finance-hero">
        <div className="reference-finance-heading">
          <div>
            <span className="reference-kicker">{language === 'pt' ? 'FOLHA DE PAGAMENTO' : language === 'es' ? 'NÓMINA' : 'PAYROLL'}</span>
            <h2>{language === 'pt' ? 'Demonstrativo Financeiro' : language === 'es' ? 'Resumen financiero' : 'Financial statement'}</h2>
          </div>
          <label className="reference-month-switcher">
            <span className="sr-only">{language === 'pt' ? 'Mês de referência' : 'Reference month'}</span>
            <select value={monthKey} onChange={(event) => onMonthChange(event.target.value)}>
              {months.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="reference-kpi-grid">
          <div><span>{language === 'pt' ? 'AULAS COMPUTADAS' : language === 'es' ? 'CLASES CONTABILIZADAS' : 'COUNTED LESSONS'}</span><strong>{payableCount}</strong><small>{completedSessions.length} {t(language, 'status_happened').toLowerCase()}</small></div>
          <div><span>{t(language, 'total_hours_worked').toUpperCase()}</span><strong>{totalHours.toFixed(1)}<em>h</em></strong><small>{formatMoney(hourlyRate)} / {language === 'pt' ? 'hora' : language === 'es' ? 'hora' : 'hour'}</small></div>
          <div className="is-green"><span>{language === 'pt' ? 'VALOR APURADO' : language === 'es' ? 'VALOR CALCULADO' : 'CALCULATED AMOUNT'}</span><strong>{formatMoney(totalAmount)}</strong><small>{monthLabel}</small></div>
          <div className="is-yellow"><span>{language === 'pt' ? 'STATUS DO REPASSE' : language === 'es' ? 'ESTADO DEL PAGO' : 'PAYMENT STATUS'}</span><strong>{profile.status_pagamento_professor === 'pago' ? t(language, 'paid') : t(language, 'pending')}</strong><small>{profile.data_pagamento_preferencial ? `${language === 'pt' ? 'Dia previsto' : 'Expected day'}: ${profile.data_pagamento_preferencial}` : t(language, 'payments')}</small></div>
        </div>
      </section>

      <section className="reference-invoice-card">
        <div className="reference-invoice-heading">
          <div>
            <div className="reference-invoice-title">
              <h2>{t(language, 'nf_submission_title')} · {invoiceReferenceLabel}</h2>
              <span>{profile.status_nota_fiscal === 'enviada' ? t(language, 'nf_status_sent') : t(language, 'nf_status_pending')}</span>
            </div>
            <p>{t(language, 'nf_exact_value_notice')} <strong>{formatMoney(invoiceAmount)}</strong></p>
          </div>
          <label className="reference-primary-button">
            <FileUp size={15} aria-hidden="true" />
            {uploadingInvoice ? t(language, 'saving_label') : profile.status_nota_fiscal === 'enviada' ? t(language, 'replace_resend_nf') : t(language, 'select_nf_file')}
            <input type="file" accept=".pdf,application/pdf" disabled={uploadingInvoice} onChange={onUploadInvoice} />
          </label>
        </div>
        <div className="reference-invoice-notice"><Info size={15} /><span>{t(language, 'teacher_mei_alert_desc')}</span></div>
        {profile.nota_fiscal_url && (
          <div className="reference-invoice-file">
            <strong>{invoiceReferenceLabel}</strong>
            <div>
              <button type="button" onClick={() => openFileFromDataOrUrl(profile.nota_fiscal_url!, `Nota_Fiscal_${profile.full_name.replace(/\s+/g, '_')}.pdf`)}>{t(language, 'view_sent_file')}</button>
              <button type="button" onClick={() => downloadFileFromDataOrUrl(profile.nota_fiscal_url!, `Nota_Fiscal_${profile.full_name.replace(/\s+/g, '_')}.pdf`)}>{language === 'pt' ? 'Baixar' : language === 'es' ? 'Descargar' : 'Download'}</button>
            </div>
          </div>
        )}
        {myInvoices.length > 0 && (
          <div className="reference-invoice-history">
            <strong>{t(language, 'past_nfs_title')} ({myInvoices.length})</strong>
            {myInvoices.map((invoice) => (
              <div key={invoice.id}>
                <span>{invoice.month_key} · {invoice.file_name || 'Nota Fiscal'}</span>
                <div>
                  <button type="button" onClick={() => openFileFromDataOrUrl(invoice.file_url, invoice.file_name || `Nota_Fiscal_${invoice.month_key}.pdf`)}>{t(language, 'view_sent_file')}</button>
                  <button type="button" onClick={() => downloadFileFromDataOrUrl(invoice.file_url, invoice.file_name || `Nota_Fiscal_${invoice.month_key}.pdf`)}>{language === 'pt' ? 'Baixar' : language === 'es' ? 'Descargar' : 'Download'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="reference-meetings-card">
        <div className="reference-meetings-heading">
          <div><h2>{t(language, 'classes_taught_month')}</h2><p>{t(language, 'manage_classes_subtitle')}</p></div>
          <div className="reference-filters">
            {([
              ['all', t(language, 'all_filter'), monthSessions.length],
              ['done', t(language, 'status_happened'), completedSessions.length],
              ['scheduled', t(language, 'scheduled_badge'), scheduledSessions.length],
              ['issues', t(language, 'issues_filter'), issueSessions.length],
            ] as [SessionFilter, string, number][]).map(([key, label, count]) => (
              <button key={key} type="button" className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>{label} ({count})</button>
            ))}
          </div>
        </div>
        <div className="reference-meeting-list">
          {sessions.map((session) => {
            const isPayable = session.is_happened || session.is_no_show
            const amount = isPayable ? (session.duration_minutes / 60) * hourlyRate : 0
            const status = session.is_happened ? t(language, 'status_happened') : session.is_no_show ? t(language, 'status_student_noshow') : session.is_cancelled ? t(language, 'status_not_happened') : t(language, 'scheduled_badge')
            const students = session.student_ids.map((id) => profilesById[id]?.full_name || t(language, 'role_student')).join(', ')
            return (
              <article className="reference-meeting-row" key={session.key}>
                <span className="reference-check">{session.is_happened ? <Check size={14} /> : <Clock3 size={14} />}</span>
                <div className="reference-meeting-copy">
                  <strong>{session.subject || t(language, 'individual_class')} · {session.class_name}</strong>
                  <span>{formatShortDate(session.starts_at, language, appTimeZone)} · {new Intl.DateTimeFormat(localeFor(language), { hour: '2-digit', minute: '2-digit' }).format(new Date(session.starts_at))} · {session.duration_minutes} min · {students}</span>
                  <small>{status}</small>
                </div>
                <strong className="reference-amount">{formatMoney(amount)}</strong>
                <div className="reference-meeting-actions">
                  <button type="button" onClick={() => setSelectedSession(session)}>{language === 'pt' ? 'Detalhes' : language === 'es' ? 'Detalles' : 'Details'}</button>
                  <button type="button" aria-label={t(language, 'edit')} onClick={() => onEditLesson(session.lessons[0], session.lessons)}><Pencil size={14} /></button>
                  <button type="button" aria-label={t(language, 'delete_class_btn')} onClick={() => void deleteSession(session)}><Trash2 size={14} /></button>
                </div>
                <div className="reference-status-actions" aria-label={t(language, 'status')}>
                  <button type="button" aria-label={t(language, 'status_happened')} title={t(language, 'status_happened')} onClick={() => void onUpdateStatus(session.lessons, 'happened')}>✓</button>
                  <button type="button" aria-label={t(language, 'status_student_noshow')} title={t(language, 'status_student_noshow')} onClick={() => void onUpdateStatus(session.lessons, 'student_no_show')}>!</button>
                  <button type="button" aria-label={t(language, 'status_not_happened')} title={t(language, 'status_not_happened')} onClick={() => void onUpdateStatus(session.lessons, 'not_happened')}>×</button>
                  <button type="button" aria-label={t(language, 'scheduled_badge')} title={t(language, 'scheduled_badge')} onClick={() => void onUpdateStatus(session.lessons, null)}>↺</button>
                </div>
              </article>
            )
          })}
          {sessions.length === 0 && <p className="teacher-calendar-empty">{t(language, 'no_classes_month_empty')}</p>}
        </div>
        <div className="reference-meetings-footer">
          <span>{sessions.length} {language === 'pt' ? 'encontros no período' : language === 'es' ? 'sesiones en el período' : 'sessions in period'}</span>
          <button type="button" className="reference-primary-button" onClick={onAddLesson}>{t(language, 'add_class')}</button>
        </div>
      </section>

      <section className="reference-teacher-notes">
        <div><span className="reference-kicker">{language === 'pt' ? 'COMUNICAÇÃO' : language === 'es' ? 'COMUNICACIÓN' : 'COMMUNICATION'}</span><h2>{t(language, 'notes_to_admin_title')}</h2></div>
        <form onSubmit={(event) => void submitNote(event)}>
          <label htmlFor="teacher-note-draft">{t(language, 'notes_placeholder')}</label>
          <textarea id="teacher-note-draft" value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} />
          <button type="submit" className="reference-primary-button" disabled={isSendingNotes || !notesDraft.trim() || !onCreateNote}>{isSendingNotes ? t(language, 'saving_label') : t(language, 'send_notes_btn')}</button>
        </form>
        <div className="reference-teacher-notes-history">
          <h3>{t(language, 'notes_history')} ({notes.length})</h3>
          {notes.length === 0 ? <p>{language === 'pt' ? 'Nenhuma observação enviada ainda.' : language === 'es' ? 'Todavía no se han enviado observaciones.' : 'No notes have been sent yet.'}</p> : notes.map((note) => (
            <article key={note.id}>
              <div><p>{note.note}</p><span>{formatShortDate(note.created_at, language, appTimeZone)}{note.month_key ? ` · ${note.month_key}` : ''}</span></div>
              <button type="button" aria-label={t(language, 'delete_note_confirm')} onClick={() => void deleteNote(note)}><X size={15} /></button>
            </article>
          ))}
        </div>
      </section>

      {selectedSession && createPortal(
        <div className="teacher-reference-preview-portal">
          <div className="reference-modal-backdrop" role="presentation" onClick={() => setSelectedSession(null)}>
            <section className="reference-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="reference-modal-close" aria-label={t(language, 'cancel')} onClick={() => setSelectedSession(null)}><X size={18} /></button>
              <div className="reference-modal-icon"><ReceiptText size={19} /></div>
              <span className="reference-kicker">{t(language, 'classes_taught_month')}</span>
              <h2>{selectedSession.subject || t(language, 'individual_class')} · {selectedSession.class_name}</h2>
              <p>{formatShortDate(selectedSession.starts_at, language, appTimeZone)} · {selectedSession.duration_minutes} min</p>
              <p>{selectedSession.student_ids.map((id) => profilesById[id]?.full_name || t(language, 'role_student')).join(', ')}</p>
              <button type="button" className="reference-primary-button" onClick={() => { setSelectedSession(null); onEditLesson(selectedSession.lessons[0], selectedSession.lessons) }}>{t(language, 'edit')}</button>
            </section>
          </div>
        </div>,
        document.body,
      )}
    </main>
  )
}
