// Catalogo de emissores comuns de Renda Fixa (bancos + corporativos).
// Usado em autocomplete no cadastro de RF privada.
//
// Bancos vem reutilizados do catalogo de instituicoes (filtrando tipo='banco').
// Corporativos sao curados manualmente: emissores grandes de CRI/CRA/debentures
// que aparecem com frequencia em corretoras como XP, Genial, BTG, Avenue, etc.

import { INSTITUICOES, type Instituicao } from './instituicoes';

export type EmissorTipo = 'banco' | 'empresa' | 'governo' | 'cripto';
export type EmissorPais = 'BR' | 'US' | 'INT';

export interface Emissor {
  nome: string;
  tipo: EmissorTipo;
  pais: EmissorPais;
  setor?: string;
  aliases?: string[];
}

// Empresas/corporativos brasileiros que mais emitem CRI/CRA/debenture
var CORPORATIVOS_BR: Emissor[] = [
  // Energia
  { nome: 'Eletrobras', tipo: 'empresa', pais: 'BR', setor: 'Energia' },
  { nome: 'CPFL Energia', tipo: 'empresa', pais: 'BR', setor: 'Energia', aliases: ['CPFL'] },
  { nome: 'Engie Brasil', tipo: 'empresa', pais: 'BR', setor: 'Energia' },
  { nome: 'Light', tipo: 'empresa', pais: 'BR', setor: 'Energia' },
  { nome: 'Cemig', tipo: 'empresa', pais: 'BR', setor: 'Energia' },
  { nome: 'Copel', tipo: 'empresa', pais: 'BR', setor: 'Energia' },
  { nome: 'Equatorial Energia', tipo: 'empresa', pais: 'BR', setor: 'Energia', aliases: ['Equatorial'] },
  { nome: 'Energisa', tipo: 'empresa', pais: 'BR', setor: 'Energia' },
  { nome: 'Neoenergia', tipo: 'empresa', pais: 'BR', setor: 'Energia' },
  { nome: 'EDP Brasil', tipo: 'empresa', pais: 'BR', setor: 'Energia' },
  { nome: 'AES Brasil', tipo: 'empresa', pais: 'BR', setor: 'Energia' },
  { nome: 'Auren Energia', tipo: 'empresa', pais: 'BR', setor: 'Energia', aliases: ['Auren'] },
  { nome: 'Omega Energia', tipo: 'empresa', pais: 'BR', setor: 'Energia' },

  // Saneamento
  { nome: 'Sabesp', tipo: 'empresa', pais: 'BR', setor: 'Saneamento' },
  { nome: 'Copasa', tipo: 'empresa', pais: 'BR', setor: 'Saneamento' },
  { nome: 'Sanepar', tipo: 'empresa', pais: 'BR', setor: 'Saneamento' },
  { nome: 'Aegea Saneamento', tipo: 'empresa', pais: 'BR', setor: 'Saneamento', aliases: ['Aegea'] },

  // Petroleo & Gas
  { nome: 'Petrobras', tipo: 'empresa', pais: 'BR', setor: 'Petróleo & Gás' },
  { nome: 'Comgás', tipo: 'empresa', pais: 'BR', setor: 'Petróleo & Gás' },
  { nome: 'Cosan', tipo: 'empresa', pais: 'BR', setor: 'Petróleo & Gás' },
  { nome: 'Raízen', tipo: 'empresa', pais: 'BR', setor: 'Petróleo & Gás' },
  { nome: 'Ultrapar', tipo: 'empresa', pais: 'BR', setor: 'Petróleo & Gás' },
  { nome: 'Vibra Energia', tipo: 'empresa', pais: 'BR', setor: 'Petróleo & Gás', aliases: ['Vibra', 'BR Distribuidora'] },

  // Mineração
  { nome: 'Vale', tipo: 'empresa', pais: 'BR', setor: 'Mineração' },
  { nome: 'CSN', tipo: 'empresa', pais: 'BR', setor: 'Mineração' },
  { nome: 'Gerdau', tipo: 'empresa', pais: 'BR', setor: 'Siderurgia' },
  { nome: 'Usiminas', tipo: 'empresa', pais: 'BR', setor: 'Siderurgia' },

  // Papel/Celulose
  { nome: 'Suzano', tipo: 'empresa', pais: 'BR', setor: 'Papel & Celulose' },
  { nome: 'Klabin', tipo: 'empresa', pais: 'BR', setor: 'Papel & Celulose' },
  { nome: 'Irani', tipo: 'empresa', pais: 'BR', setor: 'Papel & Celulose' },

  // Construção & Imobiliário
  { nome: 'MRV Engenharia', tipo: 'empresa', pais: 'BR', setor: 'Construção', aliases: ['MRV'] },
  { nome: 'Cyrela', tipo: 'empresa', pais: 'BR', setor: 'Construção' },
  { nome: 'Even Construtora', tipo: 'empresa', pais: 'BR', setor: 'Construção', aliases: ['Even'] },
  { nome: 'Direcional', tipo: 'empresa', pais: 'BR', setor: 'Construção' },
  { nome: 'Tenda', tipo: 'empresa', pais: 'BR', setor: 'Construção' },
  { nome: 'JHSF', tipo: 'empresa', pais: 'BR', setor: 'Construção' },
  { nome: 'Multiplan', tipo: 'empresa', pais: 'BR', setor: 'Shoppings' },
  { nome: 'Iguatemi', tipo: 'empresa', pais: 'BR', setor: 'Shoppings' },
  { nome: 'BR Malls', tipo: 'empresa', pais: 'BR', setor: 'Shoppings' },

  // Agronegócio (CRA)
  { nome: 'JBS', tipo: 'empresa', pais: 'BR', setor: 'Agronegócio' },
  { nome: 'BRF', tipo: 'empresa', pais: 'BR', setor: 'Agronegócio' },
  { nome: 'Marfrig', tipo: 'empresa', pais: 'BR', setor: 'Agronegócio' },
  { nome: 'Minerva Foods', tipo: 'empresa', pais: 'BR', setor: 'Agronegócio', aliases: ['Minerva'] },
  { nome: 'SLC Agrícola', tipo: 'empresa', pais: 'BR', setor: 'Agronegócio' },
  { nome: 'BrasilAgro', tipo: 'empresa', pais: 'BR', setor: 'Agronegócio' },
  { nome: 'Camil', tipo: 'empresa', pais: 'BR', setor: 'Alimentos' },
  { nome: 'M. Dias Branco', tipo: 'empresa', pais: 'BR', setor: 'Alimentos' },
  { nome: 'São Martinho', tipo: 'empresa', pais: 'BR', setor: 'Sucroenergético' },
  { nome: 'Adecoagro', tipo: 'empresa', pais: 'BR', setor: 'Agronegócio' },

  // Telecom & Tech
  { nome: 'Telefônica Brasil (Vivo)', tipo: 'empresa', pais: 'BR', setor: 'Telecom', aliases: ['Vivo', 'Telefônica'] },
  { nome: 'TIM Brasil', tipo: 'empresa', pais: 'BR', setor: 'Telecom', aliases: ['TIM'] },
  { nome: 'Oi', tipo: 'empresa', pais: 'BR', setor: 'Telecom' },
  { nome: 'Algar Telecom', tipo: 'empresa', pais: 'BR', setor: 'Telecom' },

  // Saude
  { nome: 'Hapvida', tipo: 'empresa', pais: 'BR', setor: 'Saúde' },
  { nome: 'Rede D\'Or', tipo: 'empresa', pais: 'BR', setor: 'Saúde' },
  { nome: 'Fleury', tipo: 'empresa', pais: 'BR', setor: 'Saúde' },
  { nome: 'Dasa', tipo: 'empresa', pais: 'BR', setor: 'Saúde' },
  { nome: 'Hypera Pharma', tipo: 'empresa', pais: 'BR', setor: 'Saúde', aliases: ['Hypera'] },

  // Varejo
  { nome: 'Magazine Luiza', tipo: 'empresa', pais: 'BR', setor: 'Varejo', aliases: ['Magalu'] },
  { nome: 'Lojas Renner', tipo: 'empresa', pais: 'BR', setor: 'Varejo', aliases: ['Renner'] },
  { nome: 'Via Varejo', tipo: 'empresa', pais: 'BR', setor: 'Varejo', aliases: ['Via', 'Casas Bahia'] },
  { nome: 'Pão de Açúcar (GPA)', tipo: 'empresa', pais: 'BR', setor: 'Varejo', aliases: ['GPA'] },
  { nome: 'Carrefour Brasil', tipo: 'empresa', pais: 'BR', setor: 'Varejo' },
  { nome: 'Assaí', tipo: 'empresa', pais: 'BR', setor: 'Varejo' },
  { nome: 'Americanas', tipo: 'empresa', pais: 'BR', setor: 'Varejo' },
  { nome: 'Mercado Livre', tipo: 'empresa', pais: 'BR', setor: 'Varejo' },

  // Logistica/Concessoes
  { nome: 'Rumo Logística', tipo: 'empresa', pais: 'BR', setor: 'Logística', aliases: ['Rumo'] },
  { nome: 'CCR', tipo: 'empresa', pais: 'BR', setor: 'Concessões' },
  { nome: 'EcoRodovias', tipo: 'empresa', pais: 'BR', setor: 'Concessões' },
  { nome: 'Movida', tipo: 'empresa', pais: 'BR', setor: 'Logística' },
  { nome: 'Localiza', tipo: 'empresa', pais: 'BR', setor: 'Locação' },
  { nome: 'Vamos', tipo: 'empresa', pais: 'BR', setor: 'Logística' },
  { nome: 'Simpar', tipo: 'empresa', pais: 'BR', setor: 'Logística' },
  { nome: 'JSL', tipo: 'empresa', pais: 'BR', setor: 'Logística' },

  // Educação
  { nome: 'Ânima Educação', tipo: 'empresa', pais: 'BR', setor: 'Educação', aliases: ['Anima'] },
  { nome: 'Cogna', tipo: 'empresa', pais: 'BR', setor: 'Educação' },
  { nome: 'Yduqs', tipo: 'empresa', pais: 'BR', setor: 'Educação' },
];

// Governo (Tesouro Nacional, estados, etc — pra debentures publicas)
var GOVERNO_BR: Emissor[] = [
  { nome: 'Tesouro Nacional', tipo: 'governo', pais: 'BR', setor: 'União' },
];

// Concatena: bancos do catalogo + corporativos curados + governo
function bancosFromInstituicoes(): Emissor[] {
  var out: Emissor[] = [];
  for (var i = 0; i < INSTITUICOES.length; i++) {
    var inst: Instituicao = INSTITUICOES[i];
    if (inst.tipo !== 'banco') continue;
    out.push({
      nome: inst.nome,
      tipo: 'banco',
      pais: inst.pais,
      aliases: inst.aliases,
    });
  }
  return out;
}

export var EMISSORES: Emissor[] = (function () {
  return GOVERNO_BR.concat(bancosFromInstituicoes()).concat(CORPORATIVOS_BR);
})();

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function searchEmissores(query: string, limit: number = 8): Emissor[] {
  var q = normalize(query);
  if (!q) return EMISSORES.slice(0, limit);

  var scored: Array<{ e: Emissor; score: number }> = [];
  for (var i = 0; i < EMISSORES.length; i++) {
    var e = EMISSORES[i];
    var nomeN = normalize(e.nome);
    var score = -1;

    if (nomeN === q) score = 100;
    else if (nomeN.startsWith(q)) score = 80;
    else if (nomeN.indexOf(q) >= 0) score = 50;

    if (e.aliases) {
      for (var j = 0; j < e.aliases.length; j++) {
        var aliasN = normalize(e.aliases[j]);
        if (aliasN === q) score = Math.max(score, 90);
        else if (aliasN.startsWith(q)) score = Math.max(score, 70);
        else if (aliasN.indexOf(q) >= 0) score = Math.max(score, 40);
      }
    }

    if (score >= 0) scored.push({ e: e, score: score });
  }

  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, limit).map(function (x) { return x.e; });
}

export function canonicalEmissor(input: string): string {
  var n = normalize(input);
  if (!n) return '';
  for (var i = 0; i < EMISSORES.length; i++) {
    var e = EMISSORES[i];
    if (normalize(e.nome) === n) return e.nome;
    if (e.aliases) {
      for (var j = 0; j < e.aliases.length; j++) {
        if (normalize(e.aliases[j]) === n) return e.nome;
      }
    }
  }
  return input.trim().replace(/\s+/g, ' ');
}

export function tipoEmissorLabel(t: EmissorTipo): string {
  if (t === 'banco') return 'Banco';
  if (t === 'governo') return 'Governo';
  if (t === 'cripto') return 'Cripto';
  return 'Empresa';
}
