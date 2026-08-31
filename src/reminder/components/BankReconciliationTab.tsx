import React, { useState, useEffect, useRef } from 'react'
import { Profile, BankTransaction, BankTransactionStatus } from '../lib/types'
import { Language, t } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  RefreshCw,
  Play,
  Square,
  Users,
  CheckSquare,
  AlertTriangle,
  ArrowRight,
  Filter,
  Check
} from 'lucide-react'

interface BankReconciliationTabProps {
  language: Language
  students: Profile[]
  refreshInvoices: () => Promise<void>
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(val || 0)
}

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) {
    // Fallback if just YYYY-MM-DD
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return dateStr
  }
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

export default function BankReconciliationTab({
  language,
  students,
  refreshInvoices
}: BankReconciliationTabProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const abortBatchRef = useRef<boolean>(false)

  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | BankTransactionStatus>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Batch queue execution states
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false)
  const [batchProgress, setBatchProgress] = useState<{
    current: number
    total: number
    studentName: string
  } | null>(null)
  const [issuingTxId, setIssuingTxId] = useState<string | null>(null)
  const [txErrors, setTxErrors] = useState<Record<string, string>>({})

  // 1. Fetch recent transactions on mount
  const fetchTransactions = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          id,
          fitid,
          transaction_date,
          amount,
          memo,
          student_id,
          nfse_id,
          status,
          raw_data,
          created_at,
          student:profiles!bank_transactions_student_id_fkey(id, full_name, email, cpf, tuition_fee)
        `)
        .order('transaction_date', { ascending: false })
        .limit(100)

      if (error) throw error
      setTransactions((data as any[]) || [])
    } catch (err: any) {
      console.error('Failed to load bank transactions:', err.message)
      toast.error('Erro ao carregar transações bancárias salvas.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [])

  // 2. Handle File Upload (.ofx or .csv)
  const handleFileUpload = async (file: File) => {
    if (!file) return

    setIsUploading(true)
    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Sessão expirada. Faça login novamente.')

      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string
          if (!content) throw new Error('Arquivo vazio ou ilegível.')

          const response = await fetch('/api/admin/parse-statement', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              file_content: content,
              filename: file.name
            })
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error || 'Erro ao processar o extrato bancário.')
          }

          const parsedList: BankTransaction[] = data.transactions || []
          setTransactions(prev => {
            const map = new Map<string, BankTransaction>()
            // Retain any existing, but replace or prepend newly parsed
            parsedList.forEach(item => map.set(item.id, item))
            prev.forEach(item => {
              if (!map.has(item.id)) map.set(item.id, item)
            })
            const merged = Array.from(map.values())
            merged.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
            return merged
          })

          toast.success(`Extrato processado com sucesso! ${parsedList.length} transações importadas.`)
        } catch (err: any) {
          toast.error(err.message || 'Falha ao analisar arquivo.')
        } finally {
          setIsUploading(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }

      reader.onerror = () => {
        setIsUploading(false)
        toast.error('Erro na leitura do arquivo.')
      }

      reader.readAsText(file)
    } catch (err: any) {
      setIsUploading(false)
      toast.error(err.message || 'Erro ao iniciar upload.')
    }
  }

  // 3. Manually update student match for a transaction
  const handleUpdateStudentMatch = async (transactionId: string, newStudentId: string) => {
    const selectedStudent = students.find(s => s.id === newStudentId) || null

    // Optimistic local update
    setTransactions(prev =>
      prev.map(t => {
        if (t.id === transactionId) {
          return {
            ...t,
            student_id: newStudentId || null,
            student: selectedStudent,
            status: newStudentId ? 'matched' : 'pending'
          }
        }
        return t
      })
    )

    try {
      const { error } = await supabase
        .from('bank_transactions')
        .update({
          student_id: newStudentId || null,
          status: newStudentId ? 'matched' : 'pending'
        })
        .eq('id', transactionId)

      if (error) throw error
    } catch (err: any) {
      console.error('Failed to update student match:', err.message)
      toast.error('Erro ao atualizar vínculo do aluno.')
      // Revert if needed
      fetchTransactions()
    }
  }

  // 4. Emit single transaction NFS-e
  const handleEmitSingleNfse = async (tx: BankTransaction) => {
    if (!tx.student_id) {
      toast.info('Selecione um aluno para vincular a esta transação antes de emitir.')
      return
    }

    setIssuingTxId(tx.id)
    setTxErrors(prev => {
      const next = { ...prev }
      delete next[tx.id]
      return next
    })

    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      const response = await fetch('/api/admin/issue-single-statement-nf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          transaction_id: tx.id,
          student_id: tx.student_id
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao emitir nota fiscal.')
      }

      // Optimistic row update
      setTransactions(prev =>
        prev.map(t => {
          if (t.id === tx.id) {
            return {
              ...t,
              status: 'issued',
              nfse_id: data.invoice_id
            }
          }
          return t
        })
      )

      toast.success(`NFS-e emitida com sucesso para ${tx.student?.full_name || 'o aluno'}!`)
      await refreshInvoices()
    } catch (err: any) {
      const msg = err.message || 'Erro ao emitir NFS-e'
      setTxErrors(prev => ({ ...prev, [tx.id]: msg }))
      setTransactions(prev =>
        prev.map(t => (t.id === tx.id ? { ...t, status: 'failed' } : t))
      )
      toast.error(`Erro na emissão (${tx.student?.full_name || 'Aluno'}): ${msg}`)
    } finally {
      setIssuingTxId(null)
    }
  }

  // 5. Sequential Batch Emission Runner (Safe for Vercel 10s Serverless Limit)
  const handleStartBatchEmission = async () => {
    // Items to emit: either explicitly selected matched items, or all matched items if none selected
    let targetItems = transactions.filter(t => t.status === 'matched' && t.student_id)
    if (selectedIds.size > 0) {
      targetItems = targetItems.filter(t => selectedIds.has(t.id))
    }

    if (targetItems.length === 0) {
      toast.info('Nenhuma transação com aluno identificado pronta para emissão.')
      return
    }

    setIsBatchRunning(true)
    abortBatchRef.current = false

    let successCount = 0
    let failureCount = 0

    try {
      const sessionData = await supabase.auth.getSession()
      const token = sessionData.data.session?.access_token
      if (!token) throw new Error('Não autenticado.')

      for (let i = 0; i < targetItems.length; i++) {
        if (abortBatchRef.current) {
          toast.info('Emissão em lote interrompida pelo usuário.')
          break
        }

        const item = targetItems[i]
        const studentName = item.student?.full_name || 'Aluno'

        setBatchProgress({
          current: i + 1,
          total: targetItems.length,
          studentName
        })
        setIssuingTxId(item.id)

        try {
          const response = await fetch('/api/admin/issue-single-statement-nf', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              transaction_id: item.id,
              student_id: item.student_id
            })
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error || 'Erro na resposta do servidor')
          }

          // Optimistic row state update
          setTransactions(prev =>
            prev.map(t => {
              if (t.id === item.id) {
                return { ...t, status: 'issued', nfse_id: data.invoice_id }
              }
              return t
            })
          )
          setTxErrors(prev => {
            const next = { ...prev }
            delete next[item.id]
            return next
          })
          successCount++
        } catch (itemErr: any) {
          failureCount++
          const errMsg = itemErr.message || 'Falha na emissão'
          setTxErrors(prev => ({ ...prev, [item.id]: errMsg }))
          setTransactions(prev =>
            prev.map(t => (t.id === item.id ? { ...t, status: 'failed' } : t))
          )
        }

        // Small delay between transactions to prevent rate limiting
        await new Promise(r => setTimeout(r, 250))
      }

      await refreshInvoices()

      if (successCount > 0 && failureCount === 0) {
        toast.success(`Lote concluído! ${successCount} notas fiscais emitidas com sucesso.`)
      } else if (successCount > 0 && failureCount > 0) {
        toast.info(`Lote finalizado: ${successCount} emitidas, ${failureCount} com falhas.`)
      } else if (failureCount > 0) {
        toast.error(`Falha ao emitir as ${failureCount} notas fiscais do lote.`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro durante execução do lote.')
    } finally {
      setIsBatchRunning(false)
      setBatchProgress(null)
      setIssuingTxId(null)
    }
  }

  const handleStopBatch = () => {
    abortBatchRef.current = true
  }

  // Toggle selection
  const toggleSelectAll = () => {
    const matchedFiltered = filteredTransactions.filter(t => t.status === 'matched')
    if (selectedIds.size >= matchedFiltered.length && matchedFiltered.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(matchedFiltered.map(t => t.id)))
    }
  }

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Filtered transactions
  const filteredTransactions = transactions.filter(tx => {
    if (statusFilter !== 'all' && tx.status !== statusFilter) return false

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      const inMemo = tx.memo.toLowerCase().includes(q)
      const inStudent = tx.student?.full_name?.toLowerCase().includes(q)
      const inAmount = String(tx.amount).includes(q)
      return inMemo || inStudent || inAmount
    }
    return true
  })

  // Summary Metrics
  const totalCount = transactions.length
  const totalAmount = transactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0)
  const matchedCount = transactions.filter(t => t.status === 'matched').length
  const pendingCount = transactions.filter(t => t.status === 'pending').length
  const issuedCount = transactions.filter(t => t.status === 'issued').length

  const batchEligibleCount = selectedIds.size > 0
    ? selectedIds.size
    : transactions.filter(t => t.status === 'matched' && t.student_id).length

  return (
    <div className="bank-reconciliation-tab space-y-6">
      {/* 1. Header & Upload Dropzone */}
      <div className="panel p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="text-indigo-400" size={24} />
              {t(language, 'bank_reconciliation')}
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Importe o extrato bancário (.OFX ou .CSV) da escola para conciliar créditos e emitir NFS-e em lote com segurança.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              accept=".ofx,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }}
            />
            <button
              type="button"
              className="primary-button flex items-center gap-2"
              disabled={isUploading || isBatchRunning}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              <span>{isUploading ? 'Processando Arquivo...' : 'Importar Extrato (.OFX / .CSV)'}</span>
            </button>
          </div>
        </div>

        {/* Upload drop zone hint */}
        <div
          onClick={() => !isUploading && !isBatchRunning && fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file) handleFileUpload(file)
          }}
          className={`mt-4 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
            isUploading
              ? 'border-indigo-500/50 bg-indigo-500/5 cursor-wait'
              : 'border-slate-700/60 hover:border-indigo-500/60 hover:bg-slate-800/20'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
            <Upload size={28} className={isUploading ? 'animate-bounce text-indigo-400' : 'text-slate-500'} />
            <p className="text-sm">
              <span className="font-semibold text-slate-200">Arraste seu arquivo OFX ou CSV aqui</span> ou clique para buscar
            </p>
            <p className="text-xs text-slate-500">
              Formatos suportados: Arquivos bancários .OFX padrão e planilhas .CSV (Itaú, Bradesco, Santander, Nubank, Inter, etc.)
            </p>
          </div>
        </div>
      </div>

      {/* 2. Metrics Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="stat-card">
          <p className="section-label">Total Transações</p>
          <p className="text-2xl font-bold text-slate-100">{totalCount}</p>
          <p className="text-xs text-slate-400 mt-1">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="stat-card">
          <p className="section-label">Alunos Identificados</p>
          <p className="text-2xl font-bold text-indigo-400">{matchedCount}</p>
          <p className="text-xs text-slate-400 mt-1">Prontos para emissão</p>
        </div>
        <div className="stat-card">
          <p className="section-label">Pendentes</p>
          <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
          <p className="text-xs text-slate-400 mt-1">Requerem vínculo manual</p>
        </div>
        <div className="stat-card">
          <p className="section-label">NFS-e Emitidas</p>
          <p className="text-2xl font-bold text-emerald-400">{issuedCount}</p>
          <p className="text-xs text-slate-400 mt-1">Processadas com sucesso</p>
        </div>
        <div className="stat-card col-span-2 sm:col-span-1">
          <p className="section-label">Ação em Lote</p>
          <p className="text-2xl font-bold text-slate-200">{batchEligibleCount}</p>
          <p className="text-xs text-slate-400 mt-1">Disponíveis na fila</p>
        </div>
      </div>

      {/* 3. Batch Emission Banner / Interactive Progress Bar */}
      {isBatchRunning && batchProgress && (
        <div className="panel p-5 border border-indigo-500/40 bg-indigo-950/20 animate-fade-in">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <RefreshCw size={20} className="text-indigo-400 animate-spin" />
              <div>
                <h4 className="text-base font-semibold text-slate-100">
                  Emitindo NFS-e em lote ({batchProgress.current} de {batchProgress.total})
                </h4>
                <p className="text-xs text-slate-300">
                  Processando atualmente: <span className="font-semibold text-indigo-300">{batchProgress.studentName}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleStopBatch}
              className="danger-button flex items-center gap-1.5 text-xs py-1.5 px-3"
            >
              <Square size={14} />
              <span>Interromper</span>
            </button>
          </div>

          {/* Progress Bar Track */}
          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
              style={{
                width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`
              }}
            />
          </div>
          <p className="text-right text-xs text-slate-400 mt-1">
            {Math.round((batchProgress.current / batchProgress.total) * 100)}% concluído (chamadas isoladas anti-timeout)
          </p>
        </div>
      )}

      {/* 4. Controls: Filter, Search, Batch Trigger */}
      <div className="panel p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search box */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por descrição, aluno, valor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-900/80 border border-slate-700/60 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Status filter dropdown */}
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-sm bg-slate-900/80 border border-slate-700/60 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Todos os Status ({transactions.length})</option>
              <option value="matched">Identificados ({matchedCount})</option>
              <option value="pending">Pendentes ({pendingCount})</option>
              <option value="issued">Emitidas ({issuedCount})</option>
              <option value="failed">Com Falha</option>
            </select>
          </div>
        </div>

        {/* Batch action button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="secondary-button flex items-center gap-2 text-sm"
            onClick={fetchTransactions}
            disabled={isLoading || isBatchRunning}
            title="Atualizar lista"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            type="button"
            className="primary-button flex items-center gap-2 text-sm font-semibold"
            disabled={isBatchRunning || batchEligibleCount === 0}
            onClick={handleStartBatchEmission}
          >
            <Play size={16} className="fill-current" />
            <span>Emitir em Lote ({batchEligibleCount})</span>
          </button>
        </div>
      </div>

      {/* 5. Preview & Management Table */}
      <div className="panel p-0 overflow-hidden">
        <div className="table-responsive">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="p-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    title="Selecionar todos identificados"
                    checked={
                      selectedIds.size > 0 &&
                      selectedIds.size >= filteredTransactions.filter(t => t.status === 'matched').length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="p-3.5">Data</th>
                <th className="p-3.5">Descrição / Memo Bancário</th>
                <th className="p-3.5 text-right">Valor</th>
                <th className="p-3.5">Aluno Vinculado</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-400" />
                    Carregando transações...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {transactions.length === 0 ? (
                      <div>
                        <FileSpreadsheet size={32} className="mx-auto mb-2 text-slate-500" />
                        <p className="font-semibold text-slate-300">Nenhum extrato importado ainda</p>
                        <p className="text-xs text-slate-500 mt-1">Faça o upload de um arquivo .OFX ou .CSV acima para iniciar.</p>
                      </div>
                    ) : (
                      <p>Nenhuma transação encontrada com os filtros selecionados.</p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isSelected = selectedIds.has(tx.id)
                  const isIssuingThis = issuingTxId === tx.id
                  const txError = txErrors[tx.id]

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-800/30 transition-colors ${
                        isSelected ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={tx.status === 'issued'}
                          onChange={() => toggleSelectRow(tx.id)}
                          className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30"
                        />
                      </td>

                      {/* Date */}
                      <td className="p-3.5 font-medium text-slate-300">
                        {formatDateDisplay(tx.transaction_date)}
                      </td>

                      {/* Memo */}
                      <td className="p-3.5 max-w-xs" title={tx.memo}>
                        <div className="font-medium text-slate-200 truncate">{tx.memo}</div>
                        {tx.fitid && (
                          <span className="text-[11px] text-slate-500 block truncate">ID: {tx.fitid}</span>
                        )}
                        {txError && (
                          <div className="text-[11px] text-rose-400 mt-0.5 flex items-center gap-1">
                            <AlertCircle size={12} className="shrink-0" />
                            <span className="truncate">{txError}</span>
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="p-3.5 text-right font-semibold text-emerald-400">
                        {formatCurrency(tx.amount)}
                      </td>

                      {/* Matched Student Dropdown */}
                      <td className="p-3.5">
                        <select
                          disabled={tx.status === 'issued' || isBatchRunning}
                          value={tx.student_id || ''}
                          onChange={(e) => handleUpdateStudentMatch(tx.id, e.target.value)}
                          className={`text-xs w-full max-w-[240px] rounded-lg px-2.5 py-1.5 focus:outline-none transition-colors ${
                            tx.student_id
                              ? 'bg-slate-900 border border-indigo-500/50 text-indigo-200'
                              : 'bg-slate-900/60 border border-slate-700/60 text-slate-400'
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                          <option value="">-- Vincular Aluno --</option>
                          {students
                            .filter(s => !s.archived)
                            .map(s => (
                              <option key={s.id} value={s.id}>
                                {s.full_name} {s.cpf ? `(${s.cpf})` : ''} {s.tuition_fee ? `- R$ ${s.tuition_fee}` : ''}
                              </option>
                            ))}
                        </select>
                        {tx.student && (
                          <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                            {tx.student.cpf && <span>CPF: {tx.student.cpf}</span>}
                            {tx.raw_data?.match_type === 'cpf' && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">Auto CPF</span>
                            )}
                            {tx.raw_data?.match_type?.startsWith('name') && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">Auto Nome</span>
                            )}
                            {tx.raw_data?.match_type === 'amount_fallback' && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/30">Auto Valor</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center">
                        {tx.status === 'issued' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 size={12} />
                            Emitida
                          </span>
                        ) : tx.status === 'matched' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                            <Check size={12} />
                            Identificado
                          </span>
                        ) : tx.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-500/30">
                            <AlertTriangle size={12} />
                            Falha
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/30">
                            <Clock size={12} />
                            Pendente
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center">
                        {tx.status === 'issued' ? (
                          <span className="text-xs text-slate-500">Concluído</span>
                        ) : (
                          <button
                            type="button"
                            disabled={!tx.student_id || isIssuingThis || isBatchRunning}
                            onClick={() => handleEmitSingleNfse(tx)}
                            className="primary-button text-xs py-1 px-2.5 flex items-center gap-1 mx-auto disabled:opacity-40 disabled:cursor-not-allowed"
                            title={!tx.student_id ? 'Vincule um aluno primeiro' : 'Emitir NFS-e individualmente'}
                          >
                            {isIssuingThis ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <Play size={12} className="fill-current" />
                            )}
                            <span>{isIssuingThis ? 'Emitindo...' : 'Emitir NFS-e'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
