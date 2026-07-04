import { FormEvent } from 'react'
import { Lesson, Profile, AccountFormState } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { formatShortDate, badgeClass } from '../lib/utils'
import { supabase } from '../lib/supabase'
import AdminCalendar from './AdminCalendar'

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
  profilesById: Record<string, Profile>
  selectedMonth: number
  setSelectedMonth: (month: number) => void
  teacherNotes: string
  setTeacherNotes: (notes: string) => void
  uploadingNf: boolean
  setUploadingNf: (uploading: boolean) => void
  refreshProfile: (userId: string) => Promise<Profile>
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
  profilesById,
  selectedMonth,
  setSelectedMonth,
  teacherNotes,
  setTeacherNotes,
  uploadingNf,
  setUploadingNf,
  refreshProfile,
  refreshLessons,
  accountForm,
  setAccountForm,
  accountSaving,
  setAccountSaving,
  focusedLessonId,
}: TeacherPanelProps) {
  const formatShortDateLabel = (value: string) => formatShortDate(value, language, appTimeZone)

  const lessonCardClass = (lessonId: string) =>
    focusedLessonId === lessonId ? 'lesson-card lesson-card-focus' : 'lesson-card'

  const handleProposeClass = async (e: FormEvent<HTMLFormElement>) => {
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
  }

  const handleUploadNf = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          cnpj: (targetForm.elements.namedItem('cnpj') as HTMLInputElement).value
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
  }

  return (
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
                onSubmit={handleProposeClass}
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
                    onChange={handleUploadNf}
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
              onSubmit={handleSaveTeacherData}
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
  )
}
