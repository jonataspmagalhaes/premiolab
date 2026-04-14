var Decimal = require('decimal.js');

/**
 * Verifica se o ativo aceita quantidades fracionadas.
 * Apenas mercado INT (stock_int, etf_int, adr, reit) aceita frações.
 */
function isFractionable(categoria, mercado) {
  return mercado === 'INT';
}

/**
 * Formata quantidade para display.
 * Inteiro → sem decimais com separador de milhar pt-BR.
 * Fração → até 6 casas, sem zeros à direita.
 * null/NaN → "0"
 */
function formatQty(value) {
  var num = parseFloat(value);
  if (isNaN(num) || value === null || value === undefined) return '0';
  if (num === Math.floor(num)) {
    return Math.floor(num).toLocaleString('pt-BR');
  }
  // Até 6 casas, trim zeros
  var str = num.toFixed(6);
  // Remover zeros à direita
  str = str.replace(/0+$/, '');
  str = str.replace(/\.$/, '');
  // Converter ponto para vírgula (pt-BR)
  var parts = str.split('.');
  var intPart = parseInt(parts[0]).toLocaleString('pt-BR');
  if (parts.length > 1 && parts[1].length > 0) {
    return intPart + ',' + parts[1];
  }
  return intPart;
}

/**
 * Valida se a quantidade fracionada é válida para o ativo.
 * Retorna string de erro ou null.
 */
function validateQtyFraction(value, categoria, mercado) {
  var num = parseFloat(value);
  if (isNaN(num) || num <= 0) return null; // Outros validadores cuidam disso
  var hasFraction = num !== Math.floor(num);
  if (!isFractionable(categoria, mercado) && hasFraction) {
    return 'Este ativo não aceita frações';
  }
  if (isFractionable(categoria, mercado) && hasFraction) {
    var strVal = String(value);
    var dotIdx = strVal.indexOf('.');
    if (dotIdx === -1) dotIdx = strVal.indexOf(',');
    if (dotIdx !== -1) {
      var decimals = strVal.length - dotIdx - 1;
      if (decimals > 6) {
        return 'Máximo 6 casas decimais';
      }
    }
  }
  return null;
}

/**
 * Sanitiza input de quantidade em tempo real.
 * Bloqueia ponto/vírgula se não fracionável.
 * Limita a 6 casas decimais se fracionável.
 */
function sanitizeQtyInput(text, categoria, mercado) {
  if (!text) return text;
  // Permitir apenas números e separador decimal
  if (!isFractionable(categoria, mercado)) {
    // BR: bloquear ponto e vírgula — apenas inteiros
    return text.replace(/[^0-9]/g, '');
  }
  // INT: permitir ponto decimal, limitar 6 casas
  var clean = text.replace(/[^0-9.]/g, '');
  // Permitir apenas um ponto
  var firstDot = clean.indexOf('.');
  if (firstDot !== -1) {
    var before = clean.substring(0, firstDot + 1);
    var after = clean.substring(firstDot + 1).replace(/\./g, '');
    // Limitar a 6 casas decimais
    if (after.length > 6) {
      after = after.substring(0, 6);
    }
    clean = before + after;
  }
  return clean;
}

function decMul(a, b) {
  return new Decimal(a || 0).times(b || 0).toNumber();
}

function decDiv(a, b) {
  if (!b || b === 0) return 0;
  return new Decimal(a || 0).div(b).toNumber();
}

function decAdd(a, b) {
  return new Decimal(a || 0).plus(b || 0).toNumber();
}

function decSub(a, b) {
  return new Decimal(a || 0).minus(b || 0).toNumber();
}

module.exports = {
  isFractionable: isFractionable,
  formatQty: formatQty,
  validateQtyFraction: validateQtyFraction,
  sanitizeQtyInput: sanitizeQtyInput,
  decMul: decMul,
  decDiv: decDiv,
  decAdd: decAdd,
  decSub: decSub,
};
