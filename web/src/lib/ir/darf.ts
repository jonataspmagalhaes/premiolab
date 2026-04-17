// Geracao de texto DARF copiavel para o usuario colar no Sicalc/e-CAC.

import { getDarfVencimento, mesLabel } from './cambio';
import type { DarfRecord, DarfPorCategoria } from './types';
import { CODIGO_DARF_RV, CODIGO_DARF_CRIPTO } from './constants';

export function buildDarfTexto(d: DarfRecord): string {
  var linhas: string[] = [];
  linhas.push('=== DARF - Imposto de Renda Pessoa Fisica ===');
  linhas.push('Periodo de Apuracao: ' + mesLabel(d.mes));
  linhas.push('Codigo da Receita: ' + d.codigo);
  linhas.push('Data de Vencimento: ' + d.vencimento);
  linhas.push('Valor Principal: R$ ' + d.valorTotal.toFixed(2));
  linhas.push('');
  linhas.push('Detalhamento por categoria:');
  d.porCategoria.forEach(function (c) {
    if (c.imposto <= 0 && c.isento) {
      linhas.push('  - ' + c.categoria + ': ISENTO' + (c.motivoIsencao ? ' (' + c.motivoIsencao + ')' : ''));
    } else if (c.imposto > 0) {
      linhas.push(
        '  - ' + c.categoria + ': R$ ' + c.imposto.toFixed(2) +
        ' (base R$ ' + c.baseCalculo.toFixed(2) + ' x ' + (c.aliquota * 100).toFixed(1) + '%)'
      );
      if (c.prejuizoConsumido > 0) {
        linhas.push('      prejuizo compensado: R$ ' + c.prejuizoConsumido.toFixed(2));
      }
    }
  });
  linhas.push('');
  linhas.push('Instrucoes: emita a DARF no programa Sicalc da Receita');
  linhas.push('Federal. Em atraso incide multa de 0,33% ao dia (max 20%)');
  linhas.push('+ juros Selic acumulada.');
  linhas.push('');
  linhas.push('Gerado por PremioLab — informacao orientativa');
  return linhas.join('\n');
}

// Gera um registro DARF a partir das categorias calculadas
export function buildDarfRecord(
  mes: string,
  categorias: DarfPorCategoria[],
  codigo: 'rv' | 'cripto' = 'rv',
): DarfRecord {
  var total = categorias.reduce(function (a, c) { return a + c.imposto; }, 0);
  var cod = codigo === 'cripto' ? CODIGO_DARF_CRIPTO : CODIGO_DARF_RV;
  return {
    mes: mes,
    vencimento: getDarfVencimento(mes),
    codigo: cod,
    valorTotal: total,
    porCategoria: categorias,
  };
}
