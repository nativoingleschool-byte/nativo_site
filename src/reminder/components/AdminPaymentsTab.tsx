import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Profile } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

const getBillingPeriods = () => {
  const today = new Date()
  const tzOffset = -3 * 60 // UTC-3 (Brasília)
  const localTime = new Date(today.getTime() + tzOffset * 60 * 1000)
  
  const currentPeriod = localTime.toISOString().substring(0, 7) // 'YYYY-MM'
  
  // Previous month in Brasília timezone
  const prevYear = localTime.getUTCMonth() === 0 ? localTime.getUTCFullYear() - 1 : localTime.getUTCFullYear()
  const prevMonthNum = localTime.getUTCMonth() === 0 ? 12 : localTime.getUTCMonth()
  const previousPeriod = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`
  
  return { currentPeriod, previousPeriod }
}

const formatBillingPeriod = (period: string, language: Language = 'pt') => {
  if (!period || !period.includes('-')) return period
  const [yearStr, monthStr] = period.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10) - 1
  const date = new Date(Date.UTC(year, month, 15))
  const locale = language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US'
  const monthName = date.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' })
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1)
  return `${capitalized}/${year}`
}

interface AdminPaymentsTabProps {
  language: Language
  paymentSearch: string
  setPaymentSearch: (s: string) => void
  paymentFilter: 'all' | 'em_dia' | 'pendente' | 'atrasado'
  setPaymentFilter: (f: 'all' | 'em_dia' | 'pendente' | 'atrasado') => void
  students: Profile[]
  invoices: any[]
  refreshInvoices: () => Promise<void>
}

export default function AdminPaymentsTab({
  language,
  paymentSearch,
  setPaymentSearch,
  paymentFilter,
  setPaymentFilter,
  students,
  invoices,
  refreshInvoices,
}: AdminPaymentsTabProps) {
  const { toast } = useToast()
  const [issuingNfseId, setIssuingNfseId] = useState<string | null>(null)
  const [checkingStatusId, setCheckingStatusId] = useState<string | null>(null)
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)
  const [nfseErrors, setNfseErrors] = useState<Record<string, string>>({})
  const [monthModalData, setMonthModalData] = useState<{
    student: Profile;
    currentPeriod: string;
    previousPeriod: string;
  } | null>(null)

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
      await refreshInvoices()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCheckingStatusId(null)
    }
  }

  const handleInitiateIssueNfse = (student: Profile) => {
    const { currentPeriod, previousPeriod } = getBillingPeriods()
    const studentInvoices = invoices.filter(inv => inv.student_id === student.id)
    const hasPrevInvoice = studentInvoices.some(
      inv => inv.billing_period === previousPeriod && (inv.status === 'pago' || !!inv.nfs_e_pdf_link)
    )

    if (!hasPrevInvoice) {
      setMonthModalData({
        student,
        currentPeriod,
        previousPeriod
      })
    } else {
      void handleIssueNfse(student.id, student.full_name, currentPeriod)
    }
  }

  const handleIssueNfse = async (studentId: string, fullName: string, billingPeriod?: string) => {
    setIssuingNfseId(studentId)
    setNfseErrors(prev => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      const { currentPeriod } = getBillingPeriods()
      const targetPeriod = billingPeriod || currentPeriod

      const response = await fetch('/api/admin/issue-nfse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          student_id: studentId, 
          billing_period: targetPeriod,
          force_retry: true 
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao emitir nota fiscal.')

      // Auto-check status 300ms after issuance so the PDF link populates without manual click
      if (data.invoice_id) {
        await new Promise(resolve => setTimeout(resolve, 300))
        const statusResult = await checkNfseStatus(data.invoice_id, token, 3)
        if (statusResult.status === 'emitida' && statusResult.nfs_e_pdf_link) {
          toast.success(t(language, 'success_invoice_banner').replace('{name}', `${fullName} (${formatBillingPeriod(targetPeriod, language)})`))
        } else if (statusResult.status === 'erro') {
          throw new Error(statusResult.message || 'Erro ao processar lote na prefeitura.')
        } else {
          toast.info(statusResult.message || t(language, 'success_lote_envio_banner'))
        }
      } else {
        // Fallback toast if no invoice_id returned
        if (data.nfs_e_pdf_link) {
          toast.success(t(language, 'success_invoice_banner').replace('{name}', `${fullName} (${formatBillingPeriod(targetPeriod, language)})`))
        } else {
          toast.info(`${t(language, 'success_lote_envio_banner')} (${fullName})`)
        }
      }
      await refreshInvoices()
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
    setNfseErrors(prev => {
      const next = { ...prev }
      delete next[studentId]
      return next
    })

    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      await fetch('/api/admin/check-nfse-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ student_names: [fullName] })
      })

      const { currentPeriod } = getBillingPeriods()
      await supabase.from('invoices').delete().eq('student_id', studentId).eq('billing_period', currentPeriod)

      toast.info(`Sistema resetado para ${fullName}. Re-emitindo NFS-e...`)
      await refreshInvoices()
      await handleIssueNfse(studentId, fullName)
    } catch (err: any) {
      toast.error(`Erro ao resetar: ${err.message}`)
      setIssuingNfseId(null)
    }
  }

  const { currentPeriod } = getBillingPeriods()

  const [sortField, setSortField] = useState<'name' | 'status' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: 'name' | 'status') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.full_name.toLowerCase().includes(paymentSearch.toLowerCase()) ||
      student.email.toLowerCase().includes(paymentSearch.toLowerCase())
    const status = student.status_pagamento || 'pendente'
    const matchesFilter = paymentFilter === 'all' || status === paymentFilter
    return matchesSearch && matchesFilter
  })

  const sortedStudents = [...filteredStudents].sort((a, b) => {
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
      <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '1.25rem', borderRadius: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="form-grid" style={{ display: 'flex', gap: '1rem' }}>
          <input
            placeholder={t(language, 'search_student_placeholder')}
            value={paymentSearch}
            onChange={(e) => setPaymentSearch(e.target.value)}
            style={{ flex: 2 }}
          />
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as any)}
            style={{ flex: 1 }}
          >
            <option value="all">{t(language, 'all_status')}</option>
            <option value="em_dia">{t(language, 'green_status')}</option>
            <option value="pendente">{t(language, 'yellow_status')}</option>
            <option value="atrasado">{t(language, 'red_status')}</option>
          </select>
        </div>
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
                  return `${st?.full_name || t(language, 'role_student')}: ${err}`
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
                if (st) handleInitiateIssueNfse(st)
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
              <th
                style={{ padding: '1rem', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('name')}
                title={t(language, 'order_by_name')}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>{t(language, 'full_name')}</span>
                  <span style={{ fontSize: '0.75rem', opacity: sortField === 'name' ? 1 : 0.4 }}>
                    {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </div>
              </th>
              <th
                style={{ padding: '1rem', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('status')}
                title={t(language, 'order_by_status')}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>{t(language, 'student_financial_status')}</span>
                  <span style={{ fontSize: '0.75rem', opacity: sortField === 'status' ? 1 : 0.4 }}>
                    {sortField === 'status' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </div>
              </th>
              <th style={{ padding: '1rem' }}>{t(language, 'billing_period_ref')} / {t(language, 'emission_date')}</th>
              <th style={{ padding: '1rem' }}>NFS-e</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>{t(language, 'actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((student) => {
                const studentInvoices = invoices.filter(inv => inv.student_id === student.id)
                const lastInvoice = studentInvoices[0]
                const hasInvoiceForCurrentMonth = studentInvoices.some(
                  inv => inv.billing_period === currentPeriod && (inv.status === 'pago' || inv.nfs_e_pdf_link)
                )

                return (
                  <tr key={student.id} style={{ borderBottom: '1px solid #1e293b', fontSize: '0.9rem' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 'bold' }}>{student.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{student.email}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: student.status_pagamento === 'em_dia' ? '#10b981' : 
                                      student.status_pagamento === 'pendente' ? '#f59e0b' : '#ef4444'
                        }} />
                        <span style={{ fontSize: '0.85rem' }}>
                          {student.status_pagamento === 'em_dia' && t(language, 'financial_ok')}
                          {student.status_pagamento === 'pendente' && t(language, 'financial_pending')}
                          {student.status_pagamento === 'atrasado' && t(language, 'financial_late')}
                          {!student.status_pagamento && t(language, 'financial_pending')}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {lastInvoice ? (
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{lastInvoice.billing_period || t(language, 'not_specified')}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(lastInvoice.created_at).toLocaleDateString()}</div>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {lastInvoice?.nfs_e_pdf_link ? (
                        <button
                          className="primary-button"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#10b981', borderColor: '#10b981' }}
                          disabled={downloadingPdfId === lastInvoice.id}
                          onClick={() => void downloadNfsePdf(lastInvoice.id, student.full_name)}
                        >
                          {downloadingPdfId === lastInvoice.id ? t(language, 'generating_pdf') : t(language, 'view_pdf')}
                        </button>
                      ) : lastInvoice?.protocolo_recebimento ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            className="secondary-button"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#f59e0b', borderColor: '#f59e0b', color: '#000' }}
                            disabled={checkingStatusId === lastInvoice.id}
                            onClick={() => void handleCheckStatus(lastInvoice.id)}
                          >
                            {checkingStatusId === lastInvoice.id ? t(language, 'checking_status') : t(language, 'check_status')}
                          </button>
                          <button
                            className="primary-button"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#ef4444', borderColor: '#ef4444', cursor: 'pointer' }}
                            disabled={issuingNfseId === student.id}
                            onClick={() => void handleResetAndRetryNfse(student.id, student.full_name)}
                          >
                            {t(language, 'reissue_reset')}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{t(language, 'awaiting_emission')}</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {nfseErrors[student.id] ? (
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
                              background: '#ef4444',
                              borderColor: '#ef4444',
                              cursor: 'pointer'
                            }}
                            disabled={issuingNfseId === student.id}
                            onClick={() => handleInitiateIssueNfse(student)}
                          >
                            🔄 {issuingNfseId === student.id ? t(language, 'issuing') : t(language, 'try_again')}
                          </button>
                        </div>
                      ) : (
                        <button
                          className="primary-button"
                          style={{ 
                            padding: '0.4rem 0.8rem', 
                            fontSize: '0.8rem', 
                            background: hasInvoiceForCurrentMonth ? '#10b981' : '#0284c7',
                            cursor: hasInvoiceForCurrentMonth ? 'not-allowed' : 'pointer'
                          }}
                          disabled={issuingNfseId === student.id || hasInvoiceForCurrentMonth || !student.tuition_fee || Number(student.tuition_fee) <= 0}
                          onClick={() => handleInitiateIssueNfse(student)}
                        >
                          {issuingNfseId === student.id ? t(language, 'issuing') : hasInvoiceForCurrentMonth ? t(language, 'invoice_issued') : t(language, 'emit_invoice')}
                        </button>
                      )}
                      <button
                        className="secondary-button"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', opacity: lastInvoice ? 1 : 0.5 }}
                        disabled={!lastInvoice}
                        onClick={async () => {
                          if (!lastInvoice) return
                          const nextStatus = prompt('Insira o novo status (pendente, pago, atrasado):', lastInvoice.status)
                          if (nextStatus && ['pendente', 'pago', 'atrasado'].includes(nextStatus)) {
                            const { error } = await supabase.from('invoices').update({ status: nextStatus }).eq('id', lastInvoice.id)
                            if (error) toast.error(error.message)
                            else await refreshInvoices()
                          }
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

      {monthModalData && createPortal(
        <div
          className="reminder-app-scope modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999,
            background: 'rgba(2, 6, 23, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            overflowY: 'auto'
          }}
          onClick={() => setMonthModalData(null)}
        >
          <div
            className="form-card"
            style={{
              maxWidth: '480px',
              width: '100%',
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '1.5rem',
              padding: '2rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#fff' }}>
              📅 {t(language, 'select_reference_month_title')}
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              {t(language, 'missing_prev_month_notice')
                .replace('{name}', monthModalData.student.full_name)
                .replace('{prevMonth}', formatBillingPeriod(monthModalData.previousPeriod, language))}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button
                type="button"
                className="primary-button"
                style={{
                  padding: '0.85rem 1.25rem',
                  fontSize: '0.9rem',
                  background: '#0284c7',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  const student = monthModalData.student
                  const period = monthModalData.previousPeriod
                  setMonthModalData(null)
                  void handleIssueNfse(student.id, student.full_name, period)
                }}
              >
                <span>⬅️ {t(language, 'previous_month').replace('{month}', formatBillingPeriod(monthModalData.previousPeriod, language))}</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.85, background: 'rgba(255,255,255,0.15)', padding: '0.2rem 0.5rem', borderRadius: '0.375rem' }}>{monthModalData.previousPeriod}</span>
              </button>

              <button
                type="button"
                className="primary-button"
                style={{
                  padding: '0.85rem 1.25rem',
                  fontSize: '0.9rem',
                  background: '#10b981',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  const student = monthModalData.student
                  const period = monthModalData.currentPeriod
                  setMonthModalData(null)
                  void handleIssueNfse(student.id, student.full_name, period)
                }}
              >
                <span>⭐ {t(language, 'current_month').replace('{month}', formatBillingPeriod(monthModalData.currentPeriod, language))}</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.85, background: 'rgba(255,255,255,0.15)', padding: '0.2rem 0.5rem', borderRadius: '0.375rem' }}>{monthModalData.currentPeriod}</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}
                onClick={() => setMonthModalData(null)}
              >
                {t(language, 'cancel')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
