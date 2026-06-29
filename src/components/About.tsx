import { MessagesSquare, Briefcase, Rocket } from 'lucide-react';

interface AboutProps {
  t: {
    title: string;
    subtitle: string;
    cards: Array<{
      title: string;
      desc: string;
    }>;
  };
}

export default function About({ t }: AboutProps) {
  const icons = [
    <MessagesSquare className="text-secondary w-8 h-8" />,
    <Briefcase className="text-secondary w-8 h-8" />,
    <Rocket className="text-secondary w-8 h-8" />
  ];

  return (
    <section className="py-[160px] bg-background" id="about">
      <div className="max-w-6xl mx-auto text-center px-6">
        <h2 className="text-5xl font-extrabold text-primary mb-10">{t.title}</h2>
        <p className="text-xl text-on-surface-variant leading-loose mb-20 max-w-4xl mx-auto font-light">
          {t.subtitle}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-left">
          {t.cards.map((card, idx) => (
            <div key={idx} className="p-12 bg-white rounded-3xl border border-outline/50 hover:shadow-xl transition-all group">
              <div className="w-16 h-16 bg-background rounded-2xl flex items-center justify-center mb-8 group-hover:bg-secondary/10 transition-colors">
                {icons[idx]}
              </div>
              <h3 className="text-2xl font-bold text-primary mb-4">{card.title}</h3>
              <p className="text-on-surface-variant font-light leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
