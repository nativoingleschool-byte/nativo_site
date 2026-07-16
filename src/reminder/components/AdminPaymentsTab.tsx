import { useState } from 'react'
import { Profile } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

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

  const handleCheckStatus = async (invoiceId: string) => {
    setCheckingStatusId(invoiceId)
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      const response = await fetch('/api/admin/check-nfse-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ invoice_id: invoiceId })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao verificar status.')

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

  const handleIssueNfse = async (studentId: string, fullName: string) => {
    setIssuingNfseId(studentId)
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

      if (data.nfs_e_pdf_link) {
        toast.success(t(language, 'success_invoice_banner').replace('{name}', fullName))
      } else {
        toast.info(`${t(language, 'success_lote_envio_banner')} (${fullName})`)
      }
      await refreshInvoices()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIssuingNfseId(null)
    }
  }

  const currentPeriod = new Date().toISOString().substring(0, 7) // 'YYYY-MM'

  return (
    <>
      <div className="form-card mb-6 animate-slide-up" style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '1.25rem', borderRadius: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="form-grid" style={{ display: 'flex', gap: '1rem' }}>
          <input
            placeholder={`${t(language, 'edit_student_title').split(' ')[0]}...`}
            value={paymentSearch}
            onChange={(e) => setPaymentSearch(e.target.value)}
            style={{ flex: 2 }}
          />
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as any)}
            style={{ flex: 1 }}
          >
            <option value="all">All status</option>
            <option value="em_dia">Green ({t(language, 'financial_ok')})</option>
            <option value="pendente">Yellow ({t(language, 'financial_pending')})</option>
            <option value="atrasado">Red ({t(language, 'financial_late')})</option>
          </select>
        </div>
      </div>

      <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '1.5rem', border: '1px solid #1e293b', padding: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>{t(language, 'edit_student_title').split(' ').pop()}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'student_financial_status')}</th>
              <th style={{ padding: '1rem' }}>{t(language, 'billing_period_ref')} / {t(language, 'emission_date')}</th>
              <th style={{ padding: '1rem' }}>NFS-e</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>{t(language, 'actions')}</th>
            </tr>
          </thead>
          <tbody>
            {students
              .filter(student => {
                const matchesSearch = student.full_name.toLowerCase().includes(paymentSearch.toLowerCase()) || 
                  student.email.toLowerCase().includes(paymentSearch.toLowerCase())
                const status = student.status_pagamento || 'pendente'
                const matchesFilter = paymentFilter === 'all' || status === paymentFilter
                return matchesSearch && matchesFilter
              })
              .map((student) => {
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
                          <div style={{ fontWeight: 'bold' }}>{lastInvoice.billing_period || 'Não especificado'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(lastInvoice.created_at).toLocaleDateString()}</div>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {lastInvoice?.nfs_e_pdf_link ? (
                        <a 
                          href={lastInvoice.nfs_e_pdf_link} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="primary-button"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#10b981', borderColor: '#10b981', textDecoration: 'none', display: 'inline-block' }}
                        >
                          {t(language, 'view_pdf')}
                        </a>
                      ) : lastInvoice?.protocolo_recebimento ? (
                        <button
                          className="secondary-button"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#f59e0b', borderColor: '#f59e0b', color: '#000' }}
                          disabled={checkingStatusId === lastInvoice.id}
                          onClick={() => void handleCheckStatus(lastInvoice.id)}
                        >
                          {checkingStatusId === lastInvoice.id ? t(language, 'checking_status') : t(language, 'check_status')}
                        </button>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{t(language, 'awaiting_emission')}</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button
                        className="primary-button"
                        style={{ 
                          padding: '0.4rem 0.8rem', 
                          fontSize: '0.8rem', 
                          background: hasInvoiceForCurrentMonth ? '#10b981' : '#0284c7',
                          cursor: hasInvoiceForCurrentMonth ? 'not-allowed' : 'pointer'
                        }}
                        disabled={issuingNfseId === student.id || hasInvoiceForCurrentMonth || !student.tuition_fee || Number(student.tuition_fee) <= 0}
                        onClick={() => void handleIssueNfse(student.id, student.full_name)}
                      >
                        {issuingNfseId === student.id ? t(language, 'issuing') : hasInvoiceForCurrentMonth ? t(language, 'invoice_issued') : t(language, 'emit_invoice')}
                      </button>
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
    </>
  )
}
