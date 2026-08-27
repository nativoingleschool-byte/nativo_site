import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Lesson, Profile, UserFormState } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { formatShortDate, badgeClass } from '../lib/utils'
import { supabase } from '../lib/supabase'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreVertical } from 'lucide-react'
import { useToast } from '../lib/toast'

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
  invoices: any[]
  refreshInvoices: () => Promise<void>
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
  invoices,
  refreshInvoices,
}: AdminStudentsTabProps) {
  const { toast } = useToast()
  const [studentSearch, setStudentSearch] = useState('')
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)
  const [initialUserForm, setInitialUserForm] = useState<UserFormState | null>(null)
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
  const activeCardRef = useRef<HTMLDivElement | null>(null)
  const editStudentCardRef = useRef<HTMLDivElement>(null)
  const historyStudentCardRef = useRef<HTMLDivElement>(null)

  /** Fetch the generated DANFS-e PDF from the server and trigger a browser download. */
  const downloadNfsePdf = async (invoiceId: string, studentName: string) => {
    setDownloadingPdfId(invoiceId)
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Nao autenticado.')

      const res = await fetch(`/api/admin/nfse-pdf?invoice_id=${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro ao gerar PDF' }))
        throw new Error(err.error || 'Erro ao gerar PDF')
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

      toast.success('Aluno excluído com sucesso!')
      await refreshProfiles()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleArchiveStudent = async (studentId: string, fullName: string) => {
    if (!confirm(`Deseja realmente arquivar o aluno ${fullName}? Todas as aulas futuras serão excluídas, mas o histórico e faturas serão mantidos.`)) {
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
          action: 'archive',
          payload: { id: studentId }
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao arquivar estudante.')

      toast.success('Aluno arquivado com sucesso!')
      await refreshProfiles()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const [issuingNfseId, setIssuingNfseId] = useState<string | null>(null)
  const [lastIssuedPdf, setLastIssuedPdf] = useState<{ name: string; url: string } | null>(null)
  const [currentPeriodInvoices, setCurrentPeriodInvoices] = useState<Record<string, { id: string; hasPdf: boolean; hasProtocol: boolean }>>({})
  const [checkingStatusId, setCheckingStatusId] = useState<string | null>(null)
  const [nfseErrors, setNfseErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const currentPeriod = new Date().toISOString().substring(0, 7) // 'YYYY-MM'
    const mapped: Record<string, { id: string; hasPdf: boolean; hasProtocol: boolean }> = {}
    
    invoices.forEach((inv) => {
      if (inv.billing_period === currentPeriod && (inv.status === 'pago' || inv.nfs_e_pdf_link)) {
        mapped[inv.student_id] = {
          id: inv.id,
          hasPdf: !!inv.nfs_e_pdf_link,
          hasProtocol: !!inv.protocolo_recebimento
        }
      }
    })
    setCurrentPeriodInvoices(mapped)
  }, [invoices])

  const checkNfseStatus = async (invoiceId: string, token: string, maxRetries = 3): Promise<{ status: string; nfs_e_pdf_link?: string; message?: string }> => {
    let attempts = 0
    while (attempts < maxRetries) {
      attempts++
      const response = await fetch('/api/admin/check-nfse-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ invoice_id: invoiceId })
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao verificar status.')
      }

      if (data.status === 'emitida' || data.status === 'erro') {
        return data
      }

      if (data.status === 'processando' && attempts < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      } else {
        return data
      }
    }
    return { status: 'processando', message: 'Lote em processamento pela prefeitura.' }
  }

  const handleCheckStatus = async (invoiceId: string) => {
    setCheckingStatusId(invoiceId)
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      const data = await checkNfseStatus(invoiceId, token, 1)

      if (data.status === 'emitida' && data.nfs_e_pdf_link) {
        toast.success(t(language, 'success_invoice_banner').replace('{name}', ''))
      } else if (data.status === 'processando') {
        toast.info(data.message || t(language, 'success_lote_envio_banner'))
      } else if (data.status === 'erro') {
        toast.error(`Erro: ${data.message}`)
      }
      
      setLastIssuedPdf(prev => prev ? { ...prev } : null)
      await refreshInvoices()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCheckingStatusId(null)
    }
  }

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
    setNfseErrors(prev => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })
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
        body: JSON.stringify({ student_id: studentId, force_retry: true })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao emitir nota fiscal.')

      let pdfUrl = data.nfs_e_pdf_link

      // Auto-check status 300ms after issuance so the PDF link populates without manual click
      if (data.invoice_id) {
        await new Promise(resolve => setTimeout(resolve, 300))
        const statusResult = await checkNfseStatus(data.invoice_id, token, 3)
        if (statusResult.status === 'emitida' && statusResult.nfs_e_pdf_link) {
          pdfUrl = statusResult.nfs_e_pdf_link
          toast.success(t(language, 'success_invoice_banner').replace('{name}', fullName))
        } else if (statusResult.status === 'erro') {
          throw new Error(statusResult.message || 'Erro ao processar lote na prefeitura.')
        } else {
          toast.info(statusResult.message || t(language, 'success_lote_envio_banner'))
        }
      } else if (pdfUrl) {
        toast.success(t(language, 'success_invoice_banner').replace('{name}', fullName))
      }

      if (pdfUrl) {
        setLastIssuedPdf({ name: fullName, url: pdfUrl })
      }
      await refreshInvoices()
      await refreshProfiles()
    } catch (err: any) {
      const errMsg = err.message || 'Erro ao emitir NFS-e'
      setNfseErrors(prev => ({ ...prev, [studentId]: errMsg }))
      toast.error(`${t(language, 'emission_error')} (${fullName}): ${errMsg}`)
    } finally {
      setIssuingNfseId(null)
    }
  }

  const handleResetAndRetryNfse = async (studentId: string, fullName: string) => {
    setIssuingNfseId(studentId)
    setLastIssuedPdf(null)
    setNfseErrors(prev => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })

    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      await fetch('/api/admin/cleanup-failed-invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ student_names: [fullName] })
      })

      const currentPeriod = new Date().toISOString().substring(0, 7)
      await supabase.from('invoices').delete().eq('student_id', studentId).eq('billing_period', currentPeriod)

      toast.info(`Sistema resetado para ${fullName}. Re-emitindo NFS-e...`)

      setCurrentPeriodInvoices(prev => {
        const next = { ...prev }
        delete next[studentId]
        return next
      })

      await handleIssueNfse(studentId, fullName)
    } catch (err: any) {
      toast.error(`Erro ao resetar: ${err.message}`)
      setIssuingNfseId(null)
    }
  }

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)

  const activeStudents = students.filter(s => !s.archived)
  
  const selectables = activeStudents.filter(
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
        const student = students.find(s => s.id === studentId)
        const fullName = student?.full_name || 'Aluno'

        try {
          // 1. Issue NFS-e with force_retry: true
          const response = await fetch('/api/admin/issue-nfse', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ student_id: studentId, force_retry: true })
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error || 'Erro na resposta do servidor.')
          }

          // 2. Automatically check status immediately after issuance (same as single issue)
          if (data.invoice_id) {
            await new Promise(resolve => setTimeout(resolve, 300))
            const statusResult = await checkNfseStatus(data.invoice_id, token, 3)
            if (statusResult.status === 'erro') {
              throw new Error(statusResult.message || 'Erro ao processar lote na prefeitura.')
            }
          }

          // Clear any previous errors for this student
          setNfseErrors(prev => {
            const next = { ...prev }
            delete next[studentId]
            return next
          })
          successCount++

          // Real-time update of invoices in UI as each student finishes
          await refreshInvoices()
        } catch (err: any) {
          console.error(`Falha ao emitir nota para o aluno ${fullName} (${studentId}):`, err.message)
          const errMsg = err.message || 'Erro na emissão em lote'
          setNfseErrors(prev => ({ ...prev, [studentId]: errMsg }))
          failCount++
        }
      }

      if (successCount > 0 && failCount === 0) {
        toast.success(`Emissão em lote concluída! ✓ ${successCount} NFS-e emitidas com sucesso.`)
      } else if (successCount > 0 && failCount > 0) {
        toast.info(`Emissão em lote concluída: ✓ ${successCount} emitidas com sucesso | ✗ ${failCount} falharam.`)
      } else {
        toast.error(`Falha na emissão em lote: todas as ${failCount} notas falharam.`)
      }

      setSelectedStudentIds([])
      await refreshInvoices()
      await refreshProfiles()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBulkProgress(null)
    }
  }

  const [sortField, setSortField] = useState<'name' | 'status' | null>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: 'name' | 'status') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedStudents = [...activeStudents].sort((a, b) => {
    if (sortField === 'name') {
      const cmp = (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
      return sortDirection === 'asc' ? cmp : -cmp
    }
    if (sortField === 'status') {
      const getWeight = (status?: string | null) => {
        if (status === 'em_dia') return 1
        if (status === 'pendente') return 2
        if (status === 'atrasado') return 3
        return 2
      }
      const weightA = getWeight(a.status_pagamento)
      const weightB = getWeight(b.status_pagamento)
      if (weightA !== weightB) {
        return sortDirection === 'asc' ? weightA - weightB : weightB - weightA
      }
      return (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
    }
    return 0
  })

  return (
    <>
      {lastIssuedPdf && (
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
          <span>
            {lastIssuedPdf.url
              ? t(language, 'success_invoice_banner').replace('{name}', lastIssuedPdf.name)
              : `${t(language, 'success_lote_envio_banner')} (${lastIssuedPdf.name})`}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {lastIssuedPdf.url && (
              <button
                className="primary-button"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', background: '#10b981' }}
                disabled={downloadingPdfId !== null}
                onClick={() => {
                  // Find the invoice id for this student so we can download
                  const inv = invoices.find(i => i.nfs_e_pdf_link === lastIssuedPdf.url || i.nfse_numero)
                  if (inv) void downloadNfsePdf(inv.id, lastIssuedPdf.name)
                  else window.open(lastIssuedPdf.url, '_blank')
                }}
              >
                {t(language, 'view_pdf')}
              </button>
            )}
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
                toast.success(t(language, 'copied_alert'))
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

      {/* NFS-e Emission Errors Retry Banner */}
      {Object.keys(nfseErrors).length > 0 && (
        <div
          className="animate-fade-in mb-4"
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '0.75rem',
            padding: '0.85rem 1.25rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            color: '#f87171'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <div>
              <strong style={{ display: 'block', fontSize: '0.9rem' }}>
                {t(language, 'emission_error')} ({Object.keys(nfseErrors).length})
              </strong>
              <span style={{ fontSize: '0.82rem', opacity: 0.9 }}>
                {Object.entries(nfseErrors).map(([id, err]) => {
                  const st = students.find(s => s.id === id)
                  return `${st?.full_name || 'Aluno'}: ${err}`
                }).join(' | ')}
              </span>
            </div>
          </div>
          <button
            className="primary-button"
            style={{ background: '#ef4444', borderColor: '#ef4444', whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
            onClick={() => {
              Object.keys(nfseErrors).forEach(studentId => {
                const st = students.find(s => s.id === studentId)
                if (st) void handleIssueNfse(st.id, st.full_name)
              })
            }}
          >
            🔄 {t(language, 'try_again')}
          </button>
        </div>
      )}

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
              <th
                style={{ padding: '1rem', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('name')}
                title="Ordenar por Nome"
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>{t(language, 'full_name')}</span>
                  <span style={{ fontSize: '0.75rem', opacity: sortField === 'name' ? 1 : 0.4 }}>
                    {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </div>
              </th>
              <th style={{ padding: '1rem' }}>{t(language, 'billing_day')}</th>
              <th
                style={{ padding: '1rem', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('status')}
                title="Ordenar por Status Financeiro"
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>{t(language, 'student_financial_status')}</span>
                  <span style={{ fontSize: '0.75rem', opacity: sortField === 'status' ? 1 : 0.4 }}>
                    {sortField === 'status' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </div>
              </th>
              <th style={{ padding: '1rem' }}>{t(language, 'invoices_title')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'student_habitual_time')}</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>{t(language, 'actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((student) => {
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
                      disabled={!!currentPeriodInvoices[student.id] || !student.tuition_fee || Number(student.tuition_fee) <= 0}
                    />
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 'bold' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#38bdf8', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold', padding: 0, textAlign: 'left', fontSize: '0.9rem' }}
                        onClick={() => void openPaymentHistory(student)}
                      >
                        {student.full_name}
                      </button>
                      {student.tuition_fee !== undefined && student.tuition_fee !== null && Number(student.tuition_fee) > 0 && (
                        <span style={{
                          fontSize: '0.78rem',
                          fontWeight: '600',
                          color: '#10b981',
                          background: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '0.375rem',
                          whiteSpace: 'nowrap'
                        }}>
                          R$ {Number(student.tuition_fee).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </td>
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
                      const invoiceInfo = currentPeriodInvoices[student.id]
                      if (!invoiceInfo) {
                        return (
                          <span className={badgeClass('pendente')}>
                            {t(language, 'financial_pending')}
                          </span>
                        )
                      }
                      if (invoiceInfo.hasPdf) {
                        return (
                          <span className={badgeClass('em_dia')}>
                            {t(language, 'invoice_issued')}
                          </span>
                        )
                      }
                      if (invoiceInfo.hasProtocol) {
                        return (
                          <span className={badgeClass('pendente')} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid #f59e0b' }}>
                            {t(language, 'success_lote_envio_banner')}
                          </span>
                        )
                      }
                      return (
                        <span className={badgeClass('pendente')} style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid #38bdf8' }}>
                          Aguardando Emissão
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
                      const invoiceInfo = currentPeriodInvoices[student.id]
                      if (invoiceInfo) {
                        if (invoiceInfo.hasPdf) {
                          return (
                            <button
                              className="primary-button"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem', background: '#10b981' }}
                              disabled={downloadingPdfId === invoiceInfo.id}
                              onClick={() => void downloadNfsePdf(invoiceInfo.id, student.full_name)}
                            >
                              {downloadingPdfId === invoiceInfo.id ? 'Gerando...' : t(language, 'invoice_issued')}
                            </button>
                          )
                        }
                        if (invoiceInfo.hasProtocol) {
                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                              <button 
                                className="secondary-button" 
                                style={{ 
                                  padding: '0.4rem 0.8rem', 
                                  fontSize: '0.8rem', 
                                  marginRight: '0.2rem', 
                                  background: '#f59e0b',
                                  borderColor: '#f59e0b',
                                  color: '#000'
                                }}
                                disabled={checkingStatusId === invoiceInfo.id}
                                onClick={() => void handleCheckStatus(invoiceInfo.id)}
                              >
                                {checkingStatusId === invoiceInfo.id ? t(language, 'checking_status') : t(language, 'check_status')}
                              </button>
                              <button
                                className="primary-button"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginRight: '0.5rem', background: '#ef4444', borderColor: '#ef4444', cursor: 'pointer' }}
                                disabled={issuingNfseId === student.id}
                                onClick={() => void handleResetAndRetryNfse(student.id, student.full_name)}
                              >
                                🔄 Re-emitir
                              </button>
                            </div>
                          )
                        }
                        return (
                          <button 
                            className="primary-button" 
                            style={{ 
                              padding: '0.4rem 0.8rem', 
                              fontSize: '0.8rem', 
                              marginRight: '0.5rem', 
                              background: '#0284c7',
                              cursor: 'pointer'
                            }}
                            onClick={() => void handleIssueNfse(student.id, student.full_name)}
                            disabled={issuingNfseId === student.id}
                          >
                            {issuingNfseId === student.id ? t(language, 'issuing') : t(language, 'emit_invoice')}
                          </button>
                        )
                      }
                      if (nfseErrors[student.id]) {
                        return (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span
                              title={nfseErrors[student.id]}
                              style={{
                                fontSize: '0.75rem',
                                color: '#f87171',
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '0.4rem',
                                maxWidth: '160px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              ⚠️ {nfseErrors[student.id]}
                            </span>
                            <button
                              className="primary-button"
                              style={{
                                padding: '0.4rem 0.8rem',
                                fontSize: '0.8rem',
                                marginRight: '0.5rem',
                                background: '#ef4444',
                                borderColor: '#ef4444',
                                cursor: 'pointer'
                              }}
                              onClick={() => void handleIssueNfse(student.id, student.full_name)}
                              disabled={issuingNfseId === student.id}
                            >
                              🔄 {issuingNfseId === student.id ? t(language, 'issuing') : t(language, 'try_again')}
                            </button>
                          </div>
                        )
                      }
                      return (
                        <button 
                          className="primary-button" 
                          style={{ 
                            padding: '0.4rem 0.8rem', 
                            fontSize: '0.8rem', 
                            marginRight: '0.5rem', 
                            background: '#0284c7',
                            cursor: 'pointer'
                          }}
                          onClick={() => void handleIssueNfse(student.id, student.full_name)}
                          disabled={issuingNfseId === student.id}
                        >
                          {issuingNfseId === student.id ? t(language, 'issuing') : t(language, 'emit_invoice')}
                        </button>
                      )
                    })()}
                    
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button 
                          className="secondary-button" 
                          style={{ padding: '0.4rem', border: 'none', background: 'transparent' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content 
                          align="end"
                          style={{ 
                            background: '#1e293b', 
                            border: '1px solid #334155', 
                            borderRadius: '0.5rem', 
                            padding: '0.5rem',
                            minWidth: '150px',
                            zIndex: 50,
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                          }}
                        >
                          <DropdownMenu.Item 
                            style={{ padding: '0.5rem 1rem', cursor: 'pointer', color: '#38bdf8', borderRadius: '0.25rem' }}
                            onSelect={() => void handleResetAndRetryNfse(student.id, student.full_name)}
                          >
                            🔄 Re-emitir NFS-e (Resetar)
                          </DropdownMenu.Item>
                          <DropdownMenu.Item 
                            style={{ padding: '0.5rem 1rem', cursor: 'pointer', color: '#e2e8f0', borderRadius: '0.25rem' }}
                            onSelect={() => {
                              setSavingUserId(student.id)
                              const initial: UserFormState = {
                                id: student.id,
                                email: student.email,
                                full_name: student.full_name,
                                role: 'student',
                                class_name: student.class_name || '',
                                speciality: '',
                                password: '',
                                cpf: student.cpf || '',
                                data_pagamento_preferencial: student.data_pagamento_preferencial || 5,
                                status_pagamento: student.status_pagamento || 'pendente',
                                first_class_at: '',
                                first_class_teacher_id: '',
                                cep: student.cep || '',
                                logradouro: student.logradouro || '',
                                bairro: student.bairro || '',
                                cidade: student.cidade || '',
                                uf: student.uf || '',
                                tuition_fee: student.tuition_fee
                              }
                              setUserForm(initial)
                              setInitialUserForm(initial)
                            }}
                          >
                            {t(language, 'edit')}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item 
                            style={{ padding: '0.5rem 1rem', cursor: 'pointer', color: '#f59e0b', borderRadius: '0.25rem' }}
                            onSelect={() => void handleArchiveStudent(student.id, student.full_name)}
                          >
                            Arquivar
                          </DropdownMenu.Item>
                          <DropdownMenu.Item 
                            style={{ padding: '0.5rem 1rem', cursor: 'pointer', color: '#ef4444', borderRadius: '0.25rem' }}
                            onSelect={() => void handleDeleteStudent(student.id, student.full_name)}
                          >
                            Excluir
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {savingUserId && userForm.role === 'student' && createPortal(
        <div
          className="reminder-app-scope modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(2, 6, 23, 0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
          onClick={(e) => {
            if (editStudentCardRef.current && !editStudentCardRef.current.contains(e.target as Node)) {
              const isDirty = initialUserForm ? (
                userForm.full_name !== initialUserForm.full_name ||
                userForm.email !== initialUserForm.email ||
                (userForm.cpf || '') !== (initialUserForm.cpf || '') ||
                Number(userForm.data_pagamento_preferencial || 5) !== Number(initialUserForm.data_pagamento_preferencial || 5) ||
                (userForm.status_pagamento || 'pendente') !== (initialUserForm.status_pagamento || 'pendente') ||
                (userForm.cep || '') !== (initialUserForm.cep || '') ||
                (userForm.logradouro || '') !== (initialUserForm.logradouro || '') ||
                (userForm.bairro || '') !== (initialUserForm.bairro || '') ||
                (userForm.cidade || '') !== (initialUserForm.cidade || '') ||
                (userForm.uf || '') !== (initialUserForm.uf || '') ||
                Number(userForm.tuition_fee || 0) !== Number(initialUserForm.tuition_fee || 0)
              ) : false

              if (isDirty) {
                setShowUnsavedWarning(true)
                const btn = editStudentCardRef.current.querySelector('.button-stack') || editStudentCardRef.current.querySelector('.primary-button')
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
          <div ref={editStudentCardRef} className="form-card" style={{ maxWidth: '450px', width: '100%', maxHeight: '85vh', overflowY: 'auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
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
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {t(language, 'billing_day_label').replace('{day}', String(day))}
                  </option>
                ))}
              </select>
              <select
                value={userForm.status_pagamento || 'pendente'}
                onChange={(e) => setUserForm({ ...userForm, status_pagamento: e.target.value as any })}
              >
                <option value="em_dia">{t(language, 'financial_ok')}</option>
                <option value="atrasado">{t(language, 'financial_late')}</option>
                <option value="pendente">{t(language, 'financial_pending')}</option>
              </select>
              <input
                placeholder="CEP"
                value={userForm.cep || ''}
                onChange={(e) => setUserForm({ ...userForm, cep: e.target.value })}
              />
              <input
                placeholder="Logradouro / Endereço"
                value={userForm.logradouro || ''}
                onChange={(e) => setUserForm({ ...userForm, logradouro: e.target.value })}
              />
              <input
                placeholder="Bairro"
                value={userForm.bairro || ''}
                onChange={(e) => setUserForm({ ...userForm, bairro: e.target.value })}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  style={{ flex: 2 }}
                  placeholder="Cidade"
                  value={userForm.cidade || ''}
                  onChange={(e) => setUserForm({ ...userForm, cidade: e.target.value })}
                />
                <input
                  style={{ flex: 1 }}
                  placeholder="UF"
                  value={userForm.uf || ''}
                  onChange={(e) => setUserForm({ ...userForm, uf: e.target.value.toUpperCase() })}
                />
              </div>
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

            <div className="button-stack mt-6" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
              <button
                type="button"
                className="primary-button"
                onClick={async () => {
                  if (!userForm.id) return
                  try {
                    const { error } = await supabase
                      .from('profiles')
                      .update({
                        full_name: userForm.full_name,
                        email: userForm.email,
                        cpf: userForm.cpf || null,
                        data_pagamento_preferencial: userForm.data_pagamento_preferencial || 5,
                        status_pagamento: userForm.status_pagamento || 'pendente',
                        cep: userForm.cep || null,
                        logradouro: userForm.logradouro || null,
                        bairro: userForm.bairro || null,
                        cidade: userForm.cidade || null,
                        uf: userForm.uf || null,
                        tuition_fee: userForm.tuition_fee !== undefined ? userForm.tuition_fee : null
                      })
                      .eq('id', userForm.id)
                    if (error) throw error
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

      {historyStudent && createPortal(
        <div
          className="reminder-app-scope modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(2, 6, 23, 0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}
          onClick={(e) => {
            if (historyStudentCardRef.current && !historyStudentCardRef.current.contains(e.target as Node)) {
              setHistoryStudent(null)
            }
          }}
        >
          <div ref={historyStudentCardRef} className="form-card" style={{ maxWidth: '600px', width: '100%', maxHeight: '85vh', overflowY: 'auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>{t(language, 'payment_history_of').replace('{name}', historyStudent.full_name)}</h3>
            {loadingHistory ? (
              <p className="muted">{t(language, 'loading_invoices')}</p>
            ) : (
              <div className="list-stack" style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {historyInvoices.map((inv) => {
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
                        {(inv.nfs_e_pdf_link || inv.nfse_url || inv.nfse_numero) ? (
                          <button 
                            className="primary-button" 
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: '#10b981', borderColor: '#10b981' }}
                            disabled={downloadingPdfId === inv.id}
                            onClick={() => void downloadNfsePdf(inv.id, historyStudent.full_name)}
                          >
                            {downloadingPdfId === inv.id ? 'Gerando...' : 'NFS-e'}
                          </button>
                        ) : (
                          <span className="muted text-xs">{t(language, 'awaiting_emission')}</span>
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
              <button className="secondary-button" onClick={() => setHistoryStudent(null)}>{t(language, 'cancel')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
