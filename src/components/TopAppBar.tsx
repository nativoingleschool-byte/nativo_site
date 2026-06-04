import { Menu } from 'lucide-react';

export default function TopAppBar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-color-outline/50">
      <div className="flex justify-between items-center h-20 px-6 md:px-16 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-2xl font-extrabold tracking-tighter text-primary">
          <img src="/hero/logo-blue.png" alt="Logo Nativo" className="h-8 w-8 object-contain" />
          <div>Nativo <span className="font-light text-secondary">English</span></div>
        </div>
        <div className="hidden md:flex gap-10 items-center">
          <a className="text-on-surface-variant hover:text-primary transition-colors text-sm font-medium" href="#about">Sobre</a>
          <a className="text-on-surface-variant hover:text-primary transition-colors text-sm font-medium" href="#pricing">Planos</a>
          <a className="text-on-surface-variant hover:text-primary transition-colors text-sm font-medium" href="#team">Equipe</a>
          <a className="bg-primary text-white border-2 border-primary px-8 py-3 rounded-full text-sm font-semibold transition-all hover:bg-primary/90 hover:shadow-lg" href="#pricing">Começar</a>
        </div>
        <div className="md:hidden">
          <Menu className="text-primary w-8 h-8 cursor-pointer" />
        </div>
      </div>
    </nav>
  );
}
