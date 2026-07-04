import { Lesson, Profile, UserFormState } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { formatShortDate, badgeClass } from '../lib/utils'
import { supabase } from '../lib/supabase'

interface AdminStudentsTabProps {
  language: Language
  inviteEmail: string
  setInviteEmail: (email: string) => void
  handleGenerateInviteLink: (e: any) => Promise<void>
  inviteLoading: boolean
  generatedInviteLink: string
  students: Profile[]
  lessons: Lesson[]
  appTimeZone: string
  savingUserId: string | null
  setSavingUserId: (id: string | null) => void
  userForm: UserFormState
  setUserForm: (form: UserFormState) => void
  refreshProfiles: () => Promise<void>
}

export default function AdminStudentsTab({
  language,
  inviteEmail,
  setInviteEmail,
  handleGenerateInviteLink,
  inviteLoading,
  generatedInviteLink,
  students,
  lessons,
  appTimeZone,
  savingUserId,
  setSavingUserId,
  userForm,
  setUserForm,
  refreshProfiles,
}: AdminStudentsTabProps) {
  const formatShortDateLabel = (value: string) => formatShortDate(value, language, appTimeZone)

  return (
    <>
      <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#fff' }}>{t(language, 'invite_student_title')}</h3>
        <form onSubmit={handleGenerateInviteLink} className="form-grid" style={{ gap: '0.75rem', display: 'flex', alignItems: 'center' }}>
          <input
            required
            type="email"
            placeholder={t(language, 'invite_email_placeholder')}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{ flex: 1, padding: '0.75rem 1rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.75rem', color: '#fff' }}
          />
          <button className="primary-button" style={{ padding: '0.75rem 1.5rem', whiteSpace: 'nowrap' }} disabled={inviteLoading}>
            {inviteLoading ? t(language, 'loading_invite') : t(language, 'generate_invite_btn')}
          </button>
        </form>
        {generatedInviteLink && (
          <div className="credential-card mt-4" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1rem', borderRadius: '1rem', marginTop: '1rem' }}>
            <p className="section-label" style={{ color: '#10b981', fontWeight: 'bold' }}>{t(language, 'invite_link_generated')}</p>
            <p className="inline-code" style={{ wordBreak: 'break-all', fontSize: '0.85rem', margin: '0.5rem 0', display: 'block', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              {generatedInviteLink}
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void navigator.clipboard.writeText(generatedInviteLink)
                alert(t(language, 'copied_alert'))
              }}
            >
              {t(language, 'copy_link_btn')}
            </button>
          </div>
        )}
      </div>

      <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>{t(language, 'full_name')}</th>
              <th style={{ padding: '1rem' }}>Email</th>
              <th style={{ padding: '1rem' }}>CPF</th>
              <th style={{ padding: '1rem' }}>{t(language, 'billing_day')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'student_financial_status')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'student_habitual_time')}</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>{t(language, 'actions')}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const studentLessons = lessons.filter(l => l.student_id === student.id)
              const scheduleText = studentLessons.length > 0 
                ? formatShortDateLabel(studentLessons[0].starts_at).split(' · ')[1] || t(language, 'class_scheduled')
                : t(language, 'student_no_classes')

              return (
                <tr key={student.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>{student.full_name}</td>
                  <td style={{ padding: '1rem', color: '#94a3b8' }}>{student.email}</td>
                  <td style={{ padding: '1rem' }}>{student.cpf || '-'}</td>
                  <td style={{ padding: '1rem' }}>
                    {student.data_pagamento_preferencial ? t(language, 'billing_day_label').replace('{day}', String(student.data_pagamento_preferencial)) : '-'}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span className={badgeClass(student.status_pagamento || 'pendente')}>
                      {student.status_pagamento === 'em_dia' && t(language, 'financial_ok')}
                      {student.status_pagamento === 'atrasado' && t(language, 'financial_late')}
                      {student.status_pagamento === 'pendente' && t(language, 'financial_pending')}
                      {!student.status_pagamento && t(language, 'financial_pending')}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span 
                      title="Utilize o calendário para alterar horários" 
                      style={{ borderBottom: '1px dotted #64748b', cursor: 'help', color: '#38bdf8' }}
                    >
                      {scheduleText}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button 
                      className="secondary-button" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => {
                        setSavingUserId(student.id)
                        setUserForm({
                          id: student.id,
                          email: student.email,
                          full_name: student.full_name,
                          role: 'student',
                          class_name: student.class_name || '',
                          speciality: '',
                          password: '',
                          cpf: student.cpf || '',
                          data_pagamento_preferencial: student.data_pagamento_preferencial || 5,
                          first_class_at: '',
                          first_class_teacher_id: ''
                        })
                      }}
                    >
                      {t(language, 'edit')}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {savingUserId && userForm.role === 'student' && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="form-card" style={{ maxWidth: '450px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>{t(language, 'edit_student_title')}</h3>
            <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                required
                placeholder={t(language, 'full_name')}
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              />
              <input
                placeholder="CPF"
                value={userForm.cpf || ''}
                onChange={(e) => setUserForm({ ...userForm, cpf: e.target.value })}
              />
              <select
                value={userForm.data_pagamento_preferencial || 5}
                onChange={(e) => setUserForm({ ...userForm, data_pagamento_preferencial: Number(e.target.value) })}
              >
                {[1, 5, 10, 15, 20, 25].map(day => (
                  <option key={day} value={day}>{t(language, 'billing_day_label').replace('{day}', String(day))}</option>
                ))}
              </select>
            </div>
            <div className="button-stack mt-6" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
              <button 
                className="primary-button" 
                onClick={async () => {
                  try {
                    const { error } = await supabase
                      .from('profiles')
                      .update({
                        full_name: userForm.full_name,
                        email: userForm.email,
                        cpf: userForm.cpf || null,
                        data_pagamento_preferencial: userForm.data_pagamento_preferencial
                      })
                      .eq('id', userForm.id)
                    if (error) throw error
                    setSavingUserId(null)
                    await refreshProfiles()
                  } catch (err: any) {
                    alert(err.message)
                  }
                }}
              >
                {t(language, 'save')}
              </button>
              <button className="secondary-button" onClick={() => setSavingUserId(null)}>{t(language, 'cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
