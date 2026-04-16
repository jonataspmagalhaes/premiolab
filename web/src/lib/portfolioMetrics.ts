// Metricas derivadas da carteira: concentracao, performance, alertas.
// Funcoes puras, testaveis. Consumidas por componentes da Carteira.

import type { Position } from '@/store';

// ───────────── Concentracao ─────────────

export interface TopAtivo {
  ticker: string;
  valor: number;
  pct: number;
}

export interface ConcentracaoMetrics {
  top1Pct: number;        // % do maior ativo
  top3Pct: number;        // % dos 3 maiores
  top5Pct: number;        // % dos 5 maiores
  topAtivos: TopAtivo[];  // top 5 ordenados (ou menos se carteira tem menos)
  top1Setor: { setor: string; pct: number } | null;
  hhi: number;            // 0..10000 (Herfindahl-Hirschman) — maior = mais concentrado
  hhiNormalized: number;  // 0..100 (mais legivel; >25 = alta concentracao)
  numAtivos: number;
  numAtivosRelevantes: number; // peso > 1%
  numAtivosDominantes: number; // peso > 5%
  status: 'ok' | 'moderada' | 'alta';
}

// Concentracao por valor de mercado (positions). RF/fundos/caixa entram pelo total.
export function computeConcentracao(positions: Position[], totalCarteira: number): ConcentracaoMetrics {
  if (totalCarteira <= 0 || positions.length === 0) {
    return {
      top1Pct: 0, top3Pct: 0, top5Pct: 0, topAtivos: [], top1Setor: null,
      hhi: 0, hhiNormalized: 0,
      numAtivos: 0, numAtivosRelevantes: 0, numAtivosDominantes: 0,
      status: 'ok',
    };
  }

  // Agrega por ticker (valor de mercado)
  const byTicker: Record<string, number> = {};
  for (const p of positions) {
    if ((p.quantidade || 0) <= 0) continue;
    const v = p.valor_mercado != null ? p.valor_mercado : p.pm * p.quantidade;
    const t = (p.ticker || '').toUpperCase();
    byTicker[t] = (byTicker[t] || 0) + v;
  }
  const entries = Object.entries(byTicker).sort((a, b) => b[1] - a[1]);
  const valores = entries.map((e) => e[1]);
  const numAtivos = valores.length;

  const topAtivos: TopAtivo[] = entries.slice(0, 5).map((e) => ({
    ticker: e[0],
    valor: e[1],
    pct: (e[1] / totalCarteira) * 100,
  }));

  const top1 = valores[0] || 0;
  const top3 = valores.slice(0, 3).reduce((s, v) => s + v, 0);
  const top5 = valores.slice(0, 5).reduce((s, v) => s + v, 0);

  // HHI: soma dos quadrados das % de mercado
  let hhi = 0;
  for (const v of valores) {
    const pct = (v / totalCarteira) * 100;
    hhi += pct * pct;
  }
  // Normaliza pra 0..100 (HHI puro vai ate 10000 = 100% num ativo)
  const hhiNorm = Math.min(100, hhi / 100);

  let numRelevantes = 0, numDominantes = 0;
  for (const v of valores) {
    const pct = (v / totalCarteira) * 100;
    if (pct > 1) numRelevantes++;
    if (pct > 5) numDominantes++;
  }

  // Setor mais concentrado
  let top1Setor: ConcentracaoMetrics['top1Setor'] = null;
  // Nao tem o resolveSector aqui pra evitar circular import — caller passa positions com sector preenchido
  const bySetor: Record<string, number> = {};
  for (const p of positions) {
    if ((p.quantidade || 0) <= 0) continue;
    const v = p.valor_mercado != null ? p.valor_mercado : p.pm * p.quantidade;
    const sec = p.sector || 'Outros';
    bySetor[sec] = (bySetor[sec] || 0) + v;
  }
  const setorEntries = Object.entries(bySetor).sort((a, b) => b[1] - a[1]);
  if (setorEntries.length > 0) {
    top1Setor = { setor: setorEntries[0][0], pct: (setorEntries[0][1] / totalCarteira) * 100 };
  }

  // Status: HHI < 15 = ok, < 25 = moderada, >= 25 = alta
  // Equivale a: ~15% no top1 = moderada; ~25% = alta concentracao
  const hhiPct = hhiNorm;
  const status: ConcentracaoMetrics['status'] =
    hhiPct < 15 ? 'ok' : hhiPct < 25 ? 'moderada' : 'alta';

  return {
    top1Pct: (top1 / totalCarteira) * 100,
    top3Pct: (top3 / totalCarteira) * 100,
    top5Pct: (top5 / totalCarteira) * 100,
    topAtivos,
    top1Setor,
    hhi,
    hhiNormalized: hhiNorm,
    numAtivos,
    numAtivosRelevantes: numRelevantes,
    numAtivosDominantes: numDominantes,
    status,
  };
}

// ───────────── Performance ─────────────

export interface SnapshotPoint {
  data: string;       // ISO date
  valor: number;
  valor_investido?: number | null;
}

// ───────────── Aporte vs Patrimonio ─────────────

export interface AporteEventPoint {
  date: string;       // ISO
  valor: number;      // positivo = entrada, negativo = saida
}

export interface AporteVsPatrimonioPoint {
  date: string;
  label: string;          // dd/mm
  aporte: number;         // R$ acumulado
  patrimonio: number;     // R$ no snapshot (preenchido se snapshot existe na/antes da data)
}

export interface AporteVsPatrimonioSummary {
  aporteTotal: number;
  patrimonioAtual: number;
  ganhoCapital: number;       // patrimonio - aporte
  ganhoCapitalPct: number;    // % sobre o aporte
}

// Constroi serie unificada com aporte acumulado e patrimonio no mesmo eixo X.
// Estrategia: ordena todos os eventos cronologicamente, acumula aporte,
// pra cada data pega o snapshot mais recente como valor de patrimonio.
export function buildAporteVsPatrimonioSeries(
  events: AporteEventPoint[],
  snapshots: SnapshotPoint[],
  patrimonioAtual: number,
  daysLookback: number | null,
): { series: AporteVsPatrimonioPoint[]; summary: AporteVsPatrimonioSummary } {
  const todayIso = new Date().toISOString().slice(0, 10);
  const cutoff = daysLookback != null ? Date.now() - daysLookback * 86400000 : 0;

  // Eventos ordenados (ja vem ordenados da query, mas defensivo)
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const sortedSnaps = [...snapshots].sort((a, b) => a.data.localeCompare(b.data));

  // Coleta todas as datas relevantes (eventos + snapshots) dentro do range
  const dateSet = new Set<string>();
  for (const e of sortedEvents) {
    if (daysLookback != null && new Date(e.date).getTime() < cutoff) continue;
    if (e.date >= todayIso) continue;
    dateSet.add(e.date);
  }
  for (const s of sortedSnaps) {
    if (daysLookback != null && new Date(s.data).getTime() < cutoff) continue;
    if (s.data >= todayIso) continue;
    dateSet.add(s.data);
  }

  // Acumula aporte ate o cutoff (pra ter ponto inicial correto se daysLookback != null)
  let aporteAcumPreCutoff = 0;
  if (daysLookback != null) {
    for (const e of sortedEvents) {
      if (new Date(e.date).getTime() < cutoff) {
        aporteAcumPreCutoff += e.valor;
      }
    }
  }

  // Funcao auxiliar pra pegar snapshot mais recente <= data
  function snapAt(targetIso: string): number | null {
    let last: number | null = null;
    for (const s of sortedSnaps) {
      if (s.data > targetIso) break;
      last = s.valor;
    }
    return last;
  }

  const series: AporteVsPatrimonioPoint[] = [];
  const dates = Array.from(dateSet).sort();
  let aporteAcum = aporteAcumPreCutoff;
  let lastPat = 0;

  for (const d of dates) {
    // Soma todos eventos dessa data
    for (const e of sortedEvents) {
      if (e.date === d) aporteAcum += e.valor;
    }
    const snap = snapAt(d);
    if (snap != null) lastPat = snap;
    const dt = new Date(d);
    const label = String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0');
    series.push({
      date: d,
      label,
      aporte: aporteAcum,
      patrimonio: lastPat || aporteAcum, // fallback inicial: se nao tem snap ainda, usa aporte
    });
  }

  // Ponto "hoje"
  const today = new Date();
  const todayLabel = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0');
  // Soma eventos pendentes ate hoje
  for (const e of sortedEvents) {
    if (e.date >= todayIso) aporteAcum += e.valor;
  }
  series.push({
    date: todayIso,
    label: todayLabel,
    aporte: aporteAcum,
    patrimonio: patrimonioAtual,
  });

  const aporteTotal = aporteAcum; // total liquido todos os tempos
  const ganhoCapital = patrimonioAtual - aporteTotal;
  const ganhoCapitalPct = aporteTotal > 0 ? (ganhoCapital / aporteTotal) * 100 : 0;

  return {
    series,
    summary: { aporteTotal, patrimonioAtual, ganhoCapital, ganhoCapitalPct },
  };
}

export interface PerformanceMetrics {
  retornoPctMes: number | null;   // ultimo mes (30d)
  retornoPctAno: number | null;   // ano corrente (YTD)
  retornoPctTotal: number | null; // total desde primeiro snapshot
  cdiAcumPctMes: number | null;
  cdiAcumPctAno: number | null;
  cdiAcumPctTotal: number | null;
  ipcaAcumPctMes: number | null;
  ipcaAcumPctAno: number | null;
  ipcaAcumPctTotal: number | null;
  diasHistorico: number;
}

// Indexador a.a. -> acumulado em N dias: (1 + idx/100) ^ (dias/365) - 1
// Aproximacao composto continuo. Boa o suficiente pra comparacao visual.
function indexadorAcumNoPeriodo(taxaAA: number, dias: number): number {
  if (dias <= 0 || taxaAA <= 0) return 0;
  return (Math.pow(1 + taxaAA / 100, dias / 365) - 1) * 100;
}

export function computePerformance(
  snapshots: SnapshotPoint[],
  patrimonioAtual: number,
  cdiAA: number,
  ipcaAA: number = 0,
): PerformanceMetrics {
  if (snapshots.length === 0 || patrimonioAtual <= 0) {
    return {
      retornoPctMes: null, retornoPctAno: null, retornoPctTotal: null,
      cdiAcumPctMes: null, cdiAcumPctAno: null, cdiAcumPctTotal: null,
      ipcaAcumPctMes: null, ipcaAcumPctAno: null, ipcaAcumPctTotal: null,
      diasHistorico: 0,
    };
  }
  // Ordenacao garantida pelo query (ascending), mas re-sort por seguranca
  const sorted = [...snapshots].sort((a, b) => a.data.localeCompare(b.data));
  const now = Date.now();
  const oneDay = 86400000;

  function pickClosestBefore(targetTs: number): SnapshotPoint | null {
    let last: SnapshotPoint | null = null;
    for (const s of sorted) {
      const t = new Date(s.data).getTime();
      if (Number.isNaN(t)) continue;
      if (t > targetTs) break;
      last = s;
    }
    return last;
  }

  // Retorno = (atual - inicial) / inicial * 100, ja descontado de aportes? Nao temos aporte tracking,
  // entao isso aqui e' "evolucao do patrimonio" (mistura aporte + retorno).
  // Para retorno puro precisariamos saber aportes do periodo.
  const cutoffMes = now - 30 * oneDay;
  const cutoffYTDate = new Date(new Date().getFullYear(), 0, 1).getTime();

  const baseMes = pickClosestBefore(cutoffMes);
  const baseAno = pickClosestBefore(cutoffYTDate);
  const baseTotal = sorted[0];

  function pct(start: number | undefined): number | null {
    if (!start || start <= 0) return null;
    return ((patrimonioAtual - start) / start) * 100;
  }

  const diasHistoricoMes = baseMes ? Math.max(1, Math.round((now - new Date(baseMes.data).getTime()) / oneDay)) : 0;
  const diasHistoricoAno = baseAno ? Math.max(1, Math.round((now - new Date(baseAno.data).getTime()) / oneDay)) : 0;
  const diasHistoricoTotal = baseTotal ? Math.max(1, Math.round((now - new Date(baseTotal.data).getTime()) / oneDay)) : 0;

  return {
    retornoPctMes: baseMes ? pct(baseMes.valor) : null,
    retornoPctAno: baseAno ? pct(baseAno.valor) : null,
    retornoPctTotal: baseTotal ? pct(baseTotal.valor) : null,
    cdiAcumPctMes: baseMes ? indexadorAcumNoPeriodo(cdiAA, diasHistoricoMes) : null,
    cdiAcumPctAno: baseAno ? indexadorAcumNoPeriodo(cdiAA, diasHistoricoAno) : null,
    cdiAcumPctTotal: baseTotal ? indexadorAcumNoPeriodo(cdiAA, diasHistoricoTotal) : null,
    ipcaAcumPctMes: baseMes && ipcaAA > 0 ? indexadorAcumNoPeriodo(ipcaAA, diasHistoricoMes) : null,
    ipcaAcumPctAno: baseAno && ipcaAA > 0 ? indexadorAcumNoPeriodo(ipcaAA, diasHistoricoAno) : null,
    ipcaAcumPctTotal: baseTotal && ipcaAA > 0 ? indexadorAcumNoPeriodo(ipcaAA, diasHistoricoTotal) : null,
    diasHistorico: diasHistoricoTotal,
  };
}

// ───────────── Performance series (carteira/CDI/IPCA acumulado por data) ─────────────

export interface PerformancePoint {
  date: string;
  label: string;     // dd/mm
  carteira: number;  // % acumulado desde t0
  cdi: number;       // % acumulado desde t0
  ipca: number;      // % acumulado desde t0
}

// Constroi serie acumulada pra plotar 3 linhas (carteira/CDI/IPCA) ao longo do tempo.
// t0 = primeiro snapshot do periodo. Cada ponto: % de evolucao desde t0.
export function buildPerformanceSeries(
  snapshots: SnapshotPoint[],
  patrimonioAtual: number,
  cdiAA: number,
  ipcaAA: number,
  daysLookback: number | null,
): PerformancePoint[] {
  if (snapshots.length === 0 || patrimonioAtual <= 0) return [];
  const cutoff = daysLookback != null ? Date.now() - daysLookback * 86400000 : 0;
  const todayIso = new Date().toISOString().slice(0, 10);
  const oneDay = 86400000;

  const filtered = snapshots
    .filter((s) => {
      const t = new Date(s.data).getTime();
      if (Number.isNaN(t)) return false;
      if (daysLookback != null && t < cutoff) return false;
      return s.data < todayIso;
    })
    .sort((a, b) => a.data.localeCompare(b.data));

  if (filtered.length === 0) return [];

  const t0 = filtered[0];
  const t0Date = new Date(t0.data).getTime();
  if (!t0.valor || t0.valor <= 0) return [];

  const series: PerformancePoint[] = [];
  for (const s of filtered) {
    const t = new Date(s.data).getTime();
    const dias = Math.max(0, Math.round((t - t0Date) / oneDay));
    const d = new Date(s.data);
    const label = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    series.push({
      date: s.data,
      label,
      carteira: ((s.valor - t0.valor) / t0.valor) * 100,
      cdi: indexadorAcumNoPeriodo(cdiAA, dias),
      ipca: ipcaAA > 0 ? indexadorAcumNoPeriodo(ipcaAA, dias) : 0,
    });
  }

  // Ponto "hoje"
  const today = new Date();
  const diasHoje = Math.max(0, Math.round((today.getTime() - t0Date) / oneDay));
  const todayLabel = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0');
  series.push({
    date: todayIso,
    label: todayLabel,
    carteira: ((patrimonioAtual - t0.valor) / t0.valor) * 100,
    cdi: indexadorAcumNoPeriodo(cdiAA, diasHoje),
    ipca: ipcaAA > 0 ? indexadorAcumNoPeriodo(ipcaAA, diasHoje) : 0,
  });

  return series;
}

// ───────────── Evolucao snapshots → series ─────────────

export interface EvolucaoPoint {
  date: string;       // ISO
  label: string;      // dd/mm
  total: number;
  investido?: number;
}

export function buildEvolucaoSeries(
  snapshots: SnapshotPoint[],
  patrimonioAtualTotal: number,
  patrimonioAtualInvestido: number,
  daysLookback: number | null,
): EvolucaoPoint[] {
  const cutoff = daysLookback != null ? Date.now() - daysLookback * 86400000 : 0;
  const todayIso = new Date().toISOString().slice(0, 10);
  const series: EvolucaoPoint[] = [];

  for (const r of snapshots) {
    const t = new Date(r.data).getTime();
    if (Number.isNaN(t)) continue;
    if (daysLookback != null && t < cutoff) continue;
    if (r.data >= todayIso) continue;
    const d = new Date(r.data);
    const label = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    series.push({
      date: r.data,
      label,
      total: Number(r.valor) || 0,
      investido: r.valor_investido != null ? Number(r.valor_investido) : undefined,
    });
  }

  // Adiciona o ponto "hoje" (live) se temos patrimonio
  if (patrimonioAtualTotal > 0) {
    const today = new Date();
    const label = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0');
    series.push({ date: todayIso, label, total: patrimonioAtualTotal, investido: patrimonioAtualInvestido });
  }
  return series;
}

// ───────────── Alertas inteligentes ─────────────

export type AlertaSeverity = 'info' | 'warn' | 'attention';

export interface CarteiraAlerta {
  id: string;
  severity: AlertaSeverity;
  title: string;
  description: string;
  action?: string;     // Label do botao se houver acao
}

export interface BuildAlertasInput {
  totalCarteira: number;
  caixaTotal: number;
  numAtivos: number;
  hhiNormalized: number;
  top1Pct: number;
  top1Ticker?: string;
  driftMaxAbsPp: number;
  driftMaxLabel?: string;
  aderencia?: number;        // 0..100
  hasTargets: boolean;
  proximoDividendoDias?: number | null;
  proximoDividendoTicker?: string | null;
  proximoDividendoValor?: number;
}

export function buildCarteiraAlertas(i: BuildAlertasInput): CarteiraAlerta[] {
  const list: CarteiraAlerta[] = [];

  // Caixa ocioso > 5%
  if (i.totalCarteira > 0) {
    const pctCaixa = (i.caixaTotal / i.totalCarteira) * 100;
    if (pctCaixa > 5) {
      list.push({
        id: 'caixa-ocioso',
        severity: 'warn',
        title: 'Caixa ocioso: ' + pctCaixa.toFixed(1).replace('.', ',') + '% da carteira',
        description: 'Considere alocar — use o simulador de aporte.',
        action: 'Simular aporte',
      });
    }
  }

  // Concentracao alta
  if (i.hhiNormalized >= 25) {
    list.push({
      id: 'concentracao',
      severity: 'warn',
      title: 'Concentracao alta',
      description: i.top1Ticker
        ? i.top1Ticker + ' = ' + i.top1Pct.toFixed(1).replace('.', ',') + '% da carteira'
        : 'Top 1 ativo = ' + i.top1Pct.toFixed(1).replace('.', ',') + '%',
    });
  }

  // Drift importante (>10pp)
  if (i.hasTargets && i.driftMaxAbsPp >= 10) {
    list.push({
      id: 'drift',
      severity: 'attention',
      title: 'Hora de rebalancear',
      description: (i.driftMaxLabel || 'Algum alvo') + ' fora do alvo em ' + i.driftMaxAbsPp.toFixed(1).replace('.', ',') + 'pp.',
      action: 'Editar metas',
    });
  }

  // Aderencia baixa (<60) sem necessariamente ter drift gigante (varios drift medios)
  if (i.hasTargets && i.aderencia != null && i.aderencia < 60 && i.driftMaxAbsPp < 10) {
    list.push({
      id: 'aderencia-baixa',
      severity: 'info',
      title: 'Aderencia baixa: ' + i.aderencia + '/100',
      description: 'Varios alvos com pequenos desvios. Pequenos ajustes podem subir o score.',
      action: 'Editar metas',
    });
  }

  // Proximo dividendo (proximos 7 dias)
  if (i.proximoDividendoDias != null && i.proximoDividendoDias <= 7 && i.proximoDividendoDias >= 0) {
    list.push({
      id: 'div-proximo',
      severity: 'info',
      title: 'Provento proximo',
      description: (i.proximoDividendoTicker || 'Algum ativo')
        + (i.proximoDividendoValor ? ' — R$ ' + i.proximoDividendoValor.toFixed(2).replace('.', ',') : '')
        + ' em ' + i.proximoDividendoDias + ' dia' + (i.proximoDividendoDias === 1 ? '' : 's') + '.',
    });
  }

  // Sem metas e carteira > 50k → CTA pra criar metas
  if (!i.hasTargets && i.totalCarteira > 50000) {
    list.push({
      id: 'sem-metas',
      severity: 'info',
      title: 'Defina suas metas de carteira',
      description: 'Sem metas, voce nao sabe se esta concentrado nem onde aportar.',
      action: 'Definir metas',
    });
  }

  return list;
}
