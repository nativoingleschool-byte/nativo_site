import { X } from 'lucide-react';
import { Language } from '../translations';

interface PrivacyPolicyModalProps {
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacyPolicyModal({ lang, isOpen, onClose }: PrivacyPolicyModalProps) {
  if (!isOpen) return null;

  const content = {
    pt: {
      title: "Política de Privacidade",
      intro: "Esta Política de Privacidade descreve como a Nativo English coleta, usa e protege suas informações pessoais quando você utiliza nosso site e serviços.",
      section1: {
        title: "1. Informações que Coletamos",
        body: "Podemos coletar informações pessoais que você nos fornece voluntariamente, como seu nome, endereço de e-mail e número de telefone/WhatsApp ao entrar em contato conosco ou manifestar interesse em nossos planos."
      },
      section2: {
        title: "2. Como Usamos Suas Informações",
        body: "Usamos suas informações para responder às suas dúvidas, processar suas solicitações de planos, agendar aulas e enviar atualizações importantes sobre nosso serviço de idiomas."
      },
      section3: {
        title: "3. Segurança dos Dados",
        body: "Adotamos medidas de segurança apropriadas para proteger seus dados contra acesso não autorizado, alteração, divulgação ou destruição de suas informações pessoais."
      },
      section4: {
        title: "4. Seus Direitos",
        body: "Você tem o direito de solicitar o acesso, retificação ou exclusão de suas informações pessoais que mantemos em nossos registros. Para fazer isso, entre em contato conosco por e-mail."
      },
      section5: {
        title: "5. Contato",
        body: "Se você tiver alguma dúvida sobre esta Política de Privacidade ou sobre o tratamento de seus dados, envie um e-mail para nativoingleschool@gmail.com."
      },
      close: "Fechar"
    },
    en: {
      title: "Privacy Policy",
      intro: "This Privacy Policy describes how Nativo English collects, uses, and protects your personal information when you use our website and services.",
      section1: {
        title: "1. Information We Collect",
        body: "We may collect personal information that you voluntarily provide to us, such as your name, email address, and phone/WhatsApp number when contacting us or expressing interest in our plans."
      },
      section2: {
        title: "2. How We Use Your Information",
        body: "We use your information to reply to your inquiries, process your plan requests, schedule classes, and send you important updates regarding our language services."
      },
      section3: {
        title: "3. Data Security",
        body: "We implement appropriate security measures to protect your data against unauthorized access, alteration, disclosure, or destruction of your personal information."
      },
      section4: {
        title: "4. Your Rights",
        body: "You have the right to request access, rectification, or deletion of your personal information stored in our records. To request this, contact us via email."
      },
      section5: {
        title: "5. Contact Us",
        body: "If you have any questions about this Privacy Policy or how we handle your data, please email us at nativoingleschool@gmail.com."
      },
      close: "Close"
    },
    es: {
      title: "Política de Privacidad",
      intro: "Esta Política de Privacidad describe cómo Nativo English recopila, utiliza y protege su información personal cuando utiliza nuestro sitio web y servicios.",
      section1: {
        title: "1. Información que Recopilamos",
        body: "Podemos recopilar información personal que nos proporcione voluntariamente, como su nombre, dirección de correo electrónico y número de teléfono/WhatsApp al ponerse en contacto con nosotros o al mostrar interés en nuestros planes."
      },
      section2: {
        title: "2. Cómo Utilizamos su Información",
        body: "Utilizamos su información para responder a sus consultas, procesar sus solicitudes de planes, programar clases y enviarle actualizaciones importantes sobre nuestro servicio de idiomas."
      },
      section3: {
        title: "3. Seguridad de los Datos",
        body: "Adoptamos las medidas de seguridad adecuadas para proteger sus datos contra el acceso no autorizado, la alteración, la divulgación o la destrucción de su información personal."
      },
      section4: {
        title: "4. Sus Derechos",
        body: "Tiene derecho a solicitar el acceso, la rectificación o la eliminación de su información personal que conservamos en nuestros registros. Para hacerlo, contáctenos por correo electrónico."
      },
      section5: {
        title: "5. Contacto",
        body: "Si tiene alguna pregunta sobre esta Política de Privacidad o sobre el tratamiento de sus datos, envíe un correo electrónico a nativoingleschool@gmail.com."
      },
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
          <p>{activeContent.intro}</p>
          
          <div>
            <h3 className="font-bold text-primary mb-2 text-base md:text-lg">{activeContent.section1.title}</h3>
            <p>{activeContent.section1.body}</p>
          </div>
          
          <div>
            <h3 className="font-bold text-primary mb-2 text-base md:text-lg">{activeContent.section2.title}</h3>
            <p>{activeContent.section2.body}</p>
          </div>
          
          <div>
            <h3 className="font-bold text-primary mb-2 text-base md:text-lg">{activeContent.section3.title}</h3>
            <p>{activeContent.section3.body}</p>
          </div>
          
          <div>
            <h3 className="font-bold text-primary mb-2 text-base md:text-lg">{activeContent.section4.title}</h3>
            <p>{activeContent.section4.body}</p>
          </div>
          
          <div>
            <h3 className="font-bold text-primary mb-2 text-base md:text-lg">{activeContent.section5.title}</h3>
            <p>{activeContent.section5.body}</p>
          </div>
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
