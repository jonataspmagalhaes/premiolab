# PREMIOLAB - Documentacao do Projeto

## Sobre o App

PremioLab e um app de investimentos focado no mercado brasileiro, construido com React Native (Expo) + Supabase. O publico-alvo sao investidores que operam opcoes (venda coberta, CSP, wheel strategy) e querem acompanhar premios, gregas, carteira de acoes/FIIs/ETFs e renda fixa em um unico lugar.

## Stack Tecnica

- **Frontend**: React Native 0.81 + Expo SDK 54
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Cotacoes**: brapi.dev API (token: tEU8wyBixv8hCi7J3NCjsi) + StatusInvest (sem token)
- **Fontes**: DM Sans (display/body), JetBrains Mono (numeros)
- **Navegacao**: React Navigation 7 (bottom tabs + stack)

## Regras de Codigo (OBRIGATORIO)

- Usar `var` (nunca const/let)
- Usar `function(){}` (nunca arrow functions)
- Sem destructuring (`var x = obj.x` em vez de `var {x} = obj`)
- Sem spread operator
- Sem optional chaining (`obj && obj.prop` em vez de `obj?.prop`)
- Sem template literals (usar concatenacao com `+`)
- useState pattern: `var _x = useState(val); var x = _x[0]; var setX = _x[1];`

## Estrutura de Pastas

```
src/
  components/      Componentes reutilizaveis (Glass, Badge, Pill, Charts, States, InteractiveChart)
  config/          Supabase client
  contexts/        AuthContext (login, session, onboarding)
  navigation/      AppNavigator (tabs + stacks)
  screens/
    analise/       Dashboard analitico + Rebalanceamento hierarquico
    auth/          Login + Onboarding
    carteira/      Portfolio (Carteira, AddOperacao, EditOperacao, AssetDetail)
    home/          Dashboard principal (donuts, grafico patrimonio, alertas)
    mais/          Menu + Configs (Meta, Corretoras, Alertas, Selic, Guia, Sobre, Historico)
    opcoes/        Opcoes (lista, add, edit, simulador BS)
    proventos/     Proventos (lista, add, edit)
    rf/            Renda Fixa (lista, add, edit)
  services/
    database.js    Todas as funcoes CRUD do Supabase
    priceService.js Cotacoes em tempo real + cache + marketCap
    dividendService.js Auto-sync de dividendos via brapi.dev + StatusInvest
  theme/
    index.js       Cores (C), Fontes (F), Tamanhos (SIZE), Sombras (SHADOW)
supabase/
  functions/
    weekly-snapshot/ Edge Function para snapshot semanal com cotacoes reais
```

## Navegacao

### Tabs (5 abas)
1. **Home** - Patrimonio, renda mensal, alertas, eventos, historico
2. **Carteira** - Donut alocacao, treemap, benchmark CDI, rebalanceamento, cards expandiveis
3. **Opcoes** - Cards com gregas BS, moneyness, cobertura, simulador, historico
4. **Analise** - Graficos avancados e metricas
5. **Mais** - Menu de configuracoes e utilidades

### Stacks modais
- AddOperacao, EditOperacao, AssetDetail
- AddOpcao, EditOpcao
- AddRendaFixa, EditRendaFixa
- AddProvento, EditProvento
- ConfigMeta, ConfigCorretoras, ConfigAlertas, ConfigSelic
- Historico, Guia, Sobre

## Banco de Dados (Supabase)

### Tabelas principais

| Tabela | Descricao |
|--------|-----------|
| `profiles` | id, nome, meta_mensal, selic, last_dividend_sync |
| `operacoes` | ticker, tipo(compra/venda), categoria(acao/fii/etf), quantidade, preco, custos, corretora, data |
| `opcoes` | ativo_base, ticker_opcao, tipo(call/put), direcao(venda/compra/lancamento), strike, premio, quantidade, vencimento, data_abertura, status, corretora, premio_fechamento |
| `proventos` | ticker, tipo_provento, valor_por_cota, quantidade, valor_total, data_pagamento |
| `renda_fixa` | tipo(cdb/lci_lca/tesouro_*), emissor, taxa, indexador, valor_aplicado, vencimento |
| `saldos_corretora` | name, saldo, tipo(corretora/banco) |
| `user_corretoras` | name, count |
| `alertas_config` | flags de alertas + thresholds |
| `indicators` | HV, RSI, SMA, EMA, Beta, ATR, BB, MaxDD por ticker (UNIQUE user_id+ticker) |
| `rebalance_targets` | class_targets(JSONB), sector_targets(JSONB), ticker_targets(JSONB) — metas de rebalanceamento persistidas |
| `patrimonio_snapshots` | user_id, data(DATE), valor — snapshot diario/semanal do patrimonio real (UNIQUE user_id+data) |

### Status de opcoes
`ativa`, `exercida`, `expirada`, `fechada`, `expirou_po`

### Direcao de opcoes
`venda` (novo padrao), `compra`, `lancamento` (legado, tratado igual a venda)

### RLS
Todas as tabelas tem Row Level Security ativado com policies `auth.uid() = user_id`.

## Servicos

### database.js - Funcoes exportadas
- **Profiles**: getProfile, updateProfile
- **Operacoes**: getOperacoes, addOperacao, deleteOperacao
- **Positions**: getPositions (agrega operacoes em posicoes com PM, por_corretora, normaliza ticker)
- **Opcoes**: getOpcoes, addOpcao
- **Proventos**: getProventos, addProvento, deleteProvento
- **Renda Fixa**: getRendaFixa, addRendaFixa, deleteRendaFixa
- **Corretoras**: getUserCorretoras, incrementCorretora
- **Saldos**: getSaldos
- **Alertas**: getAlertasConfig, updateAlertasConfig
- **Dashboard**: getDashboard (endpoint agregado: patrimonio, renda, eventos, historico, proventosHoje)
- **Indicadores**: getIndicators, getIndicatorByTicker, upsertIndicator, upsertIndicatorsBatch
- **Rebalanceamento**: getRebalanceTargets, upsertRebalanceTargets
- **Snapshots**: getPatrimonioSnapshots, upsertPatrimonioSnapshot

### priceService.js - Funcoes exportadas
- `fetchPrices(tickers)` - Cotacoes atuais (cache 60s)
- `fetchPriceHistory(tickers)` - Historico 1 mes (cache 5min)
- `fetchPriceHistoryLong(tickers)` - Historico 6 meses OHLCV (cache 1h)
- `fetchTickerProfile(tickers)` - Sector/industry via brapi summaryProfile (cache 24h)
- `enrichPositionsWithPrices(positions)` - Adiciona preco_atual, variacao, P&L, marketCap
- `clearPriceCache()` - Limpa cache manualmente
- `getLastPriceUpdate()` - Timestamp da ultima atualizacao

### indicatorService.js - Funcoes exportadas
- `calcHV(closes, period)` - Volatilidade historica anualizada (%)
- `calcSMA(closes, period)` - Media movel simples
- `calcEMA(closes, period)` - Media movel exponencial
- `calcRSI(closes, period)` - RSI Wilder
- `calcBeta(tickerCloses, ibovCloses, period)` - Beta vs IBOV
- `calcATR(highs, lows, closes, period)` - Average True Range
- `calcBollingerBands(closes, period, mult)` - Bandas de Bollinger {upper, lower, width}
- `calcMaxDrawdown(closes)` - Maior queda pico-a-vale (%)
- `calcIVMedia(opcoes)` - Media ponderada IV opcoes ativas
- `calcIVRank(ivAtual, ivsHistoricas)` - Percentil IV atual
- `runDailyCalculation(userId)` - Orquestrador: posicoes → historicos → calcula → upsert
- `shouldCalculateToday(lastCalcDate)` - Verifica dia util + hora >= 18 BRT + nao calculou hoje

### dividendService.js - Funcoes exportadas
- `fetchDividendsBrapi(ticker)` - Busca dividendos do ticker via brapi.dev (`?dividends=true`)
- `fetchDividends(ticker)` - Alias de `fetchDividendsBrapi` (compatibilidade)
- `fetchDividendsStatusInvest(ticker, categoria)` - Busca dividendos via StatusInvest (acoes/FIIs)
- `mergeDividends(brapiDivs, statusInvestDivs)` - Merge sem duplicatas, brapi como base
- `mapLabelToTipo(label)` - "DIVIDENDO" → "dividendo", "JCP" → "jcp", "RENDIMENTO" → "rendimento"
- `shouldSyncDividends(lastSyncDate)` - Verifica dia util + hora >= 18 BRT + nao sincronizou hoje
- `runDividendSync(userId)` - Orquestrador: posicoes → dividendos brapi+StatusInvest → merge → dedup → addProvento → updateProfile

## Componentes

| Componente | Arquivo | Uso |
|------------|---------|-----|
| `Glass` | Glass.js | Card com glassmorphism + glow opcional |
| `Badge` | Primitives.js | Label pequeno colorido (fonte 9, padding 8x3) |
| `Pill` | Primitives.js | Botao selecionavel com estado ativo |
| `SectionLabel` | Primitives.js | Titulo de secao |
| `Field` | Primitives.js | Input com label, prefixo/sufixo |
| `InteractiveChart` | InteractiveChart.js | Grafico interativo touch com tooltip, pontos semanais, eixos Y/X |
| `MiniLineChart` | InteractiveChart.js | Sparkline interativo |
| `Sparkline` | Charts.js | Sparkline simples |
| `Gauge` | Charts.js | Indicador circular |
| `LoadingScreen` | States.js | Tela de loading |
| `EmptyState` | States.js | Estado vazio com icone + CTA |
| `Skeleton*` | States.js | Placeholders de carregamento |

## Theme

### Cores principais (C)
- `bg: '#070a11'` | `text: '#f1f1f4'` | `accent: '#6C5CE7'`
- Produtos: `acoes: '#3B82F6'` | `fiis: '#10B981'` | `opcoes: '#8B5CF6'` | `etfs: '#F59E0B'` | `rf: '#06B6D4'`
- Status: `green: '#22C55E'` | `red: '#EF4444'` | `yellow: '#F59E0B'`

### Fontes (F)
- `display: 'DMSans-Bold'` | `body: 'DMSans-Medium'` | `mono: 'JetBrainsMono-Regular'`

### Tamanhos (SIZE)
- `gap: 14` | `padding: 18` | `radius: 14` | `tabBarHeight: 78`

## Features Implementadas

### Carteira (CarteiraScreen)
- Donut chart de alocacao por classe
- Treemap de exposicao visual
- Benchmark vs CDI
- Rebalanceamento com metas editaveis
- Cards expandiveis com Comprar/Vender/Lancar opcao/Transacoes
- Pre-fill de forms via route.params (ticker, tipo, categoria)
- **Multi-corretora**: posicoes agregadas por ticker, campo `por_corretora` com qty por corretora
- Cards de RF com botoes Editar/Excluir
- Corretora removida do header do card (mostrada no expandido com qty por corretora)

### Opcoes (OpcoesScreen)
- **Black-Scholes completo**: pricing, gregas (delta, gamma, theta, vega), IV implicita
- **Moneyness**: badges ITM/ATM/OTM com cor por direcao e texto "Strike R$ X . Y% acima/abaixo"
- **Cobertura inteligente** (usa `por_corretora` das transacoes, nao do card):
  - CALL vendida: verifica acoes do ativo_base na MESMA corretora (COBERTA/PARCIAL/COBERTA*/DESCOBERTA)
  - PUT vendida (CSP): verifica saldo na MESMA corretora vs strike*qty
- **Encerramento antecipado**: input de premio recompra + P&L em tempo real + confirmacao
- **Opcoes vencidas**: detecao automatica, painel no topo com botoes "Expirou PO" / "Foi exercida"
- **Exercicio automatico**: cria operacao de compra/venda na carteira ao confirmar exercicio
- **Simulador BS**: inputs editaveis, cenarios what-if (+/-5%, +/-10%)
- **Payoff Chart**: grafico SVG de P&L no vencimento com breakeven, spot, zonas lucro/prejuizo, touch interativo
- **Cadeia Sintetica BS**: grade de opcoes com 11 strikes, precos CALL/PUT via Black-Scholes, delta, ITM/ATM/OTM
  - IV inicializado com **HV 20d real** do indicatorService (fallback 35% se sem dados)
  - Badge "HV 20d: XX%" ao lado do spot, IV atualiza ao trocar ticker
- **HV/IV nos cards**: linha "HV: XX% | IV: YY%" + badge "IV ALTA" (>130% HV) / "IV BAIXA" (<70% HV)
- **Historico**: resumo total recebido, expiradas PO, exercidas + lista detalhada
- **Data abertura**: campo data_abertura nas opcoes, premios calculados com D+1 (liquidacao)
- DTE badge no header de cada card

### Home (HomeScreen)
- Card de patrimonio com variacao + barra de alocacao por classe
- **Donuts Double Ring**: aneis concentricos comparando mes atual vs anterior
  - Anel interno = mes atual, anel externo = mes anterior
  - Cores dinamicas: verde = mes melhor, vermelho = mes pior
  - Escala proporcional: maior valor = 100% (anel completo), menor proporcional
  - Transparencia nos aneis (strokeOpacity 0.7) para legibilidade
  - Legenda padronizada "Atual / Ant." com dots coloridos + % comparativo
  - Subtitulo "MES ANO · ATUAL vs ANTERIOR" nos cards
  - Prop `subLines` para info extra (ex: Recebido/A receber em Dividendos)
- Card de renda mensal (dividendos + premios + RF)
- Card de ganhos acumulados (acoes, FIIs, ETFs, RF, total)
- **Grafico de patrimonio**: InteractiveChart com pontos semanais, eixo Y com valores (k/M), eixo X com datas
- **Snapshots de patrimonio**: salva valor real (cotacao brapi) ao abrir o app via `upsertPatrimonioSnapshot`
- Alertas inteligentes
- Timeline de eventos (vencimentos opcoes, vencimentos RF)
- **Auto-trigger indicadores**: dispara `runDailyCalculation` em background apos 18h BRT em dias uteis
- **Auto-trigger dividend sync**: dispara `runDividendSync` fire-and-forget apos 18h BRT em dias uteis
- **Alerta dividendo hoje**: se `proventosHoje` do dashboard tem itens, mostra alerta verde "Dividendo sendo pago hoje" com tickers e total, badge "HOJE"

### Renda Fixa (RendaFixaScreen)
- Suporte a CDB, LCI/LCA, Tesouro Selic/IPCA/Pre, Debenture
- Indexadores: prefixado, CDI, IPCA, Selic
- Contagem regressiva de vencimento com cores de urgencia

### Proventos (ProventosScreen)
- Tipos: dividendo, JCP, rendimento, juros RF, amortizacao, bonificacao
- Filtros por tipo
- Valor por cota + total
- **Botao "Sincronizar"**: sync manual de dividendos via brapi.dev + StatusInvest no header

### AssetDetail (AssetDetailScreen)
- Card "INDICADORES TECNICOS" com grid 2x4: HV 20d, RSI 14, SMA 20, EMA 9, Beta, ATR 14, Max DD, BB Width
- Cores semanticas por indicador (RSI >70 vermelho, <30 verde; Beta >1.2 vermelho, <0.8 verde)
- Data do ultimo calculo no rodape
- **Proventos por corretora**: proventos aparecem DENTRO de cada grupo de corretora na secao TRANSACOES, com qty ajustada por corretora (usa `por_corretora` computado dos txns). Separador visual "PROVENTOS (X cotas)" em verde. Secao separada de proventos removida.

### Analise (AnaliseScreen)
- Sub-tab **Indicadores** com tabela resumo (Ticker, HV, RSI, Beta, Max DD) + cards detalhados por ativo (14 indicadores)
- Botao "Recalcular indicadores" para calculo manual
- Auto-trigger de calculo se dados desatualizados
- **Performance — Grafico Retorno Mensal/Semanal**: grafico de linhas comparando Carteira vs CDI vs IBOV
  - 3 series: Carteira (roxo, com area fill), CDI (ciano), IBOV (amarelo)
  - Granularidade adaptiva: **semanal** no filtro 1M, **mensal** nos filtros 3M/6M/1A/Tudo
  - CDI: calculo puro matematico `((1 + cdiAnual/100)^(1/N) - 1) * 100` (N=52 semanal, N=12 mensal)
  - IBOV: dados reais via `fetchPriceHistoryLong(['^BVSP'])` (6 meses OHLCV, cache 1h)
  - Carteira: retornos calculados a partir dos snapshots de patrimonio
  - Dots com glow em cada ponto + valor % em cima + linhas conectando 2+ pontos
  - Funcoes: `computeMonthlyReturns(history)`, `computeWeeklyReturns(history)`
- **Performance — KPIs**: Carteira %, CDI %, Melhor Mes, Pior Mes
- **Performance — Benchmark**: Carteira vs CDI (retorno acumulado %)
- **Performance — Rentabilidade por ativo**: barras horizontais com P&L % por ticker
- **Rebalanceamento hierarquico**: Classe → Setor → Ticker (FIIs/ETFs/RF) ou Classe → Market Cap → Setor → Ticker (Acoes)
  - Classificacao por market cap via brapi: Large Cap (>R$40B), Mid Cap (>R$10B), Small Cap (>R$2B), Micro Cap (<R$2B)
  - Setores dinamicos via `fetchTickerProfile` (brapi summaryProfile) com fallback para TICKER_SECTORS
  - Perfis pre-configurados: Conservador, Moderado, Arrojado
  - Persistencia no Supabase (tabela `rebalance_targets`), capTargets embutido em `sector_targets._cap`
  - Accordion com expand/collapse por nivel, steppers +/- para edicao de metas

### Auth
- Login/Registro com Supabase Auth
- Onboarding 4 etapas (nome, corretoras, meta)
- Persistencia de sessao com AsyncStorage

## Migrations SQL Pendentes

Ao configurar um novo ambiente, executar `supabase-migration.sql` no SQL Editor do Supabase Dashboard. Inclui:
- Criacao de todas as tabelas com RLS
- Trigger para auto-criar profile no signup
- Migration v4→v5 (comentada, so se upgrading)
- Migration opcoes: status `expirou_po`, coluna `premio_fechamento`, direcao `venda`, coluna `data_abertura`
- Tabela `indicators` com RLS + UNIQUE(user_id, ticker)
- Coluna `profiles.last_dividend_sync` (DATE) para controle do auto-sync de dividendos
- Tabela `rebalance_targets` com JSONB para class/sector/ticker targets
- Tabela `patrimonio_snapshots` com UNIQUE(user_id, data)
- pg_cron setup para snapshot semanal via Edge Function

## Padroes Importantes

### Normalizacao de tickers
Tickers sao normalizados com `toUpperCase().trim()` em:
- `getPositions()` - agrupamento por ticker
- `getOperacoes()` - filtro por ticker (em JS, nao no banco)
- `getProventos()` - filtro por ticker (em JS, nao no banco)
Isso garante que transacoes salvas com caixa ou espacos diferentes sejam agrupadas corretamente.

### Anti-duplicacao de submit
Todas as telas Add (Operacao, Opcao, RendaFixa, Provento) usam estado `submitted` para prevenir duplo clique:
- `if (!canSubmit || submitted) return;` no inicio do handleSubmit
- `setSubmitted(true)` antes do request
- Reset em erro e em "Adicionar outro/outra"

### Posicoes multi-corretora
`getPositions()` retorna campo `por_corretora: { 'Clear': 200, 'XP': 100 }` com quantidade por corretora.
Cobertura de opcoes usa `por_corretora` para verificar acoes na mesma corretora da opcao.

## Proximos Passos Possiveis

- [x] **Sistema de Indicadores Tecnicos** (implementado: indicatorService.js, tabela indicators, integrado em Opcoes/AssetDetail/Analise/Home)
- [x] **Auto-sync de dividendos** (implementado: dividendService.js, cross-check brapi+StatusInvest, auto-trigger Home, sync manual Proventos, dedup por ticker+data+valor)
- [ ] Rolagem de opcoes (fechar atual + abrir nova com um clique)
- [ ] Grafico de P&L de opcoes por mes (premios recebidos historico)
- [ ] Notificacoes push para vencimentos proximos
- [ ] Importacao de operacoes via CSV/Excel
- [ ] Calculo de IR (darf mensal, swing trade, day trade)
- [ ] Integracao com CEI/B3 para importacao automatica
- [ ] Dark/Light mode toggle
- [ ] Backup/restore de dados

## Sistema de Indicadores Tecnicos (Implementado)

Calcula HV, RSI, SMA, EMA, Beta, ATR, Bollinger, IV Rank, Max Drawdown diariamente apos 18h BRT. Dados OHLCV via brapi.dev (6 meses). Trigger automatico fire-and-forget na Home e OpcoesScreen via `shouldCalculateToday()`.

### Arquivos modificados/criados
| Arquivo | Mudanca |
|---------|---------|
| `src/services/indicatorService.js` | Criado — 12 funcoes de calculo + orquestrador |
| `src/services/database.js` | CRUD indicators (get, getByTicker, upsert, upsertBatch) |
| `src/services/priceService.js` | `fetchPriceHistoryLong()` (6mo OHLCV, cache 1h) |
| `src/screens/opcoes/OpcoesScreen.js` | HV como IV default na Cadeia, HV/IV nos cards, auto-trigger |
| `src/screens/carteira/AssetDetailScreen.js` | Grid 2x4 indicadores por ativo |
| `src/screens/analise/AnaliseScreen.js` | Sub-tab "Indicadores" com tabela + cards detalhados |
| `src/screens/home/HomeScreen.js` | Auto-trigger fire-and-forget |
| `supabase-migration.sql` | Tabela `indicators` com RLS |

## Auto-sync de Dividendos (Implementado)

Importa automaticamente dividendos, JCP e rendimentos de FIIs para tickers na carteira do usuario. Usa **cross-check de duas fontes** para cobertura maxima:

### Fontes de dados
1. **brapi.dev**: endpoint `?dividends=true`, retorna `dividendsData.cashDividends[]` com `rate`, `paymentDate`, `lastDatePrior`, `label`. Cobre acoes mas nao FIIs.
2. **StatusInvest**: endpoint `GET /acao/companytickerprovents?ticker={TICKER}&chartProvType=2` (ou `/fii/` para FIIs). Retorna `assetEarningsModels[]` com `v` (rate), `pd` (pagamento DD/MM/YYYY), `ed` (data-ex DD/MM/YYYY), `et` (tipo). Header `User-Agent` obrigatorio. Sem token. Cobre acoes E FIIs.

### Estrategia de merge
- Busca de ambas as fontes em paralelo (cada uma com try/catch proprio retornando `[]`)
- `mergeDividends()` usa brapi como base, StatusInvest preenche gaps
- Dedup por `paymentDate (YYYY-MM-DD) + round(rate, 4)` — mesmo dividendo em ambas fontes nao duplica
- Se uma fonte falhar, a outra funciona sozinha

### Deduplicacao (insercao)
Chave composta: `ticker (upper) + data_pagamento (YYYY-MM-DD) + round(valor_por_cota, 4)`. Se match com provento existente, pula. Proventos manuais coexistem sem conflito.

Trigger automatico fire-and-forget na Home apos 18h BRT via `shouldSyncDividends()`. Sync manual via botao "Sincronizar" na tela de Proventos.

### Limitacoes
- **Quantidade**: usa qty ATUAL da posicao, nao historica na data-ex
- **Corretora**: auto-sync nao preenche campo corretora
- **Escopo**: filtra dividendos dos ultimos 12 meses com paymentDate valido
- **StatusInvest**: pode ter rate limiting sem aviso; User-Agent necessario

### Arquivos modificados/criados
| Arquivo | Mudanca |
|---------|---------|
| `src/services/dividendService.js` | Criado — fetchDividendsBrapi, fetchDividendsStatusInvest, mergeDividends, mapLabelToTipo, shouldSyncDividends, runDividendSync |
| `src/screens/home/HomeScreen.js` | Auto-trigger fire-and-forget dividend sync |
| `src/screens/proventos/ProventosScreen.js` | Botao "Sincronizar" no header + handleSync |
| `supabase-migration.sql` | Coluna `profiles.last_dividend_sync` |

## Snapshots de Patrimonio (Implementado)

Grava o valor real do patrimonio periodicamente para construir o grafico de evolucao patrimonial com dados precisos.

### Fontes de dados
1. **App (ao abrir Home)**: salva snapshot com valor de mercado real (cotacoes brapi via `enrichPositionsWithPrices`) + RF
2. **Edge Function semanal**: `supabase/functions/weekly-snapshot/index.ts` — busca cotacoes reais da brapi para todos os usuarios, calcula patrimonio e salva snapshots. Roda toda sexta 18h BRT via pg_cron + `net.http_post`

### Logica de prioridade
- Quando usuario abre o app: `upsertPatrimonioSnapshot` salva valor real (upsert por user_id+data)
- Quando cron roda (sexta): Edge Function busca precos reais da brapi e faz upsert. Se usuario ja abriu naquele dia, sobrescreve com valor atualizado
- `getDashboard` merge snapshots no `patrimonioHistory`: snapshots substituem valores baseados em custo

### Grafico de patrimonio (InteractiveChart)
- Pontos semanais: dot no ultimo ponto de cada semana (glow r=4 + centro r=2.5)
- Eixo Y: labels com valores formatados (k/M) alinhados as linhas de grid
- Eixo X: datas distribuidas nos pontos semanais (max 5 labels)
- Touch interativo: arrastar para ver tooltip com valor + data
- Linha suave com bezier cubico + area fill com gradiente

### Arquivos
| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/weekly-snapshot/index.ts` | Edge Function — busca brapi, calcula patrimonio, upsert snapshots |
| `src/services/database.js` | getPatrimonioSnapshots, upsertPatrimonioSnapshot, merge no getDashboard |
| `src/screens/home/HomeScreen.js` | Salva snapshot ao abrir, donuts double ring |
| `src/components/InteractiveChart.js` | Pontos semanais, eixo Y com valores, eixo X com datas |
| `supabase-migration.sql` | Tabela patrimonio_snapshots, pg_cron + Edge Function |

## Grafico de Retorno Mensal/Semanal (Implementado)

Grafico de linhas na aba Performance > Todos comparando retorno da carteira vs CDI vs IBOV. Substitui o grafico duplicado de patrimonio que ja existe na Home.

### Series
| Serie | Cor | Fonte | Calculo |
|-------|-----|-------|---------|
| Carteira | `C.accent` (roxo) | Snapshots patrimonio | `(valor_fim - valor_fim_anterior) / valor_fim_anterior * 100` |
| CDI | `C.rf` (ciano) | Selic do perfil | Semanal: `((1+cdi/100)^(1/52)-1)*100` / Mensal: `((1+cdi/100)^(1/12)-1)*100` |
| IBOV | `C.etfs` (amarelo) | brapi `^BVSP` (6mo OHLCV) | Mesmo calculo da carteira mas usando closes do Ibovespa |

### Granularidade adaptiva
- **Filtro 1M**: usa `computeWeeklyReturns` — agrupa por semana ISO, labels DD/MM
- **Filtros 3M/6M/1A/Tudo**: usa `computeMonthlyReturns` — agrupa por YYYY-MM, labels Mes/AA

### Funcoes
- `computeMonthlyReturns(history)` — agrupa `{date, value}[]` por mes, retorna `{month, pct}[]`
- `computeWeeklyReturns(history)` — agrupa por semana ISO (YYYY-WNN), retorna `{week, date, pct}[]`

### Visual
- Carteira: linha solida + area fill sutil ate zero + dots com glow + valor %
- CDI/IBOV: linha solida + dots com glow + valor %
- Grid com 5 niveis Y (±maxAbs, ±metade, zero) + labels %
- Zero line mais grossa para separar positivo/negativo
- IBOV carregado em background (fire-and-forget) via `fetchPriceHistoryLong(['^BVSP'])`
