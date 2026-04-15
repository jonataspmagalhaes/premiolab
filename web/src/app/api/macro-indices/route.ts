// Indicadores macro: CDI, Selic meta, IPCA 12m.
// Fonte: BCB SGS (api.bcb.gov.br/dados/serie). Publico, sem auth.
// Cache 24h server-side.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 86400; // 24h

const SGS = {
  cdi: 4389,        // Taxa CDI - acumulada no mes anualizada base 252
  selicMeta: 432,   // Meta Selic - definida pelo Copom
  ipca12m: 13522,   // IPCA acumulado 12 meses
};

interface BcbPoint { data: string; valor: string; }

async function fetchSerie(code: number): Promise<{ valor: number; data: string } | null> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const arr = (await res.json()) as BcbPoint[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const last = arr[arr.length - 1];
    const v = parseFloat(String(last.valor).replace(',', '.'));
    if (isNaN(v)) return null;
    return { valor: v, data: last.data };
  } catch {
    return null;
  }
}

export async function GET() {
  const [cdi, selic, ipca] = await Promise.all([
    fetchSerie(SGS.cdi),
    fetchSerie(SGS.selicMeta),
    fetchSerie(SGS.ipca12m),
  ]);

  // Fallbacks conservadores se algum endpoint falhar
  return NextResponse.json({
    cdi: cdi ? cdi.valor : 14.65,
    cdi_data: cdi ? cdi.data : null,
    selic_meta: selic ? selic.valor : 14.75,
    selic_data: selic ? selic.data : null,
    ipca_12m: ipca ? ipca.valor : 4.14,
    ipca_data: ipca ? ipca.data : null,
    fetched_at: new Date().toISOString(),
    source: 'bcb.gov.br/sgs',
  });
}
