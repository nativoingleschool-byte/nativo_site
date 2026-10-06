import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FileUp, Info, ReceiptText, X } from 'lucide-react'

const formatMonth = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(date)
    .replace(/^./, (letter) => letter.toUpperCase())

const sessions = [
  { id: 1, date: '26 de Julho', title: 'Aulas de Inglês · Turma Fluência', students: '4 alunos presentes', amount: 'R$ 56,00' },
  { id: 2, date: '19 de Julho', title: 'Aulas de Inglês · Turma Fluência', students: '4 alunos presentes', amount: 'R$ 56,00' },
  { id: 3, date: '12 de Julho', title: 'Aulas de Inglês · Turma Fluência', students: '4 alunos presentes', amount: 'R$ 56,00' },
  { id: 4, date: '05 de Julho', title: 'Aulas de Inglês · Turma Fluência', students: '4 alunos presentes', amount: 'R$ 56,00' },
]

export default function TeacherReferenceFinanceView() {
  const [month, setMonth] = useState(() => new Date())
  const [filter, setFilter] = useState<'all' | 'done' | 'absence'>('all')
  const [modal, setModal] = useState<'invoice' | 'info' | 'details' | null>(null)
  const selectedMonth = formatMonth(month)
  const filtered = filter === 'absence' ? [] : sessions

  return (
    <main className="teacher-reference-content teacher-reference-finance">
      <section className="reference-finance-hero">
        <div className="reference-finance-heading">
          <div>
            <span className="reference-kicker">FOLHA DE PAGAMENTO</span>
            <h2>Demonstrativo Financeiro</h2>
          </div>
          <div className="reference-month-switcher">
            <button type="button" aria-label="Mês financeiro anterior" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}><ArrowLeft size={15} /></button>
            <strong>{selectedMonth}</strong>
            <button type="button" aria-label="Próximo mês financeiro" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}><ArrowRight size={15} /></button>
          </div>
        </div>
        <div className="reference-kpi-grid">
          <div><span>AULAS REALIZADAS</span><strong>4</strong><small>100% de assiduidade</small></div>
          <div><span>HORAS TRABALHADAS</span><strong>4.0<em>h</em></strong><small>60 min por encontro</small></div>
          <div className="is-green"><span>VALOR DO MÊS</span><strong>R$ 224,00</strong><small>R$ 56,00 / aula turma</small></div>
          <div className="is-yellow"><span>STATUS DO REPASSE</span><strong>Pendente de NFS-e</strong><small>Previsão: 5º dia útil</small></div>
        </div>
      </section>

      <section className="reference-invoice-card">
        <div className="reference-invoice-heading">
          <div><div className="reference-invoice-title"><h2>Nota Fiscal (MEI) · {selectedMonth}</h2><span>Aguardando Envio</span></div><p>Valor exato a ser emitido na NFS-e: <strong>R$ 224,00</strong> · Tomador: Nativo English Cursos</p></div>
          <button type="button" className="reference-primary-button" onClick={() => setModal('invoice')}><FileUp size={15} /> Enviar nota fiscal</button>
        </div>
        <div className="reference-invoice-notice"><Info size={15} /><span><strong>Sobre o MEI:</strong> Para liberação dos repasses bancários, anexe sua NFS-e MEI do período apurado com descrição de serviços pedagógicos de idiomas. <button type="button" onClick={() => setModal('info')}>Saiba mais</button></span></div>
      </section>

      <section className="reference-meetings-card">
        <div className="reference-meetings-heading"><div><h2>Detalhamento dos Encontros</h2><p>Valores computados individualmente por turma e aula ministrada.</p></div><div className="reference-filters">{[['all', 'Todas (4)'], ['done', 'Realizadas (4)'], ['absence', 'Ausências (0)']].map(([key, label]) => <button key={key} type="button" className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key as typeof filter)}>{label}</button>)}</div></div>
        <div className="reference-meeting-list">{filtered.map((session) => <div className="reference-meeting-row" key={session.id}><span className="reference-check"><Check size={14} /></span><div><strong>{session.title}</strong><span>{session.date} • 20:00 (60 min) • {session.students}</span></div><strong className="reference-amount">{session.amount}</strong><span className="reference-status">Realizada</span><button type="button" onClick={() => setModal('details')}>Detalhes</button></div>)}</div>
      </section>

      {modal && <div className="reference-modal-backdrop" onClick={() => setModal(null)}><section className="reference-modal" onClick={(event) => event.stopPropagation()}><button type="button" className="reference-modal-close" onClick={() => setModal(null)} aria-label="Fechar"><X size={18} /></button><div className="reference-modal-icon">{modal === 'invoice' ? <FileUp size={19} /> : modal === 'details' ? <ReceiptText size={19} /> : <Info size={19} />}</div><span className="reference-kicker">{modal === 'invoice' ? 'DOCUMENTAÇÃO' : modal === 'details' ? 'ENCONTRO REALIZADO' : 'ORIENTAÇÕES MEI'}</span><h2>{modal === 'invoice' ? 'Enviar nota fiscal' : modal === 'details' ? 'Aulas de Inglês · Turma Fluência' : 'Como enviar sua NFS-e'}</h2><p>{modal === 'invoice' ? `Anexe o PDF da NFS-e referente a ${selectedMonth}.` : modal === 'details' ? '26 de Julho · 20:00 · 60 minutos' : 'Emita a nota com a descrição “Serviços pedagógicos de idiomas” e o valor exato do período.'}</p>{modal === 'invoice' && <label className="reference-upload"><FileUp size={20} /><strong>Selecionar arquivo PDF</strong><span>Máximo de 10 MB</span><input type="file" accept="application/pdf" onChange={() => setModal(null)} /></label>}</section></div>}
    </main>
  )
}
