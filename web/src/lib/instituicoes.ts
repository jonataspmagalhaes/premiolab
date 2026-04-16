// Catalogo de instituicoes financeiras (bancos, corretoras, cripto).
// Usado no autocomplete de cadastro de conta. User pode digitar livre
// se a instituicao nao estiver na lista.
//
// Para match case-insensitive no trigger SQL, normalizamos para nome canonico.

export type InstituicaoTipo = 'corretora' | 'banco' | 'cripto';
export type InstituicaoPais = 'BR' | 'US' | 'INT';

export interface Instituicao {
  nome: string;
  tipo: InstituicaoTipo;
  pais: InstituicaoPais;
  aliases?: string[]; // variantes comuns para match
}

export var INSTITUICOES: Instituicao[] = [
  // ───── Corretoras BR ─────
  { nome: 'XP Investimentos', tipo: 'corretora', pais: 'BR', aliases: ['XP', 'Xp'] },
  { nome: 'Clear', tipo: 'corretora', pais: 'BR' },
  { nome: 'Rico', tipo: 'corretora', pais: 'BR' },
  { nome: 'BTG Pactual', tipo: 'corretora', pais: 'BR', aliases: ['BTG'] },
  { nome: 'Nuinvest', tipo: 'corretora', pais: 'BR', aliases: ['Easynvest'] },
  { nome: 'Itaú BBA', tipo: 'corretora', pais: 'BR', aliases: ['Itau BBA'] },
  { nome: 'Genial Investimentos', tipo: 'corretora', pais: 'BR', aliases: ['Genial'] },
  { nome: 'Inter Invest', tipo: 'corretora', pais: 'BR' },
  { nome: 'Ágora', tipo: 'corretora', pais: 'BR', aliases: ['Agora'] },
  { nome: 'Toro Investimentos', tipo: 'corretora', pais: 'BR', aliases: ['Toro'] },
  { nome: 'Modalmais', tipo: 'corretora', pais: 'BR' },
  { nome: 'Órama', tipo: 'corretora', pais: 'BR', aliases: ['Orama'] },
  { nome: 'Warren', tipo: 'corretora', pais: 'BR' },
  { nome: 'Avenue', tipo: 'corretora', pais: 'BR' },
  { nome: 'Nomad', tipo: 'corretora', pais: 'BR' },
  { nome: 'C6 Invest', tipo: 'corretora', pais: 'BR' },
  { nome: 'Mirae Asset', tipo: 'corretora', pais: 'BR' },
  { nome: 'Guide Investimentos', tipo: 'corretora', pais: 'BR', aliases: ['Guide'] },
  { nome: 'Terra Investimentos', tipo: 'corretora', pais: 'BR' },
  { nome: 'Necton', tipo: 'corretora', pais: 'BR' },
  { nome: 'Safra', tipo: 'corretora', pais: 'BR' },
  { nome: 'Santander Corretora', tipo: 'corretora', pais: 'BR' },

  // ───── Bancos BR ─────
  { nome: 'Nubank', tipo: 'banco', pais: 'BR', aliases: ['Nu'] },
  { nome: 'Itaú', tipo: 'banco', pais: 'BR', aliases: ['Itau'] },
  { nome: 'Bradesco', tipo: 'banco', pais: 'BR' },
  { nome: 'Santander', tipo: 'banco', pais: 'BR' },
  { nome: 'Banco do Brasil', tipo: 'banco', pais: 'BR', aliases: ['BB'] },
  { nome: 'Caixa Econômica', tipo: 'banco', pais: 'BR', aliases: ['Caixa'] },
  { nome: 'Inter', tipo: 'banco', pais: 'BR', aliases: ['Banco Inter'] },
  { nome: 'C6 Bank', tipo: 'banco', pais: 'BR', aliases: ['C6'] },
  { nome: 'BTG+', tipo: 'banco', pais: 'BR', aliases: ['BTG Plus'] },
  { nome: 'Next', tipo: 'banco', pais: 'BR' },
  { nome: 'PicPay', tipo: 'banco', pais: 'BR' },
  { nome: 'Mercado Pago', tipo: 'banco', pais: 'BR' },
  { nome: 'Will Bank', tipo: 'banco', pais: 'BR', aliases: ['Will'] },
  { nome: 'Neon', tipo: 'banco', pais: 'BR' },
  { nome: 'Banco Original', tipo: 'banco', pais: 'BR', aliases: ['Original'] },
  { nome: 'Safra', tipo: 'banco', pais: 'BR' },
  { nome: 'Sicredi', tipo: 'banco', pais: 'BR' },
  { nome: 'Sicoob', tipo: 'banco', pais: 'BR' },
  { nome: 'Banrisul', tipo: 'banco', pais: 'BR' },
  { nome: 'Votorantim (BV)', tipo: 'banco', pais: 'BR', aliases: ['BV', 'Banco Votorantim'] },
  { nome: 'Pan', tipo: 'banco', pais: 'BR', aliases: ['Banco Pan'] },
  { nome: 'Daycoval', tipo: 'banco', pais: 'BR' },
  { nome: 'ABC Brasil', tipo: 'banco', pais: 'BR' },
  { nome: 'Banco Master', tipo: 'banco', pais: 'BR' },
  { nome: 'Stone', tipo: 'banco', pais: 'BR' },

  // ───── Corretoras US / INT ─────
  { nome: 'Interactive Brokers', tipo: 'corretora', pais: 'US', aliases: ['IBKR', 'IB'] },
  { nome: 'Charles Schwab', tipo: 'corretora', pais: 'US', aliases: ['Schwab'] },
  { nome: 'Fidelity', tipo: 'corretora', pais: 'US' },
  { nome: 'Robinhood', tipo: 'corretora', pais: 'US' },
  { nome: 'TD Ameritrade', tipo: 'corretora', pais: 'US', aliases: ['TDA'] },
  { nome: 'E*TRADE', tipo: 'corretora', pais: 'US', aliases: ['ETrade', 'E-Trade'] },
  { nome: 'Vanguard', tipo: 'corretora', pais: 'US' },
  { nome: 'Merrill Edge', tipo: 'corretora', pais: 'US', aliases: ['Merrill'] },
  { nome: 'Webull', tipo: 'corretora', pais: 'US' },
  { nome: 'SoFi Invest', tipo: 'corretora', pais: 'US', aliases: ['SoFi'] },
  { nome: 'Passfolio', tipo: 'corretora', pais: 'INT' },
  { nome: 'Stake', tipo: 'corretora', pais: 'INT' },
  { nome: 'eToro', tipo: 'corretora', pais: 'INT' },
  { nome: 'Saxo Bank', tipo: 'corretora', pais: 'INT', aliases: ['Saxo'] },
  { nome: 'Degiro', tipo: 'corretora', pais: 'INT' },
  { nome: 'Trading 212', tipo: 'corretora', pais: 'INT' },
  { nome: 'Revolut', tipo: 'banco', pais: 'INT' },
  { nome: 'Wise', tipo: 'banco', pais: 'INT', aliases: ['TransferWise'] },
  { nome: 'HSBC Expat', tipo: 'banco', pais: 'INT', aliases: ['HSBC'] },

  // ───── Bancos US ─────
  { nome: 'Chase', tipo: 'banco', pais: 'US', aliases: ['JP Morgan'] },
  { nome: 'Bank of America', tipo: 'banco', pais: 'US', aliases: ['BofA', 'BoA'] },
  { nome: 'Wells Fargo', tipo: 'banco', pais: 'US' },
  { nome: 'Citibank', tipo: 'banco', pais: 'US', aliases: ['Citi'] },
  { nome: 'Capital One', tipo: 'banco', pais: 'US' },

  // ───── Cripto ─────
  { nome: 'Binance', tipo: 'cripto', pais: 'INT' },
  { nome: 'Mercado Bitcoin', tipo: 'cripto', pais: 'BR', aliases: ['MB'] },
  { nome: 'Foxbit', tipo: 'cripto', pais: 'BR' },
  { nome: 'NovaDAX', tipo: 'cripto', pais: 'BR' },
  { nome: 'Bitso', tipo: 'cripto', pais: 'BR' },
  { nome: 'Coinbase', tipo: 'cripto', pais: 'US' },
  { nome: 'Kraken', tipo: 'cripto', pais: 'US' },
  { nome: 'OKX', tipo: 'cripto', pais: 'INT' },
  { nome: 'Bybit', tipo: 'cripto', pais: 'INT' },
  { nome: 'KuCoin', tipo: 'cripto', pais: 'INT' },
  { nome: 'Crypto.com', tipo: 'cripto', pais: 'INT' },
];

// Normaliza pra comparacao: lowercase, sem acento, trim, collapse spaces.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Busca por prefixo/contains em nome + aliases. Ordena por match quality.
export function searchInstituicoes(query: string, limit: number = 8): Instituicao[] {
  var q = normalize(query);
  if (!q) return INSTITUICOES.slice(0, limit);

  var scored: Array<{ inst: Instituicao; score: number }> = [];
  for (var i = 0; i < INSTITUICOES.length; i++) {
    var inst = INSTITUICOES[i];
    var nomeN = normalize(inst.nome);
    var score = -1;

    if (nomeN === q) score = 100;
    else if (nomeN.startsWith(q)) score = 80;
    else if (nomeN.indexOf(q) >= 0) score = 50;

    if (inst.aliases) {
      for (var j = 0; j < inst.aliases.length; j++) {
        var aliasN = normalize(inst.aliases[j]);
        if (aliasN === q) score = Math.max(score, 90);
        else if (aliasN.startsWith(q)) score = Math.max(score, 70);
        else if (aliasN.indexOf(q) >= 0) score = Math.max(score, 40);
      }
    }

    if (score >= 0) scored.push({ inst: inst, score: score });
  }

  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, limit).map(function (x) { return x.inst; });
}

// Retorna nome canonico se input bate com alguma inst, senao retorna trimmed input.
export function canonicalName(input: string): string {
  var n = normalize(input);
  if (!n) return '';
  for (var i = 0; i < INSTITUICOES.length; i++) {
    var inst = INSTITUICOES[i];
    if (normalize(inst.nome) === n) return inst.nome;
    if (inst.aliases) {
      for (var j = 0; j < inst.aliases.length; j++) {
        if (normalize(inst.aliases[j]) === n) return inst.nome;
      }
    }
  }
  return input.trim().replace(/\s+/g, ' ');
}

// True se input bate com alguma instituicao curada (nome ou alias).
// Usado pra recusar cadastro de nomes desconhecidos — user deve contatar suporte.
export function isKnownInstituicao(input: string): boolean {
  var n = normalize(input);
  if (!n) return false;
  for (var i = 0; i < INSTITUICOES.length; i++) {
    var inst = INSTITUICOES[i];
    if (normalize(inst.nome) === n) return true;
    if (inst.aliases) {
      for (var j = 0; j < inst.aliases.length; j++) {
        if (normalize(inst.aliases[j]) === n) return true;
      }
    }
  }
  return false;
}

export function tipoLabel(t: InstituicaoTipo): string {
  if (t === 'corretora') return 'Corretora';
  if (t === 'banco') return 'Banco';
  return 'Cripto';
}

export function paisLabel(p: InstituicaoPais): string {
  if (p === 'BR') return '🇧🇷';
  if (p === 'US') return '🇺🇸';
  return '🌐';
}
