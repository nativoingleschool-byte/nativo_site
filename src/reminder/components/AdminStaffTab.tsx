import { FormEvent, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Lesson, Profile, UserFormState } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { badgeClass, groupLessonsIntoTeacherSessions, TeacherLessonSession } from '../lib/utils'
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

  // Helper functions for month navigation
  const getNextMonthKey = (monthKey: string): string => {
    const [yearStr, monthStr] = monthKey.split('-')
    let year = parseInt(yearStr, 10)
    let month = parseInt(monthStr, 10)
    if (month === 12) {
      year += 1
      month = 1
    } else {
      month += 1
    }
    return `${year}-${String(month).padStart(2, '0')}`
  }

  const getMonthLabel = (monthKey: string, lang: Language): string => {
    const [yearStr, monthStr] = monthKey.split('-')
    const dObj = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1)
    const label = dObj.toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es' : 'en', {
      month: 'long',
      year: 'numeric',
    })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  // Persistent record of paid months for each teacher
  const [paidMonthsByTeacher, setPaidMonthsByTeacher] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem('nativo_teacher_paid_months_map')
      if (raw) return JSON.parse(raw)
    } catch (e) {}
    return {}
  })

  // Get active payout month for a teacher: starting from current month (2026-08), advancing when marked as paid
  const getTeacherActivePayoutMonth = (teacherId: string): string => {
    if (selectedMonthKey && selectedMonthKey !== 'auto') {
      return selectedMonthKey
    }
    const baseMonth = '2026-08'
    let current = baseMonth
    const paidList = paidMonthsByTeacher[teacherId] || []
    while (paidList.includes(current)) {
      current = getNextMonthKey(current)
    }
    return current
  }

  const markTeacherMonthPaid = async (teacherId: string, monthKey: string, isPaid: boolean) => {
    try {
      const currentList = paidMonthsByTeacher[teacherId] || []
      let newList: string[] = []
      if (isPaid) {
        newList = currentList.includes(monthKey) ? currentList : [...currentList, monthKey]
      } else {
        newList = currentList.filter((m) => m !== monthKey)
      }
      const updatedMap = { ...paidMonthsByTeacher, [teacherId]: newList }
      setPaidMonthsByTeacher(updatedMap)
      localStorage.setItem('nativo_teacher_paid_months_map', JSON.stringify(updatedMap))

      await handleUpdateTeacherPayout(teacherId, isPaid ? 'pago' : 'pendente')

      const monthLabel = getMonthLabel(monthKey, language)
      if (isPaid) {
        const nextMonth = getNextMonthKey(monthKey)
        const nextMonthLabel = getMonthLabel(nextMonth, language)
        toast.success(`Mês ${monthLabel} marcado como PAGO! Agora exibindo ${nextMonthLabel}.`)
        if (selectedTeacherForDetail?.id === teacherId) {
          setSelectedMonthKey(nextMonth)
        }
      } else {
        toast.success(`Mês ${monthLabel} desmarcado como pago.`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar pagamento do mês.')
    }
  }

  // Generate available months list from all lessons
  const availablePayrollMonths = useMemo(() => {
    const monthsMap = new Map<string, string>()
    lessons.forEach((l) => {
      if (l.starts_at) {
        const key = l.starts_at.slice(0, 7)
        if (!monthsMap.has(key)) {
          monthsMap.set(key, getMonthLabel(key, language))
        }
      }
    })

    const baseMonthKey = '2026-08'
    if (!monthsMap.has(baseMonthKey)) {
      monthsMap.set(baseMonthKey, getMonthLabel(baseMonthKey, language))
    }

    return Array.from(monthsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [lessons, language])

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

  const handleUpdateSessionStatus = async (lessonIds: string[], status: 'happened' | 'student_no_show' | 'not_happened' | null) => {
    try {
      if (lessonIds.length === 0) return
      const { error } = await supabase
        .from('lessons')
        .update({
          teacher_lesson_status: status,
          status: status === 'happened' ? 'concluida' : status === 'not_happened' ? 'cancelada' : 'agendada',
        })
        .in('id', lessonIds)
      if (error) throw error
      toast.success(t(language, 'data_updated_success'))
      await refreshLessons()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar status da turma.')
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
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>
            Clique no valor de qualquer professor para ver o registro de aulas, copiar a chave PIX e marcar o mês como pago.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Filtro de Mês:</span>
            <select
              value={selectedMonthKey || 'auto'}
              onChange={(e) => setSelectedMonthKey(e.target.value === 'auto' ? '' : e.target.value)}
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
              <option value="auto">Mês Vigente de Cada Professor (Início: Agosto 2026)</option>
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
              <th style={{ padding: '1rem' }}>Mês Referência</th>
              <th style={{ padding: '1rem' }}>Chave PIX</th>
              <th style={{ padding: '1rem' }}>Aulas (Mês)</th>
              <th style={{ padding: '1rem' }}>{t(language, 'hours_worked')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'rate_hour')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'amount_due')} (Clique p/ Detalhes)</th>
              <th style={{ padding: '1rem' }}>{t(language, 'status')}</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>{t(language, 'actions')}</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => {
              const teacherActiveMonth = getTeacherActivePayoutMonth(teacher.id)
              const isMonthPaid = (paidMonthsByTeacher[teacher.id] || []).includes(teacherActiveMonth)

              const teacherMonthLessons = lessons.filter(
                (l) => l.teacher_id === teacher.id && l.starts_at && l.starts_at.slice(0, 7) === teacherActiveMonth
              )
              const sessions = groupLessonsIntoTeacherSessions(teacherMonthLessons)
              const completedSessions = sessions.filter((s) => s.is_happened)
              const activeSessions = sessions.filter((s) => !s.is_cancelled)
              const scheduledOnlySessions = activeSessions.filter((s) => s.is_scheduled)

              const completedMinutes = completedSessions.reduce((acc, s) => acc + s.duration_minutes, 0)
              const completedHours = completedMinutes / 60

              const totalActiveMinutes = activeSessions.reduce((acc, s) => acc + s.duration_minutes, 0)
              const totalActiveHours = totalActiveMinutes / 60

              const totalEnrolledStudents = activeSessions.reduce((acc, s) => acc + s.student_ids.length, 0)

              const hourlyRate = teacher.taxa_hora_aula ?? 56.00
              const currency = teacher.moeda_taxa ?? 'BRL'
              const completedAmount = completedHours * Number(hourlyRate)
              const totalActiveAmount = totalActiveHours * Number(hourlyRate)

              const monthLabel = getMonthLabel(teacherActiveMonth, language)

              return (
                <tr key={teacher.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#38bdf8', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: 0, textAlign: 'left' }}
                      onClick={() => {
                        setSelectedTeacherForDetail(teacher)
                        setSelectedMonthKey(teacherActiveMonth)
                      }}
                      title="Ver registro de aulas e chave PIX"
                    >
                      {teacher.full_name}
                    </button>
                    {teacher.cnpj && <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>{teacher.cnpj}</div>}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <strong style={{ color: '#fff' }}>{monthLabel}</strong>
                    {isMonthPaid && (
                      <span className="badge badge-confirmed" style={{ marginLeft: '0.4rem', fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}>
                        Pago ✓
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {teacher.chave_pix ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{teacher.chave_pix}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(teacher.chave_pix!)
                            toast.success('Chave PIX copiada!')
                          }}
                          style={{
                            background: 'rgba(51, 65, 85, 0.4)',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            borderRadius: '0.3rem',
                            padding: '0.2rem 0.4rem',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            color: '#38bdf8',
                          }}
                          title="Copiar Chave PIX"
                        >
                          📋
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: '#64748b' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {activeSessions.length === 0 ? (
                      <span style={{ color: '#64748b' }}>0 aulas</span>
                    ) : completedSessions.length === activeSessions.length ? (
                      <div>
                        <strong style={{ color: '#10b981' }}>{completedSessions.length} realizadas</strong>
                        {totalEnrolledStudents > completedSessions.length && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>({totalEnrolledStudents} alunos nas turmas)</div>
                        )}
                      </div>
                    ) : completedSessions.length > 0 ? (
                      <div>
                        <span>
                          <strong style={{ color: '#10b981' }}>{completedSessions.length}</strong> / {activeSessions.length}{' '}
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({scheduledOnlySessions.length} agendadas)</span>
                        </span>
                        {totalEnrolledStudents > activeSessions.length && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>({totalEnrolledStudents} alunos)</div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <span style={{ color: '#818cf8' }}>
                          {activeSessions.length} agendadas
                        </span>
                        {totalEnrolledStudents > activeSessions.length && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>({totalEnrolledStudents} alunos)</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {totalActiveHours === 0 ? (
                      <span style={{ color: '#64748b' }}>0.0h</span>
                    ) : completedHours > 0 && scheduledOnlySessions.length > 0 ? (
                      <div>
                        <strong style={{ color: '#10b981' }}>{completedHours.toFixed(1)}h</strong>{' '}
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({totalActiveHours.toFixed(1)}h total)</span>
                      </div>
                    ) : completedHours > 0 ? (
                      <strong style={{ color: '#10b981' }}>{completedHours.toFixed(1)}h</strong>
                    ) : (
                      <span style={{ color: '#818cf8' }}>
                        {totalActiveHours.toFixed(1)}h <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>(agenda)</span>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>{currency} {Number(hourlyRate).toFixed(2)}</td>
                  
                  {/* Clickable Amount Column */}
                  <td style={{ padding: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTeacherForDetail(teacher)
                        setSelectedMonthKey(teacherActiveMonth)
                      }}
                      style={{
                        background: 'rgba(56, 189, 248, 0.08)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        borderRadius: '0.6rem',
                        padding: '0.45rem 0.8rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.15rem',
                        transition: 'all 0.15s ease',
                      }}
                      title="Clique para abrir o pop-up com as aulas deste mês, chave PIX e botão de pagar"
                    >
                      <span style={{ fontSize: '1rem', fontWeight: 'bold', color: isMonthPaid ? '#10b981' : '#38bdf8' }}>
                        {currency} {totalActiveAmount.toFixed(2)}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span>🔍 Ver aulas</span>
                        {isMonthPaid && <span style={{ color: '#10b981' }}>· Pago ✓</span>}
                      </span>
                    </button>
                  </td>

                  <td style={{ padding: '1rem' }}>
                    <span className={badgeClass(isMonthPaid ? 'confirmed' : 'pending')}>
                      {isMonthPaid ? 'Pago ✓' : 'Pendente'}
                    </span>
                  </td>

                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
                      {!isMonthPaid ? (
                        <button
                          type="button"
                          className="primary-button"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem', background: '#10b981' }}
                          onClick={() => void markTeacherMonthPaid(teacher.id, teacherActiveMonth, true)}
                          title={`Marcar o mês de ${monthLabel} como pago e avançar para o próximo mês`}
                        >
                          ✓ Pagar Mês
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary-button"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}
                          onClick={() => void markTeacherMonthPaid(teacher.id, teacherActiveMonth, false)}
                          title="Desmarcar pagamento deste mês"
                        >
                          Desmarcar
                        </button>
                      )}

                      <button
                        type="button"
                        className="secondary-button"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                        onClick={() => {
                          setSelectedTeacherForDetail(teacher)
                          setSelectedMonthKey(teacherActiveMonth)
                        }}
                        title="Ver registro detalhado de aulas e chave PIX"
                      >
                        🔍 Detalhes
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Teacher Detail & History Modal Pop-up Overlay */}
      {selectedTeacherForDetail && (() => {
        const teacherLessons = lessons.filter(l => l.teacher_id === selectedTeacherForDetail.id)
        
        // Group available months for this teacher
        const availableMonthsMap = new Map<string, string>()
        teacherLessons.forEach(l => {
          if (l.starts_at) {
            const key = l.starts_at.slice(0, 7)
            if (!availableMonthsMap.has(key)) {
              availableMonthsMap.set(key, getMonthLabel(key, language))
            }
          }
        })

        const baseMonthKey = '2026-08'
        if (!availableMonthsMap.has(baseMonthKey)) {
          availableMonthsMap.set(baseMonthKey, getMonthLabel(baseMonthKey, language))
        }

        const availableMonths = Array.from(availableMonthsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
        
        const activeMonthKey = selectedMonthKey || getTeacherActivePayoutMonth(selectedTeacherForDetail.id)
        const isCurrentMonthPaid = (paidMonthsByTeacher[selectedTeacherForDetail.id] || []).includes(activeMonthKey)

        const monthLessons = teacherLessons
          .filter(l => l.starts_at && l.starts_at.slice(0, 7) === activeMonthKey)

        const monthSessions = groupLessonsIntoTeacherSessions(monthLessons)

        const completedSessions = monthSessions.filter(s => s.is_happened)
        const activeSessions = monthSessions.filter(s => !s.is_cancelled)
        const scheduledOnlySessions = activeSessions.filter(s => s.is_scheduled)

        const completedMinutes = completedSessions.reduce((acc, s) => acc + s.duration_minutes, 0)
        const completedHours = completedMinutes / 60

        const totalActiveMinutes = activeSessions.reduce((acc, s) => acc + s.duration_minutes, 0)
        const totalActiveHours = totalActiveMinutes / 60

        const totalEnrolledStudents = activeSessions.reduce((acc, s) => acc + s.student_ids.length, 0)

        const hourlyRate = selectedTeacherForDetail.taxa_hora_aula ?? 56.00
        const currency = selectedTeacherForDetail.moeda_taxa ?? 'BRL'
        const completedAmount = completedHours * Number(hourlyRate)
        const totalActiveAmount = totalActiveHours * Number(hourlyRate)
        const activeMonthLabel = getMonthLabel(activeMonthKey, language)

        return createPortal(
          <div
            className="reminder-app-scope modal-overlay"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(2, 6, 23, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
            onClick={(e) => {
              if (teacherDetailCardRef.current && !teacherDetailCardRef.current.contains(e.target as Node)) {
                setSelectedTeacherForDetail(null)
              }
            }}
          >
            <div ref={teacherDetailCardRef} className="form-card animate-fade-in" style={{ maxWidth: '920px', width: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#fff', margin: 0 }}>{selectedTeacherForDetail.full_name}</h3>
                    <span className="badge badge-confirmed" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>{t(language, 'teacher')}</span>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>{selectedTeacherForDetail.email}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {/* Select Month inside modal */}
                  <select
                    value={activeMonthKey}
                    onChange={(e) => setSelectedMonthKey(e.target.value)}
                    style={{ padding: '0.45rem 0.85rem', background: '#090d16', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    {availableMonths.map(([mKey, mLabel]) => (
                      <option key={mKey} value={mKey}>{mLabel}</option>
                    ))}
                  </select>

                  <button
                    className="secondary-button"
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
                    onClick={() => setSelectedTeacherForDetail(null)}
                  >
                    ✕ {t(language, 'close')}
                  </button>
                </div>
              </div>

              {/* Highlight Card: PIX Key & Payment Action */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: isCurrentMonthPaid ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '1.25rem',
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1.25rem',
                  alignItems: 'center',
                }}
              >
                {/* Left: Summary & Amounts */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Folha de Pagamento</span>
                    <span className={badgeClass(isCurrentMonthPaid ? 'confirmed' : 'pending')}>
                      {isCurrentMonthPaid ? 'Mês Pago ✓' : 'Pendente'}
                    </span>
                  </div>

                  <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', color: isCurrentMonthPaid ? '#10b981' : '#38bdf8', margin: '0 0 0.3rem 0' }}>
                    {currency} {totalActiveAmount.toFixed(2)}
                  </h2>

                  <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: 0 }}>
                    Mês de Referência: <strong style={{ color: '#fff' }}>{activeMonthLabel}</strong> · {totalActiveHours.toFixed(1)}h ({activeSessions.length} aulas | {totalEnrolledStudents} alunos)
                  </p>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                    Taxa Horária: {currency} {Number(hourlyRate).toFixed(2)}/h
                  </p>
                </div>

                {/* Right: PIX Key & Pay Button */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* PIX Box */}
                  <div
                    style={{
                      background: '#090d16',
                      border: '1px solid #334155',
                      borderRadius: '0.75rem',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', display: 'block', fontWeight: 'bold' }}>
                        Chave PIX do Professor
                      </span>
                      <strong style={{ color: '#38bdf8', fontSize: '0.95rem', wordBreak: 'break-all' }}>
                        {selectedTeacherForDetail.chave_pix || 'Chave PIX não informada'}
                      </strong>
                    </div>

                    {selectedTeacherForDetail.chave_pix && (
                      <button
                        type="button"
                        className="primary-button"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem', background: '#0284c7', whiteSpace: 'nowrap' }}
                        onClick={() => {
                          navigator.clipboard.writeText(selectedTeacherForDetail.chave_pix!)
                          toast.success('Chave PIX copiada!')
                        }}
                      >
                        📋 Copiar PIX
                      </button>
                    )}
                  </div>

                  {/* Mark as Paid Action Button */}
                  {!isCurrentMonthPaid ? (
                    <button
                      type="button"
                      className="primary-button"
                      style={{
                        padding: '0.8rem 1.25rem',
                        fontSize: '0.95rem',
                        background: '#10b981',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        borderRadius: '0.75rem',
                      }}
                      onClick={() => void markTeacherMonthPaid(selectedTeacherForDetail.id, activeMonthKey, true)}
                    >
                      <span>✓ Marcar {activeMonthLabel} como PAGO</span>
                      <span>({currency} {totalActiveAmount.toFixed(2)})</span>
                    </button>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '0.6rem 1rem',
                        borderRadius: '0.75rem',
                      }}
                    >
                      <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        ✓ Mês de {activeMonthLabel} PAGO
                      </span>
                      <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => void markTeacherMonthPaid(selectedTeacherForDetail.id, activeMonthKey, false)}
                      >
                        Desmarcar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* NF Card (Secondary info) */}
              <div style={{ background: 'rgba(30, 41, 59, 0.3)', padding: '1rem 1.25rem', borderRadius: '1rem', border: '1px solid #1e293b', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Nota Fiscal (MEI):</span>
                  <span className={badgeClass(selectedTeacherForDetail.status_nota_fiscal === 'enviada' ? 'confirmed' : selectedTeacherForDetail.status_nota_fiscal === 'nao_se_aplica' ? 'secondary' : 'pending')}>
                    {selectedTeacherForDetail.status_nota_fiscal === 'enviada' ? 'Enviada ✓' : selectedTeacherForDetail.status_nota_fiscal === 'nao_se_aplica' ? 'Não se Aplica' : 'Pendente'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {selectedTeacherForDetail.nota_fiscal_url && (
                    <button
                      type="button"
                      className="primary-button"
                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', background: '#0284c7' }}
                      onClick={() => {
                        window.open(selectedTeacherForDetail.nota_fiscal_url!, '_blank')
                      }}
                    >
                      📄 Ver Arquivo NF
                    </button>
                  )}
                  <label className="secondary-button" style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', cursor: 'pointer' }}>
                    <span>{selectedTeacherForDetail.nota_fiscal_url ? 'Substituir NF' : 'Anexar NF'}</span>
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
                </div>
              </div>

              {/* Monthly Lesson History / Registry that amounts are based on */}
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '1rem', border: '1px solid #1e293b', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#fff', margin: 0 }}>
                      Registro de Aulas de {activeMonthLabel} ({activeSessions.length} aulas | {totalActiveHours.toFixed(1)}h)
                    </h4>
                    <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: 0 }}>
                      Aulas no mesmo horário são computadas como turmas/grupos (1 hora de aula = 1 hora de pagamento).
                    </p>
                  </div>
                  
                  {scheduledOnlySessions.length > 0 && (
                    <button
                      type="button"
                      className="primary-button"
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', background: '#059669' }}
                      onClick={() => void handleBatchConfirmMonthLessons(selectedTeacherForDetail.id, activeMonthKey)}
                      title={`Confirmar todas as ${scheduledOnlySessions.length} aulas agendadas deste mês como realizadas`}
                    >
                      ✓ Confirmar Todas como Realizadas ({scheduledOnlySessions.length})
                    </button>
                  )}
                </div>

                {/* Monthly Lessons Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                        <th style={{ padding: '0.6rem' }}>{t(language, 'date_time_col')}</th>
                        <th style={{ padding: '0.6rem' }}>Alunos / Turma</th>
                        <th style={{ padding: '0.6rem' }}>{t(language, 'class_subject_col')}</th>
                        <th style={{ padding: '0.6rem' }}>{t(language, 'duration_col')}</th>
                        <th style={{ padding: '0.6rem' }}>Status</th>
                        <th style={{ padding: '0.6rem' }}>Ajustar Status da Turma</th>
                        <th style={{ padding: '0.6rem', textAlign: 'right' }}>Valor da Aula</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthSessions.map((session) => {
                        const studentNames = session.student_ids
                          .map((id) => profiles.find((p) => p.id === id)?.full_name || t(language, 'role_student'))
                          .join(', ')

                        const isHappened = session.is_happened
                        const isNoShow = session.is_no_show
                        const isCancelled = session.is_cancelled
                        const isScheduled = session.is_scheduled

                        const sessionHours = session.duration_minutes / 60
                        const sessionVal = sessionHours * Number(hourlyRate)
                        const allLessonIds = session.lessons.map((l) => l.id)

                        return (
                          <tr key={session.key} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '0.6rem', color: '#f8fafc', whiteSpace: 'nowrap' }}>
                              {new Date(session.starts_at).toLocaleString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : 'en', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td style={{ padding: '0.6rem' }}>
                              {session.student_ids.length > 1 ? (
                                <div>
                                  <span className="badge badge-confirmed" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', marginRight: '0.4rem' }}>
                                    👥 Turma ({session.student_ids.length} alunos)
                                  </span>
                                  <strong style={{ color: '#38bdf8', fontSize: '0.85rem' }}>{studentNames}</strong>
                                </div>
                              ) : (
                                <div>
                                  <span style={{ color: '#64748b', marginRight: '0.25rem' }}>👤</span>
                                  <strong style={{ color: '#38bdf8' }}>{studentNames || 'Aluno'}</strong>
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '0.6rem', color: '#94a3b8' }}>{session.subject || session.class_name || '-'}</td>
                            <td style={{ padding: '0.6rem', color: '#cbd5e1' }}>{session.duration_minutes} min ({sessionHours.toFixed(1)}h)</td>
                            <td style={{ padding: '0.6rem' }}>
                              <span className={badgeClass(
                                isHappened ? 'confirmed' :
                                isNoShow ? 'pending' :
                                isCancelled ? 'danger' : 'secondary'
                              )}>
                                {isHappened ? t(language, 'status_happened') :
                                 isNoShow ? t(language, 'status_student_noshow') :
                                 isCancelled ? t(language, 'status_not_happened') : t(language, 'scheduled_badge')}
                              </span>
                            </td>
                            <td style={{ padding: '0.6rem' }}>
                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateSessionStatus(allLessonIds, 'happened')}
                                  style={{
                                    padding: '0.2rem 0.45rem',
                                    borderRadius: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    background: isHappened ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
                                    color: isHappened ? '#0f172a' : '#10b981',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                  }}
                                  title="Marcar aula/turma como Realizada"
                                >
                                  ✓ Realizada
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateSessionStatus(allLessonIds, 'student_no_show')}
                                  style={{
                                    padding: '0.2rem 0.45rem',
                                    borderRadius: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    background: isNoShow ? '#f59e0b' : 'rgba(245, 158, 11, 0.12)',
                                    color: isNoShow ? '#0f172a' : '#fbbf24',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                  }}
                                  title="Marcar como Falta do(s) Aluno(s)"
                                >
                                  Falta
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateSessionStatus(allLessonIds, 'not_happened')}
                                  style={{
                                    padding: '0.2rem 0.45rem',
                                    borderRadius: '0.35rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    background: isCancelled ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                                    color: isCancelled ? '#fff' : '#f87171',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                  }}
                                  title="Marcar como Cancelada"
                                >
                                  Cancelada
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateSessionStatus(allLessonIds, null)}
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
                            <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 'bold', color: isCancelled ? '#64748b' : '#10b981' }}>
                              {currency} {isCancelled ? '0.00' : sessionVal.toFixed(2)}
                            </td>
                          </tr>
                        )
                      })}
                      {monthSessions.length === 0 && (
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
