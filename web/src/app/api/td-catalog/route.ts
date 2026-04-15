// Catalogo Tesouro Direto — titulos atualmente ofertados + taxas.
// Fonte: CSV publico do Tesouro Transparente (tesourotransparente.gov.br),
// dataset oficial do Tesouro Nacional. Sem auth, sem rate limit.
//
// Estrategia: baixa CSV historico completo, extrai a data mais recente,
// retorna titulos com vencimento futuro.
// Cache 6h server-side (revalidate).

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 21600; // 6h

const CSV_URL = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv';

export interface TdTitulo {
  nome: string;           // "Tesouro IPCA+ 2035"
  tipo: 'tesouro_selic' | 'tesouro_ipca' | 'tesouro_pre';
  vencimento: string;     // ISO YYYY-MM-DD
  ano: number;
  taxaCompra: number;     // % a.a.
  taxaVenda: number;      // % a.a. (resgate antecipado)
  puCompra: number;       // R$
  puVenda: number;        // R$
  jurosSemestrais: boolean;
  renda: boolean;
}

function inferTipo(nome: string): TdTitulo['tipo'] {
  const lower = nome.toLowerCase();
  if (lower.includes('selic')) return 'tesouro_selic';
  if (lower.includes('ipca') || lower.includes('renda+') || lower.includes('educa+')) return 'tesouro_ipca';
  return 'tesouro_pre';
}

// DD/MM/YYYY -> YYYY-MM-DD
function parseBRDate(s: string): string {
  if (!s) return '';
  const parts = s.trim().split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  return y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0');
}

function parseNum(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function normalizeNome(tipoTitulo: string, venc: string): string {
  // "Tesouro IPCA+" + "2035" -> "Tesouro IPCA+ 2035"
  const ano = venc.substring(0, 4);
  return tipoTitulo.trim() + ' ' + ano;
}

async function fetchFromTesouroTransparente(): Promise<TdTitulo[]> {
  const res = await fetch(CSV_URL, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 PremioLab/1.0' },
  });
  if (!res.ok) throw new Error('Tesouro Transparente fetch failed: ' + res.status);
  const text = await res.text();

  // Parse CSV: header + linhas. Colunas:
  // Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // Descobre data mais recente
  let maxDataBase = '';
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(';');
    if (cols.length < 3) continue;
    const db = parseBRDate(cols[2]);
    if (db && db > maxDataBase) maxDataBase = db;
  }
  if (!maxDataBase) return [];

  // Hoje em ISO (para filtrar vencimentos futuros)
  const today = new Date().toISOString().substring(0, 10);

  // Coleta linhas do maxDataBase
  const out: TdTitulo[] = [];
  const seen: Record<string, boolean> = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(';');
    if (cols.length < 7) continue;
    const tipoTitulo = cols[0].trim();
    const venc = parseBRDate(cols[1]);
    const dataBase = parseBRDate(cols[2]);
    if (dataBase !== maxDataBase) continue;
    if (venc <= today) continue; // só futuros
    // Ignora variantes antigas (IGPM, Tesouro Indexado a DI)
    if (/igpm|di($|\s)/i.test(tipoTitulo)) continue;

    const nome = normalizeNome(tipoTitulo, venc);
    if (seen[nome]) continue;
    seen[nome] = true;

    const taxaCompra = parseNum(cols[3]);
    const taxaVenda = parseNum(cols[4]);
    const puCompra = parseNum(cols[5]);
    const puVenda = parseNum(cols[6]);
    const jurosSemestrais = /semestrais/i.test(tipoTitulo);
    const renda = /renda\+|educa\+/i.test(tipoTitulo);

    out.push({
      nome,
      tipo: inferTipo(tipoTitulo),
      vencimento: venc,
      ano: parseInt(venc.substring(0, 4), 10) || 0,
      taxaCompra,
      taxaVenda,
      puVenda,
      puCompra,
      jurosSemestrais,
      renda,
    });
  }

  out.sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
  return out;
}

export async function GET() {
  try {
    const titulos = await fetchFromTesouroTransparente();
    return NextResponse.json({
      titulos,
      source: 'tesourotransparente.gov.br',
      fetched_at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { titulos: [], error: e?.message || 'fetch failed' },
      { status: 502 },
    );
  }
}
