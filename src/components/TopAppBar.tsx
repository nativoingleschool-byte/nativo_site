import { Menu, X, Globe } from 'lucide-react';
import { useState } from 'react';
import { Language } from '../translations';

interface TopAppBarProps {
  lang: Language;
  setLang: (lang: Language) => void;
  t: {
    about: string;
    pricing: string;
    team: string;
    cta: string;
    login: string;
  };
  onOpenLogin: () => void;
}

export default function TopAppBar({ lang, setLang, t, onOpenLogin }: TopAppBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const LanguageSelector = () => (
    <div className="flex items-center gap-2 bg-outline/30 p-1 rounded-full">
      <Globe className="w-4 h-4 text-primary ml-2" />
      {(['pt', 'en', 'es'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase transition-all cursor-pointer ${
            lang === l ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:text-primary'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-outline/50">
      <div className="flex justify-between items-center h-20 px-6 md:px-16 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-2xl font-extrabold tracking-tighter text-primary">
          <img src="/hero/logo-blue.png" alt="Logo Nativo" className="h-8 w-8 object-contain" />
          <div>Nativo <span className="font-light text-secondary">English</span></div>
        </div>
        <div className="hidden md:flex gap-8 items-center">
          <a className="text-on-surface-variant hover:text-primary transition-colors text-sm font-medium" href="#about">{t.about}</a>
          <a className="text-on-surface-variant hover:text-primary transition-colors text-sm font-medium" href="#pricing">{t.pricing}</a>
          <a className="text-on-surface-variant hover:text-primary transition-colors text-sm font-medium" href="#team">{t.team}</a>
          <a className="bg-primary text-white border-2 border-primary px-6 py-2.5 rounded-full text-sm font-semibold transition-all hover:bg-primary/90 hover:shadow-lg" href="#pricing">{t.cta}</a>
          <button 
            onClick={onOpenLogin}
            className="text-on-surface-variant hover:text-primary transition-colors text-sm font-bold cursor-pointer"
          >
            {t.login}
          </button>
          <LanguageSelector />
        </div>
        <button 
          className="md:hidden text-primary focus:outline-none cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="w-8 h-8" /> : <Menu className="w-8 h-8" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-outline/50 py-6 px-6 space-y-4 shadow-lg flex flex-col">
          <a 
            className="text-on-surface-variant hover:text-primary transition-colors text-base font-medium py-2" 
            href="#about"
            onClick={() => setIsOpen(false)}
          >
            {t.about}
          </a>
          <a 
            className="text-on-surface-variant hover:text-primary transition-colors text-base font-medium py-2" 
            href="#pricing"
            onClick={() => setIsOpen(false)}
          >
            {t.pricing}
          </a>
          <a 
            className="text-on-surface-variant hover:text-primary transition-colors text-base font-medium py-2" 
            href="#team"
            onClick={() => setIsOpen(false)}
          >
            {t.team}
          </a>
          <a 
            className="bg-primary text-white border-2 border-primary px-8 py-4 rounded-full text-base font-semibold text-center transition-all hover:bg-primary/90 shadow-md inline-block mt-2" 
            href="#pricing"
            onClick={() => setIsOpen(false)}
          >
            {t.cta}
          </a>
          <button 
            onClick={() => {
              setIsOpen(false);
              onOpenLogin();
            }}
            className="border-2 border-outline hover:border-primary text-primary px-8 py-3.5 rounded-full text-base font-bold text-center transition-all shadow-sm cursor-pointer"
          >
            {t.login}
          </button>
          <div className="pt-4 border-t border-outline/50 flex justify-center">
            <LanguageSelector />
          </div>
        </div>
      )}
    </nav>
  );
}
