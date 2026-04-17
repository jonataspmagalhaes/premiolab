'use client';

// /app/ir/declaracao — Replica visual das fichas do programa IRPF com
// dados do usuario ja preenchidos. Cada linha com botao Copiar pro user
// colar 1:1 no programa IRPF sem digitar valores/CNPJs manualmente.

import { useMemo } from 'react';
import { useIRYear } from '../_yearContext';
import { useAppStore } from '@/store';
import { useIR } from '@/lib/ir/useIR';
import { FichaCard, type FichaLinhaData } from '@/components/ir/FichaCard';
import { CaixaContador } from '@/components/ir/CaixaContador';
import { tipoLabel, isIntTicker, valorLiquido } from '@/lib/proventosUtils';
import { lookupCNPJ } from '@/lib/ir/cnpjsBR';
import { fmtBRL } from '@/lib/fmt';
import { mesLabel } from '@/lib/ir/cambio';
import type { Provento } from '@/store';

export default function IRDeclaracaoPage() {
  var yCtx = useIRYear();
  var ano = yCtx.year;
  var ir = useIR(ano);
  var proventos = useAppStore(function (s) { return s.proventos; });

  // Proventos do ano, agrupados por ticker (uma linha por fonte pagadora)
  var fichas = useMemo(function () {
    var byTickerDiv: Record<string, { ticker: string; total: number; count: number }> = {};
    var byTickerRendFII: Record<string, { ticker: string; total: number; count: number }> = {};
    var byTickerJCP: Record<string, { ticker: string; bruto: number; ir: number; count: number }> = {};
    var byTickerEUA: Record<string, { ticker: string; bruto: number; ir: number; count: number }> = {};

    proventos.forEach(function (p: Provento) {
      if (!p.data_pagamento || p.data_pagamento.substring(0, 4) !== String(ano)) return;
      var tl = tipoLabel(p.tipo_provento);
      var bruto = p.valor_total || 0;
      var isInt = isIntTicker(p.ticker);

      if (tl === 'JCP') {
        if (!byTickerJCP[p.ticker]) byTickerJCP[p.ticker] = { ticker: p.ticker, bruto: 0, ir: 0, count: 0 };
        byTickerJCP[p.ticker].bruto += bruto;
        byTickerJCP[p.ticker].ir += bruto * 0.15;
        byTickerJCP[p.ticker].count += 1;
      } else if (isInt && tl === 'Dividendo') {
        if (!byTickerEUA[p.ticker]) byTickerEUA[p.ticker] = { ticker: p.ticker, bruto: 0, ir: 0, count: 0 };
        byTickerEUA[p.ticker].bruto += bruto;
        byTickerEUA[p.ticker].ir += bruto * 0.30;
        byTickerEUA[p.ticker].count += 1;
      } else if (tl === 'Rendimento') {
        if (!byTickerRendFII[p.ticker]) byTickerRendFII[p.ticker] = { ticker: p.ticker, total: 0, count: 0 };
        byTickerRendFII[p.ticker].total += bruto;
        byTickerRendFII[p.ticker].count += 1;
      } else {
        // Dividendo BR
        if (!byTickerDiv[p.ticker]) byTickerDiv[p.ticker] = { ticker: p.ticker, total: 0, count: 0 };
        byTickerDiv[p.ticker].total += bruto;
        byTickerDiv[p.ticker].count += 1;
      }
    });

    // Ficha 09 — Rendimentos Isentos (codigo 09 = dividendos, codigo 26 = FII)
    var linhasF09: FichaLinhaData[] = [];
    Object.values(byTickerDiv).sort(function (a, b) { return b.total - a.total; }).forEach(function (x) {
      var e = lookupCNPJ(x.ticker);
      linhasF09.push({
        codigo: '09',
        beneficiario: 'Titular',
        cnpjCpf: e ? e.cnpj : '—',
        nomeFonte: e ? e.razaoSocial : x.ticker + ' (pesquise CNPJ no RI da empresa)',
        valor: x.total,
        detalhes: [x.count + ' pgto' + (x.count === 1 ? '' : 's')],
      });
    });
    Object.values(byTickerRendFII).sort(function (a, b) { return b.total - a.total; }).forEach(function (x) {
      linhasF09.push({
        codigo: '26',
        beneficiario: 'Titular',
        cnpjCpf: '—',            // CNPJs de FII variam — user procura no informe
        nomeFonte: 'Rendimento de FII — ' + x.ticker,
        valor: x.total,
        detalhes: [x.count + ' rendimento' + (x.count === 1 ? '' : 's'), 'CNPJ no informe mensal do FII'],
      });
    });

    // Ficha 10 — Tributacao Exclusiva (codigo 10 = JCP; codigo 06 = RV anual)
    var linhasF10: FichaLinhaData[] = [];
    Object.values(byTickerJCP).sort(function (a, b) { return b.bruto - a.bruto; }).forEach(function (x) {
      var e = lookupCNPJ(x.ticker);
      linhasF10.push({
        codigo: '10',
        beneficiario: 'Titular',
        cnpjCpf: e ? e.cnpj : '—',
        nomeFonte: e ? e.razaoSocial : x.ticker,
        valor: x.bruto,
        irRetidoFonte: x.ir,
        detalhes: ['JCP bruto (lance o valor COMPLETO, nao o liquido)'],
      });
    });

    // Ganhos RV anual — totalizado por categoria
    if (ir.data && ir.data.totais.irDevido > 0) {
      var totalGanhoTributado = 0;
      ir.data.darfs.forEach(function (d) {
        d.porCategoria.forEach(function (c) {
          if (c.categoria === 'cripto_swing' || c.categoria === 'cripto_day') return;
          totalGanhoTributado += c.baseCalculo;
        });
      });
      if (totalGanhoTributado > 0) {
        linhasF10.push({
          codigo: '06',
          beneficiario: 'Titular',
          cnpjCpf: 'Receita Federal',
          nomeFonte: 'Ganhos liquidos em renda variavel (operacoes comuns + daytrade)',
          valor: totalGanhoTributado,
          irRetidoFonte: ir.data.totais.irDevido,
          detalhes: ['Total apos compensacao de prejuizo', 'DARFs 6015 emitidas mes a mes'],
        });
      }
    }

    // Ficha 17 — Rendimentos no Exterior (Dividendos EUA)
    var linhasF17: FichaLinhaData[] = [];
    Object.values(byTickerEUA).sort(function (a, b) { return b.bruto - a.bruto; }).forEach(function (x) {
      linhasF17.push({
        beneficiario: 'Titular',
        cnpjCpf: 'EUA',
        nomeFonte: 'Dividendo ' + x.ticker + ' — pais pagador: Estados Unidos',
        valor: x.bruto,
        irRetidoFonte: x.ir,
        detalhes: [x.count + ' pgto' + (x.count === 1 ? '' : 's'), 'Valor convertido por PTAX de venda do mes de recebimento', 'Pode deduzir IR no exterior (tratado BR-EUA)'],
      });
    });

    return { f09: linhasF09, f10: linhasF10, f17: linhasF17 };
  }, [proventos, ano, ir.data]);

  // Fichas Renda Variavel mensal — usa DARFs do ir
  var linhasRV = useMemo<FichaLinhaData[]>(function () {
    if (!ir.data) return [];
    return ir.data.darfs
      .filter(function (d) { return d.codigo === '6015'; })
      .map(function (d) {
        var cats = d.porCategoria.filter(function (c) { return c.imposto > 0; });
        var detalhes: string[] = cats.map(function (c) {
          return c.categoria + ' (base R$ ' + fmtBRL(c.baseCalculo) + ' × ' + (c.aliquota * 100).toFixed(1) + '%)';
        });
        detalhes.push('Vencimento DARF: ' + d.vencimento);
        return {
          codigo: 'Renda Variavel',
          beneficiario: 'Titular',
          nomeFonte: 'Apuracao mensal — ' + mesLabel(d.mes),
          valor: d.valorTotal,
          irRetidoFonte: d.valorTotal,
          detalhes: detalhes,
        };
      });
  }, [ir.data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Declaracao IRPF {ano + 1} — Pre-Preenchida</h1>
        <p className="text-xs text-white/40 mt-1">
          Replica das fichas do programa IRPF com seus dados do PremioLab prontos pra copiar.
          Abra o programa IRPF lado-a-lado e copie campo a campo.
        </p>
      </div>

      <div className="rounded-xl border border-info/25 bg-info/[0.04] px-4 py-3">
        <p className="text-[12px] text-info font-semibold mb-1">Como usar</p>
        <ol className="space-y-0.5 text-[11px] text-white/70 leading-relaxed list-decimal list-inside">
          <li>Abra o programa IRPF {ano + 1} no seu computador.</li>
          <li>Escolha "Iniciar a partir da Pre-Preenchida" (necessita Gov.br Prata/Ouro).</li>
          <li>Revise o que a Receita ja trouxe; abra a ficha correspondente abaixo aqui.</li>
          <li>Use os botoes Copiar (linha ou ficha) pra colar no programa IRPF.</li>
          <li>Valide pendencias no programa IRPF antes de enviar.</li>
        </ol>
      </div>

      <FichaCard
        ficha="09"
        titulo="Rendimentos Isentos e Nao Tributaveis"
        subtitulo="Dividendos BR (cod 09) + Rendimentos FII (cod 26)"
        cor="emerald"
        linhas={fichas.f09}
        footerTotal
        empty="Sem proventos isentos em {ano}."
      />

      <FichaCard
        ficha="10"
        titulo="Rendimentos Sujeitos a Tributacao Exclusiva"
        subtitulo="JCP (cod 10) + Ganhos em Renda Variavel (cod 06)"
        cor="amber"
        linhas={fichas.f10}
        footerTotal
        empty={'Sem rendimentos com tributacao exclusiva em ' + ano + '.'}
      />

      <FichaCard
        ficha="17"
        titulo="Rendimentos Recebidos de PJ no Exterior"
        subtitulo="Dividendos EUA e outros (30% retido na fonte)"
        cor="info"
        linhas={fichas.f17}
        footerTotal
        empty={'Sem rendimentos recebidos do exterior em ' + ano + '.'}
      />

      <FichaCard
        ficha="Renda Variavel"
        titulo="Operacoes Comuns e Daytrade (mensal)"
        subtitulo="Apuracao mes a mes — a DARF 6015 paga esses valores"
        cor="orange"
        linhas={linhasRV}
        footerTotal
        empty={'Sem imposto devido em renda variavel em ' + ano + '.'}
      />

      <CaixaContador secao="pre_preenchida" defaultOpen={false} />
      <CaixaContador secao="primeiros_passos" defaultOpen={false} />
    </div>
  );
}
