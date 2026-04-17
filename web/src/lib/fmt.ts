// Helpers de formatacao compartilhados (BRL, K, mes/ano, data)
// Extraidos de renda/page.tsx para reuso em Renda, IR e outras telas.

export function fmtBRL(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtK(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
  return Math.round(v).toString();
}

export function fmtMonthYear(d: Date): string {
  var m = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return m[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2);
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtDateLong(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Percentual com 2 casas
export function fmtPct(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

// Numero inteiro com separador
export function fmtInt(v: number): string {
  return Math.round(v || 0).toLocaleString('pt-BR');
}
