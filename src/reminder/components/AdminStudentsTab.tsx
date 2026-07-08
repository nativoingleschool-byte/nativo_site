import { useState, useEffect } from 'react'
import { Lesson, Profile, UserFormState } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { formatShortDate, badgeClass } from '../lib/utils'
import { supabase } from '../lib/supabase'

interface AdminStudentsTabProps {
  language: Language
  inviteEmail: string
  setInviteEmail: (email: string) => void
  handleGenerateInviteLink: (e: any, isGlobal?: boolean) => Promise<void>
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

  const handleDeleteStudent = async (studentId: string, fullName: string) => {
    if (!confirm(`Deseja realmente excluir o aluno ${fullName}? Isso removerá a conta e todos os dados relacionados (aulas e faturas).`)) {
      return
    }

    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'delete',
          payload: {
            id: studentId,
            force: true
          }
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao deletar estudante.')

      alert('Aluno excluído com sucesso!')
      await refreshProfiles()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const [issuingNfseId, setIssuingNfseId] = useState<string | null>(null)
  const [lastIssuedPdf, setLastIssuedPdf] = useState<{ name: string; url: string } | null>(null)
  const [currentPeriodInvoices, setCurrentPeriodInvoices] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const fetchCurrentInvoices = async () => {
      try {
        const currentPeriod = new Date().toISOString().substring(0, 7) // 'YYYY-MM'
        const { data, error } = await supabase
          .from('invoices')
          .select('student_id, id, status, nfs_e_pdf_link')
          .eq('billing_period', currentPeriod)

        if (error) throw error

        const mapped: Record<string, boolean> = {}
        data?.forEach((inv) => {
          if (inv.status === 'pago' || inv.nfs_e_pdf_link) {
            mapped[inv.student_id] = true
          }
        })
        setCurrentPeriodInvoices(mapped)
      } catch (err) {
        console.error('Error fetching current month invoices:', err)
      }
    }

    void fetchCurrentInvoices()
  }, [students, lastIssuedPdf])

  const [historyStudent, setHistoryStudent] = useState<Profile | null>(null)
  const [historyInvoices, setHistoryInvoices] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const openPaymentHistory = async (student: Profile) => {
    setHistoryStudent(student)
    setLoadingHistory(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('student_id', student.id)
        .order('billing_period', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setHistoryInvoices(data || [])
    } catch (err) {
      console.error('Error fetching student invoices:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleIssueNfse = async (studentId: string, fullName: string) => {
    setIssuingNfseId(studentId)
    setLastIssuedPdf(null)
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      const response = await fetch('/api/admin/issue-nfse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ student_id: studentId })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao emitir nota fiscal.')

      // Display custom in-app success banner (prevents browser popup blockers)
      setLastIssuedPdf({ name: fullName, url: data.nfs_e_pdf_link })
      await refreshProfiles()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIssuingNfseId(null)
    }
  }

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)

  const selectables = students.filter(
    (s) => !currentPeriodInvoices[s.id] && s.tuition_fee && Number(s.tuition_fee) > 0
  )

  const handleToggleAll = () => {
    if (selectedStudentIds.length === selectables.length) {
      setSelectedStudentIds([])
    } else {
      setSelectedStudentIds(selectables.map((s) => s.id))
    }
  }

  const handleToggleStudent = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId))
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId])
    }
  }

  const handleBulkIssueNfse = async () => {
    if (selectedStudentIds.length === 0) return
    const total = selectedStudentIds.length
    let successCount = 0
    let failCount = 0
    setLastIssuedPdf(null)

    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      let i = 0
      for (const studentId of selectedStudentIds) {
        i++
        setBulkProgress({ current: i, total })

        try {
          const response = await fetch('/api/admin/issue-nfse', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ student_id: studentId })
          })

          if (!response.ok) {
            const errData = await response.json()
            throw new Error(errData.error || 'Erro na resposta do servidor.')
          }

          successCount++
        } catch (err: any) {
          console.error(`Falha ao emitir nota para o aluno ${studentId}:`, err.message)
          failCount++
        }
      }

      alert(`Emissão em lote concluída!\n\nSucesso: ${successCount} notas emitidas.\nFalhas: ${failCount} notas falharam/já existiam.`)
      setSelectedStudentIds([])
      await refreshProfiles()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBulkProgress(null)
    }
  }

  return (
    <>
      {lastIssuedPdf && (
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
          <span>{t(language, 'success_invoice_banner').replace('{name}', lastIssuedPdf.name)}</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href={lastIssuedPdf.url} target="_blank" rel="noreferrer" className="primary-button" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', background: '#10b981' }}>
              {t(language, 'view_pdf')}
            </a>
            <button className="secondary-button" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setLastIssuedPdf(null)}>
              {t(language, 'close')}
            </button>
          </div>
        </div>
      )}
      <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '1.25rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#fff' }}>{t(language, 'invite_student_title')}</h3>
        <form onSubmit={(e) => handleGenerateInviteLink(e)} className="form-grid" style={{ gap: '0.75rem', display: 'flex', alignItems: 'center' }}>
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
        <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-start' }}>
          <button 
            type="button" 
            className="secondary-button" 
            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }} 
            onClick={(e) => handleGenerateInviteLink(e, true)}
            disabled={inviteLoading}
          >
            Gerar Link Geral (Múltiplos Alunos)
          </button>
        </div>
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

      {/* Bulk Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', background: 'rgba(30, 41, 59, 0.3)', padding: '1rem', borderRadius: '1rem', border: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
          {t(language, 'bulk_invoices_selected').replace('{count}', String(selectedStudentIds.length))}
        </div>
        <button
          className="primary-button"
          style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', background: '#0284c7' }}
          onClick={handleBulkIssueNfse}
          disabled={selectedStudentIds.length === 0 || bulkProgress !== null}
        >
          {bulkProgress ? t(language, 'bulk_issuing_progress').replace('{current}', String(bulkProgress.current)).replace('{total}', String(bulkProgress.total)) : t(language, 'emit_selected_invoices')}
        </button>
      </div>

      <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem', width: '40px' }}>
                <input 
                  type="checkbox" 
                  checked={selectedStudentIds.length === selectables.length && selectables.length > 0} 
                  onChange={handleToggleAll} 
                />
              </th>
              <th style={{ padding: '1rem' }}>{t(language, 'full_name')}</th>
              <th style={{ padding: '1rem' }}>Email</th>
              <th style={{ padding: '1rem' }}>CPF</th>
              <th style={{ padding: '1rem' }}>{t(language, 'billing_day')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'student_financial_status')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'invoices_title')}</th>
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
                  <td style={{ padding: '1rem', width: '40px' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedStudentIds.includes(student.id)} 
                      onChange={() => handleToggleStudent(student.id)} 
                      disabled={currentPeriodInvoices[student.id] || !student.tuition_fee || Number(student.tuition_fee) <= 0}
                    />
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#38bdf8', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: 0, textAlign: 'left' }}
                      onClick={() => void openPaymentHistory(student)}
                    >
                      {student.full_name}
                    </button>
                  </td>
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
                    {(() => {
                      const hasInvoice = currentPeriodInvoices[student.id]
                      return (
                        <span className={badgeClass(hasInvoice ? 'em_dia' : 'pendente')}>
                          {hasInvoice ? t(language, 'invoice_issued') : t(language, 'financial_pending')}
                        </span>
                      )
                    })()}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span 
                      title={t(language, 'calendar_time_hint')}
                      style={{ borderBottom: '1px dotted #64748b', cursor: 'help', color: '#38bdf8' }}
                    >
                      {scheduleText}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {(() => {
                      const hasInvoice = currentPeriodInvoices[student.id]
                      return (
                        <button 
                          className="primary-button" 
                          style={{ 
                            padding: '0.4rem 0.8rem', 
                            fontSize: '0.8rem', 
                            marginRight: '0.5rem', 
                            background: hasInvoice ? '#10b981' : '#0284c7',
                            cursor: hasInvoice ? 'not-allowed' : 'pointer'
                          }}
                          onClick={() => void handleIssueNfse(student.id, student.full_name)}
                          disabled={issuingNfseId === student.id || hasInvoice}
                        >
                          {issuingNfseId === student.id ? t(language, 'issuing') : hasInvoice ? t(language, 'invoice_issued') : t(language, 'emit_invoice')}
                        </button>
                      )
                    })()}
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
                          first_class_teacher_id: '',
                          cep: student.cep || '',
                          logradouro: student.logradouro || '',
                          bairro: student.bairro || '',
                          cidade: student.cidade || '',
                          uf: student.uf || '',
                          tuition_fee: student.tuition_fee
                        })
                      }}
                    >
                      {t(language, 'edit')}
                    </button>
                    <button 
                      className="danger-button" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginLeft: '0.5rem' }}
                      onClick={() => void handleDeleteStudent(student.id, student.full_name)}
                    >
                      Excluir
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
              <input
                type="number"
                step="0.01"
                placeholder="Valor da Mensalidade"
                value={userForm.tuition_fee ?? ''}
                onChange={(e) => setUserForm({ ...userForm, tuition_fee: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
              <select
                value={userForm.data_pagamento_preferencial || 5}
                onChange={(e) => setUserForm({ ...userForm, data_pagamento_preferencial: Number(e.target.value) })}
              >
                {[1, 5, 10, 15, 20, 25].map(day => (
                  <option key={day} value={day}>{t(language, 'billing_day_label').replace('{day}', String(day))}</option>
                ))}
              </select>
              <input
                placeholder="CEP"
                value={userForm.cep || ''}
                onChange={(e) => setUserForm({ ...userForm, cep: e.target.value })}
              />
              <input
                placeholder="Endereço (Rua, Nº, Apto)"
                value={userForm.logradouro || ''}
                onChange={(e) => setUserForm({ ...userForm, logradouro: e.target.value })}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  placeholder="Bairro"
                  style={{ flex: 1 }}
                  value={userForm.bairro || ''}
                  onChange={(e) => setUserForm({ ...userForm, bairro: e.target.value })}
                />
                <input
                  placeholder="Cidade"
                  style={{ flex: 1 }}
                  value={userForm.cidade || ''}
                  onChange={(e) => setUserForm({ ...userForm, cidade: e.target.value })}
                />
                <input
                  placeholder="UF"
                  maxLength={2}
                  style={{ width: '60px' }}
                  value={userForm.uf || ''}
                  onChange={(e) => setUserForm({ ...userForm, uf: e.target.value.toUpperCase() })}
                />
              </div>
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
                        data_pagamento_preferencial: userForm.data_pagamento_preferencial,
                        cep: userForm.cep || null,
                        logradouro: userForm.logradouro || null,
                        bairro: userForm.bairro || null,
                        cidade: userForm.cidade || null,
                        uf: userForm.uf || null,
                        tuition_fee: userForm.tuition_fee ?? null
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
      {historyStudent && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="form-card" style={{ maxWidth: '600px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>{t(language, 'payment_history_of').replace('{name}', historyStudent.full_name)}</h3>
            {loadingHistory ? (
              <p className="muted">{t(language, 'loading_invoices')}</p>
            ) : (
              <div className="list-stack" style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {historyInvoices.map((inv) => {
                  const pdfUrl = inv.nfs_e_pdf_link || inv.nfse_url
                  return (
                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(15,23,42,0.4)', border: '1px solid #1e293b', borderRadius: '1rem' }}>
                      <div>
                        <p className="text-white font-bold" style={{ fontSize: '0.9rem' }}>NFS-e Ref. {inv.billing_period || '-'}</p>
                        <p className="muted text-xs">{t(language, 'emission_date')}: {new Date(inv.created_at).toLocaleDateString()}</p>
                        <span className={badgeClass(inv.status)} style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                          {inv.status === 'pago' ? t(language, 'paid') : inv.status === 'atrasado' ? t(language, 'financial_late') : t(language, 'financial_pending')}
                        </span>
                      </div>
                      <div>
                        {pdfUrl ? (
                          <a 
                            href={pdfUrl} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="primary-button" 
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: '#10b981', borderColor: '#10b981', textDecoration: 'none', display: 'inline-block' }}
                          >
                            {t(language, 'view_pdf')}
                          </a>
                        ) : (
                          <span className="muted text-xs">{t(language, 'financial_pending')}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {historyInvoices.length === 0 && (
                  <p className="empty-state">{t(language, 'no_invoices_available')}</p>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="secondary-button" onClick={() => setHistoryStudent(null)}>{t(language, 'close')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
