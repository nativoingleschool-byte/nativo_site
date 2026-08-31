import { useState, FormEvent } from 'react';
import { X, Lock, Mail, Loader2 } from 'lucide-react';
import { supabase } from '../reminder/lib/supabase';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'pt' | 'en' | 'es';
}

export default function LoginModal({ isOpen, onClose, lang = 'pt' }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isForgotView, setIsForgotView] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    setIsForgotView(false);
    setSuccessMsg('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || (lang === 'es' ? 'Error al iniciar sesión.' : lang === 'en' ? 'Error signing in.' : 'Erro ao realizar login.'));
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: resData.session.access_token,
        refresh_token: resData.session.refresh_token
      });

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      if (resData.user) {
        // Fetch the user's profile to check their role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', resData.user.id)
          .single();

        if (profileError || !profile) {
          throw new Error(lang === 'es' ? 'No se pudo obtener el perfil del usuario.' : lang === 'en' ? 'Could not retrieve user profile.' : 'Não foi possível obter o perfil do usuário.');
        }

        // Redirect to the correct path (in this app, dashboard is at /reminder)
        // The path router in App.tsx will load the ReminderApp which shows the role-specific view
        window.history.pushState({}, '', '/reminder');
        handleClose();
      }
    } catch (err: any) {
      setError(err?.message || (lang === 'es' ? 'Error al iniciar sesión.' : lang === 'en' ? 'Error signing in.' : 'Erro ao realizar login.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      setSuccessMsg(
        lang === 'es'
          ? '¡Enlace de recuperación enviado con éxito a su correo! Verifique su bandeja de entrada.'
          : lang === 'en'
          ? 'Recovery link sent successfully to your email! Please check your inbox.'
          : 'Link de recuperação enviado com sucesso para seu e-mail! Verifique sua caixa de entrada.'
      );
    } catch (err: any) {
      console.error('Password reset error:', err);
      let msg = lang === 'es' ? 'Error al solicitar el enlace de recuperación.' : lang === 'en' ? 'Error requesting recovery link.' : 'Erro ao solicitar link de recuperação.';
      if (err) {
        if (typeof err === 'string') msg = err;
        else if (err.message) msg = String(err.message);
        else if (err.error_description) msg = String(err.error_description);
        else if (err.msg) msg = String(err.msg);
        else msg = err.toString() !== '[object Object]' ? err.toString() : JSON.stringify(err);
      }
      if (msg === '{}') {
        msg = lang === 'es' ? 'Error de red o límite de solicitudes excedido.' : lang === 'en' ? 'Network error or rate limit exceeded.' : 'Erro de rede ou limite de requisições excedido. Verifique os logs do console.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-md"
      onClick={handleClose}
    >
      <div 
        className="bg-white rounded-[2rem] max-w-md w-full overflow-hidden flex flex-col shadow-2xl border border-outline transition-all duration-300 transform scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-outline">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-primary tracking-tight">
              {isForgotView 
                ? (lang === 'es' ? 'Recuperar Acceso' : lang === 'en' ? 'Reset Access' : 'Recuperar Acesso')
                : (lang === 'es' ? 'Área de Usuario' : lang === 'en' ? 'User Portal' : 'Área do Usuário')}
            </h2>
            <p className="text-xs text-on-surface-variant font-light mt-1">
              {isForgotView 
                ? (lang === 'es' ? 'Ingrese su correo registrado' : lang === 'en' ? 'Enter your registered email' : 'Insira seu e-mail cadastrado')
                : (lang === 'es' ? 'Acceda al sistema Nativo English' : lang === 'en' ? 'Access Nativo English portal' : 'Acesse o sistema Nativo English')}
            </p>
          </div>
          <button 
            className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer p-1.5 hover:bg-background rounded-full"
            onClick={handleClose}
            aria-label={lang === 'es' ? 'Cerrar' : lang === 'en' ? 'Close' : 'Fechar'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6">
          {isForgotView ? (
            <form className="space-y-4" onSubmit={handleResetPassword}>
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 font-medium">
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-2xl text-xs text-green-600 font-medium">
                  {successMsg}
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary uppercase tracking-widest block">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant w-5 h-5" />
                  <input 
                    type="email"
                    required
                    placeholder="exemplo@nativo.com"
                    className="w-full pl-12 pr-4 py-3.5 bg-background border border-outline rounded-2xl text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-primary text-white rounded-full font-bold hover:bg-primary/95 transition-all cursor-pointer flex justify-center items-center gap-2 text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{lang === 'es' ? 'Enviando...' : lang === 'en' ? 'Sending...' : 'Enviando...'}</span>
                    </>
                  ) : (
                    <span>{lang === 'es' ? 'Recuperar Contraseña' : lang === 'en' ? 'Reset Password' : 'Recuperar Senha'}</span>
                  )}
                </button>
                
                <button 
                  type="button"
                  className="w-full py-4 bg-gray-100 text-gray-700 rounded-full font-bold hover:bg-gray-200 transition-all cursor-pointer text-sm"
                  onClick={() => {
                    setIsForgotView(false);
                    setError('');
                    setSuccessMsg('');
                  }}
                >
                  {lang === 'es' ? 'Volver al Login' : lang === 'en' ? 'Back to Login' : 'Voltar ao Login'}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 font-medium">
                  {error}
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary uppercase tracking-widest block">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant w-5 h-5" />
                  <input 
                    type="email"
                    required
                    placeholder="exemplo@nativo.com"
                    className="w-full pl-12 pr-4 py-3.5 bg-background border border-outline rounded-2xl text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary uppercase tracking-widest block">
                  {lang === 'es' ? 'Contraseña' : lang === 'en' ? 'Password' : 'Senha'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant w-5 h-5" />
                  <input 
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-3.5 bg-background border border-outline rounded-2xl text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="flex justify-end mt-1">
                  <button 
                    type="button" 
                    className="text-xs text-on-surface-variant hover:text-primary transition-colors font-medium underline cursor-pointer"
                    onClick={() => {
                      setIsForgotView(true);
                      setError('');
                      setSuccessMsg('');
                    }}
                  >
                    {lang === 'es' ? 'Olvidé mi contraseña' : lang === 'en' ? 'Forgot password?' : 'Esqueci minha senha'}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button 
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-4 bg-primary text-white rounded-full font-bold hover:bg-primary/95 transition-all cursor-pointer flex justify-center items-center gap-2 text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{lang === 'es' ? 'Autenticando...' : lang === 'en' ? 'Signing in...' : 'Autenticando...'}</span>
                  </>
                ) : (
                  <span>{lang === 'es' ? 'Entrar al Sistema' : lang === 'en' ? 'Sign In to Portal' : 'Entrar no Sistema'}</span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
