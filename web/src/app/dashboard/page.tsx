// Dashboard logado — area /dashboard. Busca dados reais do Supabase
// server-side e mostra renda projetada + posicoes top + acoes rapidas.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase-server';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

function fmt(v: number) {
  return (v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtInt(v: number) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}

interface Provento {
  ticker: string;
  valor_total?: number | null;
  valor_por_cota?: number | null;
  quantidade?: number | null;
  data_pagamento: string;
}

interface Posicao {
  ticker: string;
  categoria: string;
  quantidade: number;
  pm: number;
}

export default async function DashboardPage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/dashboard');
  }

  // Profile (tier, nome, meta_mensal)
  const { data: profile } = await supabase
    .from('profiles')
    .select('nome, tier, meta_mensal, subscription_expires_at, subscription_status')
    .eq('id', user.id)
    .maybeSingle();

  const isPro = profile?.tier === 'pro';

  // Renda dos ultimos 30 dias
  const now = new Date();
  const cutoff30 = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

  const { data: proventos } = await supabase
    .from('proventos')
    .select('ticker, valor_total, valor_por_cota, quantidade, data_pagamento')
    .eq('user_id', user.id)
    .gte('data_pagamento', cutoff30.toISOString().substring(0, 10))
    .order('data_pagamento', { ascending: false })
    .limit(50);

  // Renda dos ultimos 12 meses (sparkline)
  const cutoff12m = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const { data: proventos12m } = await supabase
    .from('proventos')
    .select('valor_total, valor_por_cota, quantidade, data_pagamento')
    .eq('user_id', user.id)
    .gte('data_pagamento', cutoff12m.toISOString().substring(0, 10));

  // Posicoes
  const { data: ops } = await supabase
    .from('operacoes')
    .select('ticker, categoria, quantidade, preco, tipo')
    .eq('user_id', user.id)
    .in('tipo', ['compra', 'venda']);

  const posicoesMap: Record<string, Posicao> = {};
  for (const op of ops || []) {
    const tk = (op.ticker || '').toUpperCase();
    if (!tk) continue;
    if (!posicoesMap[tk]) {
      posicoesMap[tk] = { ticker: tk, categoria: op.categoria, quantidade: 0, pm: 0 };
    }
    const sign = op.tipo === 'compra' ? 1 : -1;
    const qtyAtual = posicoesMap[tk].quantidade;
    const custoAtual = posicoesMap[tk].pm * qtyAtual;
    const novaQty = qtyAtual + sign * (op.quantidade || 0);
    if (sign === 1) {
      const novoCusto = custoAtual + (op.preco || 0) * (op.quantidade || 0);
      posicoesMap[tk].pm = novaQty > 0 ? novoCusto / novaQty : 0;
    }
    posicoesMap[tk].quantidade = novaQty;
  }

  const posicoes = Object.values(posicoesMap)
    .filter((p) => p.quantidade > 0)
    .sort((a, b) => b.pm * b.quantidade - a.pm * a.quantidade)
    .slice(0, 10);

  // Renda 30d
  let renda30 = 0;
  for (const p of (proventos as Provento[]) || []) {
    const v = p.valor_total ?? (p.valor_por_cota || 0) * (p.quantidade || 0);
    if (v > 0) renda30 += v;
  }

  // Renda 12m por mes
  const monthlyMap: Record<string, number> = {};
  for (const p of (proventos12m as Provento[]) || []) {
    const v = p.valor_total ?? (p.valor_por_cota || 0) * (p.quantidade || 0);
    if (v <= 0) continue;
    const dKey = (p.data_pagamento || '').substring(0, 7); // YYYY-MM
    monthlyMap[dKey] = (monthlyMap[dKey] || 0) + v;
  }
  const monthlySorted = Object.keys(monthlyMap).sort();
  let renda12m = 0;
  for (const k of monthlySorted) renda12m += monthlyMap[k];
  const rendaMediaMes = renda12m / 12;

  // Patrimonio aproximado
  let patrimonio = 0;
  for (const p of posicoes) patrimonio += p.quantidade * p.pm;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-12 w-full">
        {/* Header da pagina */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display font-extrabold text-3xl md:text-4xl">
              Olá, {profile?.nome || 'investidor'}
            </h1>
            <p className="text-secondary text-sm mt-1">Aqui está sua renda mensal</p>
          </div>
          <div className="flex items-center gap-3">
            {isPro ? (
              <span className="px-3 py-1.5 rounded-md bg-income/10 border border-income/30 text-income text-xs font-bold uppercase">
                PRO ativo
              </span>
            ) : (
              <Link
                href="/assinar"
                className="px-4 py-2 rounded-md bg-income text-bg font-display font-bold text-sm hover:opacity-90"
              >
                Virar PRO
              </Link>
            )}
          </div>
        </div>

        {/* Hero — split patrimonio + renda */}
        <div className="glass p-6 md:p-8 mb-6 border border-income/20">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:border-r md:border-white/5 md:pr-6">
              <p className="text-xs text-muted font-mono uppercase tracking-wider mb-1">
                PATRIMÔNIO
              </p>
              <p className="font-mono font-extrabold text-3xl text-primary">
                R$ {fmtInt(patrimonio)}
              </p>
              <p className="text-xs text-muted mt-1">
                {posicoes.length} posições ativas
              </p>
            </div>
            <div>
              <p className="text-xs text-muted font-mono uppercase tracking-wider mb-1">
                RENDA MÉDIA/MÊS
              </p>
              <p className="font-mono font-extrabold text-3xl text-income">
                R$ {fmtInt(rendaMediaMes)}
              </p>
              <p className="text-xs text-muted mt-1">
                base últimos 12 meses · R$ {fmtInt(renda12m)} no ano
              </p>
            </div>
          </div>

          {/* Meta */}
          {profile?.meta_mensal && profile.meta_mensal > 0 ? (
            <div className="mt-6">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-muted font-mono uppercase">META MENSAL</span>
                <span className="text-xs text-income font-mono font-bold">
                  {Math.min(100, (rendaMediaMes / profile.meta_mensal) * 100).toFixed(0)}% de R$ {fmtInt(profile.meta_mensal)}
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full">
                <div
                  className="h-2 rounded-full bg-income"
                  style={{ width: `${Math.min(100, (rendaMediaMes / profile.meta_mensal) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Grid: renda 30d + ações rápidas */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Renda 30 dias */}
          <div className="glass p-6">
            <div className="flex items-center gap-2 mb-4">
              <span>💰</span>
              <h3 className="font-display font-bold text-lg">Recebido nos últimos 30 dias</h3>
            </div>
            <p className="font-mono font-extrabold text-2xl text-income mb-2">
              R$ {fmt(renda30)}
            </p>
            <p className="text-xs text-muted mb-4">{(proventos || []).length} eventos</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(proventos || []).slice(0, 6).map((p: Provento, i: number) => {
                const v = p.valor_total ?? (p.valor_por_cota || 0) * (p.quantidade || 0);
                return (
                  <div key={i} className="flex justify-between text-sm py-1.5 border-b border-white/5">
                    <div>
                      <span className="text-primary font-mono font-bold">{p.ticker}</span>
                      <span className="text-muted text-xs ml-2">{p.data_pagamento.substring(5)}</span>
                    </div>
                    <span className="text-income font-mono">+R$ {fmt(v)}</span>
                  </div>
                );
              })}
              {(proventos || []).length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">Nenhum provento nos últimos 30 dias</p>
              ) : null}
            </div>
          </div>

          {/* Ações rápidas */}
          <div className="glass p-6">
            <div className="flex items-center gap-2 mb-4">
              <span>⚡</span>
              <h3 className="font-display font-bold text-lg">Ações rápidas</h3>
            </div>
            <div className="space-y-2">
              <a
                href="https://apps.apple.com/br/app/premiolab/id000"
                className="flex items-center justify-between p-3 rounded-md bg-white/5 hover:bg-white/10 transition"
              >
                <span className="text-sm">📱 Baixar app iOS</span>
                <span className="text-muted">→</span>
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.premiolab"
                className="flex items-center justify-between p-3 rounded-md bg-white/5 hover:bg-white/10 transition"
              >
                <span className="text-sm">📱 Baixar app Android</span>
                <span className="text-muted">→</span>
              </a>
              <Link
                href="/dashboard/posicoes"
                className="flex items-center justify-between p-3 rounded-md bg-white/5 hover:bg-white/10 transition"
              >
                <span className="text-sm">📂 Ver posições completas</span>
                <span className="text-muted">→</span>
              </Link>
              <Link
                href="/dashboard/relatorios"
                className="flex items-center justify-between p-3 rounded-md bg-white/5 hover:bg-white/10 transition"
              >
                <span className="text-sm">📄 Relatórios mensais</span>
                <span className="text-muted">→</span>
              </Link>
              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center justify-between p-3 rounded-md bg-danger/10 hover:bg-danger/20 transition text-danger text-sm"
                >
                  <span>🚪 Sair</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Top posições */}
        <div className="glass p-6">
          <div className="flex items-center gap-2 mb-4">
            <span>💼</span>
            <h3 className="font-display font-bold text-lg">Top posições por valor</h3>
          </div>
          {posicoes.length === 0 ? (
            <p className="text-secondary text-sm py-6 text-center">
              Você ainda não tem posições registradas. Use o app mobile para começar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted uppercase border-b border-white/5">
                    <th className="text-left py-2 font-mono font-normal">Ticker</th>
                    <th className="text-left py-2 font-mono font-normal">Tipo</th>
                    <th className="text-right py-2 font-mono font-normal">Qty</th>
                    <th className="text-right py-2 font-mono font-normal">PM</th>
                    <th className="text-right py-2 font-mono font-normal">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {posicoes.map((p) => (
                    <tr key={p.ticker} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="py-3 font-mono font-bold">{p.ticker}</td>
                      <td className="py-3 text-secondary text-xs uppercase">{p.categoria}</td>
                      <td className="py-3 text-right font-mono">{p.quantidade}</td>
                      <td className="py-3 text-right font-mono text-secondary">R$ {fmt(p.pm)}</td>
                      <td className="py-3 text-right font-mono font-bold">
                        R$ {fmtInt(p.quantidade * p.pm)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-muted text-center mt-8">
          Dashboard simplificado · A experiência completa fica no app mobile.
        </p>
      </main>

      <Footer />
    </div>
  );
}
