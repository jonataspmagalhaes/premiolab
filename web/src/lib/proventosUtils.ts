// Helpers compartilhados para cálculo e exibição de proventos com desconto de IR.

export function tipoLabel(t: string): string {
  var x = (t || '').toLowerCase();
  if (x.indexOf('jcp') >= 0 || x.indexOf('juros') >= 0) return 'JCP';
  if (x.indexOf('rend') >= 0) return 'Rendimento';
  if (x.indexOf('bonif') >= 0) return 'Bonificacao';
  if (x.indexOf('amort') >= 0) return 'Amortizacao';
  return 'Dividendo';
}

// Detecta ticker internacional (US) — não tem dígito final como BR tickers
export function isIntTicker(ticker: string): boolean {
  if (!ticker) return false;
  var t = ticker.toUpperCase();
  return !/\d$/.test(t);
}

// Calcula valor liquido considerando IR (JCP 15%, INT 30%)
export function valorLiquido(valorBruto: number, tipoProv: string, ticker: string): number {
  if (tipoLabel(tipoProv) === 'JCP') return valorBruto * 0.85;
  if (isIntTicker(ticker)) return valorBruto * 0.70;
  return valorBruto;
}
