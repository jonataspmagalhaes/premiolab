// Página de assinatura — redireciona pro checkout Kiwify
// Fase I/H: links Kiwify reais devem ser preenchidos pelas envs após
// criar produto na Kiwify (NEXT_PUBLIC_KIWIFY_MONTHLY_URL e
// NEXT_PUBLIC_KIWIFY_ANNUAL_URL).

import Link from 'next/link';

const KIWIFY_MONTHLY = process.env.NEXT_PUBLIC_KIWIFY_MONTHLY_URL || '#configure-kiwify';
const KIWIFY_ANNUAL = process.env.NEXT_PUBLIC_KIWIFY_ANNUAL_URL || '#configure-kiwify';

export default function AssinarPage({
  searchParams,
}: {
  searchParams: { plan?: string };
}) {
  const planoSugerido = searchParams.plan || 'annual';

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-accent to-income" />
            <span className="font-display font-bold text-xl">PremioLab</span>
          </Link>
          <Link href="/login" className="text-sm text-secondary hover:text-primary">
            Já tenho conta
          </Link>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto px-4 py-16 w-full">
        <h1 className="font-display font-extrabold text-4xl md:text-5xl text-center mb-3">
          Escolha seu plano
        </h1>
        <p className="text-center text-secondary mb-12">PIX, boleto ou cartão · Cancela quando quiser</p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Mensal */}
          <div
            className={
              planoSugerido === 'monthly'
                ? 'glass p-8 border-2 border-accent/40'
                : 'glass p-8 border border-white/5'
            }
          >
            <h3 className="font-display font-bold text-xl mb-3">Mensal</h3>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-sm text-secondary">R$</span>
              <span className="text-5xl font-mono font-extrabold">14,99</span>
              <span className="text-secondary">/mês</span>
            </div>
            <p className="text-xs text-muted mb-6">Cobrança mensal recorrente</p>
            <a
              href={KIWIFY_MONTHLY}
              target="_blank"
              rel="noopener"
              className="block w-full text-center px-6 py-3 rounded-md border border-white/10 text-primary font-display font-bold hover:bg-white/5 transition"
            >
              Assinar mensal
            </a>
          </div>

          {/* Anual */}
          <div
            className={
              planoSugerido === 'annual'
                ? 'glass p-8 border-2 border-income/40 relative'
                : 'glass p-8 border border-white/5 relative'
            }
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-income text-bg text-xs font-bold uppercase">
              17% off
            </div>
            <h3 className="font-display font-bold text-xl mb-3">Anual</h3>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-sm text-secondary">R$</span>
              <span className="text-5xl font-mono font-extrabold">149</span>
              <span className="text-secondary">/ano</span>
            </div>
            <p className="text-xs text-muted mb-6">~R$ 12,42/mês — você economiza R$ 30/ano</p>
            <a
              href={KIWIFY_ANNUAL}
              target="_blank"
              rel="noopener"
              className="block w-full text-center px-6 py-3 rounded-md bg-income text-bg font-display font-bold hover:opacity-90 transition"
            >
              Assinar anual
            </a>
          </div>
        </div>

        <div className="mt-12 glass p-6">
          <h3 className="font-display font-bold text-base mb-3">Como funciona</h3>
          <ol className="space-y-2 text-sm text-secondary list-decimal list-inside">
            <li>Clique em &quot;Assinar&quot; — checkout Kiwify abre em nova aba</li>
            <li>Pague com PIX, boleto ou cartão (parcelado em até 12x)</li>
            <li>
              Use o <strong>mesmo email</strong> que vai usar (ou usa) no app PremioLab
            </li>
            <li>Em até 2 minutos sua conta vira PRO automaticamente</li>
            <li>Baixe o app e faça login com esse email</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
