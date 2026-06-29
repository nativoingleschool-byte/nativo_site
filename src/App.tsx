import { useState, useEffect } from 'react';
import TopAppBar from './components/TopAppBar';
import Hero from './components/Hero';
import Positioning from './components/Positioning';
import About from './components/About';
import Pricing from './components/Pricing';
import Team from './components/Team';
import Content from './components/Content';
import Footer from './components/Footer';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import TermsOfServiceModal from './components/TermsOfServiceModal';
import { Language, translations } from './translations';

export default function App() {
  const [lang, setLang] = useState<Language>('pt');
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);

  useEffect(() => {
    const userLang = navigator.language || (navigator as any).userLanguage || 'pt';
    const shortLang = userLang.split('-')[0].toLowerCase();
    if (shortLang === 'en' || shortLang === 'es' || shortLang === 'pt') {
      setLang(shortLang as Language);
    } else {
      setLang('pt');
    }
  }, []);

  const t = translations[lang];

  return (
    <div className="font-sans text-on-surface bg-background antialiased min-h-screen">
      <TopAppBar lang={lang} setLang={setLang} t={t.nav} />
      <main>
        <Hero t={t.hero} />
        <Positioning t={t.positioning} />
        <About t={t.about} />
        <Pricing t={t.pricing} />
        <Team t={t.team} />
        <Content t={t.content} />
      </main>
      <Footer 
        t={t.footer} 
        onOpenPrivacy={() => setShowPrivacyPolicy(true)} 
        onOpenTerms={() => setShowTermsOfService(true)} 
      />
      
      <PrivacyPolicyModal 
        lang={lang} 
        isOpen={showPrivacyPolicy} 
        onClose={() => setShowPrivacyPolicy(false)} 
      />

      <TermsOfServiceModal
        lang={lang}
        isOpen={showTermsOfService}
        onClose={() => setShowTermsOfService(false)}
      />
    </div>
  );
}
