import { useState, FormEvent } from 'react';
import { X, Lock, Mail, Loader2 } from 'lucide-react';
import { supabase } from '../reminder/lib/supabase';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

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
        throw new Error(resData.error || 'Erro ao realizar login.');
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
          throw new Error('Não foi possível obter o perfil do usuário.');
        }

        // Redirect to the correct path (in this app, dashboard is at /reminder)
        // The path router in App.tsx will load the ReminderApp which shows the role-specific view
        window.history.pushState({}, '', '/reminder');
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao realizar login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-[2rem] max-w-md w-full overflow-hidden flex flex-col shadow-2xl border border-outline transition-all duration-300 transform scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-outline">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-primary tracking-tight">Área do Usuário</h2>
            <p className="text-xs text-on-surface-variant font-light mt-1">Acesse o sistema Nativo English</p>
          </div>
          <button 
            className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer p-1.5 hover:bg-background rounded-full"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6">
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
              <label className="text-xs font-bold text-primary uppercase tracking-widest block">Senha</label>
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
                  <span>Autenticando...</span>
                </>
              ) : (
                <span>Entrar no Sistema</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
