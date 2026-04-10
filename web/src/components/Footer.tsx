import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 mt-20">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded bg-gradient-to-br from-accent to-income" />
              <span className="font-display font-bold">PremioLab</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              O app que organiza, projeta e cresce sua renda mensal de investimentos.
            </p>
          </div>

          <div>
            <h4 className="font-display font-bold text-sm mb-3">Produto</h4>
            <ul className="space-y-2 text-sm text-secondary">
              <li><Link href="/#features" className="hover:text-primary transition">Recursos</Link></li>
              <li><Link href="/#precos" className="hover:text-primary transition">Preços</Link></li>
              <li><Link href="/assinar" className="hover:text-primary transition">Assinar</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold text-sm mb-3">Conta</h4>
            <ul className="space-y-2 text-sm text-secondary">
              <li><Link href="/login" className="hover:text-primary transition">Entrar</Link></li>
              <li><Link href="/dashboard" className="hover:text-primary transition">Dashboard</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold text-sm mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-secondary">
              <li><Link href="/privacidade" className="hover:text-primary transition">Privacidade</Link></li>
              <li><Link href="/termos" className="hover:text-primary transition">Termos de uso</Link></li>
              <li><a href="mailto:contato@premiolab.com.br" className="hover:text-primary transition">Contato</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div>© 2026 PremioLab. Todos os direitos reservados.</div>
          <div>Feito no Brasil 🇧🇷</div>
        </div>
      </div>
    </footer>
  );
}
