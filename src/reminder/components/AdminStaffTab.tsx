import { FormEvent } from 'react'
import { Lesson, Profile, UserFormState } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { badgeClass } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

const defaultUserForm = (): UserFormState => ({
  full_name: '',
  email: '',
  password: '',
  role: 'student',
  class_name: '',
  speciality: '',
  first_class_at: '',
  first_class_teacher_id: '',
  cpf: '',
  data_pagamento_preferencial: 5,
  chave_pix: '',
  cnpj: '',
  taxa_hora_aula: 56.00,
})

interface AdminStaffTabProps {
  language: Language
  userForm: UserFormState
  setUserForm: (form: UserFormState) => void
  profiles: Profile[]
  teachers: Profile[]
  lessons: Lesson[]
  savingUserId: string | null
  setSavingUserId: (id: string | null) => void
  callAdminUsersApi: <T>(action: 'create' | 'invite' | 'update' | 'delete', payload: unknown) => Promise<T>
  refreshProfiles: () => Promise<void>
  refreshLessons: () => Promise<void>
  handleDeleteUser: (userId: string) => Promise<void>
  handleBatchUpdatePayout: (status: 'pago' | 'pendente') => Promise<void>
  handleUpdateTeacherPayout: (teacherId: string, status: 'pago' | 'pendente') => Promise<void>
  setAppError: (error: string) => void
}

export default function AdminStaffTab({
  language,
  userForm,
  setUserForm,
  profiles,
  teachers,
  lessons,
  savingUserId,
  setSavingUserId,
  callAdminUsersApi,
  refreshProfiles,
  refreshLessons,
  handleDeleteUser,
  handleBatchUpdatePayout,
  handleUpdateTeacherPayout,
  setAppError,
}: AdminStaffTabProps) {
  const { toast } = useToast()

  const handleAddStaffSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setAppError('')
    try {
      const targetRole = userForm.role === 'student' ? 'teacher' : userForm.role // Default safety fallback
      const created = await callAdminUsersApi<Profile>('create', {
        full_name: userForm.full_name,
        email: userForm.email,
        password: userForm.password,
        role: targetRole,
        class_name: '',
        speciality: userForm.speciality || '',
        chave_pix: userForm.chave_pix || '',
        cnpj: userForm.cnpj || '',
        taxa_hora_aula: userForm.taxa_hora_aula || 56.00,
      })
      toast.success(`Membro da equipe ${created.full_name} adicionado com sucesso!`)
      setUserForm(defaultUserForm())
      await refreshProfiles()
    } catch (err: any) {
      setAppError(err.message || 'Erro ao adicionar membro da equipe.')
    }
  }

  return (
    <>
      {/* Add New Staff Section */}
      <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#fff' }}>{t(language, 'add_staff_title')}</h3>
        <form 
          onSubmit={handleAddStaffSubmit} 
          className="form-grid" 
          style={{ gap: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'full_name')}</label>
            <input
              required
              type="text"
              placeholder={t(language, 'full_name')}
              value={userForm.full_name}
              onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
              style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Email</label>
            <input
              required
              type="email"
              placeholder="Email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'password')}</label>
            <input
              required
              type="password"
              placeholder={t(language, 'password')}
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'role_label')}</label>
            <select
              value={userForm.role === 'student' ? 'teacher' : userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
              style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
            >
              <option value="teacher">Professor (Teacher)</option>
              <option value="admin">Administrador (Admin)</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'speciality_label')}</label>
            <input
              type="text"
              placeholder="E.g. Business, TOEFL"
              value={userForm.speciality}
              onChange={(e) => setUserForm({ ...userForm, speciality: e.target.value })}
              style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'pix_label')}</label>
            <input
              type="text"
              placeholder="Celular, E-mail, CPF..."
              value={userForm.chave_pix || ''}
              onChange={(e) => setUserForm({ ...userForm, chave_pix: e.target.value })}
              style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'cnpj_label')}</label>
            <input
              type="text"
              placeholder="CNPJ ou CPF"
              value={userForm.cnpj || ''}
              onChange={(e) => setUserForm({ ...userForm, cnpj: e.target.value })}
              style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'value_hour_label')}</label>
            <input
              type="number"
              placeholder="Valor hora aula"
              value={userForm.taxa_hora_aula || ''}
              onChange={(e) => setUserForm({ ...userForm, taxa_hora_aula: Number(e.target.value) })}
              style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'stretch', gridColumn: 'span 1' }}>
            <button type="submit" className="primary-button" style={{ width: '100%', padding: '0.6rem 1rem' }}>
              {t(language, 'add_staff_btn')}
            </button>
          </div>
        </form>
      </div>

      {/* Staff list table */}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#fff' }}>{t(language, 'staff_list_title')}</h3>
      <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem', marginBottom: '2.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>{t(language, 'full_name')}</th>
              <th style={{ padding: '1rem' }}>Email</th>
              <th style={{ padding: '1rem' }}>{t(language, 'role_label').split(' ')[0]}</th>
              <th style={{ padding: '1rem' }}>CPF/CNPJ</th>
              <th style={{ padding: '1rem' }}>Chave PIX</th>
              <th style={{ padding: '1rem' }}>{t(language, 'rate_hour')}</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>{t(language, 'actions')}</th>
            </tr>
          </thead>
          <tbody>
            {profiles
              .filter((p) => p.role === 'admin' || p.role === 'teacher')
              .map((staff) => {
                const hourlyRate = staff.taxa_hora_aula ?? (staff.role === 'teacher' ? 56.00 : 0)
                const currency = staff.moeda_taxa ?? 'BRL'

                return (
                  <tr key={staff.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{staff.full_name}</td>
                    <td style={{ padding: '1rem', color: '#94a3b8' }}>{staff.email}</td>
                    <td style={{ padding: '1rem' }}>
                      <span className={badgeClass(staff.role === 'admin' ? 'confirmed' : 'rescheduled')}>
                        {staff.role === 'admin' ? 'Admin' : t(language, 'teacher')}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: '#94a3b8' }}>{staff.cnpj || '-'}</td>
                    <td style={{ padding: '1rem', color: '#94a3b8' }}>{staff.chave_pix || '-'}</td>
                    <td style={{ padding: '1rem' }}>
                      {staff.role === 'teacher' ? `${currency} ${Number(hourlyRate).toFixed(2)}` : 'N/A'}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          className="secondary-button"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => {
                            setSavingUserId(staff.id)
                            setUserForm({
                              id: staff.id,
                              email: staff.email,
                              full_name: staff.full_name,
                              role: staff.role,
                              class_name: '',
                              speciality: staff.speciality || '',
                              password: '',
                              chave_pix: staff.chave_pix || '',
                              cnpj: staff.cnpj || '',
                              taxa_hora_aula: Number(staff.taxa_hora_aula || 56.00),
                              cpf: '',
                              data_pagamento_preferencial: 5,
                              first_class_at: '',
                              first_class_teacher_id: ''
                            })
                          }}
                        >
                          {t(language, 'edit')}
                        </button>
                        <button
                          className="secondary-button"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderColor: '#ef4444', color: '#ef4444' }}
                          onClick={() => void handleDeleteUser(staff.id)}
                        >
                          {t(language, 'delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Edit Modal Overlay */}
      {savingUserId && (userForm.role === 'admin' || userForm.role === 'teacher') && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="form-card" style={{ maxWidth: '450px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>{t(language, 'edit_staff_title')}</h3>
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
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
              >
                <option value="teacher">Professor</option>
                <option value="admin">Administrador</option>
              </select>
              <input
                placeholder="CNPJ ou CPF"
                value={userForm.cnpj || ''}
                onChange={(e) => setUserForm({ ...userForm, cnpj: e.target.value })}
              />
              <input
                placeholder="Chave PIX"
                value={userForm.chave_pix || ''}
                onChange={(e) => setUserForm({ ...userForm, chave_pix: e.target.value })}
              />
              {userForm.role === 'teacher' && (
                <input
                  type="number"
                  placeholder="Valor da Hora Aula"
                  value={userForm.taxa_hora_aula || ''}
                  onChange={(e) => setUserForm({ ...userForm, taxa_hora_aula: Number(e.target.value) })}
                />
              )}
              <input
                placeholder="Especialidade"
                value={userForm.speciality}
                onChange={(e) => setUserForm({ ...userForm, speciality: e.target.value })}
              />
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
                        role: userForm.role,
                        cnpj: userForm.cnpj || null,
                        chave_pix: userForm.chave_pix || null,
                        taxa_hora_aula: userForm.role === 'teacher' ? userForm.taxa_hora_aula : null,
                        speciality: userForm.speciality || null
                      })
                      .eq('id', userForm.id)
                    if (error) throw error
                    setSavingUserId(null)
                    await refreshProfiles()
                  } catch (err: any) {
                    toast.error(err.message)
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

      {/* Payroll Section */}
      <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#fff' }}>{t(language, 'payout_teachers_title')}</h3>
      <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '1.25rem', borderRadius: '1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{t(language, 'payout_month')}: </span>
          <strong style={{ color: '#fff', textTransform: 'capitalize' }}>
            {new Date().toLocaleDateString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en', { month: 'long', year: 'numeric' })}
          </strong>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            className="primary-button" 
            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            onClick={() => void handleBatchUpdatePayout('pago')}
          >
            {t(language, 'pay_all')}
          </button>
          <button 
            className="secondary-button" 
            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            onClick={() => void handleBatchUpdatePayout('pendente')}
          >
            {t(language, 'pending_all')}
          </button>
        </div>
      </div>

      <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>{t(language, 'teacher')}</th>
              <th style={{ padding: '1rem' }}>CPF/CNPJ</th>
              <th style={{ padding: '1rem' }}>Chave PIX</th>
              <th style={{ padding: '1rem' }}>{t(language, 'hours_worked')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'rate_hour')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'amount_due')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'status')}</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>{t(language, 'actions')}</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => {
              const teacherLessons = lessons.filter(l => 
                l.teacher_id === teacher.id && 
                l.teacher_lesson_status === 'happened'
              )
              const totalMinutes = teacherLessons.reduce((acc, l) => acc + l.duration_minutes, 0)
              const totalHours = totalMinutes / 60
              
              const hourlyRate = teacher.taxa_hora_aula ?? 56.00
              const currency = teacher.moeda_taxa ?? 'BRL'
              const amountDue = totalHours * Number(hourlyRate)

              return (
                <tr key={teacher.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>{teacher.full_name}</td>
                  <td style={{ padding: '1rem', color: '#94a3b8' }}>{teacher.cnpj || '-'}</td>
                  <td style={{ padding: '1rem', color: '#94a3b8' }}>{teacher.chave_pix || '-'}</td>
                  <td style={{ padding: '1rem' }}>{totalHours.toFixed(1)}h</td>
                  <td style={{ padding: '1rem' }}>{currency} {Number(hourlyRate).toFixed(2)}</td>
                  <td style={{ padding: '1rem', fontWeight: 'bold', color: '#38bdf8' }}>
                    {currency} {amountDue.toFixed(2)}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span className={badgeClass(teacher.status_pagamento_professor === 'pago' ? 'confirmed' : 'pending')}>
                      {teacher.status_pagamento_professor === 'pago' ? t(language, 'paid') : t(language, 'pending')}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                      className="primary-button"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => void handleUpdateTeacherPayout(teacher.id, 'pago')}
                    >
                      {t(language, 'paid')}
                    </button>
                    <button
                      className="secondary-button"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => void handleUpdateTeacherPayout(teacher.id, 'pendente')}
                    >
                      {t(language, 'pending')}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
