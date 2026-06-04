import { MessagesSquare, Briefcase, Rocket } from 'lucide-react';

export default function About() {
  return (
    <section className="py-[160px] bg-background" id="about">
      <div className="max-w-6xl mx-auto text-center px-6">
        <h2 className="text-5xl font-extrabold text-primary mb-10">Conheça a Nativo</h2>
        <p className="text-xl text-on-surface-variant leading-loose mb-20 max-w-4xl mx-auto font-light">
          Somos seus parceiros no desenvolvimento de suas habilidades no inglês. Contando com o apoio de professores nativos, nossos cursos online são projetados para proporcionar uma experiência de aprendizagem envolvente, focada em suas necessidades e objetivos.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-left">
          <div className="p-12 bg-white rounded-3xl border border-outline/50 hover:shadow-xl transition-all group">
            <div className="w-16 h-16 bg-background rounded-2xl flex items-center justify-center mb-8 group-hover:bg-secondary/10 transition-colors">
                <MessagesSquare className="text-secondary w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-primary mb-4">Método comunicativo</h3>
            <p className="text-on-surface-variant font-light leading-relaxed">Foco total na fala e na compreensão auditiva desde o seu primeiro dia conosco.</p>
          </div>
          <div className="p-12 bg-white rounded-3xl border border-outline/50 hover:shadow-xl transition-all group">
            <div className="w-16 h-16 bg-background rounded-2xl flex items-center justify-center mb-8 group-hover:bg-secondary/10 transition-colors">
              <Briefcase className="text-secondary w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-primary mb-4">Vida Real</h3>
            <p className="text-on-surface-variant font-light leading-relaxed">Inglês aplicado em situações práticas, focado na sua carreira e vivências internacionais.</p>
          </div>
          <div className="p-12 bg-white rounded-3xl border border-outline/50 hover:shadow-xl transition-all group">
            <div className="w-16 h-16 bg-background rounded-2xl flex items-center justify-center mb-8 group-hover:bg-secondary/10 transition-colors">
              <Rocket className="text-secondary w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-primary mb-4">Upgrade Nativo</h3>
            <p className="text-on-surface-variant font-light leading-relaxed">Evolua para professores nativos sem custos adicionais. Nosso compromisso é sua fluência.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
