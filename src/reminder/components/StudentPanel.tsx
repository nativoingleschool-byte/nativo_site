import { useState, useEffect, useMemo, FormEvent } from 'react'
import { BrowserPermission, Lesson, Profile } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { formatShortDate, badgeClass, minutesUntil, sortByDateDesc, sortByDateAsc, buildGoogleCalendarInviteUrl } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { trackPageView } from '../../lib/telemetry'
import MobileCalendar, { type CalendarEventItem } from './MobileCalendar'

interface StudentPanelProps {
  language: Language
  profile: Profile
  lessons: Lesson[]
  invoices: any[]
  appTimeZone: string
  focusedLessonId: string | null
  now: Date
  updateLesson: (lessonId: string, changes: Partial<Lesson>) => Promise<void>
  profilesById: Record<string, Profile>
  notificationPermission: BrowserPermission
  disablePush: () => Promise<void>
  requestPushPermission: () => Promise<void>
  studentTab: 'account' | 'lessons' | 'invoices'
  setStudentTab: (tab: 'account' | 'lessons' | 'invoices') => void
  dueStudentFourHourReminders: Lesson[]
  dueStudentStartReminders: Lesson[]
  refreshProfile: (userId: string) => Promise<Profile>
}

export default function StudentPanel({
  language,
  profile,
  lessons,
  invoices,
  appTimeZone,
  focusedLessonId,
  now,
  updateLesson,
  profilesById,
  notificationPermission,
  disablePush,
  requestPushPermission,
  studentTab,
  setStudentTab,
  dueStudentFourHourReminders,
  dueStudentStartReminders,
  refreshProfile,
}: StudentPanelProps) {
  const { toast } = useToast()

  const handleTabChange = (tab: 'account' | 'lessons' | 'invoices') => {
    trackPageView('/student/' + tab)
    setStudentTab(tab)
  }
  const [fullName, setFullName] = useState(profile.full_name)
  const [email, setEmail] = useState(profile.email)
  const [cpf, setCpf] = useState(profile.cpf || '')
  const [cep, setCep] = useState(profile.cep || '')
  const [logradouro, setLogradouro] = useState(profile.logradouro || '')
  const [bairro, setBairro] = useState(profile.bairro || '')
  const [cidade, setCidade] = useState(profile.cidade || '')
  const [uf, setUf] = useState(profile.uf || '')
  const [saving, setSaving] = useState(false)
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)

  /** Fetch the generated DANFS-e PDF from the server and trigger a browser download for the student. */
  const downloadNfsePdf = async (invoiceId: string, studentName: string) => {
    setDownloadingPdfId(invoiceId)
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error(t(language, 'unauthenticated_error'))

      const res = await fetch(`/api/admin/nfse-pdf?invoice_id=${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t(language, 'error_generating_pdf') }))
        throw new Error(err.error || t(language, 'error_generating_pdf'))
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download  = `NFS-e_${studentName.replace(/\s+/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDownloadingPdfId(null)
    }
  }

  useEffect(() => {
    setFullName(profile.full_name)
    setEmail(profile.email)
    setCpf(profile.cpf || '')
    setCep(profile.cep || '')
    setLogradouro(profile.logradouro || '')
    setBairro(profile.bairro || '')
    setCidade(profile.cidade || '')
    setUf(profile.uf || '')
  }, [profile])

  const handleSaveStudentData = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          email: email,
          cpf: cpf || null,
          cep: cep || null,
          logradouro: logradouro || null,
          bairro: bairro || null,
          cidade: cidade || null,
          uf: uf || null
        })
        .eq('id', profile.id)
      if (error) throw error
      await refreshProfile(profile.id)
      toast.success(t(language, 'student_registration_updated'))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }
  const [myInvoices, setMyInvoices] = useState<any[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  useEffect(() => {
    if (studentTab === 'invoices') {
      const fetchMyInvoices = async () => {
        setLoadingInvoices(true)
        try {
          const { data, error } = await supabase
            .from('invoices')
            .select('*')
            .order('billing_period', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })

          if (error) throw error
          setMyInvoices(data || [])
        } catch (err) {
          console.error('Error fetching student invoices:', err)
        } finally {
          setLoadingInvoices(false)
        }
      }
      void fetchMyInvoices()
    }
  }, [studentTab])
  const formatShortDateLabel = (value: string) => formatShortDate(value, language, appTimeZone)

  const visibleLessons = lessons.filter((lesson) => lesson.student_id === profile.id)

  const studentPastLessons = visibleLessons
    .filter((lesson) => new Date(lesson.starts_at) < now)
    .sort(sortByDateDesc)
    .slice(0, 3)

  const studentUpcomingLessons = visibleLessons
    .filter((lesson) => new Date(lesson.starts_at) >= now)
    .sort(sortByDateAsc)
    .slice(0, 4)

  const studentCalendarEvents = useMemo<CalendarEventItem[]>(() => {
    return visibleLessons.map((lesson) => {
      const start = new Date(lesson.starts_at)
      const duration = lesson.duration_minutes || 60
      const end = new Date(start.getTime() + duration * 60000)
      const teacherName = profilesById[lesson.teacher_id]?.full_name || 'Professor'
      return {
        id: `student-lesson-${lesson.id}`,
        type: 'lesson' as const,
        start,
        end,
        title: lesson.subject || 'Aula de Inglês',
        subtitle: `Prof. ${teacherName}`,
        color: lesson.teacher_lesson_status === 'happened' ? ('green' as const) : ('blue' as const),
        sourceData: lesson,
      }
    })
  }, [visibleLessons, profilesById])

  const handleSelectStudentCalendarEvent = (event: CalendarEventItem) => {
    const lesson = event.sourceData as Lesson
    if (lesson?.meeting_url) {
      window.open(lesson.meeting_url, '_blank', 'noopener,noreferrer')
      return
    }
    if (lesson) {
      const url = buildGoogleCalendarInviteUrl({
        title: `${lesson.subject || 'Aula de Inglês'} · ${lesson.class_name || 'Nativo'}`,
        startsAt: lesson.starts_at,
        durationMinutes: lesson.duration_minutes || 60,
        attendees: [profile.email].filter(Boolean),
        meetingUrl: lesson.meeting_url,
      })
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const lessonCardClass = (lessonId: string) =>
    focusedLessonId === lessonId ? 'lesson-card lesson-card-focus' : 'lesson-card'

  return (
    <section className="flex flex-col w-full gap-6">
      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">{t(language, 'role_student')}</p>
            <h2>{studentTab === 'lessons' ? t(language, 'student_tab_lessons') : studentTab === 'account' ? t(language, 'student_tab_account') : t(language, 'student_tab_invoices')}</h2>
          </div>
          {/* Mobile Tab Dropdown */}
          <div className="mobile-tab-select">
            <select
              value={studentTab}
              onChange={(e) => handleTabChange(e.target.value as any)}
            >
              <option value="lessons">{t(language, 'student_tab_lessons')}</option>
              <option value="account">{t(language, 'student_tab_account')}</option>
              <option value="invoices">{t(language, 'student_tab_invoices')}</option>
            </select>
          </div>

          {/* Desktop Tab Buttons */}
          <div className="tab-row desktop-only">
            <button
              type="button"
              className={studentTab === 'lessons' ? 'tab-button tab-button-active' : 'tab-button'}
              onClick={() => handleTabChange('lessons')}
            >
              {t(language, 'student_tab_lessons')}
            </button>
            <button
              type="button"
              className={studentTab === 'account' ? 'tab-button tab-button-active' : 'tab-button'}
              onClick={() => handleTabChange('account')}
            >
              {t(language, 'student_tab_account')}
            </button>
            <button
              type="button"
              className={studentTab === 'invoices' ? 'tab-button tab-button-active' : 'tab-button'}
              onClick={() => handleTabChange('invoices')}
            >
              {t(language, 'student_tab_invoices')}
            </button>
          </div>
        </div>

        {studentTab === 'lessons' ? (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="split-column">
              <section style={{ flex: 1.3 }}>
                <h3>{t(language, 'active_lesson_reminders')}</h3>
                <div className="list-stack">
                  {/* 4-hour reminders */}
                  {dueStudentFourHourReminders.map((lesson) => (
                    <div key={lesson.id} className={`reminder-card ${focusedLessonId === lesson.id ? 'reminder-card-focus' : ''}`}>
                      <p className="reminder-title">{lesson.subject}</p>
                      <p className="muted">
                        {t(language, 'starts_in_minutes')
                          .replace('{minutes}', String(minutesUntil(now, lesson.starts_at)))
                          .replace('{time}', formatShortDateLabel(lesson.starts_at))}
                      </p>
                      <div className="button-row wrap" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <button className="primary-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => void updateLesson(lesson.id, { student_attendance: 'attend' })}>
                          {t(language, 'will_attend_btn')}
                        </button>
                        <button className="danger-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => void updateLesson(lesson.id, { student_attendance: 'cancel' })}>
                          {t(language, 'need_cancel_btn')}
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Class-time reminders */}
                  {dueStudentStartReminders.map((lesson) => (
                    <div key={lesson.id} className={`reminder-card ${focusedLessonId === lesson.id ? 'reminder-card-focus' : ''}`}>
                      <p className="reminder-title">{lesson.subject}</p>
                      <p className="muted">{t(language, 'class_started_notice')}</p>
                      <div className="button-row wrap" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <button className="primary-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => void updateLesson(lesson.id, { student_lesson_status: 'done' })}>
                          {t(language, 'had_class_btn')}
                        </button>
                        <button className="danger-button" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => void updateLesson(lesson.id, { student_lesson_status: 'not_done' })}>
                          {t(language, 'did_not_have_class_btn')}
                        </button>
                      </div>
                    </div>
                  ))}

                  {dueStudentFourHourReminders.length === 0 && dueStudentStartReminders.length === 0 && (
                    <p className="empty-state">{t(language, 'no_active_reminders')}</p>
                  )}
                </div>

                <h3 className="mt-8" style={{ marginTop: '2rem' }}>{t(language, 'my_upcoming_lessons')}</h3>
                <div className="list-stack">
                  {studentUpcomingLessons.map((lesson) => (
                    <div key={lesson.id} className={lessonCardClass(lesson.id)}>
                      <div>
                        <h3>{lesson.subject}</h3>
                        <p className="muted">
                          {formatShortDateLabel(lesson.starts_at)} {t(language, 'with_teacher_label')} {profilesById[lesson.teacher_id]?.full_name}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {lesson.meeting_url && (
                          <a
                            href={lesson.meeting_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="primary-button"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', textDecoration: 'none' }}
                          >
                            Entrar no Zoom
                          </a>
                        )}
                        <span className={badgeClass('agendada')}>{t(language, 'scheduled_badge')}</span>
                      </div>
                    </div>
                  ))}
                  {studentUpcomingLessons.length === 0 && <p className="empty-state">{t(language, 'no_upcoming_lessons')}</p>}
                </div>
              </section>

              <section style={{ flex: 0.7 }}>
                <h3>{t(language, 'alert_settings_title')}</h3>
                <div className="form-card" style={{ background: 'var(--portal-surface-subtle)', border: '1px solid var(--portal-border)', padding: '1rem', borderRadius: '1rem' }}>
                  <p className="muted text-sm" style={{ marginBottom: '1rem' }}>
                    {t(language, 'alert_settings_desc')}
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
                    {notificationPermission === 'granted' && profile.push_enabled ? t(language, 'disable_alerts_btn') : t(language, 'enable_pwa_alerts_btn')}
                  </button>
                </div>
              </section>
            </div>

            {/* Student Google Calendar View */}
            <section className="teacher-calendar-card" style={{ marginTop: '0.5rem' }}>
              <MobileCalendar
                events={studentCalendarEvents}
                language={language}
                hideAvailabilityLayer={true}
                syncStatusLabel={
                  profile.email && !profile.email.endsWith('@setup.local')
                    ? `Google Agenda (${profile.email}): Sincronizado`
                    : 'Google Agenda: Sincronizado'
                }
                onSelectEvent={handleSelectStudentCalendarEvent}
                onSelectSlot={() => {}}
              />
            </section>
          </div>
        ) : studentTab === 'account' ? (
          <div className="split-column animate-fade-in">
            <section style={{ flex: 1 }}>
              <h3>{t(language, 'registration_data')}</h3>
              <form onSubmit={handleSaveStudentData} className="form-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--portal-surface-subtle)', border: '1px solid var(--portal-border)', padding: '1.25rem', borderRadius: '1.25rem' }}>
                <div>
                  <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'full_name')}</label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'email_optional')}</label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'cpf_label')}</label>
                  <input
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'cep_label')}</label>
                  <input
                    placeholder="06401-000"
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'address_label')}</label>
                  <input
                    placeholder="Av. Principal, 123"
                    value={logradouro}
                    onChange={(e) => setLogradouro(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'neighborhood_label')}</label>
                    <input
                      placeholder="Centro"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'city_label')}</label>
                    <input
                      placeholder="Barueri"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                    />
                  </div>
                  <div style={{ width: '60px' }}>
                    <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'state_label')}</label>
                    <input
                      placeholder="SP"
                      maxLength={2}
                      value={uf}
                      onChange={(e) => setUf(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'preferred_billing_day')}</label>
                  <strong className="text-base block mt-1" style={{ padding: '0 0.5rem', color: 'var(--portal-heading)' }}>
                    {profile.data_pagamento_preferencial
                      ? t(language, 'day_of_each_month').replace('{day}', String(profile.data_pagamento_preferencial))
                      : t(language, 'not_defined')}
                  </strong>
                </div>
                <div>
                  <label className="text-xs font-bold block uppercase tracking-widest mb-1" style={{ color: 'var(--portal-text-secondary)' }}>{t(language, 'student_financial_status')}</label>
                  <span className={`${badgeClass(profile.status_pagamento || 'pendente')} inline-block mt-1`}>
                    {profile.status_pagamento === 'em_dia' && t(language, 'financial_ok')}
                    {profile.status_pagamento === 'atrasado' && t(language, 'financial_late')}
                    {profile.status_pagamento === 'pendente' && t(language, 'financial_pending')}
                    {!profile.status_pagamento && t(language, 'financial_pending')}
                  </span>
                </div>
                <button type="submit" className="primary-button mt-4" disabled={saving} style={{ marginTop: '1rem' }}>
                  {saving ? t(language, 'saving_label') : t(language, 'save_changes_btn')}
                </button>
              </form>
            </section>

            <section style={{ flex: 1 }}>
              <h3>{t(language, 'payment_history_title')}</h3>
              <div className="list-stack">
                {invoices
                  .filter(inv => inv.student_id === profile.id)
                  .map((inv) => (
                    <div key={inv.id} className="lesson-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--portal-surface-subtle)', border: '1px solid var(--portal-border)', borderRadius: '1rem' }}>
                      <div>
                        <p className="font-bold" style={{ fontSize: '0.9rem', color: 'var(--portal-heading)' }}>{t(language, 'invoice_nativo')}</p>
                        <p className="muted text-xs">{new Date(inv.created_at).toLocaleDateString()}</p>
                        <span className={badgeClass(inv.status)} style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                          {inv.status === 'pago' ? t(language, 'paid') : inv.status === 'atrasado' ? t(language, 'financial_late') : t(language, 'financial_pending')}
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
                          {t(language, 'boleto_btn')}
                        </a>
                        {(inv.nfs_e_pdf_link || inv.nfse_url || inv.nfse_numero) && (
                          <button
                            className="primary-button"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: '#10b981', borderColor: '#10b981' }}
                            disabled={downloadingPdfId === inv.id}
                            onClick={() => void downloadNfsePdf(inv.id, profile.full_name)}
                          >
                            {downloadingPdfId === inv.id ? t(language, 'generating_pdf') : 'NFS-e'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                {invoices.filter(inv => inv.student_id === profile.id).length === 0 && (
                  <p className="empty-state">{t(language, 'no_payment_history')}</p>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Tuition Overview Card */}
            <div
              className="form-card"
              style={{
                background: 'var(--portal-surface-subtle)',
                border: '1px solid var(--status-info-border)',
                borderRadius: '1.25rem',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--portal-heading)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>💳</span>
                {language === 'es' ? 'Resumen de Matrícula y Pagos' : language === 'en' ? 'Tuition & Billing Overview' : 'Resumo da Mensalidade e Pagamentos'}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ background: 'var(--portal-surface)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--portal-border)' }}>
                  <p className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    {language === 'es' ? 'Valor Mensual' : language === 'en' ? 'Monthly Tuition' : 'Valor da Mensalidade'}
                  </p>
                  <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--portal-link)' }}>
                    {profile.tuition_fee ? `R$ ${Number(profile.tuition_fee).toFixed(2).replace('.', ',')}` : 'R$ 0,00'}
                  </p>
                </div>

                <div style={{ background: 'var(--portal-surface)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--portal-border)' }}>
                  <p className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    {language === 'es' ? 'Vencimiento Preferencial' : language === 'en' ? 'Preferred Due Day' : 'Vencimento Preferencial'}
                  </p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--portal-heading)' }}>
                    {profile.data_pagamento_preferencial
                      ? (language === 'es' ? `Día ${profile.data_pagamento_preferencial} de cada mes` : language === 'en' ? `Day ${profile.data_pagamento_preferencial} of each month` : `Dia ${profile.data_pagamento_preferencial} de cada mês`)
                      : (language === 'es' ? 'Día 5 de cada mes' : language === 'en' ? 'Day 5 of each month' : 'Dia 5 de cada mês')}
                  </p>
                </div>

                <div style={{ background: 'var(--portal-surface)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--portal-border)' }}>
                  <p className="muted" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    {language === 'es' ? 'Situación Actual' : language === 'en' ? 'Current Status' : 'Situação Atual'}
                  </p>
                  <span className={`${badgeClass(profile.status_pagamento || 'pendente')}`} style={{ fontSize: '0.85rem', display: 'inline-block', marginTop: '0.25rem' }}>
                    {profile.status_pagamento === 'em_dia' && (language === 'es' ? '✓ Al día' : language === 'en' ? '✓ Paid / Up to Date' : '✓ Em Dia')}
                    {profile.status_pagamento === 'atrasado' && (language === 'es' ? '⚠️ Atrasado' : language === 'en' ? '⚠️ Overdue' : '⚠️ Atrasado')}
                    {(profile.status_pagamento === 'pendente' || !profile.status_pagamento) && (language === 'es' ? '⏳ Pendiente' : language === 'en' ? '⏳ Pending' : '⏳ Pendente')}
                  </span>
                </div>
              </div>
            </div>

            <section>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--portal-heading)', marginBottom: '0.75rem' }}>
                {t(language, 'invoices_title')}
              </h3>
              {loadingInvoices ? (
                <p className="muted">{t(language, 'loading_invoices')}</p>
              ) : (
                <div className="list-stack">
                  {myInvoices.map((inv) => {
                    return (
                      <div key={inv.id} className="lesson-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--portal-surface-subtle)', border: '1px solid var(--portal-border)', borderRadius: '1rem' }}>
                        <div>
                          <p className="font-bold" style={{ fontSize: '0.9rem', color: 'var(--portal-heading)' }}>Nativo Languages Brazil LTDA - NFS-e</p>
                          <p className="muted text-xs" style={{ marginTop: '0.25rem' }}>
                            <strong>{t(language, 'billing_period_ref')}:</strong> {inv.billing_period || t(language, 'not_specified')}
                          </p>
                          <p className="muted text-xs">
                            <strong>{t(language, 'emission_date')}:</strong> {new Date(inv.created_at).toLocaleDateString()}
                          </p>
                          <span className={badgeClass(inv.status)} style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                            {inv.status === 'pago' ? t(language, 'paid') : inv.status === 'atrasado' ? t(language, 'financial_late') : t(language, 'financial_pending')}
                          </span>
                        </div>
                        <div>
                          {(inv.nfs_e_pdf_link || inv.nfse_url || inv.nfse_numero) ? (
                            <button
                              className="primary-button"
                              style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', background: '#10b981', borderColor: '#10b981' }}
                              disabled={downloadingPdfId === inv.id}
                              onClick={() => void downloadNfsePdf(inv.id, profile.full_name)}
                            >
                              {downloadingPdfId === inv.id ? t(language, 'generating_pdf') : t(language, 'view_pdf')}
                            </button>
                          ) : (
                            <span className="muted text-xs">{t(language, 'awaiting_emission')}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {myInvoices.length === 0 && (
                    <p className="empty-state">{t(language, 'no_invoices_available')}</p>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </article>
    </section>
  )
}
