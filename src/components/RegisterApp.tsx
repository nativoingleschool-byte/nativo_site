import { useState, useEffect, FormEvent } from 'react';
import { User, FileText, Mail, Lock, Calendar, Loader2, CheckCircle2, Home, MapPin } from 'lucide-react';

export default function RegisterApp() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [paymentDate, setPaymentDate] = useState('5');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [isEmailLocked, setIsEmailLocked] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token') || '';
    const emailParam = params.get('email') || '';
    setToken(tokenParam);
    if (emailParam) {
      setEmail(emailParam);
      setIsEmailLocked(true);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!token) {
      setError('Token de convite ausente na URL.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register-student', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          email,
          password,
          full_name: fullName,
          cpf,
          data_pagamento_preferencial: Number(paymentDate),
          cep,
          logradouro,
          bairro,
          cidade,
          uf
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao realizar cadastro.');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Falha ao cadastrar a conta.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#020617] text-[#e5eefc] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#0f172a] border border-slate-800 rounded-3xl p-8 text-center shadow-2xl space-y-6">
          <div className="flex justify-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-white">Cadastro Concluído!</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Sua conta de estudante foi criada com sucesso. Você já pode acessar a plataforma utilizando suas credenciais.
            </p>
          </div>
          <button
            onClick={() => window.history.pushState({}, '', '/reminder')}
            className="w-full py-4 bg-primary text-white rounded-full font-bold hover:brightness-110 transition-all cursor-pointer shadow-lg text-sm"
          >
            Acessar a Área do Aluno
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-[#e5eefc] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#0f172a] border border-slate-800 rounded-[2rem] p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-block px-3 py-1 bg-primary/20 border border-primary/30 rounded-full text-xs text-primary font-bold uppercase tracking-widest">
            Convite Nativo
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Crie sua Conta</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Preencha seus dados para concluir seu cadastro como estudante.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-300 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Nome Completo</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input
                type="text"
                required
                placeholder="Seu nome"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-primary transition-colors text-sm"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>

          {/* CPF */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">CPF</label>
            <div className="relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input
                type="text"
                placeholder="000.000.000-00"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-primary transition-colors text-sm"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input
                type="email"
                required
                disabled={isEmailLocked}
                placeholder="exemplo@gmail.com"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-950/50 border border-slate-900 rounded-2xl text-slate-400 placeholder-slate-600 focus:outline-none transition-colors text-sm disabled:cursor-not-allowed"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input
                type="password"
                required
                placeholder="Defina uma senha"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-primary transition-colors text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* Preferred Payment Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Dia de Vencimento Preferencial</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <select
                className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white focus:outline-none focus:border-primary transition-colors text-sm appearance-none"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              >
                {[1, 5, 10, 15, 20, 25].map((day) => (
                  <option key={day} value={day}>
                    Dia {day} de cada mês
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CEP */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">CEP (Opcional)</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input
                type="text"

                placeholder="06401-000"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-primary transition-colors text-sm"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
              />
            </div>
          </div>

          {/* Logradouro */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Endereço (Rua, Nº, Apto) (Opcional)</label>
            <div className="relative">
              <Home className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input
                type="text"

                placeholder="Av. Principal, 123"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-primary transition-colors text-sm"
                value={logradouro}
                onChange={(e) => setLogradouro(e.target.value)}
              />
            </div>
          </div>

          {/* Bairro, Cidade, UF in grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Bairro (Opcional)</label>
              <input
                type="text"
                placeholder="Centro"
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-primary transition-colors text-sm"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Cidade (Opcional)</label>
              <input
                type="text"
                placeholder="Barueri"
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-primary transition-colors text-sm"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">UF (Opcional)</label>
              <input
                type="text"
                placeholder="SP"
                maxLength={2}
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:border-primary transition-colors text-sm uppercase"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-4 bg-primary text-white rounded-full font-bold hover:brightness-110 transition-all cursor-pointer flex justify-center items-center gap-2 text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Registrando...</span>
              </>
            ) : (
              <span>Finalizar Cadastro</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
