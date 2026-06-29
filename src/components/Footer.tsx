import { MapPin, Mail, Phone } from 'lucide-react';

interface FooterProps {
  t: {
    desc: string;
    explore: string;
    about: string;
    pricing: string;
    team: string;
    contact: string;
    hq: string;
    legal: string;
    privacy: string;
    terms: string;
    rights: string;
  };
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

export default function Footer({ t, onOpenPrivacy, onOpenTerms }: FooterProps) {
  return (
    <footer className="bg-primary pt-24 pb-12 text-white/80 font-light">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-16 px-6 md:px-16 max-w-7xl mx-auto">
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-2xl font-black text-white tracking-tighter uppercase">
            <img src="/hero/logo-white.png" alt="Logo Nativo" className="h-8 w-8 object-contain" />
            <div>Nativo English</div>
          </div>
          <p className="text-sm leading-relaxed max-w-xs">{t.desc}</p>
        </div>
        <div>
          <h5 className="text-secondary font-bold mb-8 uppercase text-xs tracking-widest">{t.explore}</h5>
          <ul className="space-y-4 text-sm">
            <li><a className="hover:text-white transition-colors" href="#about">{t.about}</a></li>
            <li><a className="hover:text-white transition-colors" href="#pricing">{t.pricing}</a></li>
            <li><a className="hover:text-white transition-colors" href="#team">{t.team}</a></li>
          </ul>
        </div>
        <div>
          <h5 className="text-secondary font-bold mb-8 uppercase text-xs tracking-widest">{t.contact}</h5>
          <ul className="space-y-4 text-sm">
            <li className="flex items-center gap-3"><MapPin className="w-5 h-5 flex-shrink-0" />{t.hq}</li>
            <li className="flex items-center gap-3"><Mail className="w-5 h-5 flex-shrink-0" />nativoingleschool@gmail.com</li>
            <li className="flex items-center gap-3"><Phone className="w-5 h-5 flex-shrink-0" />(61) 99808-0042</li>
          </ul>
        </div>
        <div>
          <h5 className="text-secondary font-bold mb-8 uppercase text-xs tracking-widest">{t.legal}</h5>
          <ul className="space-y-4 text-sm">
            <li>
              <button 
                className="hover:text-white transition-colors cursor-pointer text-left" 
                onClick={onOpenPrivacy}
              >
                {t.privacy}
              </button>
            </li>
            <li>
              <button 
                className="hover:text-white transition-colors cursor-pointer text-left" 
                onClick={onOpenTerms}
              >
                {t.terms}
              </button>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 md:px-16 mt-20 pt-8 border-t border-white/10 text-center text-[10px] uppercase tracking-widest opacity-50">
        <p>{t.rights}</p>
      </div>
    </footer>
  );
}
