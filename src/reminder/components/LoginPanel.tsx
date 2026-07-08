import { FormEvent, useState } from 'react'
import { Language, t } from '../lib/i18n'
import { supabase } from '../lib/supabase'

interface LoginPanelProps {
  language: Language
  setupSigningIn: boolean
  loginForm: { email: string; password: string }
  setLoginForm: (form: { email: string; password: string }) => void
  loginError: string
  appError: string
  handleLogin: (event: FormEvent) => Promise<void>
}

export default function LoginPanel({
  language,
  setupSigningIn,
  loginForm,
  setLoginForm,
  loginError,
  appError,
  handleLogin,
}: LoginPanelProps) {
  const [view, setView] = useState<'login' | 'reset_request'>('login')
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  const handleResetRequest = async (e: FormEvent) => {
    e.preventDefault()
    setResetLoading(true)
    setResetMessage('')
    setResetError('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin
      })
      if (error) throw error
      
      const successMsg = language === 'es'
        ? 'Se ha enviado un enlace de recuperación a su correo electrónico. Verifique su bandeja de entrada.'
        : language === 'en'
        ? 'A recovery link has been sent to your email. Please check your inbox.'
        : 'Um link de recuperação foi enviado para seu e-mail. Por favor, verifique sua caixa de entrada.'
      setResetMessage(successMsg)
    } catch (err: any) {
      setResetError(err.message || 'Erro ao enviar e-mail de recuperação.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="reminder-app-scope">
      <div className="login-shell">
      <section className="login-hero">
        <div>
          <p className="eyebrow">Welcome</p>
          <h1>Keep every class organized</h1>
          <p className="muted large-copy">
            This app helps schools, teachers, and students see upcoming classes, stay on time, and keep a clear record of what
            happened in each lesson.
          </p>
        </div>

        <div className="feature-grid">
          <article className="feature-card">
            <h3>See what’s next</h3>
            <p className="muted">Check upcoming classes and recent lessons in one place.</p>
          </article>
          <article className="feature-card">
            <h3>Stay on time</h3>
            <p className="muted">Get reminders before class so nobody misses an important lesson.</p>
          </article>
          <article className="feature-card">
            <h3>Keep everyone aligned</h3>
            <p className="muted">Students, teachers, and admins can each see the information that matters to them.</p>
          </article>
          <article className="feature-card">
            <h3>Track each class</h3>
            <p className="muted">Mark whether a class happened and keep a simple history of lessons.</p>
          </article>
        </div>
      </section>

      <section className="login-panel">
        {view === 'login' ? (
          <>
            <div className="panel-header">
              <div>
                <p className="section-label">Login</p>
                <h2>{language === 'es' ? 'Inicie sesión en su cuenta' : language === 'en' ? 'Sign in to your account' : 'Entre na sua conta'}</h2>
              </div>
            </div>

            <form className="form-card" onSubmit={handleLogin}>
              {setupSigningIn && <p className="muted">{t(language, 'opening_setup_link')}</p>}
              <input
                required
                type="email"
                placeholder="Email"
                value={loginForm.email}
                onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
              />
              <input
                required
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
                <button 
                  type="button" 
                  style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                  onClick={() => setView('reset_request')}
                >
                  {language === 'es' ? 'Olvidé mi contraseña' : language === 'en' ? 'Forgot password?' : 'Esqueci minha senha'}
                </button>
              </div>
              {loginError && <p className="error-text">{loginError}</p>}
              {appError && <p className="error-text">{appError}</p>}
              <button className="primary-button">{language === 'es' ? 'Iniciar sesión' : language === 'en' ? 'Sign in' : 'Entrar'}</button>
            </form>
          </>
        ) : (
          <>
            <div className="panel-header">
              <div>
                <p className="section-label">{language === 'es' ? 'Recuperar contraseña' : language === 'en' ? 'Reset password' : 'Recuperar senha'}</p>
                <h2>{language === 'es' ? 'Recuperación de Cuenta' : language === 'en' ? 'Account Recovery' : 'Recuperação de Conta'}</h2>
              </div>
            </div>

            <form className="form-card" onSubmit={handleResetRequest}>
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                {language === 'es' ? 'Ingrese su correo electrónico para recibir un enlace de recuperación.' : language === 'en' ? 'Enter your email to receive a recovery link.' : 'Insira seu e-mail para receber um link de recuperação.'}
              </p>
              <input
                required
                type="email"
                placeholder="Email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
              />
              {resetMessage && <p style={{ color: '#10b981', fontSize: '0.85rem' }}>{resetMessage}</p>}
              {resetError && <p className="error-text">{resetError}</p>}
              
              <button className="primary-button" disabled={resetLoading}>
                {resetLoading ? (language === 'es' ? 'Enviando...' : language === 'en' ? 'Sending...' : 'Enviando...') : (language === 'es' ? 'Enviar Enlace' : language === 'en' ? 'Send Link' : 'Enviar Link')}
              </button>

              <button 
                type="button"
                className="secondary-button"
                style={{ marginTop: '0.5rem' }}
                onClick={() => {
                  setView('login')
                  setResetMessage('')
                  setResetError('')
                }}
              >
                {language === 'es' ? 'Volver al Login' : language === 'en' ? 'Back to Login' : 'Voltar ao Login'}
              </button>
            </form>
          </>
        )}

        <div className="install-note">
          <h3>{language === 'es' ? 'Cómo empezar' : language === 'en' ? 'Getting started' : 'Primeiros passos'}</h3>
          <p className="muted">
            {language === 'es' ? 'Use el correo y la contraseña compartidos por su escuela.' : language === 'en' ? 'Use the email and password shared with you by your school or admin.' : 'Use o e-mail e a senha compartilhados pela sua escola.'}
          </p>
        </div>
      </section>
      </div>
    </div>
  )
}
