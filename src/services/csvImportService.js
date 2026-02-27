// =========== CSV IMPORT SERVICE ===========
// Parse CSV/TSV text, detect B3/CEI/generic format, validate, deduplicate
// Supports: operacoes (acoes/FIIs/ETFs), opcoes (call/put), exercicios, futuros (skip)

// ── Corretora name mapping (B3 legal name → commercial name) ──
var CORRETORA_MAP = {
  'CLEAR CTVM': 'Clear',
  'CLEAR CORRETORA': 'Clear',
  'XP INVESTIMENTOS': 'XP',
  'RICO INVESTIMENTOS': 'Rico',
  'BTG PACTUAL': 'BTG',
  'INTER DTVM': 'Inter',
  'INTER DISTRIBUIDORA': 'Inter',
  'NU INVEST': 'NuInvest',
  'NU INVESTIMENTOS': 'NuInvest',
  'GENIAL INVESTIMENTOS': 'Genial',
  'GENIAL INSTITUCIONAL': 'Genial',
  'MODAL DTVM': 'Modal',
  'MODAL DISTRIBUIDORA': 'Modal',
  'TORO CTVM': 'Toro',
  'TORO INVESTIMENTOS': 'Toro',
  'GUIDE INVESTIMENTOS': 'Guide',
  'AVENUE SECURITIES': 'Avenue',
  'ORAMA DTVM': 'Orama',
  'EASYNVEST': 'NuInvest',
  'ITAU UNIBANCO': 'Itaú',
  'ITAU CORRETORA': 'Itaú',
  'BRADESCO': 'Bradesco',
  'SANTANDER CORRETORA': 'Santander',
  'SANTANDER CCVM': 'Santander',
  'BANCO DO BRASIL': 'BB',
  'BB INVESTIMENTOS': 'BB',
  'SAFRA CORRETORA': 'Safra',
  'SAFRA CVC': 'Safra',
  'TERRA INVESTIMENTOS': 'Terra',
  'ATIVA INVESTIMENTOS': 'Ativa',
  'MIRAE ASSET': 'Mirae',
  'MIRAE WEALTH': 'Mirae',
  'SOCOPA': 'Socopa',
  'C6 CTVM': 'C6 Bank',
  'PAGBANK': 'PagBank',
  'PAGSEGURO': 'PagBank',
  'MERCADO PAGO': 'Mercado Pago',
  'STAKE': 'Stake',
  'CHARLES SCHWAB': 'Charles Schwab',
  'NOMAD': 'Nomad',
  'WARREN': 'Warren',
  'PLANNER': 'Planner',
  'NECTON': 'Necton',
  'AGORA CTVM': 'Ágora',
  'AGORA INVESTIMENTOS': 'Ágora',
};

// ── ETFs conhecidos BR ──
var KNOWN_ETFS = [
  'IVVB11', 'BOVA11', 'HASH11', 'SMAL11', 'XFIX11', 'DIVO11',
  'GOLD11', 'MATB11', 'BOVV11', 'SPXI11', 'NASD11', 'IMAB11',
  'FIXA11', 'IRFM11', 'SMAC11', 'ECOO11', 'ISUS11', 'TECK11',
  'QBTC11', 'QETH11', 'BITI11', 'ETHE11', 'EURP11', 'ACWI11',
  'WRLD11', 'XINA11', 'SHOT11', 'JURO11', 'LFTS11', 'NTNS11',
  'B5P211', 'KDIF11',
];

// ── Parse numero formato BR ──
// "1.234,56" → 1234.56 | "36,75" → 36.75 | "100" → 100
function parseBRNumber(str) {
  if (!str) return 0;
  var s = String(str).trim();
  if (s === '' || s === '-') return 0;
  // Remove R$ prefix if present
  s = s.replace(/^R\$\s*/, '');
  // If contains comma → BR format
  if (s.indexOf(',') >= 0) {
    s = s.replace(/\./g, ''); // remove thousands dots
    s = s.replace(',', '.'); // comma → decimal point
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Parse numero formato CEI (ponto = decimal) ──
// "1.15" → 1.15 | "192425" → 192425 | "" → 0
function parseDotNumber(str) {
  if (!str) return 0;
  var s = String(str).trim();
  if (s === '' || s === '-') return 0;
  s = s.replace(/^R\$\s*/, '');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Meses B3 para opcoes ──
// A-L = Call Jan-Dec, M-X = Put Jan-Dec
var CALL_MONTHS = 'ABCDEFGHIJKL';
var PUT_MONTHS = 'MNOPQRSTUVWX';

// ── Decodifica ticker B3 de opcao ──
// "PETRC402" → { ativoBase: "PETR", tipo: "call", monthIdx: 2 (mar), strikeRef: "402" }
// "BBASB223E" → mesma coisa + isExercicio: true (strip E suffix)
// Retorna null se nao for ticker de opcao
function decodeOptionTicker(ticker) {
  if (!ticker) return null;
  var t = ticker.toUpperCase().trim();
  // Opcao: 4 letras base + 1 letra mes + digitos strike [+ E exercicio]
  // Min 6 chars (PETRB1), typical 7-9 (PETRC402, BBASB223E)
  if (t.length < 6) return null;

  var base = t.substring(0, 4);
  var monthChar = t.charAt(4);
  var rest = t.substring(5);

  // Check if month letter is valid
  var callIdx = CALL_MONTHS.indexOf(monthChar);
  var putIdx = PUT_MONTHS.indexOf(monthChar);
  if (callIdx < 0 && putIdx < 0) return null;

  // Check for E suffix (exercicio)
  var isExercicio = false;
  if (rest.length > 0 && rest.charAt(rest.length - 1) === 'E') {
    isExercicio = true;
    rest = rest.substring(0, rest.length - 1);
  }

  // Rest should be digits (strike reference)
  if (!rest || !/^\d+$/.test(rest)) return null;

  var tipo = callIdx >= 0 ? 'call' : 'put';
  var monthIdx = callIdx >= 0 ? callIdx : putIdx;

  return {
    ativoBase: base,
    tipo: tipo,
    monthIdx: monthIdx,
    strikeRef: rest,
    isExercicio: isExercicio,
  };
}

// ── Estima strike a partir dos digitos do ticker ──
// "402" → 40.20 | "25" → 25 | "335" → 33.50 | "1450" → 145.00
function estimateStrike(strikeRef) {
  if (!strikeRef) return 0;
  var n = parseInt(strikeRef, 10);
  if (isNaN(n)) return 0;
  // Heuristica: se >= 100, assume centavos (dividir por 10 ou 100)
  // Padroes B3: PETRH325 = R$32.50, VALE3H90 = R$90, BBASB223 = R$22.30
  if (strikeRef.length >= 3) {
    // 3 digitos: 402 → 40.2, 325 → 32.5
    return n / 10;
  }
  // 1-2 digitos: valor inteiro do strike
  return n;
}

// ── Classifica tipo de mercado pela coluna "Mercado" do CEI ──
// Exercicio check BEFORE opcao (pois "Exercicio de Opcao de Compra" contem "opcao de compra")
// Also handles garbled Latin-1 encoding where accented chars become \uFFFD
function detectMercadoType(mercadoRaw) {
  if (!mercadoRaw) return 'stock';
  var m = mercadoRaw.toLowerCase().trim();
  // Strip replacement chars for matching (Latin-1→UTF-8 garble resilience)
  var mClean = m.replace(/\uFFFD/g, '');
  // Exercicio: "Exercício de Opção" / "Exercicio de Opcao" / garbled "Exerccio de Opo"
  if (m.indexOf('exercicio de opc') >= 0 || m.indexOf('exercício de opç') >= 0) return 'exercicio';
  if (mClean.indexOf('exerccio de op') >= 0) return 'exercicio';
  // Opcao de Compra: "Opção de Compra" / "Opcao de Compra" / garbled "Opo de Compra"
  if (m.indexOf('opcao de compra') >= 0 || m.indexOf('opção de compra') >= 0) return 'option_call';
  if (mClean.indexOf('o de compra') >= 0 && mClean.indexOf('exerc') < 0) return 'option_call';
  // Opcao de Venda: "Opção de Venda" / "Opcao de Venda" / garbled
  if (m.indexOf('opcao de venda') >= 0 || m.indexOf('opção de venda') >= 0) return 'option_put';
  if (mClean.indexOf('o de venda') >= 0 && mClean.indexOf('exerc') < 0) return 'option_put';
  if (m.indexOf('futuro') >= 0) return 'futuro';
  if (m.indexOf('termo') >= 0) return 'termo';
  return 'stock';
}

// ── Extract ticker from B3 "Produto" field ──
// "PETR4 - PETROBRAS PN N2" → "PETR4"
// "PETR4F - PETROBRAS PN N2" → "PETR4" (remove F fracionario)
// "HGLG11 - CSHG LOG FII CI ER" → "HGLG11"
function extractTicker(produto) {
  if (!produto) return '';
  var parts = produto.split(' - ');
  var raw = (parts[0] || '').trim().toUpperCase();
  // Remove sufixo F (fracionario) se ticker base tem 5+ chars
  // Ex: PETR4F → PETR4, mas nao ABEV3 (sem F)
  // Tickers BR: 4-6 chars + F = fracionario
  if (raw.length >= 6 && raw.charAt(raw.length - 1) === 'F') {
    var base = raw.substring(0, raw.length - 1);
    // Verify it looks like a valid ticker (letters + numbers)
    if (/^[A-Z]{4}\d{1,2}$/.test(base) || /^[A-Z]{4}\d{2}$/.test(base)) {
      return base;
    }
  }
  return raw;
}

// ── Map B3 legal name to commercial name ──
function mapCorretora(nomeCompleto) {
  if (!nomeCompleto) return '';
  var upper = nomeCompleto.toUpperCase().trim();
  var keys = Object.keys(CORRETORA_MAP);
  for (var i = 0; i < keys.length; i++) {
    if (upper.indexOf(keys[i]) >= 0) {
      return CORRETORA_MAP[keys[i]];
    }
  }
  // Fallback: retorna nome original com capitalize
  var words = nomeCompleto.trim().split(/\s+/);
  if (words.length > 0) {
    return words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
  }
  return nomeCompleto.trim();
}

// ── Detect category from ticker ──
function detectCategory(ticker) {
  if (!ticker) return 'acao';
  var t = ticker.toUpperCase().trim();
  // ETFs conhecidos
  if (KNOWN_ETFS.indexOf(t) >= 0) return 'etf';
  // FIIs terminam em 11
  if (/^[A-Z]{4}11$/.test(t)) return 'fii';
  // Default acao
  return 'acao';
}

// ── Parse date DD/MM/YYYY → YYYY-MM-DD ──
function parseDateBR(str) {
  if (!str) return '';
  var s = str.trim();
  // Already ISO format?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  var parts = s.split('/');
  if (parts.length === 3) {
    var d = parts[0];
    var m = parts[1];
    var y = parts[2];
    if (d.length === 2 && m.length === 2 && (y.length === 4 || y.length === 2)) {
      if (y.length === 2) y = '20' + y;
      return y + '-' + m + '-' + d;
    }
  }
  return s;
}

// ── Detect CSV separator ──
function detectSeparator(firstLine) {
  var tab = (firstLine.match(/\t/g) || []).length;
  var semi = (firstLine.match(/;/g) || []).length;
  var comma = (firstLine.match(/,/g) || []).length;
  if (tab >= semi && tab >= comma && tab > 0) return '\t';
  if (semi >= comma && semi > 0) return ';';
  if (comma > 0) return ',';
  return ';'; // default BR
}

// ── Decode HTML entities (comuns em XML Spreadsheet da B3) ──
var HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú',
  '&agrave;': 'à', '&egrave;': 'è', '&igrave;': 'ì', '&ograve;': 'ò', '&ugrave;': 'ù',
  '&atilde;': 'ã', '&otilde;': 'õ', '&ntilde;': 'ñ',
  '&acirc;': 'â', '&ecirc;': 'ê', '&icirc;': 'î', '&ocirc;': 'ô', '&ucirc;': 'û',
  '&ccedil;': 'ç', '&Ccedil;': 'Ç',
  '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú',
  '&Atilde;': 'Ã', '&Otilde;': 'Õ',
  '&Acirc;': 'Â', '&Ecirc;': 'Ê',
  '&#10;': ' ', '&#13;': '', '&nbsp;': ' ',
};

function decodeHTMLEntities(str) {
  if (!str) return '';
  // Named entities
  var result = str.replace(/&[a-zA-Z]+;/g, function(match) {
    return HTML_ENTITIES[match] || match;
  });
  // Numeric entities &#NNN;
  result = result.replace(/&#(\d+);/g, function(match, num) {
    var code = parseInt(num, 10);
    if (code === 10 || code === 13) return ' ';
    return String.fromCharCode(code);
  });
  return result;
}

// ── Detect and convert XML Spreadsheet 2003 (SpreadsheetML) to TSV ──
// B3 exports .xls files that are actually XML, not binary Excel
function convertXMLSpreadsheet(text) {
  // Quick check: is this XML?
  var trimmed = text.trim();
  if (trimmed.indexOf('<?xml') < 0 && trimmed.indexOf('<Workbook') < 0 && trimmed.indexOf('<ss:Workbook') < 0) {
    return null; // not XML, return null to use normal CSV parsing
  }

  // Extract all <Row>...</Row> blocks
  var rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/gi;

  var tsvLines = [];
  var rowMatch;
  while ((rowMatch = rowRegex.exec(text)) !== null) {
    var rowContent = rowMatch[1];

    // Handle <Cell ss:Index="N"> (B3 XML sometimes skips empty columns)
    var cellRegex = /<Cell[^>]*?(?:ss:Index="(\d+)")?[^>]*>([\s\S]*?)<\/Cell>/gi;
    var indexedCells = [];
    var cellMatch;
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      var ssIndex = cellMatch[1] ? parseInt(cellMatch[1], 10) : 0;
      var cellContent = cellMatch[2];
      var cellDataMatch = /<Data[^>]*>([\s\S]*?)<\/Data>/i.exec(cellContent);
      var cellVal = '';
      if (cellDataMatch) {
        cellVal = decodeHTMLEntities(cellDataMatch[1]).trim();
      }
      if (ssIndex > 0) {
        // Fill gaps with empty strings
        while (indexedCells.length < ssIndex - 1) {
          indexedCells.push('');
        }
        indexedCells[ssIndex - 1] = cellVal;
      } else {
        indexedCells.push(cellVal);
      }
    }

    if (indexedCells.length > 0) {
      tsvLines.push(indexedCells.join('\t'));
    }
  }

  if (tsvLines.length === 0) return null;
  return tsvLines.join('\n');
}

// ── Decode file buffer with automatic encoding detection ──
// Handles UTF-8 (with or without BOM) and Latin-1/Windows-1252
// B3/CEI exports often use Latin-1, which garbles accented chars when read as UTF-8
function decodeCSVBuffer(buffer) {
  var bytes = new Uint8Array(buffer);
  var start = 0;

  // Skip UTF-8 BOM (EF BB BF)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    start = 3;
  }

  // Check for invalid UTF-8 sequences (indicates Latin-1/Windows-1252 file)
  var isValidUTF8 = true;
  for (var i = start; i < bytes.length; i++) {
    var b = bytes[i];
    if (b <= 0x7F) continue; // ASCII — always valid
    if (b >= 0xC2 && b <= 0xDF) {
      // 2-byte sequence: need 1 continuation byte
      if (i + 1 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80) { isValidUTF8 = false; break; }
      i += 1;
    } else if (b >= 0xE0 && b <= 0xEF) {
      // 3-byte sequence: need 2 continuation bytes
      if (i + 2 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80) { isValidUTF8 = false; break; }
      i += 2;
    } else if (b >= 0xF0 && b <= 0xF4) {
      // 4-byte sequence: need 3 continuation bytes
      if (i + 3 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80 || (bytes[i + 3] & 0xC0) !== 0x80) { isValidUTF8 = false; break; }
      i += 3;
    } else {
      // Invalid start byte (0x80-0xC1, 0xF5-0xFF)
      isValidUTF8 = false;
      break;
    }
  }

  // Decode as UTF-8 if valid
  if (isValidUTF8) {
    try {
      var subBytes = start > 0 ? bytes.subarray(start) : bytes;
      return new TextDecoder('utf-8').decode(subBytes);
    } catch (e) {
      // TextDecoder not available, fall through to Latin-1
    }
  }

  // Latin-1 / Windows-1252 fallback: each byte maps directly to Unicode code point
  var CHUNK = 8192;
  var parts = [];
  for (var j = start; j < bytes.length; j += CHUNK) {
    var end = j + CHUNK;
    if (end > bytes.length) end = bytes.length;
    var slice = bytes.subarray(j, end);
    parts.push(String.fromCharCode.apply(null, slice));
  }
  return parts.join('');
}

// ── Parse CSV text → { headers, rows } ──
// Also handles XML Spreadsheet 2003 (.xls from B3)
function parseCSVText(text) {
  if (!text || !text.trim()) return { headers: [], rows: [] };

  // Strip BOM if present (belt-and-suspenders, decodeCSVBuffer already handles this)
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.substring(1);
  }

  // Try to convert XML Spreadsheet to TSV first
  var converted = convertXMLSpreadsheet(text);
  if (converted) {
    text = converted;
  }

  var lines = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };

  var sep = detectSeparator(lines[0]);

  function splitLine(line) {
    var fields = [];
    var current = '';
    var inQuote = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '"') {
        if (inQuote && i + 1 < line.length && line.charAt(i + 1) === '"') {
          current = current + '"';
          i++; // skip escaped quote
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === sep && !inQuote) {
        fields.push(current.trim());
        current = '';
      } else {
        current = current + ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  var headers = splitLine(lines[0]);
  // Normalize headers: trim, lowercase for matching
  var headersClean = [];
  for (var h = 0; h < headers.length; h++) {
    headersClean.push(headers[h].replace(/^["']+|["']+$/g, '').trim());
  }

  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === '') continue;
    var fields = splitLine(line);
    rows.push(fields);
  }

  return { headers: headersClean, rows: rows };
}

// ── Detect format by headers ──
// Returns 'cei' | 'b3' | 'generic' | 'unknown'
function detectFormat(headers) {
  if (!headers || headers.length === 0) return 'unknown';
  var lower = [];
  for (var i = 0; i < headers.length; i++) {
    lower.push(headers[i].toLowerCase().replace(/[\/\\]/g, '/'));
  }
  var joined = lower.join('|');

  // CEI format detection (BEFORE B3 — CEI also has "movimentacao" but different structure)
  // CEI headers: "Data do Negocio", "Tipo de Movimentacao", "Mercado", "Prazo/Vencimento",
  //   "Instituicao", "Codigo de Negociacao", "Quantidade", "Preco", "Valor"
  if (joined.indexOf('codigo de negoci') >= 0 || joined.indexOf('código de negoci') >= 0) return 'cei';
  if ((joined.indexOf('tipo de movimenta') >= 0 || joined.indexOf('tipo de movimentaç') >= 0) &&
      (joined.indexOf('codigo') >= 0 || joined.indexOf('código') >= 0)) return 'cei';
  // Robust CEI fallback: handles Latin-1 encoding where accented chars become garbled
  // "Código" → "C\uFFFDdigo" still contains "digo", "Movimentação" still starts with "movimenta"
  if (joined.indexOf('negoci') >= 0 && joined.indexOf('movimenta') >= 0 && joined.indexOf('quantidade') >= 0) return 'cei';

  // B3 format detection
  if (joined.indexOf('entrada/sa') >= 0 && joined.indexOf('produto') >= 0) return 'b3';
  if (joined.indexOf('institui') >= 0 && joined.indexOf('produto') >= 0) return 'b3';
  if (joined.indexOf('movimenta') >= 0 && joined.indexOf('produto') >= 0 && joined.indexOf('pre') >= 0) return 'b3';

  // Generic format detection
  if (joined.indexOf('ticker') >= 0 && joined.indexOf('tipo') >= 0) return 'generic';
  if (joined.indexOf('ticker') >= 0 && joined.indexOf('data') >= 0) return 'generic';

  return 'unknown';
}

// ── Find column index (case-insensitive partial match) ──
function findCol(headers, candidates) {
  for (var c = 0; c < candidates.length; c++) {
    var cand = candidates[c].toLowerCase();
    for (var h = 0; h < headers.length; h++) {
      if (headers[h].toLowerCase().indexOf(cand) >= 0) return h;
    }
  }
  return -1;
}

// ── Parse B3 format rows → normalized operations ──
function parseB3(headers, rows) {
  var colData = findCol(headers, ['Data']);
  var colEntSai = findCol(headers, ['Entrada/Sa', 'Entrada/Saída', 'Entrada/Saida']);
  var colMov = findCol(headers, ['Movimenta', 'Movimentação', 'Movimentacao']);
  var colProduto = findCol(headers, ['Produto']);
  var colInst = findCol(headers, ['Institui', 'Instituição', 'Instituicao']);
  var colQty = findCol(headers, ['Quantidade']);
  var colPreco = findCol(headers, ['Preço unitário', 'Preco unitario', 'Preço unit', 'Preco unit']);
  var colValor = findCol(headers, ['Valor da Opera', 'Valor da Operação', 'Valor da Operacao']);

  var ops = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 3) continue;

    var entSai = colEntSai >= 0 ? (row[colEntSai] || '').trim().toLowerCase() : '';
    var mov = colMov >= 0 ? (row[colMov] || '').trim().toLowerCase() : '';
    var produto = colProduto >= 0 ? (row[colProduto] || '').trim() : '';
    var inst = colInst >= 0 ? (row[colInst] || '').trim() : '';
    var dataStr = colData >= 0 ? (row[colData] || '').trim() : '';
    var qtyStr = colQty >= 0 ? (row[colQty] || '').trim() : '';
    var precoStr = colPreco >= 0 ? (row[colPreco] || '').trim() : '';
    var valorStr = colValor >= 0 ? (row[colValor] || '').trim() : '';

    // Skip non-trade rows (transferencia, dividendo, etc.)
    var isCompra = entSai === 'debito' || entSai === 'débito' || mov.indexOf('compra') >= 0;
    var isVenda = entSai === 'credito' || entSai === 'crédito' || mov.indexOf('venda') >= 0;

    // Also check movimentacao for compra/venda keywords
    if (!isCompra && !isVenda) {
      if (mov.indexOf('compra') >= 0) isCompra = true;
      if (mov.indexOf('venda') >= 0) isVenda = true;
    }

    // Skip non-compra/venda (transferencia, liquidacao sem compra/venda, etc.)
    if (!isCompra && !isVenda) continue;

    var ticker = extractTicker(produto);
    if (!ticker) continue;

    var qty = parseBRNumber(qtyStr);
    var preco = parseBRNumber(precoStr);
    var valor = parseBRNumber(valorStr);

    // If preco is 0 but valor and qty are valid, compute preco
    if (preco === 0 && valor > 0 && qty > 0) {
      preco = Math.round((valor / qty) * 100) / 100;
    }

    var data = parseDateBR(dataStr);
    var corretora = mapCorretora(inst);
    var categoria = detectCategory(ticker);

    ops.push({
      ticker: ticker,
      tipo: isCompra ? 'compra' : 'venda',
      categoria: categoria,
      quantidade: qty,
      preco: preco,
      custos: 0,
      corretora: corretora,
      data: data,
      mercado: 'BR',
      _raw: row,
      _rowIndex: i,
    });
  }
  return ops;
}

// ── Parse generic CSV format → normalized operations ──
function parseGeneric(headers, rows) {
  var colData = findCol(headers, ['Data', 'Date']);
  var colTipo = findCol(headers, ['Tipo', 'Type']);
  var colTicker = findCol(headers, ['Ticker', 'Ativo', 'Symbol']);
  var colCat = findCol(headers, ['Categoria', 'Category', 'Classe']);
  var colQty = findCol(headers, ['Quantidade', 'Qty', 'Quantity']);
  var colPreco = findCol(headers, ['Preço', 'Preco', 'Price']);
  var colCorretagem = findCol(headers, ['Corretagem', 'Taxa', 'Fee']);
  var colEmolumentos = findCol(headers, ['Emolumentos']);
  var colImpostos = findCol(headers, ['Impostos', 'Tax']);
  var colCorretora = findCol(headers, ['Corretora', 'Broker']);
  var colMercado = findCol(headers, ['Mercado', 'Market']);

  var ops = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 3) continue;

    var ticker = colTicker >= 0 ? (row[colTicker] || '').trim().toUpperCase() : '';
    if (!ticker) continue;

    var tipoRaw = colTipo >= 0 ? (row[colTipo] || '').trim().toLowerCase() : '';
    var tipo = '';
    if (tipoRaw === 'compra' || tipoRaw === 'buy' || tipoRaw === 'c') tipo = 'compra';
    else if (tipoRaw === 'venda' || tipoRaw === 'sell' || tipoRaw === 'v') tipo = 'venda';
    else continue; // skip unknown types

    var data = parseDateBR(colData >= 0 ? (row[colData] || '').trim() : '');
    var qty = parseBRNumber(colQty >= 0 ? row[colQty] : '0');
    var preco = parseBRNumber(colPreco >= 0 ? row[colPreco] : '0');
    var corretagem = parseBRNumber(colCorretagem >= 0 ? row[colCorretagem] : '0');
    var emolumentos = parseBRNumber(colEmolumentos >= 0 ? row[colEmolumentos] : '0');
    var impostos = parseBRNumber(colImpostos >= 0 ? row[colImpostos] : '0');
    var custos = corretagem + emolumentos + impostos;
    var corretora = colCorretora >= 0 ? (row[colCorretora] || '').trim() : '';
    var mercado = colMercado >= 0 ? (row[colMercado] || '').trim().toUpperCase() : 'BR';
    if (mercado !== 'INT') mercado = 'BR';

    var catRaw = colCat >= 0 ? (row[colCat] || '').trim().toLowerCase() : '';
    var categoria = '';
    if (catRaw === 'acao' || catRaw === 'ação' || catRaw === 'stock') categoria = 'acao';
    else if (catRaw === 'fii') categoria = 'fii';
    else if (catRaw === 'etf') categoria = 'etf';
    else if (catRaw === 'stock_int') categoria = 'stock_int';
    else categoria = detectCategory(ticker);

    ops.push({
      ticker: ticker,
      tipo: tipo,
      categoria: categoria,
      quantidade: qty,
      preco: preco,
      custos: custos,
      corretora: corretora,
      data: data,
      mercado: mercado,
      _raw: row,
      _rowIndex: i,
    });
  }
  return ops;
}

// ── Parse CEI format rows → normalized operations/opcoes/exercicios ──
function parseCEI(headers, rows) {
  var colData = findCol(headers, ['Data do Neg', 'Data do Negócio', 'Data do Negocio']);
  var colTipoMov = findCol(headers, ['Tipo de Movimenta', 'Tipo de Movimentação', 'Tipo de Movimentacao']);
  var colMercado = findCol(headers, ['Mercado']);
  var colVenc = findCol(headers, ['Prazo/Vencimento', 'Prazo', 'Vencimento']);
  var colInst = findCol(headers, ['Institui', 'Instituição', 'Instituicao']);
  // "Código de Negociação": accent in 'ó' at position 1 garbles on Latin-1→UTF-8
  // "digo de Negoci" matches the fragment after the garbled char
  var colCodigo = findCol(headers, ['Codigo de Negoci', 'Código de Negociação', 'Codigo de Negociacao', 'digo de Negoci', 'de Negoci']);
  var colQty = findCol(headers, ['Quantidade']);
  var colPreco = findCol(headers, ['Preco', 'Preço']);
  var colValor = findCol(headers, ['Valor']);

  // Positional fallback for standard CEI 9-column format
  // When accented headers garble on Latin-1→UTF-8, some columns fail to match by name.
  // CEI always has: [0]Data [1]TipoMov [2]Mercado [3]Prazo [4]Inst [5]Codigo [6]Qty [7]Preco [8]Valor
  var matchedCount = 0;
  if (colData >= 0) matchedCount++;
  if (colTipoMov >= 0) matchedCount++;
  if (colMercado >= 0) matchedCount++;
  if (colVenc >= 0) matchedCount++;
  if (colInst >= 0) matchedCount++;
  if (colCodigo >= 0) matchedCount++;
  if (colQty >= 0) matchedCount++;
  if (colPreco >= 0) matchedCount++;
  if (colValor >= 0) matchedCount++;

  if (matchedCount >= 3 && headers.length >= 9) {
    if (colData < 0) colData = 0;
    if (colTipoMov < 0) colTipoMov = 1;
    if (colMercado < 0) colMercado = 2;
    if (colVenc < 0) colVenc = 3;
    if (colInst < 0) colInst = 4;
    if (colCodigo < 0) colCodigo = 5;
    if (colQty < 0) colQty = 6;
    if (colPreco < 0) colPreco = 7;
    if (colValor < 0) colValor = 8;
  }

  var ops = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 3) continue;

    var dataStr = colData >= 0 ? (row[colData] || '').trim() : '';
    var tipoMov = colTipoMov >= 0 ? (row[colTipoMov] || '').trim().toLowerCase() : '';
    var mercadoRaw = colMercado >= 0 ? (row[colMercado] || '').trim() : '';
    var vencStr = colVenc >= 0 ? (row[colVenc] || '').trim() : '';
    var inst = colInst >= 0 ? (row[colInst] || '').trim() : '';
    var codigo = colCodigo >= 0 ? (row[colCodigo] || '').trim().toUpperCase() : '';
    var qtyStr = colQty >= 0 ? (row[colQty] || '').trim() : '';
    var precoStr = colPreco >= 0 ? (row[colPreco] || '').trim() : '';
    var valorStr = colValor >= 0 ? (row[colValor] || '').trim() : '';

    if (!codigo) continue;

    var isCompra = tipoMov.indexOf('compra') >= 0;
    var isVenda = tipoMov.indexOf('venda') >= 0;
    if (!isCompra && !isVenda) continue;

    var qty = parseDotNumber(qtyStr);
    var preco = parseDotNumber(precoStr);
    var valor = parseDotNumber(valorStr);
    var data = parseDateBR(dataStr);
    var corretora = mapCorretora(inst);
    var mercadoType = detectMercadoType(mercadoRaw);

    // Prefer Valor/Quantidade as unit price when available (more reliable than Preco column)
    // This correctly handles contracts with price multipliers (e.g. mini-indice: 1pt = R$0.20)
    if (valor > 0 && qty > 0) {
      var computedPreco = Math.round((valor / qty) * 100) / 100;
      if (preco === 0) {
        preco = computedPreco;
      } else if (Math.abs(preco * qty - valor) / valor > 0.05) {
        // >5% discrepancy between preco*qty and valor: prefer valor/qty
        preco = computedPreco;
      }
    }

    // ── Futuro / Termo → skip
    if (mercadoType === 'futuro' || mercadoType === 'termo') {
      ops.push({
        ticker: codigo,
        tipo: isCompra ? 'compra' : 'venda',
        quantidade: qty,
        preco: preco,
        data: data,
        corretora: corretora,
        _importType: 'skip',
        _skipReason: mercadoType === 'futuro' ? 'Futuro não suportado' : 'Termo não suportado',
        _raw: row,
        _rowIndex: i,
      });
      continue;
    }

    // ── Exercicio de opcao
    if (mercadoType === 'exercicio') {
      var exDecode = decodeOptionTicker(codigo);
      var exBase = exDecode ? exDecode.ativoBase : codigo.substring(0, 4);
      var exCat = detectCategory(exBase + '4'); // heuristic: append 4 for acao detection
      if (exCat === 'acao' || exCat === 'fii' || exCat === 'etf') {
        // Keep detected category
      } else {
        exCat = 'acao';
      }
      // For exercise: ticker_opcao original serves as reference
      // The actual stock operation uses the base ticker
      // Need to figure out which stock ticker (e.g. PETR4 from PETRC402)
      // Heuristic: try base+3 and base+4 — common acao suffixes
      var exTicker = exBase + '4';
      ops.push({
        ticker: exTicker,
        tipo: isCompra ? 'compra' : 'venda',
        categoria: exCat,
        quantidade: qty,
        preco: preco,
        custos: 0,
        corretora: corretora,
        data: data,
        mercado: 'BR',
        _importType: 'exercicio',
        _tickerOpcao: codigo,
        _raw: row,
        _rowIndex: i,
      });
      continue;
    }

    // ── Opcao (call ou put)
    if (mercadoType === 'option_call' || mercadoType === 'option_put') {
      var optDecode = decodeOptionTicker(codigo);
      var optBase = optDecode ? optDecode.ativoBase : codigo.substring(0, 4);
      var optTipo = optDecode ? optDecode.tipo : (mercadoType === 'option_call' ? 'call' : 'put');
      // Direcao: compra no CEI = compra de opcao, venda no CEI = venda de opcao (lancamento)
      var optDirecao = isVenda ? 'venda' : 'compra';
      // Strike: CEI NAO informa strike. Estimativa heuristica pelo ticker
      var optStrike = 0;
      var strikeEstimated = false;
      if (optDecode && optDecode.strikeRef) {
        optStrike = estimateStrike(optDecode.strikeRef);
        strikeEstimated = true;
      }
      // Vencimento: usar coluna Prazo/Vencimento se disponivel
      var optVenc = vencStr ? parseDateBR(vencStr) : '';
      // Premio = preco unitario do CEI
      var optPremio = preco;

      ops.push({
        ativo_base: optBase + '4', // heuristic: append 4 (most common)
        ticker_opcao: codigo,
        tipo: optTipo,
        direcao: optDirecao,
        strike: optStrike,
        premio: optPremio,
        quantidade: qty,
        vencimento: optVenc,
        data_abertura: data,
        status: 'ativa',
        corretora: corretora,
        _importType: 'opcao',
        _strikeEstimated: strikeEstimated,
        _raw: row,
        _rowIndex: i,
      });
      continue;
    }

    // ── Default: operacao normal (acao/FII/ETF)
    // Remove fracionario F suffix
    var ticker = extractTicker(codigo);
    if (!ticker) continue;
    var categoria = detectCategory(ticker);

    ops.push({
      ticker: ticker,
      tipo: isCompra ? 'compra' : 'venda',
      categoria: categoria,
      quantidade: qty,
      preco: preco,
      custos: 0,
      corretora: corretora,
      data: data,
      mercado: 'BR',
      _importType: 'operacao',
      _raw: row,
      _rowIndex: i,
    });
  }
  return ops;
}

// ── Validate opcao row ──
function validateOpcaoRow(op) {
  var errors = [];
  if (!op.ativo_base) errors.push('Ativo base vazio');
  if (!op.tipo || (op.tipo !== 'call' && op.tipo !== 'put')) errors.push('Tipo inválido');
  if (!op.premio || op.premio <= 0) errors.push('Prêmio inválido');
  if (!op.quantidade || op.quantidade <= 0) errors.push('Quantidade inválida');
  if (!op.data_abertura || op.data_abertura.length < 8) errors.push('Data inválida');
  if (op.data_abertura) {
    var today = new Date();
    var opDate = new Date(op.data_abertura);
    if (opDate > today) errors.push('Data futura');
  }
  return { valid: errors.length === 0, errors: errors };
}

// ── Validate a single parsed row (routes by _importType) ──
function validateRow(op) {
  // Skip items are always "valid" (they just won't be imported)
  if (op._importType === 'skip') {
    return { valid: true, errors: [] };
  }
  // Opcao validation
  if (op._importType === 'opcao') {
    return validateOpcaoRow(op);
  }
  // Operacao / exercicio validation
  var errors = [];
  if (!op.ticker) errors.push('Ticker vazio');
  if (!op.tipo || (op.tipo !== 'compra' && op.tipo !== 'venda')) errors.push('Tipo inválido');
  if (!op.quantidade || op.quantidade <= 0) errors.push('Quantidade inválida');
  if (!op.preco || op.preco <= 0) errors.push('Preço inválido');
  if (!op.data || op.data.length < 8) errors.push('Data inválida');
  // Validate date is not in the future
  if (op.data) {
    var today = new Date();
    var opDate = new Date(op.data);
    if (opDate > today) errors.push('Data futura');
  }
  return { valid: errors.length === 0, errors: errors };
}

// ── Find duplicates comparing new ops against existing ──
// existingOpcoes is optional (array of existing opcoes for dedup)
function findDuplicates(newOps, existingOps, existingOpcoes) {
  // Build lookup from existing operations
  var exactKeys = {};
  var partialKeys = {};
  for (var e = 0; e < existingOps.length; e++) {
    var ex = existingOps[e];
    var tk = (ex.ticker || '').toUpperCase().trim();
    var dt = (ex.data || '').substring(0, 10);
    var tp = ex.tipo || '';
    var qt = ex.quantidade || 0;
    var pr = Math.round((ex.preco || 0) * 100) / 100;
    var exactKey = tk + '|' + dt + '|' + tp + '|' + qt + '|' + pr;
    var partialKey = tk + '|' + dt + '|' + tp;
    exactKeys[exactKey] = true;
    if (!partialKeys[partialKey]) partialKeys[partialKey] = [];
    partialKeys[partialKey].push(ex);
  }

  // Build lookup from existing opcoes (for opcao dedup)
  var opcaoExactKeys = {};
  var opcoesArr = existingOpcoes || [];
  for (var oe = 0; oe < opcoesArr.length; oe++) {
    var exOp = opcoesArr[oe];
    var oTk = (exOp.ticker_opcao || '').toUpperCase().trim();
    var oDt = (exOp.data_abertura || '').substring(0, 10);
    var oPr = Math.round((exOp.premio || 0) * 100) / 100;
    var oQt = exOp.quantidade || 0;
    var opcaoKey = oTk + '|' + oDt + '|' + oPr + '|' + oQt;
    opcaoExactKeys[opcaoKey] = true;
  }

  var results = [];
  for (var i = 0; i < newOps.length; i++) {
    var op = newOps[i];

    // Skip items get status 'skip' directly
    if (op._importType === 'skip') {
      results.push({ op: op, status: 'skip' });
      continue;
    }

    var validation = validateRow(op);
    if (!validation.valid) {
      results.push({
        op: op,
        status: 'error',
        errors: validation.errors,
      });
      continue;
    }

    // Opcao dedup: ticker_opcao + data_abertura + premio + qty
    if (op._importType === 'opcao') {
      var oTk2 = (op.ticker_opcao || '').toUpperCase().trim();
      var oDt2 = (op.data_abertura || '').substring(0, 10);
      var oPr2 = Math.round((op.premio || 0) * 100) / 100;
      var oQt2 = op.quantidade || 0;
      var opcaoKey2 = oTk2 + '|' + oDt2 + '|' + oPr2 + '|' + oQt2;
      if (opcaoExactKeys[opcaoKey2]) {
        results.push({ op: op, status: 'duplicate' });
      } else {
        results.push({ op: op, status: 'new' });
      }
      continue;
    }

    // Operacao / exercicio dedup (same as before)
    var tk2 = (op.ticker || '').toUpperCase().trim();
    var dt2 = (op.data || '').substring(0, 10);
    var tp2 = op.tipo || '';
    var qt2 = op.quantidade || 0;
    var pr2 = Math.round((op.preco || 0) * 100) / 100;
    var exactKey2 = tk2 + '|' + dt2 + '|' + tp2 + '|' + qt2 + '|' + pr2;
    var partialKey2 = tk2 + '|' + dt2 + '|' + tp2;

    if (exactKeys[exactKey2]) {
      results.push({ op: op, status: 'duplicate' });
    } else if (partialKeys[partialKey2] && partialKeys[partialKey2].length > 0) {
      results.push({ op: op, status: 'possible_duplicate' });
    } else {
      results.push({ op: op, status: 'new' });
    }
  }
  return results;
}

// ══════════════════════════════════════════════════
// ═══════ NOTA DE CORRETAGEM (PDF text) ══════════
// ══════════════════════════════════════════════════

// ── Detect if pasted text is a nota de corretagem ──
function isNotaCorretagem(text) {
  if (!text) return false;
  var t = text.substring(0, 3000); // check first 3k chars
  var score = 0;
  if (/Nr\.?\s*[Nn]ota/i.test(t)) score++;
  if (/Data\s+preg[aã]o/i.test(t)) score++;
  if (/Neg[oó]cios\s+realizados/i.test(t)) score++;
  if (/Resumo\s+(dos\s+Neg[oó]cios|Financeiro)/i.test(t)) score++;
  if (/\bD\/C\b/.test(t)) score++;
  if (/Taxa\s+de\s+liquida[cç][aã]o/i.test(t)) score++;
  if (/Emolumentos/i.test(t)) score++;
  if (/BOVESPA|B3\s+RV|LISTADO/i.test(t)) score++;
  return score >= 3;
}

// ── Parse nota header (date, number, broker) ──
function parseNotaHeader(text) {
  var data = '';
  var notaNumero = '';
  var corretora = '';

  // Data pregao: DD/MM/YYYY
  var dataMatch = /Data\s+preg[aã]o\s*[:\s]*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  if (dataMatch) {
    data = parseDateBR(dataMatch[1]);
  }

  // Nr. Nota
  var notaMatch = /Nr\.?\s*[Nn]ota\s*[:\s]*(\d+)/i.exec(text);
  if (notaMatch) {
    notaNumero = notaMatch[1];
  }

  // Corretora: search for known names in text
  var keys = Object.keys(CORRETORA_MAP);
  var textUpper = text.substring(0, 2000).toUpperCase();
  for (var i = 0; i < keys.length; i++) {
    if (textUpper.indexOf(keys[i]) >= 0) {
      corretora = CORRETORA_MAP[keys[i]];
      break;
    }
  }

  return { data: data, notaNumero: notaNumero, corretora: corretora };
}

// ── Parse trade description (the text part before qty/price/value/D|C) ──
function parseTradeDescription(desc) {
  var result = {
    compraVenda: '',  // 'C' or 'V'
    mercadoTipo: '',  // 'vista', 'fracionario', 'option_call', 'option_put', 'exercicio', 'termo', 'futuro'
    prazo: '',        // 'MM/YY' for options
    tickerOpcao: '',
    specText: '',     // remaining spec text (e.g. "PN 39,40 PETRE")
  };

  // Normalize whitespace
  var d = desc.replace(/\s+/g, ' ').trim();

  // Remove venue prefix: "B3 RV LISTADO", "B3", "BOVESPA", etc.
  d = d.replace(/^(B3\s+RV\s+LISTADO|B3\s+RV|BOVESPA|B3)\s+/i, '');

  // Find C or V (compra/venda) — first isolated C or V
  var cvMatch = /^([CV])\s+/i.exec(d);
  if (cvMatch) {
    result.compraVenda = cvMatch[1].toUpperCase();
    d = d.substring(cvMatch[0].length);
  }

  // Detect market type
  if (/^OPCAO\s+DE\s+COMPRA/i.test(d) || /^OP[CÇ][AÃ]O\s+DE\s+COMPRA/i.test(d)) {
    result.mercadoTipo = 'option_call';
    d = d.replace(/^OP[CÇ]?[AÃ]?O?\s+DE\s+COMPRA\s*/i, '');
  } else if (/^OPCAO\s+DE\s+VENDA/i.test(d) || /^OP[CÇ][AÃ]O\s+DE\s+VENDA/i.test(d)) {
    result.mercadoTipo = 'option_put';
    d = d.replace(/^OP[CÇ]?[AÃ]?O?\s+DE\s+VENDA\s*/i, '');
  } else if (/^EXERCICIO/i.test(d) || /^EXERC[IÍ]CIO/i.test(d)) {
    result.mercadoTipo = 'exercicio';
    d = d.replace(/^EXERC[IÍ]?CIO\s*/i, '');
  } else if (/^VISTA/i.test(d)) {
    result.mercadoTipo = 'vista';
    d = d.replace(/^VISTA\s*/i, '');
  } else if (/^FRACIONARIO/i.test(d) || /^FRACION[AÁ]RIO/i.test(d)) {
    result.mercadoTipo = 'fracionario';
    d = d.replace(/^FRACION[AÁ]?RIO\s*/i, '');
  } else if (/^TERMO/i.test(d)) {
    result.mercadoTipo = 'termo';
    d = d.replace(/^TERMO\s*/i, '');
  } else if (/^FUTURO/i.test(d)) {
    result.mercadoTipo = 'futuro';
    d = d.replace(/^FUTURO\s*/i, '');
  } else {
    result.mercadoTipo = 'vista'; // default
  }

  // Extract prazo (MM/YY) for options
  var prazoMatch = /^(\d{2}\/\d{2})\s+/.exec(d);
  if (prazoMatch) {
    result.prazo = prazoMatch[1];
    d = d.substring(prazoMatch[0].length);
  }

  // Remaining is spec: ticker + type + strike info
  result.specText = d.trim();

  return result;
}

// ── Extract ticker from nota spec text ──
// "PETRC402 PN 39,40 PETRE" → "PETRC402"
// "PETR4 PN N2" → "PETR4"
function extractNotaTicker(specText) {
  if (!specText) return '';
  var parts = specText.split(/\s+/);
  if (parts.length > 0) {
    return parts[0].toUpperCase().trim();
  }
  return '';
}

// ── Extract strike from spec text ──
// "PETRC402 PN 39,40 PETRE" → 39.40 (from "PN 39,40")
// "PETRM26 PN 39,40" → 39.40
function extractNotaStrike(specText) {
  if (!specText) return 0;
  // Pattern: "PN XX,XX" or "ON XX,XX" where XX,XX is the strike
  var strikeMatch = /\b(?:PN|ON|UNT|CI)\s+(\d+[.,]\d+)/i.exec(specText);
  if (strikeMatch) {
    return parseBRNumber(strikeMatch[1]);
  }
  return 0;
}

// ── Compute 3rd Friday of a given month/year ──
function thirdFriday(year, month) {
  // month is 0-indexed (0=Jan, 11=Dec)
  var d = new Date(year, month, 1);
  var dayOfWeek = d.getDay(); // 0=Sun, 5=Fri
  // Days until first Friday: (5 - dayOfWeek + 7) % 7, but if day1 is already Friday → 0
  var daysToFri = (5 - dayOfWeek + 7) % 7;
  var firstFriday = 1 + daysToFri;
  // 3rd Friday = first + 14
  var third = firstFriday + 14;
  var mm = String(month + 1);
  if (mm.length < 2) mm = '0' + mm;
  var dd = String(third);
  if (dd.length < 2) dd = '0' + dd;
  return year + '-' + mm + '-' + dd;
}

// ── Infer ativo_base from option ticker base letters ──
// "PETR" → "PETR4" (PN preference), "VALE" → "VALE3" (ON preference)
// Uses heuristic: most common B3 tickers
var BASE_ON = ['VALE', 'BBAS', 'SUZB', 'CMIG', 'CSNA', 'GGBR', 'USIM', 'GOAU', 'CMIN'];
function inferAtivoBase(base4) {
  if (!base4) return base4 + '4';
  var up = base4.toUpperCase();
  if (BASE_ON.indexOf(up) >= 0) return up + '3';
  return up + '4';
}

// ── Parse trade lines from nota text ──
function parseNotaTrades(text) {
  var trades = [];
  // Normalize line breaks
  var normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var lines = normalized.split('\n');

  // Pre-process: join continuation lines
  // Trade lines start with venue (B3, BOVESPA) or have the trailing pattern
  // Non-trade lines in the middle might be wrapped continuations
  var joined = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\t/g, ' ').trim();
    if (!line) continue;
    joined.push(line);
  }

  // Match lines with trailing: qty price value D/C
  // qty can have dots as thousands sep: "3.000"
  // price and value use BR format: "1,15" or "3.450,00"
  // Pattern: ... QTY PRICE VALUE D|C
  var tradeRegex = /^(.+?)\s+([\d.]+)\s+([\d.,]+)\s+([\d.,]+)\s+([DC])\s*$/i;

  for (var j = 0; j < joined.length; j++) {
    var match = tradeRegex.exec(joined[j]);
    if (!match) continue;

    var descRaw = match[1].trim();
    var qtyStr = match[2];
    var precoStr = match[3];
    var valorStr = match[4];
    var dc = match[5].toUpperCase();

    // Filter: must have a venue indicator or known pattern
    var descUpper = descRaw.toUpperCase();
    if (descUpper.indexOf('B3') < 0 && descUpper.indexOf('BOVESPA') < 0 &&
        descUpper.indexOf('VISTA') < 0 && descUpper.indexOf('OPCAO') < 0 &&
        descUpper.indexOf('FRACION') < 0 && descUpper.indexOf('EXERCICIO') < 0 &&
        descUpper.indexOf('LISTADO') < 0) {
      // Not a trade line (could be a summary line that matches the regex)
      // Additional check: if value looks like a valid trade
      var testQty = parseInt(qtyStr.replace(/\./g, ''), 10);
      var testPreco = parseBRNumber(precoStr);
      var testValor = parseBRNumber(valorStr);
      if (testQty <= 0 || testPreco <= 0 || testValor <= 0) continue;
      // If qty*price ~= value (within 5%), it's probably a trade
      var expectedVal = testQty * testPreco;
      if (Math.abs(expectedVal - testValor) / testValor > 0.05) continue;
    }

    // Parse qty (remove thousands dots)
    var qty = parseInt(qtyStr.replace(/\./g, ''), 10);
    if (isNaN(qty) || qty <= 0) continue;

    var preco = parseBRNumber(precoStr);
    var valor = parseBRNumber(valorStr);
    if (preco <= 0 || valor <= 0) continue;

    // Parse description
    var desc = parseTradeDescription(descRaw);
    var tickerRaw = extractNotaTicker(desc.specText);

    trades.push({
      descRaw: descRaw,
      desc: desc,
      tickerRaw: tickerRaw,
      qty: qty,
      preco: preco,
      valor: valor,
      dc: dc, // D=debito(comprou), C=credito(vendeu)
    });
  }

  return trades;
}

// ── Parse costs from nota text ──
function parseNotaCosts(text) {
  var costs = {
    liquidacao: 0,
    registro: 0,
    emolumentos: 0,
    clearing: 0,
    iss: 0,
    irrf: 0,
    total: 0,
  };

  // Taxa de liquidacao
  var liqMatch = /Taxa\s+de\s+liquida[cç][aã]o\s+([\d.,]+)/i.exec(text);
  if (liqMatch) costs.liquidacao = parseBRNumber(liqMatch[1]);

  // Taxa de Registro
  var regMatch = /Taxa\s+de\s+Registro[^\d]*([\d.,]+)/i.exec(text);
  if (regMatch) costs.registro = parseBRNumber(regMatch[1]);

  // Emolumentos
  var emoMatch = /Emolumentos\s+([\d.,]+)/i.exec(text);
  if (emoMatch) costs.emolumentos = parseBRNumber(emoMatch[1]);

  // Outras Bovespa (clearing)
  var clearMatch = /Outras\s+Bovespa\s+([\d.,]+)/i.exec(text);
  if (clearMatch) costs.clearing = parseBRNumber(clearMatch[1]);

  // ISS (can appear multiple times)
  var issRegex = /ISS\s*[\(\)SÃO PAULO]?\s*([\d.,]+)/gi;
  var issMatch;
  while ((issMatch = issRegex.exec(text)) !== null) {
    costs.iss = costs.iss + parseBRNumber(issMatch[1]);
  }

  // IRRF Projecao
  var irrfMatch = /IRRF\s+Proje[cç][aã]o\s+([\d.,]+)/i.exec(text);
  if (irrfMatch) costs.irrf = parseBRNumber(irrfMatch[1]);

  // Total Custos / Despesas — try to extract from "Total Custos / Despesas" line
  var totalMatch = /Total\s+(?:Custos|CBLC|despesas)[^\d]*([\d.,]+)/i.exec(text);
  if (totalMatch) {
    costs.total = parseBRNumber(totalMatch[1]);
  } else {
    costs.total = costs.liquidacao + costs.registro + costs.emolumentos + costs.clearing + costs.iss;
  }

  return costs;
}

// ── Main nota parser: orchestrator ──
function parseNotaCorretagem(text) {
  if (!text) return [];

  var header = parseNotaHeader(text);
  var rawTrades = parseNotaTrades(text);
  var costs = parseNotaCosts(text);

  if (rawTrades.length === 0) return [];

  // Sum of all trade values for pro-rata cost distribution
  var somaValores = 0;
  for (var s = 0; s < rawTrades.length; s++) {
    somaValores = somaValores + rawTrades[s].valor;
  }

  var ops = [];
  for (var i = 0; i < rawTrades.length; i++) {
    var trade = rawTrades[i];
    var desc = trade.desc;
    var tickerRaw = trade.tickerRaw;

    // Pro-rata costs
    var custoProRata = 0;
    if (somaValores > 0 && costs.total > 0) {
      custoProRata = Math.round((trade.valor / somaValores) * costs.total * 100) / 100;
    }

    // Determine compra/venda from description C/V (primary), D/C as fallback
    var isCompra = false;
    if (desc.compraVenda === 'C') {
      isCompra = true;
    } else if (desc.compraVenda === 'V') {
      isCompra = false;
    } else {
      // Fallback to D/C: D=debito=compra, C=credito=venda
      isCompra = trade.dc === 'D';
    }

    // ── Futuro / Termo → skip
    if (desc.mercadoTipo === 'futuro' || desc.mercadoTipo === 'termo') {
      ops.push({
        ticker: tickerRaw,
        tipo: isCompra ? 'compra' : 'venda',
        quantidade: trade.qty,
        preco: trade.preco,
        data: header.data,
        corretora: header.corretora,
        custos: custoProRata,
        _importType: 'skip',
        _skipReason: desc.mercadoTipo === 'futuro' ? 'Futuro não suportado' : 'Termo não suportado',
        _notaNumero: header.notaNumero,
        _raw: trade.descRaw,
      });
      continue;
    }

    // ── Opcao (call ou put)
    if (desc.mercadoTipo === 'option_call' || desc.mercadoTipo === 'option_put') {
      var optDecode = decodeOptionTicker(tickerRaw);
      var optBase = optDecode ? optDecode.ativoBase : tickerRaw.substring(0, 4);
      var optTipo = desc.mercadoTipo === 'option_call' ? 'call' : 'put';
      // Direcao: V na descricao = venda de opcao, C na descricao = compra de opcao
      var optDirecao = isCompra ? 'compra' : 'venda';

      // Strike: try spec first (PN XX,XX), then estimate from ticker
      var optStrike = extractNotaStrike(desc.specText);
      var strikeEstimated = false;
      if (optStrike === 0 && optDecode && optDecode.strikeRef) {
        optStrike = estimateStrike(optDecode.strikeRef);
        strikeEstimated = true;
      }

      // Vencimento: from prazo MM/YY → 3rd Friday
      var optVenc = '';
      if (desc.prazo) {
        var prazoParts = desc.prazo.split('/');
        if (prazoParts.length === 2) {
          var vencMonth = parseInt(prazoParts[0], 10);
          var vencYear = parseInt(prazoParts[1], 10);
          if (vencYear < 100) vencYear = 2000 + vencYear;
          if (vencMonth >= 1 && vencMonth <= 12) {
            optVenc = thirdFriday(vencYear, vencMonth - 1);
          }
        }
      }
      // Fallback: use option ticker month
      if (!optVenc && optDecode) {
        var currentYear = new Date().getFullYear();
        var monthIdx = optDecode.monthIdx; // 0-indexed
        optVenc = thirdFriday(currentYear, monthIdx);
        // If vencimento already passed, try next year
        if (optVenc < header.data) {
          optVenc = thirdFriday(currentYear + 1, monthIdx);
        }
      }

      ops.push({
        ativo_base: inferAtivoBase(optBase),
        ticker_opcao: tickerRaw,
        tipo: optTipo,
        direcao: optDirecao,
        strike: optStrike,
        premio: trade.preco,
        quantidade: trade.qty,
        vencimento: optVenc,
        data_abertura: header.data,
        status: 'ativa',
        corretora: header.corretora,
        custos: custoProRata,
        _importType: 'opcao',
        _strikeEstimated: strikeEstimated,
        _notaNumero: header.notaNumero,
        _notaCustos: custoProRata,
        _raw: trade.descRaw,
      });
      continue;
    }

    // ── Exercicio
    if (desc.mercadoTipo === 'exercicio') {
      var exDecode = decodeOptionTicker(tickerRaw);
      var exBase = exDecode ? exDecode.ativoBase : tickerRaw.substring(0, 4);
      var exTicker = inferAtivoBase(exBase);
      var exCat = detectCategory(exTicker);

      ops.push({
        ticker: exTicker,
        tipo: isCompra ? 'compra' : 'venda',
        categoria: exCat,
        quantidade: trade.qty,
        preco: trade.preco,
        custos: custoProRata,
        corretora: header.corretora,
        data: header.data,
        mercado: 'BR',
        _importType: 'exercicio',
        _tickerOpcao: tickerRaw,
        _notaNumero: header.notaNumero,
        _notaCustos: custoProRata,
        _raw: trade.descRaw,
      });
      continue;
    }

    // ── Default: operacao normal (vista / fracionario)
    var ticker = extractTicker(tickerRaw);
    if (!ticker) ticker = tickerRaw;
    var categoria = detectCategory(ticker);

    ops.push({
      ticker: ticker,
      tipo: isCompra ? 'compra' : 'venda',
      categoria: categoria,
      quantidade: trade.qty,
      preco: trade.preco,
      custos: custoProRata,
      corretora: header.corretora,
      data: header.data,
      mercado: 'BR',
      _importType: 'operacao',
      _notaNumero: header.notaNumero,
      _notaCustos: custoProRata,
      _raw: trade.descRaw,
    });
  }

  return ops;
}

// ── Exports ──
export {
  parseCSVText,
  parseB3,
  parseGeneric,
  parseCEI,
  parseBRNumber,
  parseDotNumber,
  extractTicker,
  mapCorretora,
  detectCategory,
  detectFormat,
  decodeOptionTicker,
  detectMercadoType,
  validateRow,
  findDuplicates,
  parseDateBR,
  decodeCSVBuffer,
  isNotaCorretagem,
  parseNotaCorretagem,
  CORRETORA_MAP,
};
