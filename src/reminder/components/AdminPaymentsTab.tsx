import { Profile } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { supabase } from '../lib/supabase'

interface AdminPaymentsTabProps {
  language: Language
  paymentSearch: string
  setPaymentSearch: (s: string) => void
  paymentFilter: 'all' | 'em_dia' | 'pendente' | 'atrasado'
  setPaymentFilter: (f: 'all' | 'em_dia' | 'pendente' | 'atrasado') => void
  students: Profile[]
  invoices: any[]
  invoiceForm: { studentId: string; amount: string; dueDate: string } | null
  setInvoiceForm: (form: { studentId: string; amount: string; dueDate: string } | null) => void
  invoiceLoading: boolean
  handleGenerateBoleto: (e: any) => Promise<void>
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
  invoiceForm,
  setInvoiceForm,
  invoiceLoading,
  handleGenerateBoleto,
  refreshInvoices,
}: AdminPaymentsTabProps) {
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
              <th style={{ padding: '1rem' }}>Last Invoice / Link</th>
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
                        <a 
                          href={lastInvoice.boleto_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={{ color: '#38bdf8', textDecoration: 'underline', fontSize: '0.85rem' }}
                        >
                          Invoice ({lastInvoice.status})
                        </a>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>No invoice</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {lastInvoice?.nfse_url ? (
                        <a 
                          href={lastInvoice.nfse_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={{ color: '#10b981', textDecoration: 'underline', fontSize: '0.85rem', fontWeight: 'bold' }}
                        >
                          NFS-e
                        </a>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>No NFS-e</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        className="secondary-button"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                        onClick={() => setInvoiceForm({ studentId: student.id, amount: '340', dueDate: new Date(Date.now() + 5*24*60*60*1000).toISOString().split('T')[0] })}
                      >
                        New invoice
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
                            if (error) alert(error.message)
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

      {invoiceForm && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="form-card" style={{ maxWidth: '400px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '1.5rem', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.25rem' }}>Gerar Boleto (Cora API)</h3>
            <form onSubmit={handleGenerateBoleto} className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Valor (R$)</label>
                <input
                  required
                  type="number"
                  placeholder="Valor da cobrança"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Data de Vencimento</label>
                <input
                  required
                  type="date"
                  value={invoiceForm.dueDate}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                />
              </div>
              <div className="button-stack mt-4" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="primary-button" disabled={invoiceLoading}>
                  {invoiceLoading ? t(language, 'loading_invite') : t(language, 'save')}
                </button>
                <button type="button" className="secondary-button" onClick={() => setInvoiceForm(null)}>{t(language, 'cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
