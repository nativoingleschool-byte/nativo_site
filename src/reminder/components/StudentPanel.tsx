import { BrowserPermission, Lesson, Profile } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { formatShortDate, badgeClass, minutesUntil, sortByDateDesc, sortByDateAsc } from '../lib/utils'

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
  studentTab: 'account' | 'lessons'
  setStudentTab: (tab: 'account' | 'lessons') => void
  dueStudentFourHourReminders: Lesson[]
  dueStudentStartReminders: Lesson[]
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
}: StudentPanelProps) {
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

  const lessonCardClass = (lessonId: string) =>
    focusedLessonId === lessonId ? 'lesson-card lesson-card-focus' : 'lesson-card'

  return (
    <section className="panel-grid">
      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">Student</p>
            <h2>{studentTab === 'lessons' ? t(language, 'student_tab_lessons') : t(language, 'student_tab_account')}</h2>
          </div>
          <div className="tab-row">
            <button
              type="button"
              className={studentTab === 'lessons' ? 'tab-button tab-button-active' : 'tab-button'}
              onClick={() => setStudentTab('lessons')}
            >
              {t(language, 'student_tab_lessons')}
            </button>
            <button
              type="button"
              className={studentTab === 'account' ? 'tab-button tab-button-active' : 'tab-button'}
              onClick={() => setStudentTab('account')}
            >
              {t(language, 'student_tab_account')}
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
                      Inicia em {minutesUntil(now, lesson.starts_at)} minutes às {formatShortDateLabel(lesson.starts_at)}
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
  )
}
