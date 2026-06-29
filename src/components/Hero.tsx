import { ArrowRight } from 'lucide-react';

interface HeroProps {
  t: {
    badge: string;
    title: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
}

export default function Hero({ t }: HeroProps) {
  return (
    <section className="relative min-h-[90vh] flex items-center pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden bg-background">
      <div className="absolute inset-0 w-full h-full lg:w-1/2 lg:right-0 lg:left-auto">
        <div className="absolute inset-0 bg-background/85 lg:bg-gradient-to-r lg:from-background lg:via-background/20 lg:to-transparent z-10"></div>
        <img alt="Online English Class" className="w-full h-full object-cover" src="/hero/laptop-office.jpg"/>
      </div>
      <div className="relative z-20 px-6 md:px-16 max-w-7xl mx-auto w-full">
        <div className="max-w-2xl">
          <span className="text-secondary font-bold tracking-[0.2em] mb-6 block uppercase text-xs">{t.badge}</span>
          <h1 className="hero-title text-primary mb-8 text-5xl sm:text-6xl md:text-8xl">{t.title}</h1>
          <p className="text-lg text-on-surface-variant mb-12 max-w-xl leading-relaxed font-light">
            {t.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="#about" className="bg-primary text-white border-2 border-primary px-10 py-5 rounded-full font-bold hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-3">
              {t.ctaPrimary}
              <ArrowRight className="w-5 h-5" />
            </a>
            <a href="#pricing" className="bg-white border-2 border-outline text-primary px-10 py-5 rounded-full font-bold hover:bg-background transition-all flex items-center justify-center text-center">
              {t.ctaSecondary}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
