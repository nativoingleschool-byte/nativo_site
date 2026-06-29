interface PositioningProps {
  t: {
    title: string;
    subtitle: string;
    badge: string;
    quote: string;
  };
}

export default function Positioning({ t }: PositioningProps) {
  return (
    <section className="py-[160px] px-6 bg-white">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
        <div className="space-y-8">
          <h2 className="text-5xl font-extrabold text-primary leading-tight">{t.title}</h2>
          <p className="text-xl text-on-surface-variant leading-relaxed font-light">
            {t.subtitle}
          </p>
          <div className="flex gap-4 items-center">
            <div className="h-[2px] w-16 bg-secondary"></div>
            <span className="font-semibold text-secondary tracking-widest text-sm uppercase">{t.badge}</span>
          </div>
        </div>
        <div className="relative">
          <div className="aspect-[4/5] rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] overflow-hidden border border-outline/30">
            <img alt="Collaboration" className="w-full h-full object-cover" src="/hero/girl-with-headphones.jpg"/>
          </div>
          <div className="absolute -bottom-10 -left-10 bg-primary p-12 rounded-2xl text-white shadow-2xl hidden lg:block max-w-xs">
            <p className="text-2xl font-medium italic leading-snug">"{t.quote}"</p>
          </div>
        </div>
      </div>
    </section>
  );
}
