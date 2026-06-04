import { CheckCircle2 } from 'lucide-react';

export default function Pricing() {
  return (
    <section className="py-[160px] bg-white px-6" id="pricing">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-24">
          <h2 className="text-5xl font-extrabold text-primary mb-6">Investimento em seu Futuro</h2>
          <p className="text-xl text-on-surface-variant font-light">Escolha a experiência que melhor se adapta à sua rotina e ambição.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-stretch">
          
          <div className="bg-white p-12 rounded-3xl border border-outline shadow-sm flex flex-col hover:border-primary/20 transition-all">
            <h3 className="text-xl font-bold text-primary mb-2">Individual</h3>
            <p className="text-on-surface-variant text-sm mb-10 font-light uppercase tracking-widest">Plano personalizado</p>
            <div className="mb-10 flex flex-wrap items-baseline gap-1">
              <span className="text-4xl lg:text-5xl font-extrabold text-primary tracking-tighter">R$340</span>
              <span className="text-on-surface-variant font-light">/mês</span>
            </div>
            <ul className="space-y-6 mb-12 flex-grow">
              <li className="flex items-center gap-4 text-on-surface font-light">
                <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> 1h por semana
              </li>
              <li className="flex items-center gap-4 text-on-surface font-light">
                <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> Horário flexível
              </li>
              <li className="flex items-center gap-4 text-on-surface font-light">
                <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> Material exclusivo
              </li>
            </ul>
            <a 
              href={`https://wa.me/556198080042?text=${encodeURIComponent("Olá! Tenho interesse no plano personalizado de R$340/mês.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-full border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-all cursor-pointer block text-center"
            >
              Selecionar
            </a>
          </div>
          
          <div className="bg-primary p-12 rounded-3xl shadow-[0_40px_80px_-15px_rgba(31,58,95,0.25)] flex flex-col relative border-4 border-secondary/20 transform md:scale-105 z-10">
            <div className="absolute top-6 right-6 bg-secondary text-primary px-4 py-1 text-[10px] font-black uppercase rounded-full tracking-widest">Recomendado</div>
            <h3 className="text-xl font-bold text-white mb-2">Duo</h3>
            <p className="text-white/60 text-sm mb-10 font-light uppercase tracking-widest">Estude com um parceiro</p>
            <div className="mb-10 flex flex-wrap items-baseline gap-1">
              <span className="text-5xl lg:text-6xl font-extrabold text-white tracking-tighter">R$220</span>
              <span className="text-white/60 font-light">/pessoa</span>
            </div>
            <ul className="space-y-6 mb-12 flex-grow">
              <li className="flex items-center gap-4 text-white font-light">
                <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> Mais motivação
              </li>
              <li className="flex items-center gap-4 text-white font-light">
                <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> Dinâmica de pares
              </li>
              <li className="flex items-center gap-4 text-white font-light">
                <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> Progressão acelerada
              </li>
            </ul>
            <a 
              href={`https://wa.me/556198080042?text=${encodeURIComponent("Olá! Tenho interesse no plano em dupla de R$220 por pessoa.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-5 rounded-full bg-secondary text-primary font-black hover:brightness-110 transition-all shadow-xl cursor-pointer block text-center"
            >
              Começar Agora
            </a>
          </div>
          
          <div className="bg-white p-12 rounded-3xl border border-outline shadow-sm flex flex-col hover:border-primary/20 transition-all">
            <h3 className="text-xl font-bold text-primary mb-2">Grupo</h3>
            <p className="text-on-surface-variant text-sm mb-10 font-light uppercase tracking-widest">Interação constante</p>
            <div className="mb-10 flex flex-wrap items-baseline gap-1">
              <span className="text-4xl lg:text-5xl font-extrabold text-primary tracking-tighter">R$120<span className="text-2xl lg:text-3xl mx-1">–</span>170</span>
              <span className="text-on-surface-variant font-light break-words w-full sm:w-auto">/mês</span>
            </div>
            <ul className="space-y-6 mb-12 flex-grow">
              <li className="flex items-center gap-4 text-on-surface font-light">
                <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> Ambiente dinâmico
              </li>
              <li className="flex items-center gap-4 text-on-surface font-light">
                <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> Grupos reduzidos
              </li>
            </ul>
            <a 
              href={`https://wa.me/556198080042?text=${encodeURIComponent("Olá! Tenho interesse nas aulas em grupo.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-full border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-all cursor-pointer block text-center"
            >
              Selecionar
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}
