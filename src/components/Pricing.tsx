import { CheckCircle2 } from 'lucide-react';

interface PlanTranslations {
  title: string;
  type: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  whatsapp: string;
}

interface PricingProps {
  t: {
    title: string;
    subtitle: string;
    recommended: string;
    individual: PlanTranslations;
    duo: PlanTranslations;
    group: PlanTranslations;
  };
}

export default function Pricing({ t }: PricingProps) {
  const getWhatsAppLink = (text: string) => {
    return `https://wa.me/556198080042?text=${encodeURIComponent(text)}`;
  };

  return (
    <section className="py-[160px] bg-white px-6" id="pricing">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-24">
          <h2 className="text-5xl font-extrabold text-primary mb-6">{t.title}</h2>
          <p className="text-xl text-on-surface-variant font-light">{t.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-stretch">
          
          {/* Individual */}
          <div className="bg-white p-12 rounded-3xl border border-outline shadow-sm flex flex-col hover:border-primary/20 transition-all">
            <h3 className="text-xl font-bold text-primary mb-2">{t.individual.title}</h3>
            <p className="text-on-surface-variant text-sm mb-10 font-light uppercase tracking-widest">{t.individual.type}</p>
            <div className="mb-10 flex flex-wrap items-baseline gap-1">
              <span className="text-4xl lg:text-5xl font-extrabold text-primary tracking-tighter">{t.individual.price}</span>
              <span className="text-on-surface-variant font-light">{t.individual.period}</span>
            </div>
            <ul className="space-y-6 mb-12 flex-grow">
              {t.individual.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-4 text-on-surface font-light">
                  <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> {feature}
                </li>
              ))}
            </ul>
            <a 
              href={getWhatsAppLink(t.individual.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-full border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-all cursor-pointer block text-center"
            >
              {t.individual.cta}
            </a>
          </div>
          
          {/* Duo */}
          <div className="bg-primary p-12 rounded-3xl shadow-[0_40px_80px_-15px_rgba(31,58,95,0.25)] flex flex-col relative border-4 border-secondary/20 transform md:scale-105 z-10">
            <div className="absolute top-6 right-6 bg-secondary text-primary px-4 py-1 text-[10px] font-black uppercase rounded-full tracking-widest">{t.recommended}</div>
            <h3 className="text-xl font-bold text-white mb-2">{t.duo.title}</h3>
            <p className="text-white/60 text-sm mb-10 font-light uppercase tracking-widest">{t.duo.type}</p>
            <div className="mb-10 flex flex-wrap items-baseline gap-1">
              <span className="text-5xl lg:text-6xl font-extrabold text-white tracking-tighter">{t.duo.price}</span>
              <span className="text-white/60 font-light">{t.duo.period}</span>
            </div>
            <ul className="space-y-6 mb-12 flex-grow">
              {t.duo.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-4 text-white font-light">
                  <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> {feature}
                </li>
              ))}
            </ul>
            <a 
              href={getWhatsAppLink(t.duo.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-5 rounded-full bg-secondary text-primary font-black hover:brightness-110 transition-all shadow-xl cursor-pointer block text-center"
            >
              {t.duo.cta}
            </a>
          </div>
          
          {/* Grupo */}
          <div className="bg-white p-12 rounded-3xl border border-outline shadow-sm flex flex-col hover:border-primary/20 transition-all">
            <h3 className="text-xl font-bold text-primary mb-2">{t.group.title}</h3>
            <p className="text-on-surface-variant text-sm mb-10 font-light uppercase tracking-widest">{t.group.type}</p>
            <div className="mb-10 flex flex-wrap items-baseline gap-1">
              <span className="text-4xl lg:text-5xl font-extrabold text-primary tracking-tighter">{t.group.price}</span>
              <span className="text-on-surface-variant font-light break-words w-full sm:w-auto">{t.group.period}</span>
            </div>
            <ul className="space-y-6 mb-12 flex-grow">
              {t.group.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-4 text-on-surface font-light">
                  <CheckCircle2 className="text-secondary w-5 h-5 flex-shrink-0" /> {feature}
                </li>
              ))}
            </ul>
            <a 
              href={getWhatsAppLink(t.group.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-full border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-all cursor-pointer block text-center"
            >
              {t.group.cta}
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}
