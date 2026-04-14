# Renda + Posicoes por Corretora — Web

Data: 2026-04-14
Escopo: web (`/web`), Next.js + Tailwind + Recharts
Escopo escolhido: **C** (MVP + sub-tab Resumo na Renda)

## Problema

Web hoje nao tem visao agregada de proventos nem permite ver posicoes agrupadas por corretora — duas necessidades ja cobertas no app mobile que perderam paridade.

## Solucao

1. **Carteira / Ativos** ganha toggle de agrupamento (`Lista` / `Por Corretora` / `Por Classe`).
2. **Top nav** ganha rota nova `/app/renda` com 2 sub-tabs (`Resumo` e `Proventos`).
3. **Data layer** estende `usePositions` pra carregar `corretora` por operacao e agregar `por_corretora`. Proventos ganham `corretora_inferida` calculada client-side.

## Arquitetura

### Data layer

`Position` interface (em `web/src/store/index.ts`):

```ts
export interface PorCorretora {
  corretora: string;
  quantidade: number;
  pm: number;
  valor_mercado?: number;
  pl?: number;
  pl_pct?: number;
}

export interface Position {
  // ... campos atuais ...
  por_corretora?: PorCorretora[];
}
```

`usePositions` (`web/src/lib/queries.ts`):
- SELECT inclui `corretora`
- Mantem agregacao atual (PM consolidado), e em paralelo monta um `byCorretora: Record<string, {qty, pm}>` por position
- Apos enriquecer com precos: mesmo enrich aplica nos sub-buckets `por_corretora` (preco_atual unico, mas valor_mercado/pl espelham qty da corretora)

Inferencia de corretora pro provento:
- Helper puro `inferCorretoraProvento(ticker, dataPagamento, operacoes): string | null`
- Cruza operacoes ate a data: corretora com maior `quantidade` liquida (compras - vendas) detinha o ticker
- Empate ou sem dado: retorna `null` → UI mostra "—"
- Calculado em `useMemo` na pagina Renda; sem alteracao no schema do Supabase

### UI

#### Carteira / Ativos — toggle de agrupamento

Acima da `<table>` atual, fileira de chips:
```
Agrupar por: [● Lista] [○ Por Corretora] [○ Por Classe]
```

Estado local `agrupamento: 'lista' | 'corretora' | 'classe'`, default `'lista'`.

- **Lista**: mantem render atual (sem mudanca)
- **Por Corretora**: itera `Object.keys(byCorretora)` ordenado por valor desc; cada corretora gera um header sticky-row com nome + totais (qty, valor, P&L) + chevron colapsavel; abaixo as linhas dos ativos limitadas aquela corretora
- **Por Classe**: mesmo padrao, agrupando por `categoria`

Header de grupo usa `linear-card` com bg `white/[0.03]`.

#### Renda → estrutura

Rota: `web/src/app/(app)/app/renda/page.tsx`

Sub-tabs em chips no topo:
```
[● Resumo] [○ Proventos]
```

Estado `subtab: 'resumo' | 'proventos'`, default `'resumo'`.

#### Renda / Resumo

Grid 12 cols:

- **col-span-12 lg:col-span-8** — Hero "Renda mensal (12m)": `Recharts BarChart` mes-a-mes, linha tracejada com a media, cores `accent` (laranja). Tooltip com breakdown por tipo.
- **col-span-12 lg:col-span-4** — KPI bar vertical (4 cards):
  - Total 12m
  - Media mensal
  - Proximos 30d (estimativa)
  - DY medio carteira (% a.a. = total 12m / patrimonio)
- **col-span-12 lg:col-span-6** — Proximos pagamentos (top 5): `TickerLogo` + ticker + tipo + data + valor estimado. Estima usando ultimo provento × qty atual.
- **col-span-12 lg:col-span-6** — Projecao 12m: linha de barras tracejadas usando media historica × posicao atual por ticker.

#### Renda / Proventos

- Filtro periodo (chips): `Mes atual | Anterior | 3m | 12m | Ano | Tudo` — default `Mes atual`
- Card "Total do periodo" em destaque (R$ XXX,XX · NN proventos)
- Toggle agrupamento (chips): `Por data | Por ticker | Por corretora` — default `Por data`
- Lista renderizada conforme agrupamento:
  - **Por data**: cronologico desc, headers de mes
  - **Por ticker**: `TickerLogo` + ticker + total recebido + N proventos; clique expande linhas
  - **Por corretora**: header com nome corretora + total; linhas dos proventos dela
- Cada linha: `TickerLogo` (sm) + ticker + tipo (`Dividendo/JCP/Rendimento`) + corretora (texto pequeno) + valor (mono) + data

### Top nav

`AppTopNav` ganha entry "Renda" entre "Carteira" e o que vier depois. Icone Lucide `TrendingUp` ou `Wallet`.

## Edge cases

- Posicao zerada que ja recebeu proventos historicos aparece em Proventos (filtra por data, nao por posicao atual)
- Ticker sem operacao previa ao provento (raro, indica dado sujo): inferencia retorna null, UI mostra "—"
- Posicao multi-corretora sem registro de corretora (legado): bucketada como "Sem corretora"
- Periodo "Mes atual" sem proventos: empty state com mensagem amigavel
- Patrimonio zero: DY mostra "—" (evita divisao por zero)

## Fora de escopo

- Sub-tab Relatorios (IR, export CSV) — sessao separada
- Edicao/adicao de proventos no web
- Override manual de corretora pro provento
- Mudancas no schema Supabase
- Mobile RN

## Criterios de sucesso

- Toggle "Por Corretora" em Carteira mostra agrupamento correto com totais batendo com a tabela Lista
- `/app/renda` carrega sem erro, sub-tab Resumo renderiza grafico 12m com dados reais
- Sub-tab Proventos filtra por periodo e agrupa por 3 modos sem perder total
- Inferencia de corretora bate com a corretora majoritaria do ticker em pelo menos 90% dos casos com dado limpo
- Type-check limpo nos diffs novos
