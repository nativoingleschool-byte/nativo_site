import { FormEvent, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
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

  const [changePasswordStaff, setChangePasswordStaff] = useState<Profile | null>(null)
  const [newPasswordValue, setNewPasswordValue] = useState('')
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [selectedTeacherForDetail, setSelectedTeacherForDetail] = useState<Profile | null>(null)
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')

  const [initialUserForm, setInitialUserForm] = useState<UserFormState | null>(null)
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
  const activeCardRef = useRef<HTMLDivElement | null>(null)
  const editStaffCardRef = useRef<HTMLDivElement>(null)
  const changePasswordCardRef = useRef<HTMLDivElement>(null)
  const teacherDetailCardRef = useRef<HTMLDivElement>(null)

  // Generate available months list from all lessons
  const availablePayrollMonths = useMemo(() => {
    const monthsMap = new Map<string, string>()
    lessons.forEach((l) => {
      if (l.starts_at) {
        const key = l.starts_at.slice(0, 7)
        if (!monthsMap.has(key)) {
          const [yr, mo] = key.split('-')
          const dObj = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 1)
          const monthLabel = dObj.toLocaleDateString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en', {
            month: 'long',
            year: 'numeric',
          })
          monthsMap.set(key, monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1))
        }
      }
    })

    const currentMonthKey = new Date().toISOString().slice(0, 7)
    if (!monthsMap.has(currentMonthKey)) {
      const dObj = new Date()
      const monthLabel = dObj.toLocaleDateString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en', {
        month: 'long',
        year: 'numeric',
      })
      monthsMap.set(currentMonthKey, monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1))
    }

    return Array.from(monthsMap.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [lessons, language])

  const activePayrollMonthKey = useMemo(() => {
    if (selectedMonthKey && availablePayrollMonths.some(([k]) => k === selectedMonthKey)) {
      return selectedMonthKey
    }
    return availablePayrollMonths[0]?.[0] || new Date().toISOString().slice(0, 7)
  }, [selectedMonthKey, availablePayrollMonths])

  const handleUpdateLessonStatus = async (lessonId: string, status: 'happened' | 'student_no_show' | 'not_happened' | null) => {
    try {
      const { error } = await supabase
        .from('lessons')
        .update({
          teacher_lesson_status: status,
          status: status === 'happened' ? 'concluida' : status === 'not_happened' ? 'cancelada' : 'agendada',
        })
        .eq('id', lessonId)
      if (error) throw error
      toast.success(t(language, 'data_updated_success'))
      await refreshLessons()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar status da aula.')
    }
  }

  const handleBatchConfirmMonthLessons = async (teacherId: string, monthKey: string) => {
    try {
      const activeTeacherMonthLessons = lessons.filter(
        (l) =>
          l.teacher_id === teacherId &&
          l.starts_at &&
          l.starts_at.slice(0, 7) === monthKey &&
          l.status !== 'cancelada' &&
          l.teacher_lesson_status !== 'not_happened'
      )
      if (activeTeacherMonthLessons.length === 0) {
        toast.error('Nenhuma aula ativa encontrada para este professor neste mês.')
        return
      }
      const ids = activeTeacherMonthLessons.map((l) => l.id)
      const { error } = await supabase
        .from('lessons')
        .update({
          teacher_lesson_status: 'happened',
          status: 'concluida',
        })
        .in('id', ids)
      if (error) throw error
      toast.success(`${ids.length} aulas confirmadas como realizadas!`)
      await refreshLessons()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao confirmar aulas.')
    }
  }

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
      toast.success(t(language, 'staff_member_added').replace('{name}', created.full_name))
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
                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>
                      {staff.role === 'teacher' ? (
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: '#38bdf8', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: 0, textAlign: 'left' }}
                          onClick={() => {
                            setSelectedTeacherForDetail(staff)
                            setSelectedMonthKey('')
                          }}
                        >
                          {staff.full_name}
                        </button>
                      ) : (
                        staff.full_name
                      )}
                    </td>
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
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          className="secondary-button"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderColor: '#38bdf8', color: '#38bdf8' }}
                          onClick={() => {
                            setChangePasswordStaff(staff)
                            setNewPasswordValue('')
                            setConfirmPasswordValue('')
                          }}
                        >
                          {t(language, 'change_password')}
                        </button>
                        <button
                          className="secondary-button"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => {
                            setSavingUserId(staff.id)
                            const initial = {
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
                            }
                            setUserForm(initial)
                            setInitialUserForm(initial)
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
      {savingUserId && (userForm.role === 'admin' || userForm.role === 'teacher') && createPortal(
        <div
          className="reminder-app-scope modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(2, 6, 23, 0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
          onClick={(e) => {
            if (editStaffCardRef.current && !editStaffCardRef.current.contains(e.target as Node)) {
              const isDirty = initialUserForm ? (
                userForm.full_name !== initialUserForm.full_name ||
                userForm.email !== initialUserForm.email ||
                (userForm.password || '') !== (initialUserForm.password || '') ||
                userForm.role !== initialUserForm.role ||
                (userForm.cnpj || '') !== (initialUserForm.cnpj || '') ||
                (userForm.chave_pix || '') !== (initialUserForm.chave_pix || '') ||
                (userForm.speciality || '') !== (initialUserForm.speciality || '') ||
                Number(userForm.taxa_hora_aula || 0) !== Number(initialUserForm.taxa_hora_aula || 0)
              ) : false

              if (isDirty) {
                setShowUnsavedWarning(true)
                const btn = editStaffCardRef.current.querySelector('.button-stack') || editStaffCardRef.current.querySelector('.primary-button')
                btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                toast.error(t(language, 'save_or_cancel_first'))
              } else {
                setSavingUserId(null)
                setInitialUserForm(null)
                setShowUnsavedWarning(false)
              }
            }
          }}
        >
          <div ref={editStaffCardRef} className="form-card" style={{ maxWidth: '450px', width: '100%', maxHeight: '85vh', overflowY: 'auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'new_password')}</label>
                <input
                  type="password"
                  placeholder={t(language, 'new_password_placeholder')}
                  value={userForm.password || ''}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                />
              </div>
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
                  step="0.01"
                  placeholder={t(language, 'value_hour_label')}
                  value={userForm.taxa_hora_aula ?? ''}
                  onChange={(e) => setUserForm({ ...userForm, taxa_hora_aula: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              )}
              <input
                placeholder={t(language, 'speciality_label')}
              value={userForm.speciality || ''}
              onChange={(e) => setUserForm({ ...userForm, speciality: e.target.value })}
            />
          </div>

          {showUnsavedWarning && (
            <div
              className="animate-fade-in"
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid #f59e0b',
                borderRadius: '0.75rem',
                padding: '0.85rem 1rem',
                marginTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                color: '#fbbf24',
                fontSize: '0.88rem',
                fontWeight: 600,
                boxShadow: '0 0 20px rgba(245, 158, 11, 0.25)'
              }}
            >
              <span style={{ fontSize: '1.3rem' }}>⚠️</span>
              <span>{t(language, 'save_or_cancel_first')}</span>
            </div>
          )}

          <div className="button-stack mt-6" style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button 
              type="button"
              className="primary-button" 
              onClick={async () => {
                if (!userForm.id) return
                try {
                  if (userForm.password && userForm.password.trim().length > 0) {
                    if (userForm.password.length < 6) {
                      toast.error(t(language, 'password_too_short'))
                      return
                    }
                  }
                  await callAdminUsersApi('update', {
                    id: userForm.id,
                    email: userForm.email,
                    full_name: userForm.full_name,
                    role: userForm.role,
                    cnpj: userForm.cnpj || null,
                    chave_pix: userForm.chave_pix || null,
                    taxa_hora_aula: userForm.role === 'teacher' ? userForm.taxa_hora_aula : null,
                    speciality: userForm.speciality || null,
                    ...(userForm.password && userForm.password.trim().length > 0 ? { password: userForm.password } : {})
                  })
                  toast.success(language === 'es' ? 'Datos actualizados con éxito.' : language === 'en' ? 'Details updated successfully.' : 'Dados atualizados com sucesso.')
                  setSavingUserId(null)
                  setInitialUserForm(null)
                  setShowUnsavedWarning(false)
                  await refreshProfiles()
                } catch (err: any) {
                  toast.error(err.message)
                }
              }}
            >
              {t(language, 'save')}
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setSavingUserId(null)
                setInitialUserForm(null)
                setShowUnsavedWarning(false)
              }}
            >
              {t(language, 'cancel')}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

      {/* Change Password Modal Overlay */}
      {changePasswordStaff && createPortal(
        <div
          className="reminder-app-scope modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(2, 6, 23, 0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
          onClick={(e) => {
            if (changePasswordCardRef.current && !changePasswordCardRef.current.contains(e.target as Node)) {
              const isDirty = newPasswordValue.trim().length > 0 || confirmPasswordValue.trim().length > 0
              if (isDirty) {
                setShowUnsavedWarning(true)
                const btn = changePasswordCardRef.current.querySelector('.button-stack') || changePasswordCardRef.current.querySelector('.primary-button')
                btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                toast.error(t(language, 'save_or_cancel_first'))
              } else {
                setChangePasswordStaff(null)
                setShowUnsavedWarning(false)
              }
            }
          }}
        >
          <div ref={changePasswordCardRef} className="form-card" style={{ maxWidth: '450px', width: '100%', maxHeight: '85vh', overflowY: 'auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#fff' }}>
              {t(language, 'change_password_title').replace('{name}', changePasswordStaff.full_name)}
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (newPasswordValue.length < 6) {
                  toast.error(t(language, 'password_too_short'))
                  return
                }
                if (newPasswordValue !== confirmPasswordValue) {
                  toast.error(t(language, 'passwords_do_not_match'))
                  return
                }
                setIsUpdatingPassword(true)
                try {
                  await callAdminUsersApi('update', {
                    id: changePasswordStaff.id,
                    email: changePasswordStaff.email,
                    full_name: changePasswordStaff.full_name,
                    role: changePasswordStaff.role,
                    password: newPasswordValue,
                  })
                  toast.success(t(language, 'password_updated_success'))
                  setChangePasswordStaff(null)
                  setNewPasswordValue('')
                  setConfirmPasswordValue('')
                } catch (err: any) {
                  toast.error(err.message || 'Erro ao alterar senha.')
                } finally {
                  setIsUpdatingPassword(false)
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'new_password')}</label>
                <input
                  required
                  type="password"
                  placeholder={t(language, 'new_password')}
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t(language, 'confirm_new_password')}</label>
                <input
                  required
                  type="password"
                  placeholder={t(language, 'confirm_new_password')}
                  value={confirmPasswordValue}
                  onChange={(e) => setConfirmPasswordValue(e.target.value)}
                  style={{ padding: '0.6rem 0.8rem', background: '#090d16', border: '1px solid #1e293b', borderRadius: '0.6rem', color: '#fff' }}
                />
              </div>
              <div className="button-stack mt-6" style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <button type="submit" className="primary-button" disabled={isUpdatingPassword}>
                  {isUpdatingPassword ? t(language, 'save') + '...' : t(language, 'save')}
                </button>
                <button type="button" className="secondary-button" onClick={() => setChangePasswordStaff(null)}>
                  {t(language, 'cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Payroll Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#fff', margin: 0 }}>{t(language, 'payout_teachers_title')}</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>Acompanhe e confirme as horas e valores apurados das aulas de cada professor.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{t(language, 'payout_month')}:</span>
            <select
              value={activePayrollMonthKey}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                background: '#090d16',
                border: '1px solid #334155',
                borderRadius: '0.6rem',
                color: '#fff',
                fontSize: '0.88rem',
                fontWeight: 600,
              }}
            >
              {availablePayrollMonths.map(([mKey, mLabel]) => (
                <option key={mKey} value={mKey}>
                  {mLabel}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="primary-button" 
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
              onClick={() => void handleBatchUpdatePayout('pago')}
            >
              {t(language, 'pay_all')}
            </button>
            <button 
              className="secondary-button" 
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
              onClick={() => void handleBatchUpdatePayout('pendente')}
            >
              {t(language, 'pending_all')}
            </button>
          </div>
        </div>
      </div>

      <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>{t(language, 'teacher')}</th>
              <th style={{ padding: '1rem' }}>CPF/CNPJ</th>
              <th style={{ padding: '1rem' }}>Chave PIX</th>
              <th style={{ padding: '1rem' }}>Aulas (Mês)</th>
              <th style={{ padding: '1rem' }}>{t(language, 'hours_worked')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'rate_hour')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'amount_due')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'status')}</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>{t(language, 'actions')}</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => {
              const teacherMonthLessons = lessons.filter(
                (l) => l.teacher_id === teacher.id && l.starts_at && l.starts_at.slice(0, 7) === activePayrollMonthKey
              )
              const completedLessons = teacherMonthLessons.filter((l) => l.teacher_lesson_status === 'happened')
              const activeLessons = teacherMonthLessons.filter(
                (l) => l.status !== 'cancelada' && l.teacher_lesson_status !== 'not_happened' && l.status !== 'proposta_pendente'
              )
              const scheduledOnlyLessons = activeLessons.filter((l) => !l.teacher_lesson_status)

              const completedMinutes = completedLessons.reduce((acc, l) => acc + (l.duration_minutes || 60), 0)
              const completedHours = completedMinutes / 60

              const totalActiveMinutes = activeLessons.reduce((acc, l) => acc + (l.duration_minutes || 60), 0)
              const totalActiveHours = totalActiveMinutes / 60

              const hourlyRate = teacher.taxa_hora_aula ?? 56.00
              const currency = teacher.moeda_taxa ?? 'BRL'
              const completedAmount = completedHours * Number(hourlyRate)
              const totalActiveAmount = totalActiveHours * Number(hourlyRate)

              return (
                <tr key={teacher.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#38bdf8', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: 0, textAlign: 'left' }}
                      onClick={() => {
                        setSelectedTeacherForDetail(teacher)
                        setSelectedMonthKey(activePayrollMonthKey)
                      }}
                      title="Ver histórico e aulas detalhadas do mês"
                    >
                      {teacher.full_name}
                    </button>
                  </td>
                  <td style={{ padding: '1rem', color: '#94a3b8' }}>{teacher.cnpj || teacher.cpf || '-'}</td>
                  <td style={{ padding: '1rem', color: '#94a3b8' }}>{teacher.chave_pix || '-'}</td>
                  <td style={{ padding: '1rem' }}>
                    {activeLessons.length === 0 ? (
                      <span style={{ color: '#64748b' }}>0</span>
                    ) : completedLessons.length === activeLessons.length ? (
                      <strong style={{ color: '#10b981' }}>{completedLessons.length} realizadas</strong>
                    ) : completedLessons.length > 0 ? (
                      <span>
                        <strong style={{ color: '#10b981' }}>{completedLessons.length}</strong> / {activeLessons.length}{' '}
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({scheduledOnlyLessons.length} agendadas)</span>
                      </span>
                    ) : (
                      <span style={{ color: '#818cf8' }}>
                        {activeLessons.length} agendadas
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {totalActiveHours === 0 ? (
                      <span style={{ color: '#64748b' }}>0.0h</span>
                    ) : completedHours > 0 && scheduledOnlyLessons.length > 0 ? (
                      <div>
                        <strong style={{ color: '#10b981' }}>{completedHours.toFixed(1)}h</strong>{' '}
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({totalActiveHours.toFixed(1)}h total)</span>
                      </div>
                    ) : completedHours > 0 ? (
                      <strong style={{ color: '#10b981' }}>{completedHours.toFixed(1)}h</strong>
                    ) : (
                      <span style={{ color: '#818cf8' }}>
                        {totalActiveHours.toFixed(1)}h <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>(na agenda)</span>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>{currency} {Number(hourlyRate).toFixed(2)}</td>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>
                    {totalActiveAmount === 0 ? (
                      <span style={{ color: '#64748b' }}>{currency} 0.00</span>
                    ) : completedAmount > 0 && totalActiveAmount > completedAmount ? (
                      <div>
                        <strong style={{ color: '#10b981' }}>{currency} {completedAmount.toFixed(2)}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'normal' }}>
                          Previsto: {currency} {totalActiveAmount.toFixed(2)}
                        </div>
                      </div>
                    ) : completedAmount > 0 ? (
                      <strong style={{ color: '#10b981' }}>{currency} {completedAmount.toFixed(2)}</strong>
                    ) : (
                      <div>
                        <strong style={{ color: '#38bdf8' }}>{currency} {totalActiveAmount.toFixed(2)}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 'normal' }}>
                          (previsto na agenda)
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span className={badgeClass(teacher.status_pagamento_professor === 'pago' ? 'confirmed' : 'pending')}>
                      {teacher.status_pagamento_professor === 'pago' ? t(language, 'paid') : t(language, 'pending')}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
                      {scheduledOnlyLessons.length > 0 && (
                        <button
                          type="button"
                          className="primary-button"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', background: '#059669' }}
                          onClick={() => void handleBatchConfirmMonthLessons(teacher.id, activePayrollMonthKey)}
                          title={`Confirmar todas as ${scheduledOnlyLessons.length} aulas agendadas deste mês como realizadas`}
                        >
                          ✓ Confirmar ({scheduledOnlyLessons.length})
                        </button>
                      )}
                      <button
                        type="button"
                        className="secondary-button"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          setSelectedTeacherForDetail(teacher)
                          setSelectedMonthKey(activePayrollMonthKey)
                        }}
                      >
                        👁️ Detalhes
                      </button>
                      <button
                        className="primary-button"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => void handleUpdateTeacherPayout(teacher.id, 'pago')}
                      >
                        {t(language, 'paid')}
                      </button>
                      <button
                        className="secondary-button"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={() => void handleUpdateTeacherPayout(teacher.id, 'pendente')}
                      >
                        {t(language, 'pending')}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Teacher Detail & History Modal Overlay */}
      {selectedTeacherForDetail && (() => {
        const teacherLessons = lessons.filter(l => l.teacher_id === selectedTeacherForDetail.id)
        
        // Group months
        const availableMonthsMap = new Map<string, string>()
        teacherLessons.forEach(l => {
          if (l.starts_at) {
            const key = l.starts_at.slice(0, 7)
            if (!availableMonthsMap.has(key)) {
              const [yr, mo] = key.split('-')
              const dObj = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 1)
              const monthLabel = dObj.toLocaleDateString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en', { month: 'long', year: 'numeric' })
              availableMonthsMap.set(key, monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1))
            }
          }
        })

        const currentMonthKey = new Date().toISOString().slice(0, 7)
        if (!availableMonthsMap.has(currentMonthKey)) {
          const dObj = new Date()
          const monthLabel = dObj.toLocaleDateString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en', { month: 'long', year: 'numeric' })
          availableMonthsMap.set(currentMonthKey, monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1))
        }

        const availableMonths = Array.from(availableMonthsMap.entries()).sort((a, b) => b[0].localeCompare(a[0]))
        const activeMonthKey = selectedMonthKey && availableMonthsMap.has(selectedMonthKey)
          ? selectedMonthKey
          : activePayrollMonthKey && availableMonthsMap.has(activePayrollMonthKey)
          ? activePayrollMonthKey
          : availableMonths[0][0]

        const monthLessons = teacherLessons
          .filter(l => l.starts_at && l.starts_at.slice(0, 7) === activeMonthKey)
          .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())

        const completedLessons = monthLessons.filter(l => l.teacher_lesson_status === 'happened')
        const activeLessons = monthLessons.filter(
          l => l.status !== 'cancelada' && l.teacher_lesson_status !== 'not_happened' && l.status !== 'proposta_pendente'
        )
        const scheduledOnlyLessons = activeLessons.filter(l => !l.teacher_lesson_status)

        const completedMinutes = completedLessons.reduce((acc, l) => acc + (l.duration_minutes || 60), 0)
        const completedHours = completedMinutes / 60

        const totalActiveMinutes = activeLessons.reduce((acc, l) => acc + (l.duration_minutes || 60), 0)
        const totalActiveHours = totalActiveMinutes / 60

        const hourlyRate = selectedTeacherForDetail.taxa_hora_aula ?? 56.00
        const currency = selectedTeacherForDetail.moeda_taxa ?? 'BRL'
        const completedAmount = completedHours * Number(hourlyRate)
        const totalActiveAmount = totalActiveHours * Number(hourlyRate)

        return createPortal(
          <div
            className="reminder-app-scope modal-overlay"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(2, 6, 23, 0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
            onClick={(e) => {
              if (teacherDetailCardRef.current && !teacherDetailCardRef.current.contains(e.target as Node)) {
                setSelectedTeacherForDetail(null)
              }
            }}
          >
            <div ref={teacherDetailCardRef} className="form-card animate-fade-in" style={{ maxWidth: '900px', width: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#fff', margin: 0 }}>{selectedTeacherForDetail.full_name}</h3>
                    <span className="badge badge-confirmed" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>{t(language, 'teacher')}</span>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>{selectedTeacherForDetail.email}</p>
                </div>
                <button
                  className="secondary-button"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => setSelectedTeacherForDetail(null)}
                >
                  ✕ {t(language, 'close')}
                </button>
              </div>

              {/* Grid: Teacher Info & NF Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                
                {/* Info Card */}
                <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '1.25rem', borderRadius: '1rem', border: '1px solid #1e293b' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#38bdf8', marginBottom: '0.75rem' }}>{t(language, 'payment_info_title')}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div><span style={{ color: '#94a3b8' }}>CPF/CNPJ:</span> <strong style={{ color: '#f8fafc' }}>{selectedTeacherForDetail.cnpj || selectedTeacherForDetail.cpf || '-'}</strong></div>
                    <div><span style={{ color: '#94a3b8' }}>{t(language, 'pix_label')}:</span> <strong style={{ color: '#f8fafc' }}>{selectedTeacherForDetail.chave_pix || '-'}</strong></div>
                    <div><span style={{ color: '#94a3b8' }}>{t(language, 'rate_hour')}:</span> <strong style={{ color: '#10b981' }}>{currency} {Number(hourlyRate).toFixed(2)}</strong></div>
                    <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>{t(language, 'status')}:</span>
                      <span className={badgeClass(selectedTeacherForDetail.status_pagamento_professor === 'pago' ? 'confirmed' : 'pending')}>
                        {selectedTeacherForDetail.status_pagamento_professor === 'pago' ? t(language, 'paid') : t(language, 'pending')}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="primary-button"
                        style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem', background: '#10b981' }}
                        onClick={async () => {
                          await handleUpdateTeacherPayout(selectedTeacherForDetail.id, 'pago')
                          setSelectedTeacherForDetail({ ...selectedTeacherForDetail, status_pagamento_professor: 'pago' })
                        }}
                      >
                        {t(language, 'mark_paid_btn')}
                      </button>
                      <button
                        className="secondary-button"
                        style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem' }}
                        onClick={async () => {
                          await handleUpdateTeacherPayout(selectedTeacherForDetail.id, 'pendente')
                          setSelectedTeacherForDetail({ ...selectedTeacherForDetail, status_pagamento_professor: 'pendente' })
                        }}
                      >
                        {t(language, 'mark_pending_btn')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* NF Card */}
                <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '1.25rem', borderRadius: '1rem', border: '1px solid #1e293b' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#38bdf8', marginBottom: '0.75rem' }}>{t(language, 'sent_invoices_title')}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Status NF:</span>
                      <span className={badgeClass(selectedTeacherForDetail.status_nota_fiscal === 'enviada' ? 'confirmed' : selectedTeacherForDetail.status_nota_fiscal === 'nao_se_aplica' ? 'secondary' : 'pending')}>
                        {selectedTeacherForDetail.status_nota_fiscal === 'enviada' ? t(language, 'nf_status_sent') : selectedTeacherForDetail.status_nota_fiscal === 'nao_se_aplica' ? t(language, 'nf_status_na') : t(language, 'nf_status_pending')}
                      </span>
                    </div>

                    {selectedTeacherForDetail.nota_fiscal_url ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>{t(language, 'file_sent_by_teacher')}</p>
                        <button
                          type="button"
                          className="primary-button"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#0284c7' }}
                          onClick={() => {
                            try {
                              const url = selectedTeacherForDetail.nota_fiscal_url!
                              if (url.startsWith('data:')) {
                                const parts = url.split(',')
                                const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf'
                                const bstr = atob(parts[1])
                                let n = bstr.length
                                const u8arr = new Uint8Array(n)
                                while (n--) {
                                  u8arr[n] = bstr.charCodeAt(n)
                                }
                                const blob = new Blob([u8arr], { type: mime })
                                const blobUrl = URL.createObjectURL(blob)
                                const win = window.open(blobUrl, '_blank')
                                if (!win) {
                                  const a = document.createElement('a')
                                  a.href = blobUrl
                                  a.download = `Nota_Fiscal_${selectedTeacherForDetail.full_name.replace(/\s+/g, '_')}.pdf`
                                  a.click()
                                }
                              } else {
                                window.open(url, '_blank')
                              }
                            } catch (e) {
                              window.open(selectedTeacherForDetail.nota_fiscal_url!, '_blank')
                            }
                          }}
                        >
                          {t(language, 'view_download_nf')}
                        </button>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                        {selectedTeacherForDetail.status_nota_fiscal === 'enviada'
                          ? t(language, 'nf_marked_sent')
                          : t(language, 'no_nf_attached_month')}
                      </p>
                    )}

                    {/* Admin Actions for NF */}
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <label className="secondary-button" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', padding: '0.35rem 0.7rem', cursor: 'pointer' }}>
                        <span>{selectedTeacherForDetail.nota_fiscal_url ? t(language, 'replace_nf_btn') : t(language, 'attach_nf_btn')}</span>
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            if (!e.target.files?.[0]) return
                            const file = e.target.files[0]
                            const reader = new FileReader()
                            reader.onload = async () => {
                              const fileUrl = reader.result as string
                              await supabase.from('profiles').update({
                                status_nota_fiscal: 'enviada',
                                nota_fiscal_url: fileUrl
                              }).eq('id', selectedTeacherForDetail.id)
                              setSelectedTeacherForDetail({
                                ...selectedTeacherForDetail,
                                status_nota_fiscal: 'enviada',
                                nota_fiscal_url: fileUrl
                              })
                              await refreshProfiles()
                              toast.success(t(language, 'nf_upload_success'))
                            }
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                      <button
                        className="secondary-button"
                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem' }}
                        onClick={async () => {
                          const nextStatus = selectedTeacherForDetail.status_nota_fiscal === 'enviada' ? 'pendente' : 'enviada'
                          await supabase.from('profiles').update({ status_nota_fiscal: nextStatus }).eq('id', selectedTeacherForDetail.id)
                          setSelectedTeacherForDetail({ ...selectedTeacherForDetail, status_nota_fiscal: nextStatus })
                          await refreshProfiles()
                          toast.success(t(language, 'data_updated_success'))
                        }}
                      >
                        {t(language, 'toggle_status_btn')}
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Monthly Lesson History */}
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '1rem', border: '1px solid #1e293b', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', margin: 0 }}>{t(language, 'monthly_class_history')}</h4>
                    <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: 0 }}>Gerencie o status de cada aula trazida da agenda ou adicione confirmações.</p>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Month Selector */}
                    <select
                      value={activeMonthKey}
                      onChange={(e) => setSelectedMonthKey(e.target.value)}
                      style={{ padding: '0.45rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}
                    >
                      {availableMonths.map(([mKey, mLabel]) => (
                        <option key={mKey} value={mKey}>{mLabel}</option>
                      ))}
                    </select>

                    {scheduledOnlyLessons.length > 0 && (
                      <button
                        type="button"
                        className="primary-button"
                        style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', background: '#059669' }}
                        onClick={() => void handleBatchConfirmMonthLessons(selectedTeacherForDetail.id, activeMonthKey)}
                        title={`Confirmar todas as ${scheduledOnlyLessons.length} aulas agendadas deste mês como realizadas`}
                      >
                        ✓ Confirmar Todas ({scheduledOnlyLessons.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Monthly Summary Bar */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '0.75rem', borderRadius: '0.75rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>{t(language, 'classes_conducted')}</span>
                    <strong style={{ fontSize: '1.15rem', color: '#fff' }}>
                      {completedLessons.length} <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'normal' }}>/ {activeLessons.length}</span>
                    </strong>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '0.75rem', borderRadius: '0.75rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>{t(language, 'total_hours_worked')}</span>
                    <strong style={{ fontSize: '1.15rem', color: '#38bdf8' }}>
                      {completedHours.toFixed(1)}h
                      {scheduledOnlyLessons.length > 0 && (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'normal' }}> ({totalActiveHours.toFixed(1)}h agenda)</span>
                      )}
                    </strong>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '0.75rem', borderRadius: '0.75rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>{t(language, 'calculated_amount')}</span>
                    <strong style={{ fontSize: '1.15rem', color: '#10b981' }}>
                      {currency} {completedAmount > 0 ? completedAmount.toFixed(2) : totalActiveAmount.toFixed(2)}
                    </strong>
                    {completedAmount > 0 && totalActiveAmount > completedAmount && (
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Previsto: {currency} {totalActiveAmount.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Monthly Lessons Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                        <th style={{ padding: '0.6rem' }}>{t(language, 'date_time_col')}</th>
                        <th style={{ padding: '0.6rem' }}>{t(language, 'student_col')}</th>
                        <th style={{ padding: '0.6rem' }}>{t(language, 'class_subject_col')}</th>
                        <th style={{ padding: '0.6rem' }}>{t(language, 'duration_col')}</th>
                        <th style={{ padding: '0.6rem' }}>{t(language, 'status')}</th>
                        <th style={{ padding: '0.6rem' }}>Ajustar Status</th>
                        <th style={{ padding: '0.6rem', textAlign: 'right' }}>{t(language, 'value_col')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthLessons.map((l) => {
                        const studentName = profiles.find(p => p.id === l.student_id)?.full_name || t(language, 'role_student')
                        const isHappened = l.teacher_lesson_status === 'happened'
                        const isNoShow = l.teacher_lesson_status === 'student_no_show'
                        const isNotHappened = l.teacher_lesson_status === 'not_happened'
                        const isScheduled = !l.teacher_lesson_status

                        const lessonHours = (l.duration_minutes || 60) / 60
                        const lessonVal = isHappened ? lessonHours * Number(hourlyRate) : 0

                        return (
                          <tr key={l.id} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '0.6rem', color: '#f8fafc' }}>
                              {new Date(l.starts_at).toLocaleString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td style={{ padding: '0.6rem', fontWeight: 'bold', color: '#38bdf8' }}>{studentName}</td>
                            <td style={{ padding: '0.6rem', color: '#94a3b8' }}>{l.subject || l.class_name || '-'}</td>
                            <td style={{ padding: '0.6rem', color: '#cbd5e1' }}>{l.duration_minutes || 60} min</td>
                            <td style={{ padding: '0.6rem' }}>
                              <span className={badgeClass(
                                isHappened ? 'confirmed' :
                                isNoShow ? 'pending' :
                                isNotHappened ? 'danger' : 'secondary'
                              )}>
                                {isHappened ? t(language, 'status_happened') :
                                 isNoShow ? t(language, 'status_student_noshow') :
                                 isNotHappened ? t(language, 'status_not_happened') : t(language, 'scheduled_badge')}
                              </span>
                            </td>
                            <td style={{ padding: '0.6rem' }}>
                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateLessonStatus(l.id, 'happened')}
                                  style={{
                                    padding: '0.2rem 0.45rem',
                                    borderRadius: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    background: isHappened ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
                                    color: isHappened ? '#0f172a' : '#10b981',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                  }}
                                  title="Marcar como Realizada / Computar na folha"
                                >
                                  ✓ Realizada
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateLessonStatus(l.id, 'student_no_show')}
                                  style={{
                                    padding: '0.2rem 0.45rem',
                                    borderRadius: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    background: isNoShow ? '#f59e0b' : 'rgba(245, 158, 11, 0.12)',
                                    color: isNoShow ? '#0f172a' : '#fbbf24',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                  }}
                                  title="Marcar como Falta do Aluno"
                                >
                                  Falta
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateLessonStatus(l.id, 'not_happened')}
                                  style={{
                                    padding: '0.2rem 0.45rem',
                                    borderRadius: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    background: isNotHappened ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                                    color: isNotHappened ? '#fff' : '#f87171',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                  }}
                                  title="Marcar como Não Aconteceu / Cancelada"
                                >
                                  Cancelada
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateLessonStatus(l.id, null)}
                                  style={{
                                    padding: '0.2rem 0.45rem',
                                    borderRadius: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    background: isScheduled ? '#6366f1' : 'rgba(99, 102, 241, 0.12)',
                                    color: isScheduled ? '#fff' : '#818cf8',
                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                  }}
                                  title="Manter como Agendada"
                                >
                                  Agendada
                                </button>
                              </div>
                            </td>
                            <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 'bold', color: isHappened ? '#10b981' : '#64748b' }}>
                              {currency} {lessonVal.toFixed(2)}
                            </td>
                          </tr>
                        )
                      })}
                      {monthLessons.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                            {t(language, 'no_classes_month')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>,
          document.body
        )
      })()}
    </>
  )
}
