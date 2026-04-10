import Link from 'next/link';

export default function Header() {
  return (
    <header className="border-b border-white/5 sticky top-0 z-50 bg-bg/80 backdrop-blur-lg">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-accent to-income" />
          <span className="font-display font-bold text-xl">PremioLab</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/#features" className="text-sm text-secondary hover:text-primary transition">
            Recursos
          </Link>
          <Link href="/#precos" className="text-sm text-secondary hover:text-primary transition">
            Preços
          </Link>
          <Link href="/login" className="text-sm text-secondary hover:text-primary transition">
            Entrar
          </Link>
          <Link
            href="/assinar"
            className="px-4 py-2 rounded-md bg-income text-bg font-display font-bold text-sm hover:opacity-90 transition"
          >
            Assinar
          </Link>
        </nav>
        {/* Mobile: só CTA + menu de hambúrguer mínimo */}
        <div className="md:hidden flex items-center gap-2">
          <Link href="/login" className="text-sm text-secondary px-2">
            Entrar
          </Link>
          <Link
            href="/assinar"
            className="px-3 py-2 rounded-md bg-income text-bg font-display font-bold text-xs"
          >
            Assinar
          </Link>
        </div>
      </div>
    </header>
  );
}
