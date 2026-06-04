import { MapPin, Mail, Phone } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-primary pt-24 pb-12 text-white/80 font-light">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-16 px-6 md:px-16 max-w-7xl mx-auto">
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-2xl font-black text-white tracking-tighter uppercase">
            <img src="/hero/logo-white.png" alt="Logo Nativo" className="h-8 w-8 object-contain" />
            <div>Nativo English</div>
          </div>
          <p className="text-sm leading-relaxed max-w-xs">Excelência acadêmica com acessibilidade moderna. Elevando o padrão do ensino de idiomas.</p>
        </div>
        <div>
          <h5 className="text-secondary font-bold mb-8 uppercase text-xs tracking-widest">Explorar</h5>
          <ul className="space-y-4 text-sm">
            <li><a className="hover:text-white transition-colors" href="#">Sobre Nós</a></li>
            <li><a className="hover:text-white transition-colors" href="#">Planos</a></li>
            <li><a className="hover:text-white transition-colors" href="#">Preços</a></li>
          </ul>
        </div>
        <div>
          <h5 className="text-secondary font-bold mb-8 uppercase text-xs tracking-widest">Contato</h5>
          <ul className="space-y-4 text-sm">
            <li className="flex items-center gap-3"><MapPin className="w-5 h-5" />Sede na Austrália</li>
            <li className="flex items-center gap-3"><Mail className="w-5 h-5" />nativoingleschool@gmail.com</li>
            <li className="flex items-center gap-3"><Phone className="w-5 h-5" />(61) 99808-0042</li>
          </ul>
        </div>
        <div>
          <h5 className="text-secondary font-bold mb-8 uppercase text-xs tracking-widest">Legal</h5>
          <ul className="space-y-4 text-sm">
            <li><a className="hover:text-white transition-colors" href="#">Política de Privacidade</a></li>
            <li><a className="hover:text-white transition-colors" href="#">Termos de Serviço</a></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 md:px-16 mt-20 pt-8 border-t border-white/10 text-center text-[10px] uppercase tracking-widest opacity-50">
        <p>© 2024 Nativo English. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
