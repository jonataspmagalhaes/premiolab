# PremioLab Web — Blueprint Completo

## Visao

App web de investimentos BR focado em **geracao de renda passiva**. Web = produto principal (analise, estrategias, simuladores). Mobile = companion (tracking, push, widgets).

URL: `premiolab.com.br/app` (Next.js, deploy Vercel)
Backend: mesmo Supabase (zero migracao)

---

## Erros do Mobile a Evitar

| Erro | Causa | Solucao Web |
|------|-------|-------------|
| Ilhas isoladas | Features adicionadas sem pensar em conexoes | **Fluxos primeiro, telas depois** |
| Dados recalculados em cada tela | Sem store central derivado | **Um unico store com dados derivados** |
| Bugs de integracao | Sem TypeScript, sem testes | **TypeScript estrito + testes de fluxo** |
| Codigo verboso (var, function) | Regras de codigo legadas | **ES6+ (const, arrow, destructuring)** |
| Features genericas | Dados hardcoded em vez de reais | **Tudo conectado ao store real** |

---

## Stack

| Camada | Tecnologia | Motivo |
|--------|-----------|--------|
| Framework | **Next.js 15 (App Router)** | SSR, rotas, API routes, deploy Vercel |
| Linguagem | **TypeScript estrito** | Contratos entre modulos, previne bugs |
| State | **Zustand** | Leve, sem boilerplate, computed slices |
| Data Fetching | **React Query (TanStack)** | Cache, refetch, stale-while-revalidate |
| UI | **Tailwind CSS + shadcn/ui** | Responsivo nativo, componentes prontos |
| Charts | **Recharts** | Interativos, responsivos, tooltips ricos |
| Auth | **Supabase Auth (SSR)** | Mesmo backend do mobile |
| Payments | **Stripe** (ou Hotmart) | Sem taxa de app store |
| Deploy | **Vercel** | Preview deploys, edge functions |

---

## Arquitetura: Store Central Unico

### Principio: UMA fonte de verdade, TUDO derivado

```
Supabase (fonte)
    |
    v
React Query (cache + fetch)
    |
    v
Zustand Store (dados brutos)
    |
    v
Computed Slices (dados derivados)
    |
    +---> patrimonioSlice (total, por classe, por ticker)
    +---> rendaSlice (atual, forecast, por fonte, sazonalidade)
    +---> gapSlice (fii deficit, caixa ociosa, acoes sem CC)
    +---> scoringSlice (score por ticker, DY, regularidade)
    +---> rebalanceSlice (atual vs ideal, gaps por classe)
    +---> riscoSlice (concentracao, cut risk, volatilidade)
    +---> projecaoSlice (12m renda, patrimonio, FIRE)
    |
    v
Telas consomem slices (NUNCA calculam)
```

### Dados Brutos (fetch uma vez, cache React Query)

```typescript
type RawData = {
  positions: Position[]       // operacoes agregadas + preco_atual
  proventos: Provento[]       // historico de dividendos
  opcoes: Opcao[]             // posicoes ativas + historico
  rf: RendaFixa[]             // renda fixa
  saldos: Saldo[]             // saldos por corretora
  movimentacoes: Mov[]        // fluxo de caixa
  cartoes: Cartao[]           // cartoes de credito
  portfolios: Portfolio[]     // multi-portfolio
  profile: Profile            // perfil + config
  snapshots: Snapshot[]       // historico patrimonio
  indicators: Indicator[]     // HV, RSI, SMA etc
  rebalanceTargets: Targets   // metas de alocacao
}
```

### Dados Derivados (computed, reagindo a mudancas)

```typescript
// patrimonioSlice
patrimonio.total           // sum(positions * preco) + rf + saldos
patrimonio.porClasse       // { fii: R$X, acao: R$Y, etf: R$Z, rf: R$W, caixa: R$V }
patrimonio.porTicker       // { PETR4: R$X, KNRI11: R$Y, ... }
patrimonio.history         // snapshots + ponto de hoje

// rendaSlice
renda.atual                // media 3 meses completos
renda.porFonte             // { dividendos, premios, rf, opcoes }
renda.porTicker            // { PETR4: R$X/mes, KNRI11: R$Y/mes }
renda.sazonalidade         // [12 meses] com mediana, fracos, fortes
renda.tendencia            // crescendo/estavel/caindo + %
renda.forecast12m          // projecao meses futuros

// gapSlice (CENTRAL — alimenta Gerador, Piloto, Roadmap)
gaps.fiiDeficit            // R$ que falta em FII vs ideal
gaps.acaoDeficit           // R$ que falta em acoes vs ideal
gaps.caixaOciosa           // R$ parado sem render
gaps.acoesSemCC            // acoes com lote completo sem covered call
gaps.rfBaixa               // RF rendendo menos que CDI
gaps.mesesFracos           // meses com renda < mediana * 0.6
gaps.subperformando        // tickers com DY abaixo do ideal

// scoringSlice
scoring.porTicker          // score 0-100, regularidade, consistencia, tendencia
scoring.cutRisks           // tickers com risco de corte de dividendos
scoring.mesesPagamento     // quais meses cada ticker paga

// rebalanceSlice
rebalance.atual            // composicao atual { fii: 30%, acao: 40%, rf: 20%, caixa: 10% }
rebalance.ideal            // composicao ideal (perfil selecionado)
rebalance.gapPorClasse     // diferenca atual-ideal em R$ e %
rebalance.sugestoes        // "compre +R$X de FII, venda R$Y de acao"

// riscoSlice
risco.concentracao         // top 3 tickers % da renda
risco.tickersPra80         // quantos tickers pra cobrir 80% renda
risco.nivel                // alto/medio/baixo
risco.impactoCorte         // "se PETR4 cortar, perde R$X/mes"

// projecaoSlice
projecao.renda12m          // renda mensal projetada por mes
projecao.patrimonio12m     // patrimonio projetado com aportes
projecao.fireMilestones    // marcos de independencia financeira
projecao.snowball          // efeito composto do reinvestimento
```

---

## Fluxos Integrados (nao telas)

### Fluxo 1: "Quero aumentar minha renda mensal"

```
Dashboard (mostra renda atual R$X/mes)
    |
    v
Gerador de Renda (meta R$Y, gap R$Z)
    |
    +---> gapSlice.fiiDeficit > 0?
    |         |
    |         v
    |     Sugestoes FII concretas (StatusInvest: DY, P/VP, liquidez)
    |         |
    |         v
    |     "Simular" → Simulador FII (pre-selecionado)
    |
    +---> gapSlice.acoesSemCC > 0?
    |         |
    |         v
    |     Covered Calls sugeridas (OpLab chain real)
    |         |
    |         v
    |     "Montar" → Opcoes (calc/simulador com ticker pre-selecionado)
    |
    +---> gapSlice.caixaOciosa > 0?
    |         |
    |         v
    |     "Alocar R$X em RF/FII" → link direto
    |
    v
Piloto Automatico (reinvestir dividendos recebidos)
    |
    +---> Usa gapSlice pra priorizar FIIs se deficit
    +---> Usa scoringSlice pra ranquear candidatos
    +---> Usa renda.mesesFracos pra cobrir gaps sazonais
    |
    v
Roadmap: passos 1-2-3 concretos com impacto em R$/mes
```

### Fluxo 2: "Minha carteira esta equilibrada?"

```
Dashboard (composicao atual)
    |
    v
Raio-X da Renda
    +---> riscoSlice.concentracao (top 3 = X%)
    +---> riscoSlice.impactoCorte por ticker
    +---> renda.sazonalidade (meses fracos)
    +---> gaps.subperformando (DY abaixo do ideal)
    |
    v
Rebalanceamento (Carteira > Analise)
    +---> rebalanceSlice.atual vs ideal
    +---> Sugestoes: "compre +R$X de FII, reduza acao"
    +---> Integrado com gapSlice (mesmos gaps)
    |
    v
Acao: links diretos pra AddOperacao/SimuladorFII
```

### Fluxo 3: "Quero operar opcoes pra gerar renda"

```
Opcoes Hub
    |
    +---> Grade OpLab (chain real, gregas, IV)
    |
    +---> Covered Calls sugeridas
    |         +---> Usa positions do store (acoes com lote >= 100)
    |         +---> Usa gapSlice.acoesSemCC
    |         +---> Mostra premio estimado + impacto na renda
    |
    +---> Radar de Oportunidades
    |         +---> 10 detectores
    |         +---> Tickers da carteira + watchlist
    |         +---> Resultado alimenta scoring pra IA
    |
    +---> IA Analysis (Claude)
    |         +---> Recebe: position + chain + technicals + fundamentals
    |         +---> Retorna: analise + recomendacao
    |
    +---> Simulador Multi-leg (6 presets)
    |
    v
Resultado → impacto na rendaSlice (premios/mes)
```

### Fluxo 4: "Quanto falta pra minha independencia financeira?"

```
FIRE Milestones
    +---> renda.atual vs profile.meta_mensal
    +---> projecaoSlice.fireMilestones (marcos)
    +---> Snowball effect (compounding)
    |
    v
Conecta com Gerador de Renda (como acelerar)
    +---> Piloto Automatico (reinvestir dividendos)
    +---> Covered Calls (gerar premios extras)
    +---> Aportes (roadmap pra meta)
```

### Fluxo 5: "Gestao do dia a dia"

```
Dashboard rapido (mobile-friendly)
    |
    +---> Gasto Rapido (1 toque)
    +---> Saldo contas
    +---> Fatura do cartao
    +---> Recorrentes pendentes
    +---> Alertas (vencimentos, precos)
    |
    v
Tudo atualiza movimentacoes → saldos → patrimonioSlice
```

---

## Rotas Web (Responsivas)

```
/                          → Landing (premiolab.com.br)
/app                       → Dashboard principal (renda + patrimonio)
/app/carteira              → Positions + Treemap + Donut
/app/carteira/[ticker]     → Asset Detail
/app/carteira/adicionar    → Add Operacao
/app/carteira/importar     → Import CSV
/app/opcoes                → Opcoes Hub (chain, calc, radar)
/app/opcoes/simulador      → Multi-leg simulator
/app/estrategias           → Estrategias Hub
/app/estrategias/gerador   → Gerador de Renda (integrado)
/app/estrategias/simulador-fii → Simulador FII
/app/analise               → Performance + Rebalance + Indicadores
/app/analise/comparar      → Comparativo 3 tickers
/app/renda-fixa            → RF positions
/app/financeiro            → Caixa + Orcamentos + Recorrentes
/app/financeiro/extrato    → Transaction log
/app/financeiro/fatura     → Credit card invoice
/app/relatorios            → IR + Dividendos + Operacoes
/app/config                → Profile + Alertas + Portfolios + Backup
/app/assinatura            → Paywall/Pricing
```

---

## Responsividade

### Desktop (>= 1200px)
```
+--sidebar--+--------main---------+---panel---+
| Logo       | Dashboard content   | Quick     |
| Nav links  | Charts (Recharts)   | Actions   |
| Portfolio  | Tables + Cards      | Alerts    |
| selector   |                     | Renda     |
+------------+---------------------+-----------+
```

### Tablet (768-1199px)
```
+--sidebar(colapsavel)--+--------main---------+
| Icons only             | 2-col grid          |
| Toggle expand          | Charts adaptados    |
+------------------------+---------------------+
```

### Mobile (< 768px)
```
+----------main-----------+
| Header + hamburger      |
| Cards full-width        |
| Charts empilhados       |
| Bottom nav (5 tabs)     |
+-------------------------+
```

Implementacao: Tailwind breakpoints (`sm:`, `md:`, `lg:`, `xl:`)
Layout: CSS Grid + Flexbox
Componentes: shadcn/ui (ja responsivos)

---

## Fases de Implementacao

### Fase W0: Fundacao (1 sessao)
- Next.js 15 + TypeScript + Tailwind + shadcn/ui
- Supabase client (SSR + client)
- Auth flow (login/signup/recuperar)
- Layout responsivo (sidebar + main + panel)
- Zustand store base + React Query setup
- Deploy Vercel com dominio premiolab.com.br/app

### Fase W1: Store Central + Dashboard (2 sessoes)
- Fetch todos dados brutos via React Query
- Computed slices: patrimonio, renda, gaps
- Dashboard: patrimonio hero + renda KPIs + chart Recharts
- Composicao por classe (donut interativo)
- Renda do mes (breakdown por fonte)

### Fase W2: Carteira Completa (2 sessoes)
- Lista positions com precos reais (brapi + Yahoo)
- Treemap heatmap interativo
- Asset Detail (fundamentals + chart + operacoes)
- Add/Edit Operacao
- Import CSV (5 formatos)
- Sort/filter/search

### Fase W3: Estrategias Integradas (2 sessoes)
- Gerador de Renda (dados reais + FIIs concretos)
- Piloto Automatico (conectado ao gapSlice)
- Raio-X da Renda (sazonalidade, concentracao, riscos)
- Simulador FII (StatusInvest, integrado com Gerador)
- FIRE Milestones + Snowball
- Tudo conectado via gapSlice central

### Fase W4: Opcoes (2 sessoes)
- Grade OpLab (chain, gregas, IV)
- Calculadora BS + Multi-leg (6 presets)
- Covered Calls (conectado com positions + gaps)
- Radar de Oportunidades (10 detectores)
- IA Streaming (Claude, SSE)
- Alertas de opcoes

### Fase W5: Analise + Rebalanceamento (1 sessao)
- Performance vs CDI/IBOV (Recharts interativo)
- Rebalanceamento hierarquico (conectado com gapSlice)
- 14 indicadores tecnicos
- Comparativo 3 tickers

### Fase W6: Financeiro (1 sessao)
- Caixa (saldos multi-corretora)
- Extrato (movimentacoes paginadas)
- Orcamentos (14 grupos)
- Recorrentes (auto-process)
- Cartoes + Faturas
- Gastos rapidos

### Fase W7: Renda Fixa + Proventos (1 sessao)
- Lista RF + Add/Edit
- Proventos (historico, sync, calendario)
- Relatorios (dividendos, IR, opcoes, operacoes)
- Export CSV/PDF

### Fase W8: Polish + Assinaturas (1 sessao)
- Paywall (Stripe/Hotmart)
- Onboarding flow
- Notificacoes (web push via service worker)
- PWA manifest (installable)
- SEO (landing pages pra Google)
- Performance (lazy loading, code splitting)

---

## Regra de Ouro

**Antes de criar qualquer feature, responder:**

1. Que dados ela CONSOME? (deve vir de um slice existente)
2. Que dados ela PRODUZ? (deve alimentar um slice)
3. Com quais outras features ela CONECTA? (deve ter link bidirecional)
4. Qual FLUXO do usuario ela faz parte? (nao pode ser ilha)

Se nao conseguir responder as 4, a feature nao esta pronta pra ser criada.

---

## Cronograma Estimado

| Fase | Escopo | Sessoes |
|------|--------|---------|
| W0 | Fundacao + Auth + Layout | 1 |
| W1 | Store + Dashboard | 2 |
| W2 | Carteira | 2 |
| W3 | Estrategias integradas | 2 |
| W4 | Opcoes | 2 |
| W5 | Analise + Rebalance | 1 |
| W6 | Financeiro | 1 |
| W7 | RF + Proventos + Relatorios | 1 |
| W8 | Polish + Assinaturas | 1 |
| **Total** | | **~13 sessoes** |
