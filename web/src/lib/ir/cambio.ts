// Helpers de conversao USD→BRL para stocks internacionais.
//
// Premissa: cada Operacao INT carrega taxa_cambio (obtido no momento da
// compra/venda). Se ausente, fallback e 5.0 (valor conservador) e registra
// warning no console.

export function usdParaBrl(valorUsd: number, taxaCambio: number | null | undefined): number {
  if (taxaCambio == null || !isFinite(taxaCambio) || taxaCambio <= 0) {
    return valorUsd * 5.0; // fallback; idealmente operacao deveria ter taxa armazenada
  }
  return valorUsd * taxaCambio;
}

// Calcula dias corridos entre duas datas (inclusivo inicio, exclusivo fim).
// Usado na tabela regressiva de RF.
export function diasCorridos(dataInicioISO: string, dataFimISO: string): number {
  var a = new Date(dataInicioISO);
  var b = new Date(dataFimISO);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

// Retorna ultimo dia util do mes seguinte ao mesKey YYYY-MM (pra DARF).
export function getDarfVencimento(mesKey: string): string {
  var parts = mesKey.split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  if (!y || !m) return '';
  // Primeiro dia do mes seguinte+1 (ou seja, mes DARF + 1):
  var next = new Date(y, m, 0);   // ultimo dia do mes SEGUINTE (m+1), mas JS month e 0-indexed; m ja == mes DARF+1 se passarmos m-1
  // Simplificado: DARF do mes 'm/y' vence no ultimo dia util do mes m+1/y (ou jan/y+1 se m=12).
  var mesAlvo = m; // ja 1-indexed; proximo mes e mesAlvo+1
  var anoAlvo = y;
  if (mesAlvo === 12) { mesAlvo = 1; anoAlvo = y + 1; } else { mesAlvo = mesAlvo + 1; }
  // Ultimo dia do mes alvo: Date(anoAlvo, mesAlvo, 0) (0-day of next month)
  var ultimo = new Date(anoAlvo, mesAlvo, 0);
  // Retrocede se sabado/domingo
  while (ultimo.getDay() === 0 || ultimo.getDay() === 6) {
    ultimo.setDate(ultimo.getDate() - 1);
  }
  return ultimo.toISOString().slice(0, 10);
}

// Formata mes em pt-BR curto: "2026-03" -> "Mar/26"
export function mesLabel(mesKey: string): string {
  var nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var parts = mesKey.split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  if (m < 0 || m > 11 || !y) return mesKey;
  return nomes[m] + '/' + String(y).slice(-2);
}

// Extrai mes key YYYY-MM de uma data ISO
export function mesKeyFromDate(isoOrDate: string | Date): string {
  var d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
