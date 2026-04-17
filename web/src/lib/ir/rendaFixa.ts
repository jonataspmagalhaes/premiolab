// Calculo IR sobre Renda Fixa.
// Tabela regressiva: 22,5% (<=180d), 20% (181-360d), 17,5% (361-720d),
// 15% (>720d). Isentas: LCI, LCA, debenture incentivada, poupanca.

import type { RendaFixa } from '@/store';
import type { RFItem } from './types';
import { RF_TABELA_REGRESSIVA } from './constants';
import { diasCorridos } from './cambio';

function normalizarTipo(t: string): string {
  return (t || '').toLowerCase().trim();
}

function isIsenta(tipo: string): boolean {
  var t = normalizarTipo(tipo);
  return t === 'lci' || t === 'lca' ||
         t === 'lci_lca' || t === 'lca_lci' ||
         t === 'debenture_incentivada' ||
         t === 'poupanca';
}

export function aliquotaPorDias(dias: number): number {
  for (var i = 0; i < RF_TABELA_REGRESSIVA.length; i++) {
    var r = RF_TABELA_REGRESSIVA[i];
    if (dias <= r.ateDias) return r.aliquota;
  }
  return 0.15;
}

export function classifyRF(rf: RendaFixa): RFItem {
  var t = normalizarTipo(rf.tipo);
  var isento = isIsenta(t);
  var valorAplicado = rf.valor_aplicado || 0;
  var valorAtual = rf.valor_mtm != null ? rf.valor_mtm : valorAplicado;
  var dataAplicacaoISO = rf.created_at || '';
  var hoje = new Date().toISOString().slice(0, 10);
  var dias = dataAplicacaoISO ? diasCorridos(dataAplicacaoISO.substring(0, 10), hoje) : 0;
  var ganho = Math.max(0, valorAtual - valorAplicado);
  var aliq = isento ? 0 : aliquotaPorDias(dias);

  var motivo: string | undefined;
  if (isento) {
    if (t === 'lci' || t === 'lci_lca' || t === 'lca_lci') motivo = 'LCI/LCA isenta de IR para PF';
    else if (t === 'lca') motivo = 'LCA isenta de IR para PF';
    else if (t === 'debenture_incentivada') motivo = 'Debenture incentivada (Lei 12.431) isenta';
    else if (t === 'poupanca') motivo = 'Poupanca isenta de IR para PF';
  }

  return {
    id: rf.id,
    tipo: rf.tipo,
    emissor: rf.emissor,
    valorAplicado: valorAplicado,
    valorAtual: valorAtual,
    diasCorridos: dias,
    aliquotaProjetada: aliq,
    irProjetado: ganho * aliq,
    isenta: isento,
    motivo: motivo,
  };
}

export function classifyAllRF(rfs: RendaFixa[]): { isentas: RFItem[]; tributadas: RFItem[] } {
  var isentas: RFItem[] = [];
  var tributadas: RFItem[] = [];
  rfs.forEach(function (rf) {
    var item = classifyRF(rf);
    if (item.isenta) isentas.push(item);
    else tributadas.push(item);
  });
  return { isentas: isentas, tributadas: tributadas };
}
