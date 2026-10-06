import { useState } from 'react'
import { Check, CreditCard, Info, UserRound } from 'lucide-react'

type ProfileForm = { fullName: string; email: string; phone: string; cnpj: string; pix: string; bank: string; notifications: boolean }

const initialForm: ProfileForm = {
  fullName: 'Eric Lucas',
  email: 'ericlucas.lucas@gmail.com',
  phone: '(11) 98765-4321',
  cnpj: '42.891.304/0001-92',
  pix: 'ericlucas.lucas@gmail.com',
  bank: '',
  notifications: true,
}

export default function TeacherReferenceProfileView() {
  const [form, setForm] = useState<ProfileForm>(() => {
    try { return { ...initialForm, ...JSON.parse(localStorage.getItem('nativo-teacher-profile') || '{}') } } catch { return initialForm }
  })
  const [saved, setSaved] = useState(form)
  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => setForm((current) => ({ ...current, [key]: value }))
  const save = (event: React.FormEvent) => { event.preventDefault(); setSaved(form); localStorage.setItem('nativo-teacher-profile', JSON.stringify(form)) }

  return (
    <main className="teacher-reference-content teacher-reference-profile">
      <form className="reference-profile-card" onSubmit={save}>
        <div className="reference-profile-header"><div><span className="reference-kicker">CONFIGURAÇÕES DE CONTA</span><h2>Meu perfil</h2><p>Gerencie seus dados de contato, prestação MEI e recebimento bancário via PIX.</p></div><span className="reference-approved"><span /> Cadastro Ativo &amp; Homologado</span></div>
        <div className="reference-profile-grid">
          <section><h3><UserRound size={16} /> Informações Pessoais</h3><label>Nome completo<input value={form.fullName} onChange={(event) => update('fullName', event.target.value)} /></label><label>E-mail de acesso e comunicação<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></label><label>Telefone / WhatsApp<input value={form.phone} onChange={(event) => update('phone', event.target.value)} /></label><label className="reference-checkbox"><input type="checkbox" checked={form.notifications} onChange={(event) => update('notifications', event.target.checked)} /><span>Receber notificações de novas turmas e lembretes por e-mail</span></label></section>
          <section><h3><CreditCard size={16} /> Dados de Pagamento &amp; MEI</h3><label>CNPJ MEI do Professor<span className="reference-field-status">Ativo na Receita</span><input value={form.cnpj} onChange={(event) => update('cnpj', event.target.value)} /></label><label>Chave PIX Cadastrada<input value={form.pix} onChange={(event) => update('pix', event.target.value)} /><Check size={15} className="reference-input-check" /></label><small className="reference-field-hint">Os repasses mensais de honorários serão direcionados automaticamente para esta chave.</small><label>Instituição Bancária (Opcional)<input placeholder="Ex: Banco Inter (077) – Ag 0001 / Conta 12345-6" value={form.bank} onChange={(event) => update('bank', event.target.value)} /></label><div className="reference-profile-note"><Info size={15} /> Mantenha sua chave PIX com titularidade correspondente ao seu CNPJ MEI ou CPF.</div></section>
        </div>
        <div className="reference-profile-actions"><button type="button" onClick={() => setForm(saved)}>Descartar</button><button type="submit" className="reference-primary-button">Salvar</button></div>
      </form>
    </main>
  )
}
