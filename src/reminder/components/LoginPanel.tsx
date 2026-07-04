import { FormEvent } from 'react'
import { Language, t } from '../lib/i18n'

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
        <div className="panel-header">
          <div>
            <p className="section-label">Login</p>
            <h2>Sign in to your account</h2>
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
          {loginError && <p className="error-text">{loginError}</p>}
          {appError && <p className="error-text">{appError}</p>}
          <button className="primary-button">Sign in</button>
        </form>

        <div className="install-note">
          <h3>Getting started</h3>
          <p className="muted">Use the email and password shared with you by your school or admin.</p>
        </div>
      </section>
      </div>
    </div>
  )
}
