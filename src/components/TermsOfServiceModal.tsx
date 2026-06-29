import { X } from 'lucide-react';
import { Language } from '../translations';

interface TermsOfServiceModalProps {
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsOfServiceModal({ lang, isOpen, onClose }: TermsOfServiceModalProps) {
  if (!isOpen) return null;

  const content = {
    pt: {
      title: "Termos de Serviço",
      intro: "Política de cancelamento, remarcação de aulas e reembolsos da Nativo English.",
      sections: [
        {
          title: "1. Cancelamento de Aulas",
          body: "Aulas poderão ser canceladas sem prejuízo até 4 horas antes do horário marcado para a aula. Para aulas em grupo, o cancelamento só poderá acontecer caso:\n\na. Todos os alunos concordem com um novo dia e horário, e\nb. O professor tenha disponibilidade no horário sugerido."
        },
        {
          title: "2. Remarcação de Aulas",
          body: "A Nativo se limita a apenas remarcar aulas que foram canceladas com 4 horas de antecedência. Após esse prazo, caso o aluno não compareça, a aula será contada como dada."
        },
        {
          title: "2.1 Prazo para Reposição de Aulas Perdidas",
          body: "Uma vez que um aluno tenha créditos de aulas para repor, ele deverá escolher uma data para reposição dentro de 7 dias úteis. Aulas em grupo só poderão ser repostas em grupo, exceto mediante pagamento do valor complementar para uma aula particular."
        },
        {
          title: "3. Reembolsos",
          body: "O aluno terá direito ao reembolso de aulas canceladas com 4 horas de antecedência mediante solicitação."
        },
        {
          title: "4. Casos Extremos",
          body: "Em casos de falecimento de família imediata, doença, desastres naturais e acidentes acometendo alunos, a Nativo fará o possível para que o aluno possa ter acesso a aulas perdidas em outra situação conveniente. Pedimos que a escola seja comunicada de tais acontecimentos assim que possível para que haja suspensão de cobranças e de aulas. Entendemos que imprevistos acontecem e faremos de tudo para tratar cada caso de maneira individual e demonstrando o grande carinho e consideração que temos por cada aluno."
        }
      ],
      close: "Fechar"
    },
    en: {
      title: "Terms of Service",
      intro: "Cancellation, rescheduling, and refund policies for Nativo English classes.",
      sections: [
        {
          title: "1. Class Cancellation",
          body: "Classes can be cancelled without penalty up to 4 hours before the scheduled class time. For group classes, cancellation can only occur if:\n\na. All students agree on a new day and time, and\nb. The teacher is available at the suggested time."
        },
        {
          title: "2. Class Rescheduling",
          body: "Nativo is limited to only rescheduling classes that were cancelled at least 4 hours in advance. After this window, if the student fails to attend, the class will be counted as completed."
        },
        {
          title: "2.1 Deadline for Makeup Classes",
          body: "Once a student has class credits to make up, they must select a date for the makeup class within 7 business days. Group classes can only be made up in a group setting, except upon payment of the complementary fee for a private class."
        },
        {
          title: "3. Refunds",
          body: "Students are entitled to a refund for classes cancelled at least 4 hours in advance upon request."
        },
        {
          title: "4. Extreme Cases",
          body: "In cases of immediate family bereavement, illness, natural disasters, or accidents involving students, Nativo will make every effort to ensure the student can access missed classes at another convenient time. We request that the school be notified of such events as soon as possible to suspend billings and classes. We understand that emergencies happen and we will do our best to treat each case individually, showing the utmost care and consideration we hold for each student."
        }
      ],
      close: "Close"
    },
    es: {
      title: "Términos de Servicio",
      intro: "Política de cancelación, reprogramación de clases y reembolsos de Nativo English.",
      sections: [
        {
          title: "1. Cancelación de Clases",
          body: "Las clases pueden cancelarse sin penalización hasta 4 horas antes de la hora programada. Para clases grupales, la cancelación solo puede ocurrir si:\n\na. Todos los alumnos están de acuerdo en un nuevo día y horario, y\nb. El profesor tiene disponibilidad en el horario propuesto."
        },
        {
          title: "2. Reprogramación de Clases",
          body: "Nativo se limita a reprogramar únicamente las clases que fueron canceladas con 4 horas de anticipación. Transcurrido ese plazo, si el alumno no asiste, la clase se considerará dictada."
        },
        {
          title: "2.1 Plazo para Recuperación de Clases Perdidas",
          body: "Una vez que un alumno tenga créditos de clase para recuperar, deberá elegir una fecha para la recuperación dentro de los 7 días hábiles. Las clases grupales solo pueden recuperarse en grupo, a menos que se pague el valor complementario para una clase particular."
        },
        {
          title: "3. Reembolsos",
          body: "El alumno tendrá derecho al reembolso de las clases canceladas con 4 horas de anticipación bajo solicitud previa."
        },
        {
          title: "4. Casos Extremos",
          body: "En casos de fallecimiento de un familiar directo, enfermedad, desastres naturales y accidentes que afecten al alumno, Nativo hará lo posible para que pueda acceder a las clases perdidas en otra situación conveniente. Solicitamos que se comunique a la escuela tales sucesos lo antes posible para la suspensión de cobros y clases. Entendemos que los imprevistos ocurren y haremos todo lo posible para tratar cada caso de manera individual, demostrando el gran cariño y consideración que tenemos por cada alumno."
        }
      ],
      close: "Cerrar"
    }
  };

  const activeContent = content[lang];

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-outline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 md:p-8 border-b border-outline">
          <h2 className="text-2xl md:text-3xl font-extrabold text-primary">{activeContent.title}</h2>
          <button 
            className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
            onClick={onClose}
            aria-label={activeContent.close}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-on-surface-variant font-light leading-relaxed text-sm md:text-base">
          <p className="font-semibold text-primary">{activeContent.intro}</p>
          
          {activeContent.sections.map((sec, idx) => (
            <div key={idx}>
              <h3 className="font-bold text-primary mb-2 text-base md:text-lg">{sec.title}</h3>
              <p className="whitespace-pre-line">{sec.body}</p>
            </div>
          ))}
        </div>

        <div className="p-6 md:p-8 border-t border-outline flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-3 bg-primary text-white rounded-full font-bold hover:bg-primary/90 transition-colors cursor-pointer text-sm"
          >
            {activeContent.close}
          </button>
        </div>
      </div>
    </div>
  );
}
