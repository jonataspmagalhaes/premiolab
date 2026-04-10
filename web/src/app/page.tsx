// Landing principal — premiolab.com.br
// Substitui docs/index.html. Usa Tailwind + tokens espelhados do mobile.

import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-income/10 border border-income/30 mb-6">
          <span className="text-xs text-income font-mono font-bold uppercase tracking-wider">
            App de renda mensal
          </span>
        </div>
        <h1 className="text-5xl md:text-7xl font-display font-extrabold leading-tight mb-6">
          Sua renda mensal,<br />
          <span className="text-income">organizada</span> e <span className="text-income">crescendo</span>.
        </h1>
        <p className="text-lg md:text-xl text-secondary max-w-2xl mx-auto mb-10">
          O app que projeta, acompanha e otimiza sua renda passiva de FIIs, ações,
          opções e renda fixa — tudo num lugar só.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
          <Link
            href="/assinar"
            className="px-8 py-4 rounded-md bg-income text-bg font-display font-bold text-base hover:opacity-90 transition"
          >
            Começar agora — R$ 14,99/mês
          </Link>
          <Link
            href="#features"
            className="px-8 py-4 rounded-md border border-white/10 text-primary font-display font-bold text-base hover:bg-white/5 transition"
          >
            Ver recursos
          </Link>
        </div>
        <p className="text-xs text-muted">
          Ou R$ 149/ano (~R$ 12,42/mês · 17% off) · PIX, boleto e cartão
        </p>
      </section>

      {/* Features grid */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl md:text-4xl font-display font-extrabold text-center mb-12">
          Tudo gira em torno de <span className="text-income">renda</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon="📊"
            title="Renda Projetada 12m"
            text="Veja exatamente quanto vai entrar nos próximos meses, com base nos dividendos históricos reais via StatusInvest."
          />
          <FeatureCard
            icon="🚀"
            title="Renda Potencial"
            text="Quanto seu patrimônio atual poderia gerar se 100% otimizado? Veja o gap e como fechá-lo."
          />
          <FeatureCard
            icon="📅"
            title="Calendário Unificado"
            text="Cada centavo entrando, dia a dia: dividendos, JCP, vencimentos de opções e cupons de RF."
          />
          <FeatureCard
            icon="🔄"
            title="Snowball + Reinvestimento"
            text="Compra 1-clique reinvestindo os proventos da semana. Acelera sua bola de neve."
          />
          <FeatureCard
            icon="🏢"
            title="Simulador FII"
            text="Carteira teórica + previsão mensal real por ticker. Autocomplete StatusInvest."
          />
          <FeatureCard
            icon="🎯"
            title="Gerador de Renda"
            text="Defina uma meta. O app calcula capital necessário, mix sugerido e quanto tempo até atingir."
          />
        </div>
      </section>

      {/* Pricing */}
      <section id="precos" className="max-w-4xl mx-auto px-4 py-20">
        <h2 className="text-3xl md:text-4xl font-display font-extrabold text-center mb-3">
          1 plano. Todas as features.
        </h2>
        <p className="text-center text-secondary mb-12">Sem pegadinha. Cancela quando quiser.</p>

        <div className="grid md:grid-cols-2 gap-6">
          <PricingCard
            title="Mensal"
            price="14,99"
            period="/mês"
            highlight={false}
            cta="Assinar mensal"
            href="/assinar?plan=monthly"
          />
          <PricingCard
            title="Anual"
            price="149"
            period="/ano"
            sub="~R$ 12,42/mês · 17% off"
            highlight={true}
            cta="Assinar anual"
            href="/assinar?plan=annual"
          />
        </div>

        <ul className="mt-10 space-y-3 max-w-md mx-auto">
          {[
            'Posições e opções ilimitadas',
            'Renda projetada 12 meses',
            'Renda potencial + diagnósticos',
            'Calendário unificado',
            'Simulador FII com carteira teórica',
            'Gerador de renda reverso',
            'Sugestão de venda coberta',
            'Snowball gamificado',
            'Yield on Cost real + comparativo IPCA',
            'Score de previsibilidade',
            'Relatórios mensais em PDF',
            'Multi-portfólio (até 5)',
            'Backup automático',
          ].map((feat) => (
            <li key={feat} className="flex items-center gap-3 text-sm text-secondary">
              <span className="text-income">✓</span>
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA final */}
      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl md:text-5xl font-display font-extrabold mb-6">
          Pare de adivinhar. <span className="text-income">Saiba</span>.
        </h2>
        <Link
          href="/assinar"
          className="inline-block px-10 py-4 rounded-md bg-income text-bg font-display font-bold text-lg hover:opacity-90 transition"
        >
          Começar por R$ 14,99/mês
        </Link>
      </section>

      <Footer />
    </main>
  );
}

function FeatureCard({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="glass p-6">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-display font-bold text-lg mb-2">{title}</h3>
      <p className="text-sm text-secondary leading-relaxed">{text}</p>
    </div>
  );
}

function PricingCard({
  title,
  price,
  period,
  sub,
  highlight,
  cta,
  href,
}: {
  title: string;
  price: string;
  period: string;
  sub?: string;
  highlight: boolean;
  cta: string;
  href: string;
}) {
  return (
    <div
      className={
        highlight
          ? 'glass p-8 border-2 border-income/40 relative'
          : 'glass p-8 border border-white/5'
      }
    >
      {highlight ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-income text-bg text-xs font-bold uppercase">
          Recomendado
        </div>
      ) : null}
      <h3 className="font-display font-bold text-xl mb-3">{title}</h3>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-sm text-secondary">R$</span>
        <span className="text-5xl font-mono font-extrabold">{price}</span>
        <span className="text-secondary">{period}</span>
      </div>
      {sub ? <p className="text-xs text-muted mb-6">{sub}</p> : <div className="h-6" />}
      <Link
        href={href}
        className={
          highlight
            ? 'block w-full text-center px-6 py-3 rounded-md bg-income text-bg font-display font-bold hover:opacity-90 transition'
            : 'block w-full text-center px-6 py-3 rounded-md border border-white/10 text-primary font-display font-bold hover:bg-white/5 transition'
        }
      >
        {cta}
      </Link>
    </div>
  );
}
