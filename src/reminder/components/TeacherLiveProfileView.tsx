import { useEffect, useState } from 'react'
import { Check, CreditCard, Info, UserRound } from 'lucide-react'
import type { Profile } from '../lib/types'
import { Language } from '../lib/i18n'

export type TeacherProfileDetails = Pick<Profile, 'full_name' | 'email' | 'cnpj' | 'chave_pix' | 'push_enabled'>

type TeacherLiveProfileViewProps = {
  profile: Profile
  language: Language
  saving: boolean
  onSave: (details: TeacherProfileDetails) => Promise<void>
}

const profileDetailsFrom = (profile: Profile): TeacherProfileDetails => ({
  full_name: profile.full_name ?? '',
  email: profile.email ?? '',
  cnpj: profile.cnpj ?? '',
  chave_pix: profile.chave_pix ?? '',
  push_enabled: profile.push_enabled,
})

export default function TeacherLiveProfileView({ profile, language, saving, onSave }: TeacherLiveProfileViewProps) {
  const [details, setDetails] = useState(() => profileDetailsFrom(profile))
  const [savedDetails, setSavedDetails] = useState(details)
  useEffect(() => {
    const current = profileDetailsFrom(profile)
    setDetails(current)
    setSavedDetails(current)
  }, [profile])

  const update = <K extends keyof TeacherProfileDetails>(key: K, value: TeacherProfileDetails[K]) =>
    setDetails((current) => ({ ...current, [key]: value }))

  const label = language === 'pt' ? {
    kicker: 'CONFIGURAÇÕES DE CONTA',
    title: 'Meu perfil',
    description: 'Gerencie seus dados de acesso, cadastro MEI e recebimento via PIX.',
    personal: 'Informações pessoais',
    fullName: 'Nome completo',
    email: 'E-mail de contato',
    payment: 'Dados de pagamento & MEI',
    cnpj: 'CNPJ MEI do professor',
    pix: 'Chave PIX cadastrada',
    notification: 'Receber notificações de novas turmas e lembretes',
    hint: 'Os dados exibidos são os cadastrados no seu perfil. Telefone e banco não estão disponíveis no cadastro atual.',
    discard: 'Descartar',
    save: 'Salvar alterações',
    saving: 'Salvando…',
  } : language === 'es' ? {
    kicker: 'CONFIGURACIÓN DE CUENTA',
    title: 'Mi perfil',
    description: 'Administre su acceso, registro MEI y datos de pago PIX.',
    personal: 'Información personal',
    fullName: 'Nombre completo',
    email: 'Correo de contacto',
    payment: 'Datos de pago y MEI',
    cnpj: 'CNPJ MEI del profesor',
    pix: 'Clave PIX registrada',
    notification: 'Recibir notificaciones de nuevos grupos y recordatorios',
    hint: 'Los datos mostrados pertenecen a su perfil. El teléfono y el banco no están disponibles en el registro actual.',
    discard: 'Descartar',
    save: 'Guardar cambios',
    saving: 'Guardando…',
  } : {
    kicker: 'ACCOUNT SETTINGS',
    title: 'My profile',
    description: 'Manage your access, MEI registration, and PIX payment details.',
    personal: 'Personal information',
    fullName: 'Full name',
    email: 'Contact email',
    payment: 'Payment & MEI details',
    cnpj: 'Teacher MEI CNPJ',
    pix: 'Registered PIX key',
    notification: 'Receive new class and reminder notifications',
    hint: 'Displayed values come from your profile. Phone and bank fields are not available in the current database.',
    discard: 'Discard',
    save: 'Save changes',
    saving: 'Saving…',
  }

  return (
    <main className="teacher-reference-content teacher-reference-profile">
      <form
        className="reference-profile-card"
        onSubmit={(event) => {
          event.preventDefault()
          void onSave(details).then(() => setSavedDetails(details), () => undefined)
        }}
      >
        <div className="reference-profile-header">
          <div><span className="reference-kicker">{label.kicker}</span><h2>{label.title}</h2><p>{label.description}</p></div>
        </div>
        <div className="reference-profile-grid">
          <section>
            <h3><UserRound size={16} /> {label.personal}</h3>
            <label>{label.fullName}<input required value={details.full_name} onChange={(event) => update('full_name', event.target.value)} /></label>
            <label>{label.email}<input required type="email" value={details.email} onChange={(event) => update('email', event.target.value)} /></label>
            <label className="reference-checkbox"><input type="checkbox" checked={details.push_enabled} onChange={(event) => update('push_enabled', event.target.checked)} /><span>{label.notification}</span></label>
          </section>
          <section>
            <h3><CreditCard size={16} /> {label.payment}</h3>
            <label>{label.cnpj}<input value={details.cnpj || ''} onChange={(event) => update('cnpj', event.target.value)} /></label>
            <label>{label.pix}<span className="reference-field-status"><Check size={13} /> {language === 'pt' ? 'Protegida' : language === 'es' ? 'Protegida' : 'Protected'}</span><input value={details.chave_pix || ''} onChange={(event) => update('chave_pix', event.target.value)} /></label>
            <div className="reference-profile-note"><Info size={15} /> {label.hint}</div>
          </section>
        </div>
        <div className="reference-profile-actions">
          <button type="button" onClick={() => setDetails(savedDetails)} disabled={saving}>{label.discard}</button>
          <button type="submit" className="reference-primary-button" disabled={saving}>{saving ? label.saving : label.save}</button>
        </div>
      </form>
    </main>
  )
}
