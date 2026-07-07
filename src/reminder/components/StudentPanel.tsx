import { useState, useEffect, FormEvent } from 'react'
import { BrowserPermission, Lesson, Profile } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { formatShortDate, badgeClass, minutesUntil, sortByDateDesc, sortByDateAsc } from '../lib/utils'
import { supabase } from '../lib/supabase'

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
  const [fullName, setFullName] = useState(profile.full_name)
  const [email, setEmail] = useState(profile.email)
  const [cpf, setCpf] = useState(profile.cpf || '')
  const [cep, setCep] = useState(profile.cep || '')
  const [logradouro, setLogradouro] = useState(profile.logradouro || '')
  const [bairro, setBairro] = useState(profile.bairro || '')
  const [cidade, setCidade] = useState(profile.cidade || '')
  const [uf, setUf] = useState(profile.uf || '')
  const [saving, setSaving] = useState(false)

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
      alert('Cadastro atualizado com sucesso!')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }
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
          {/* Mobile Tab Dropdown */}
          <div className="mobile-tab-select">
            <select
              value={studentTab}
              onChange={(e) => setStudentTab(e.target.value as any)}
            >
              <option value="lessons">{t(language, 'student_tab_lessons')}</option>
              <option value="account">{t(language, 'student_tab_account')}</option>
            </select>
          </div>

          {/* Desktop Tab Buttons */}
          <div className="tab-row desktop-only">
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
              <form onSubmit={handleSaveStudentData} className="form-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(30,41,59,0.2)', padding: '1.25rem', borderRadius: '1.25rem' }}>
                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Nome Completo</label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">E-mail</label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">CPF</label>
                  <input
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">CEP</label>
                  <input
                    placeholder="06401-000"
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Endereço (Rua, Nº, Apto)</label>
                  <input
                    placeholder="Av. Principal, 123"
                    value={logradouro}
                    onChange={(e) => setLogradouro(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Bairro</label>
                    <input
                      placeholder="Centro"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Cidade</label>
                    <input
                      placeholder="Barueri"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                    />
                  </div>
                  <div style={{ width: '60px' }}>
                    <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">UF</label>
                    <input
                      placeholder="SP"
                      maxLength={2}
                      value={uf}
                      onChange={(e) => setUf(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Dia de Vencimento Preferencial</label>
                  <strong className="text-white text-base block mt-1" style={{ padding: '0 0.5rem' }}>
                    {profile.data_pagamento_preferencial ? `Dia ${profile.data_pagamento_preferencial} de cada mês` : 'Não definido'}
                  </strong>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold block uppercase tracking-widest mb-1">Status Financeiro</label>
                  <span className={`${badgeClass(profile.status_pagamento || 'pendente')} inline-block mt-1`}>
                    {profile.status_pagamento === 'em_dia' && 'Em dia'}
                    {profile.status_pagamento === 'atrasado' && 'Atrasado'}
                    {profile.status_pagamento === 'pendente' && 'Pendente'}
                    {!profile.status_pagamento && 'Pendente'}
                  </span>
                </div>
                <button type="submit" className="primary-button mt-4" disabled={saving} style={{ marginTop: '1rem' }}>
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </form>
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
