import { FormEvent, useState } from 'react'
import { ArrowLeft, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { Language, t } from '../lib/i18n'
import { supabase } from '../lib/supabase'

interface LoginPanelProps {
  language: Language
  loginForm: { email: string; password: string }
  setLoginForm: (form: { email: string; password: string }) => void
  keepLoggedIn: boolean
  setKeepLoggedIn: (val: boolean) => void
  loginError: string
  appError: string
  handleLogin: (event: FormEvent) => Promise<void>
}

const copy = {
  pt: { eyebrow: 'PORTAL DO PROFESSOR', title: 'Entre na sua conta', description: 'Acesse sua agenda, financeiro e dados cadastrais em um só lugar.', email: 'E-mail', password: 'Senha', forgot: 'Esqueci minha senha', keep: 'Manter conectado neste dispositivo', submit: 'Entrar', help: 'Use o e-mail e a senha compartilhados pela sua escola.', resetEyebrow: 'RECUPERAÇÃO DE ACESSO', resetTitle: 'Recuperar senha', resetDescription: 'Insira seu e-mail para receber um link de recuperação.', send: 'Enviar link', back: 'Voltar para o login', sent: 'Um link de recuperação foi enviado para seu e-mail. Verifique sua caixa de entrada.', resetError: 'Erro ao enviar e-mail de recuperação.' },
  en: { eyebrow: 'TEACHER PORTAL', title: 'Sign in to your account', description: 'Access your schedule, finances, and profile information in one place.', email: 'Email', password: 'Password', forgot: 'Forgot password?', keep: 'Keep me signed in on this device', submit: 'Sign in', help: 'Use the email and password shared by your school.', resetEyebrow: 'ACCESS RECOVERY', resetTitle: 'Reset password', resetDescription: 'Enter your email to receive a recovery link.', send: 'Send link', back: 'Back to login', sent: 'A recovery link has been sent to your email. Please check your inbox.', resetError: 'Error sending recovery email.' },
  es: { eyebrow: 'PORTAL DEL PROFESOR', title: 'Inicia sesión en tu cuenta', description: 'Accede a tu agenda, finanzas y datos de perfil en un solo lugar.', email: 'Correo electrónico', password: 'Contraseña', forgot: 'Olvidé mi contraseña', keep: 'Mantener conectado en este dispositivo', submit: 'Iniciar sesión', help: 'Usa el correo y la contraseña compartidos por tu escuela.', resetEyebrow: 'RECUPERACIÓN DE ACCESO', resetTitle: 'Recuperar contraseña', resetDescription: 'Ingresa tu correo para recibir un enlace de recuperación.', send: 'Enviar enlace', back: 'Volver al login', sent: 'Se ha enviado un enlace de recuperación a tu correo. Verifica tu bandeja de entrada.', resetError: 'Error al enviar el correo de recuperación.' },
} as const

export default function LoginPanel({ language, loginForm, setLoginForm, keepLoggedIn, setKeepLoggedIn, loginError, appError, handleLogin }: LoginPanelProps) {
  const [view, setView] = useState<'login' | 'reset_request'>('login')
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')
  const text = copy[language] ?? copy.pt

  const handleResetRequest = async (event: FormEvent) => {
    event.preventDefault()
    setResetLoading(true)
    setResetMessage('')
    setResetError('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: window.location.origin })
      if (error) throw error
      setResetMessage(text.sent)
    } catch (error: any) {
      console.error('Password reset error:', error)
      setResetError(error?.message || text.resetError)
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="reminder-app-scope login-reference-shell">
      <div className="login-reference-brand"><span className="login-reference-mark"><img src="/hero/logo-white.png" alt="" /></span><div><strong>NATIVO <em>ENGLISH</em></strong><span>Portal do Professor</span></div></div>
      <main className="login-reference-main">
        <section className="login-reference-card" aria-labelledby="login-title">
          {view === 'login' ? <>
            <div className="login-reference-heading"><span className="login-reference-eyebrow">{text.eyebrow}</span><h1 id="login-title">{text.title}</h1><p>{text.description}</p></div>
            <form className="login-reference-form" onSubmit={handleLogin}>
              <label><span>{text.email}</span><div className="login-reference-input"><Mail size={17} /><input required type="email" placeholder="seuemail@exemplo.com" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} /></div></label>
              <label><span>{text.password}</span><div className="login-reference-input"><LockKeyhole size={17} /><input required type="password" placeholder="••••••••" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} /></div></label>
              <div className="login-reference-options"><label className="login-reference-check"><input type="checkbox" checked={keepLoggedIn} onChange={(event) => setKeepLoggedIn(event.target.checked)} /><span>{text.keep}</span></label><button type="button" onClick={() => setView('reset_request')}>{text.forgot}</button></div>
              {(loginError || appError) && <p className="login-reference-error">{loginError || appError}</p>}
              <button className="login-reference-submit" type="submit">{text.submit}</button>
            </form>
            <div className="login-reference-help"><ShieldCheck size={16} /><span>{text.help}</span></div>
          </> : <>
            <button type="button" className="login-reference-back" onClick={() => { setView('login'); setResetMessage(''); setResetError('') }}><ArrowLeft size={16} /> {text.back}</button>
            <div className="login-reference-heading"><span className="login-reference-eyebrow">{text.resetEyebrow}</span><h1>{text.resetTitle}</h1><p>{text.resetDescription}</p></div>
            <form className="login-reference-form" onSubmit={handleResetRequest}><label><span>{text.email}</span><div className="login-reference-input"><Mail size={17} /><input required type="email" placeholder="seuemail@exemplo.com" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} /></div></label>{resetMessage && <p className="login-reference-success">{resetMessage}</p>}{resetError && <p className="login-reference-error">{resetError}</p>}<button className="login-reference-submit" disabled={resetLoading}>{resetLoading ? '...' : text.send}</button></form>
          </>}
        </section>
      </main>
      <footer className="login-reference-footer">Nativo English · Portal do Professor</footer>
    </div>
  )
}
