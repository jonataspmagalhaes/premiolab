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
  components/      Componentes reutilizaveis (Glass, Badge, Pill, Charts, States, InteractiveChart, PressableCard, SwipeableRow, TickerInput, CorretoraSelector, ToastConfig, InfoTip)
  config/          Supabase client
  contexts/        AuthContext (login, session, onboarding)
  navigation/      AppNavigator (tabs + stacks)
  screens/
    analise/       Dashboard analitico + Rebalanceamento hierarquico
    auth/          Login + Onboarding
    carteira/      Portfolio (Carteira, AddOperacao, EditOperacao, AssetDetail)
    gestao/        Gestao (GestaoScreen wrapper Ativos/Caixa, CaixaView, AddMovimentacao, Extrato, AddConta)
    home/          Dashboard principal (patrimonio, renda, KPIs, alertas, eventos)
    mais/          Menu + Configs (Meta, Corretoras, Alertas, Selic, Guia, Sobre, Historico) + acesso a Analise
    opcoes/        Opcoes (lista, add, edit, simulador BS)
    proventos/     Proventos (lista, add, edit) — embedded na tab Renda
    relatorios/    Relatorios (dividendos, opcoes, operacoes, IR) — embedded na tab Renda
    renda/         Tab Renda (RendaScreen wrapper, RendaResumoView)
    rf/            Renda Fixa (lista, add, edit)
  services/
    database.js    Todas as funcoes CRUD do Supabase
    priceService.js Cotacoes em tempo real + cache + marketCap + routing BR/INT
    yahooService.js Cotacoes internacionais via Yahoo Finance (cache + OHLCV + dividendos)
    indicatorService.js Calculo HV, RSI, SMA, EMA, Beta, ATR, BB, MaxDD
    dividendService.js Auto-sync de dividendos via brapi.dev + StatusInvest + Yahoo Finance (INT)
    tickerSearchService.js Busca e validacao de tickers via brapi.dev (BR) + Yahoo Finance (INT)
    fundamentalService.js Dados fundamentalistas via brapi.dev (BR) + Yahoo Finance (INT), cache 24h
    currencyService.js Cambio multi-moeda via brapi.dev + fallback
  theme/
    index.js       Cores (C), Fontes (F), Tamanhos (SIZE), Sombras (SHADOW)
  utils/
    a11y.js        shouldAnimate(), animateLayout() — ReduceMotion + LayoutAnimation centralizado
supabase/
  functions/
    weekly-snapshot/ Edge Function para snapshot semanal com cotacoes reais
```

## Navegacao

### Tabs (5 abas)
1. **Home** - Patrimonio, renda mensal, alertas, eventos, historico
2. **Carteira** - Sub-tabs "Ativos" (portfolio via CarteiraScreen) + "Caixa" (fluxo de caixa via CaixaView). Icone briefcase. Componente: GestaoScreen
3. **Opcoes** - Cards com gregas BS, moneyness, cobertura, simulador, historico. 5 sub-tabs (ativas, pendentes, sim, cadeia, hist)
4. **Renda** - Sub-tabs "Resumo" (RendaResumoView) + "Proventos" (ProventosScreen embedded) + "Relatorios" (RelatoriosScreen embedded). Icone cash. Componente: RendaScreen
5. **Mais** - Menu de configuracoes, utilidades + acesso a Analise Completa (stack screen)

### Stacks modais
- AddOperacao, EditOperacao, AssetDetail
- AddOpcao, EditOpcao
- AddRendaFixa, EditRendaFixa
- AddProvento, EditProvento
- AddMovimentacao, Extrato, AddConta
- Analise (stack screen com back button, acessado via Mais)
- ConfigMeta, ConfigCorretoras, ConfigAlertas, ConfigSelic
- Historico, Guia, Sobre

## Banco de Dados (Supabase)

### Tabelas principais

| Tabela | Descricao |
|--------|-----------|
| `profiles` | id, nome, meta_mensal, selic, last_dividend_sync |
| `operacoes` | ticker, tipo(compra/venda), categoria(acao/fii/etf/stock_int), quantidade, preco, custos, corretora, data, mercado(BR/INT), taxa_cambio |
| `opcoes` | ativo_base, ticker_opcao, tipo(call/put), direcao(venda/compra/lancamento), strike, premio, quantidade, vencimento, data_abertura, status, corretora, premio_fechamento, data_fechamento |
| `proventos` | ticker, tipo_provento, valor_por_cota, quantidade, valor_total, data_pagamento |
| `renda_fixa` | tipo(cdb/lci_lca/tesouro_*), emissor, taxa, indexador, valor_aplicado, vencimento |
| `saldos_corretora` | name, saldo, tipo(corretora/banco), moeda(BRL/USD/EUR/etc, default BRL). UNIQUE(user_id, name, moeda) — permite mesma instituicao com contas em moedas diferentes |
| `user_corretoras` | name, count |
| `alertas_config` | flags de alertas + thresholds |
| `indicators` | HV, RSI, SMA, EMA, Beta, ATR, BB, MaxDD por ticker (UNIQUE user_id+ticker) |
| `rebalance_targets` | class_targets(JSONB), sector_targets(JSONB), ticker_targets(JSONB) — metas de rebalanceamento persistidas |
| `patrimonio_snapshots` | user_id, data(DATE), valor — snapshot diario/semanal do patrimonio real (UNIQUE user_id+data) |
| `movimentacoes` | conta, tipo(entrada/saida/transferencia), categoria, valor, descricao, referencia_id, ticker, conta_destino, saldo_apos, data — fluxo de caixa completo |

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
- **Positions**: getPositions (agrega operacoes em posicoes com PM, por_corretora, normaliza ticker, taxa_cambio_media ponderada para INT)
- **Opcoes**: getOpcoes, addOpcao
- **Proventos**: getProventos, addProvento, deleteProvento
- **Renda Fixa**: getRendaFixa, addRendaFixa, deleteRendaFixa
- **Corretoras**: getUserCorretoras, incrementCorretora
- **Saldos**: getSaldos, upsertSaldo, deleteSaldo
- **Alertas**: getAlertasConfig, updateAlertasConfig
- **Dashboard**: getDashboard (endpoint agregado: patrimonio, renda, eventos, historico, proventosHoje)
- **Indicadores**: getIndicators, getIndicatorByTicker, upsertIndicator, upsertIndicatorsBatch
- **Rebalanceamento**: getRebalanceTargets, upsertRebalanceTargets
- **Snapshots**: getPatrimonioSnapshots, upsertPatrimonioSnapshot
- **Movimentações**: getMovimentacoes, addMovimentacao, addMovimentacaoComSaldo, deleteMovimentacao, getMovimentacoesSummary, buildMovDescricao

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

### currencyService.js - Funcoes exportadas
- `fetchExchangeRates(moedas)` - Busca cambio via brapi.dev (principal) + open.er-api.com (fallback para moedas nao suportadas como QAR). Cache 30min
- `convertToBRL(valor, moeda, rates)` - Converte valor para BRL usando rates
- `getSymbol(moeda)` - Retorna simbolo da moeda (USD→US$, EUR→€, etc.)
- `MOEDAS` - Lista de moedas suportadas com code, symbol, name

### tickerSearchService.js - Funcoes exportadas
- `searchTickers(query, mercado)` - Roteador principal: busca BR (brapi.dev) ou INT (Yahoo Finance), cache 24h, min 2 chars
- `clearSearchCache()` - Limpa cache de busca

### fundamentalService.js - Funcoes exportadas
- `fetchFundamentals(ticker, mercado)` - Busca dados fundamentalistas via brapi.dev (BR) ou Yahoo Finance (INT), cache 24h, timeout 8s. Retorna objeto normalizado com valuation, endividamento, eficiencia, rentabilidade, crescimento, historico
- `clearFundamentalsCache()` - Limpa cache manualmente

### dividendService.js - Funcoes exportadas
- `fetchDividendsBrapi(ticker)` - Busca dividendos do ticker via brapi.dev (`?dividends=true`)
- `fetchDividends(ticker)` - Alias de `fetchDividendsBrapi` (compatibilidade)
- `fetchDividendsStatusInvest(ticker, categoria)` - Busca dividendos via StatusInvest (acoes/FIIs)
- `mergeDividends(brapiDivs, statusInvestDivs)` - Merge sem duplicatas, brapi como base
- `mapLabelToTipo(label)` - "DIVIDENDO" → "dividendo", "JCP" → "jcp", "RENDIMENTO" → "rendimento"
- `shouldSyncDividends(lastSyncDate)` - Verifica dia util + hora >= 18 BRT + nao sincronizou hoje
- `runDividendSync(userId)` - Orquestrador: posicoes BR → brapi+StatusInvest, posicoes INT → Yahoo Finance + USD→BRL → merge → dedup → addProvento → updateProfile

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
| `Skeleton*` | States.js | Placeholders de carregamento (Home, Carteira, Opcoes, Caixa, Proventos, RendaFixa) |
| `InfoTip` | InfoTip.js | Icone info (ⓘ) com Modal explicativo |
| `PressableCard` | PressableCard.js | Card com Animated.spring scale + a11y props |
| `SwipeableRow` | SwipeableRow.js | Wrapper swipe-to-delete com botao Excluir |
| `TickerInput` | TickerInput.js | Input com autocomplete de tickers da carteira + busca API (brapi/Yahoo) com debounce |
| `CorretoraSelector` | CorretoraSelector.js | Pills + autocomplete de ~60 instituicoes com metadados (moeda, tipo). Props: value, onSelect, userId, mercado, color, label, defaults |
| `ToastConfig` | ToastConfig.js | Config visual toast dark/glass + tipo undo |
| `FundamentalAccordion` | FundamentalAccordion.js | 6 secoes accordion (Opcoes + 5 fundamentalistas) no card expandido da Carteira, com InfoTip + grafico historico |
| `FundamentalChart` | FundamentalChart.js | Modal com grafico de barras 5 anos para indicador fundamental |

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
- Cards expandiveis com Comprar/Vender/Lancar opcao/Transacoes + indicadores fundamentalistas accordion (lazy load)
- Pre-fill de forms via route.params (ticker, tipo, categoria)
- **Multi-corretora**: posicoes agregadas por ticker, campo `por_corretora` com qty por corretora
- Cards de RF com botoes Editar/Excluir
- Corretora removida do header do card (mostrada no expandido com qty por corretora)
- **Saldo livre**: movido para Gestao > Caixa (CaixaView). Acoes Depositar/Retirar/Transferir/Editar saldo/Excluir conta agora logam movimentacoes automaticamente
- **Multi-moeda**: contas podem ser cadastradas em moedas estrangeiras (USD, EUR, GBP, QAR, ARS, JPY, CHF). Cambio automatico via brapi.dev (cache 30min). Patrimonio total soma tudo em BRL. CaixaView exibe valor na moeda original + ≈ R$ convertido
- **Transferencia cross-currency**: transferir entre contas de moedas diferentes exibe campo editavel de cambio (auto-preenchido via rates do currencyService) + preview do valor convertido. Descricao da movimentacao inclui taxa usada
- **Editar saldo direto**: botao "Editar saldo" no card expandido permite definir novo valor, registra movimentacao `ajuste_manual` com diff
- **Excluir movimentacao com reversao**: long press em movimentacao exclui e reverte saldo automaticamente (entrada excluida = subtrai, saida excluida = soma de volta). Movimentacoes auto-geradas (compra/venda, premio, dividendo etc) sao bloqueadas

### Opcoes (OpcoesScreen) — 5 sub-tabs (ativas, pendentes, sim, cadeia, hist)
- **Black-Scholes completo**: pricing, gregas (delta, gamma, theta, vega), IV implicita
- **Moneyness**: badges ITM/ATM/OTM com cor por direcao e texto "Strike R$ X . Y% acima/abaixo"
- **Cobertura inteligente** (usa `por_corretora` das transacoes, nao do card):
  - CALL vendida: verifica acoes do ativo_base na MESMA corretora (COBERTA/PARCIAL/COBERTA*/DESCOBERTA)
  - PUT vendida (CSP): verifica saldo na MESMA corretora vs strike*qty
- **Encerramento antecipado**: painel com premio recompra, quantidade (auto-fill, editavel para encerramento parcial), data de fechamento (auto-fill hoje, editavel). Encerramento parcial reduz qty da original e cria novo registro fechado. Fallback resiliente se coluna `data_fechamento` nao existir no banco. Exibe `ticker_opcao` no topo do painel. Ao confirmar, oferece descontar custo de recompra do saldo livre da mesma corretora
- **Opcoes vencidas**: detecao automatica, painel no topo com botoes "Expirou PO" / "Foi exercida". Exibe `ticker_opcao` no card
- **Exercicio automatico**: cria operacao de compra/venda na carteira ao confirmar exercicio
- **Simulador BS**: inputs editaveis, cenarios what-if (+/-5%, +/-10%)
- **Payoff Chart**: grafico SVG de P&L no vencimento com breakeven, spot, zonas lucro/prejuizo, touch interativo
- **Cadeia Sintetica BS**: grade de opcoes com 11 strikes, precos CALL/PUT via Black-Scholes, delta, ITM/ATM/OTM
  - IV inicializado com **HV 20d real** do indicatorService (fallback 35% se sem dados)
  - Badge "HV 20d: XX%" ao lado do spot, IV atualiza ao trocar ticker
- **HV/IV nos cards**: linha "HV: XX% | IV: YY%" + badge "IV ALTA" (>130% HV) / "IV BAIXA" (<70% HV)
- **Badge direcao VENDA/COMPRA**: badge dedicado no header do card entre CALL/PUT e cobertura. VENDA em amarelo (`C.etfs`), COMPRA em ciano (`C.rf`), sempre visivel independente da cobertura
- **Corretora visivel**: label da corretora no card de opcao ativa (abaixo do header)
- **Historico**: resumo P&L total (considera premio_fechamento para fechadas), contadores expiradas PO/exercidas/fechadas + lista detalhada com P&L real por opcao, detalhes de recompra (preco, qty, data) nas fechadas. Cards fechadas mostram linha resumo: Recebido (premio total), Recompra (custo total), Resultado (P&L com cor verde/vermelha)
- **Data abertura**: campo data_abertura nas opcoes, premios calculados com D+1 (liquidacao)
- DTE badge no header de cada card

### Home (HomeScreen)
- **Patrimonio Hero**: card principal com valor total, rentabilidade mes (%), breakdown RV/RF, InteractiveChart com pontos semanais, allocation bar + legenda
- **KPI Bar**: 3 chips horizontais logo apos o hero (Rent. Mes %, Posicoes count, Opcoes count + venc 7d)
- **Renda do Mes** (simplificado): total grande com badge comparativo vs mes anterior (% em verde/vermelho), 5 breakdown rows compactos (dot + label + valor), meta progress bar + % + faltam R$
- **Snapshots de patrimonio**: salva valor real (cotacao brapi) ao abrir o app via `upsertPatrimonioSnapshot`
- Alertas inteligentes (criticos separados de info, colapsa info se >2)
- Timeline de eventos (vencimentos opcoes, vencimentos RF, max 3 itens)
- **Auto-trigger indicadores**: dispara `runDailyCalculation` em background apos 18h BRT em dias uteis
- **Auto-trigger dividend sync**: dispara `runDividendSync` fire-and-forget apos 18h BRT em dias uteis
- **Alerta dividendo hoje**: se `proventosHoje` do dashboard tem itens, mostra alerta verde "Dividendo sendo pago hoje" com tickers e total, badge "HOJE"
- Layout: Header → Hero → KPI Bar → Renda do Mes → Alertas → Eventos → FAB (~960 linhas, ~25 data points, scroll ~2 telas)

### Renda Fixa (RendaFixaScreen)
- Suporte a CDB, LCI/LCA, Tesouro Selic/IPCA/Pre, Debenture
- Indexadores: prefixado, CDI, IPCA, Selic
- Contagem regressiva de vencimento com cores de urgencia

### Proventos (ProventosScreen) — embedded na tab Renda
- Tipos: dividendo, JCP, rendimento, juros RF, amortizacao, bonificacao
- Filtros por tipo
- Valor por cota + total
- **Botao "Sincronizar"**: sync manual de dividendos via brapi.dev + StatusInvest no header
- **Modo embedded**: prop `embedded` oculta header com back button, mostra apenas sync + add buttons

### AssetDetail (AssetDetailScreen)
- Card "INDICADORES DE OPÇÕES" com grid 2x4: Ativas (XC/YP), Cobertura, Prêmios Rec., P&L Opções, HV 20d, IV Média, Yield Opções, Próx. Venc.
- Cores semanticas: cobertura (verde/amarelo/vermelho), IV vs HV (alta/baixa), DTE urgencia
- Dados de opções via getOpcoes filtrado por ativo_base, IV calculada via Black-Scholes
- **Proventos por corretora**: proventos aparecem DENTRO de cada grupo de corretora na secao TRANSACOES, com qty ajustada por corretora (usa `por_corretora` computado dos txns). Separador visual "PROVENTOS (X cotas)" em verde. Secao separada de proventos removida.

### Analise (AnaliseScreen) — acessado via Mais → Analise Completa (stack screen com back button)
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
- **Performance — P&L Detalhado por categoria** (Acao/FII/ETF):
  - Secao **P&L ABERTO vs REALIZADO**: cards lado a lado com InfoTips, total com contagem encerradas + vendas parciais
  - Secao **P&L REALIZADO POR PERIODO**: grafico `PLBarChart` com barras positivas (verde) e negativas (vermelho), toggle Mensal/Anual, tooltip interativo com detalhes por ticker
  - Secao **POSICOES ENCERRADAS**: lista com PM compra/venda, P&L %, borda colorida, expand/collapse (3 por padrao, "Ver todas")
  - **Proventos Mensais (12M)**: grafico `ProvVertBarChart` por categoria com cor dinamica
  - **Renda Mensal Media**: KPI "RENDA/MES" (media 3 meses) ao lado de YoC e DY
  - Funcoes: `computeCatPLByMonth(ops, categoria)`, componente `PLBarChart`, helper `fmtCompact`
  - EmptyState so aparece se nao ha posicoes ativas NEM encerradas na categoria
  - Secoes condicionais: Hero/Stats so com ativas, Proventos so com dados, Ranking so com posicoes
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
- Tabela `movimentacoes` com indexes + RLS (fluxo de caixa)
- Coluna `saldos_corretora.moeda` (TEXT DEFAULT 'BRL') para multi-moeda

Apos `supabase-migration.sql`, executar tambem `fix-multi-moeda-constraint.sql` para alterar constraint UNIQUE de (user_id, name) para (user_id, name, moeda), permitindo mesma instituicao com contas em moedas diferentes.

## Padroes Importantes

### Normalizacao de tickers
Tickers sao normalizados com `toUpperCase().trim()` em:
- `getPositions()` - agrupamento por ticker
- `getOperacoes()` - filtro por ticker (em JS, nao no banco)
- `getProventos()` - filtro por ticker (em JS, nao no banco)
Isso garante que transacoes salvas com caixa ou espacos diferentes sejam agrupadas corretamente.

### Validacao de tickers via API
`tickerSearchService.js` busca tickers em tempo real durante o cadastro:
- **BR**: brapi.dev `/api/quote/list?search=QUERY&limit=8` — retorna ticker, nome, tipo, exchange B3
- **INT**: Yahoo Finance `/v1/finance/search?q=QUERY&quotesCount=8` — filtra EQUITY/ETF, retorna ticker canonico
- Cache 24h por query (`mercado:QUERY`), min 2 chars para disparar busca
- Resolve tickers compostos (BRK.B vs BRK-B) ao exibir formato canonico da API
- TickerInput com `onSearch` prop: debounce 300ms, merge portfolio (max 3) + API (dedup, total max 8), badge CARTEIRA, nome da empresa

### Anti-duplicacao de submit
Todas as telas Add (Operacao, Opcao, RendaFixa, Provento) usam estado `submitted` para prevenir duplo clique:
- `if (!canSubmit || submitted) return;` no inicio do handleSubmit
- `setSubmitted(true)` antes do request
- Reset em erro e em "Adicionar outro/outra"

### Posicoes multi-corretora
`getPositions()` retorna campo `por_corretora: { 'Clear': 200, 'XP': 100 }` com quantidade por corretora.
Cobertura de opcoes usa `por_corretora` para verificar acoes na mesma corretora da opcao.

## Features Principais Implementadas (Resumo)

- **Sistema de Indicadores Tecnicos**: indicatorService.js, tabela indicators, integrado em Opcoes/AssetDetail/Analise/Home
- **Auto-sync de dividendos**: dividendService.js, cross-check brapi+StatusInvest (BR) + Yahoo Finance (INT com conversao USD→BRL), auto-trigger Home, sync manual Proventos
- **Gestao Financeira / Fluxo de Caixa**: tab Carteira com sub-tabs Ativos+Caixa, movimentacoes, integracao com operacoes/opcoes/dividendos
- **Relatorios Detalhados**: embedded na tab Renda, sub-tabs Dividendos/Opcoes/Operacoes/IR, graficos, agrupamentos
- **Multi-Moeda**: contas em USD/EUR/GBP/QAR/etc, cambio automatico via brapi.dev
- **Busca e Validacao de Tickers**: tickerSearchService.js, busca brapi.dev (BR) + Yahoo Finance (INT) com cache 24h, TickerInput com debounce + merge portfolio/API
- **Indicadores Fundamentalistas**: fundamentalService.js + FundamentalAccordion no card expandido da Carteira, 6 secoes accordion (opcoes + valuation + endividamento + eficiencia + rentabilidade + crescimento), lazy loading, brapi.dev + Yahoo Finance
- **Melhorias UX P0-P12**: 13 rodadas cobrindo contraste, validacao, haptics, keyboard, toast, swipe-to-delete, performance, React.memo, autocomplete, undo, PressableCard, skeletons, animacoes, accessibilityLabel/Hint/Role, ReduceMotion, maxFontSizeMultiplier

## Sistema de Indicadores Tecnicos (Implementado)

Calcula HV, RSI, SMA, EMA, Beta, ATR, Bollinger, IV Rank, Max Drawdown diariamente apos 18h BRT. Dados OHLCV via brapi.dev (6 meses). Trigger automatico fire-and-forget na Home e OpcoesScreen via `shouldCalculateToday()`. Resultados visiveis nos cards de opcoes (HV/IV), AssetDetail (HV no card de indicadores de opcoes) e AnaliseScreen (sub-tab Indicadores, acessado via Mais).

### Arquivos modificados/criados
| Arquivo | Mudanca |
|---------|---------|
| `src/services/indicatorService.js` | Criado — 12 funcoes de calculo + orquestrador |
| `src/services/database.js` | CRUD indicators (get, getByTicker, upsert, upsertBatch) |
| `src/services/priceService.js` | `fetchPriceHistoryLong()` (6mo OHLCV, cache 1h) |
| `src/screens/opcoes/OpcoesScreen.js` | HV como IV default na Cadeia, HV/IV nos cards, auto-trigger (sub-tab Indicadores removida — agora so em AnaliseScreen) |
| `src/screens/carteira/AssetDetailScreen.js` | Grid 2x4 indicadores por ativo |
| `src/screens/analise/AnaliseScreen.js` | Sub-tab "Indicadores" com tabela + cards detalhados |
| `src/screens/home/HomeScreen.js` | Auto-trigger fire-and-forget |
| `supabase-migration.sql` | Tabela `indicators` com RLS |

## Auto-sync de Dividendos (Implementado)

Importa automaticamente dividendos, JCP e rendimentos de FIIs para tickers na carteira do usuario. Posicoes BR usam **cross-check de duas fontes** (brapi+StatusInvest). Posicoes INT usam **Yahoo Finance** com conversao USD→BRL.

### Fontes de dados
1. **brapi.dev** (BR): endpoint `?dividends=true`, retorna `dividendsData.cashDividends[]` com `rate`, `paymentDate`, `lastDatePrior`, `label`. Cobre acoes mas nao FIIs.
2. **StatusInvest** (BR): endpoint `GET /acao/companytickerprovents?ticker={TICKER}&chartProvType=2` (ou `/fii/` para FIIs). Retorna `assetEarningsModels[]` com `v` (rate), `pd` (pagamento DD/MM/YYYY), `ed` (data-ex DD/MM/YYYY), `et` (tipo). Header `User-Agent` obrigatorio. Sem token. Cobre acoes E FIIs.
3. **Yahoo Finance** (INT): endpoint `?interval=1d&range=1y&events=div`, retorna `chart.result[0].events.dividends` (objeto keyed por timestamp UNIX, cada entry tem `amount` e `date`). Cache 24h. Cobre stocks e ETFs internacionais.

### Estrategia de sync
- **BR**: busca brapi + StatusInvest em paralelo, `mergeDividends()` usa brapi como base, StatusInvest preenche gaps. Dedup por `paymentDate + round(rate, 4)`
- **INT**: busca Yahoo Finance via `fetchYahooDividends(ticker)`, converte `rate` USD→BRL via `fetchExchangeRates(['USD'])` do currencyService. Valores salvos em BRL. Descricao da movimentacao inclui valor original USD + taxa de cambio
- Se uma fonte falhar, as outras funcionam sozinhas

### Deduplicacao (insercao)
Chave composta: `ticker (upper) + data_pagamento (YYYY-MM-DD) + round(valor_por_cota, 4)`. Se match com provento existente, pula. Proventos manuais coexistem sem conflito. Para INT, `valor_por_cota` ja esta em BRL (convertido).

Trigger automatico fire-and-forget na Home apos 18h BRT via `shouldSyncDividends()`. Sync manual via botao "Sincronizar" na tela de Proventos.

### Limitacoes
- **Quantidade BR**: usa posicao HISTORICA na data-com via `positionAtDate()` (reconstroi qty a partir das operacoes). Pula dividendos com data-com futura ou sem posicao na data-ex
- **Quantidade INT**: usa posicao ATUAL (Yahoo nao fornece ex-date confiavel)
- **Corretora**: auto-sync nao preenche campo corretora
- **Escopo**: filtra dividendos dos ultimos 12 meses com paymentDate valido
- **StatusInvest**: pode ter rate limiting sem aviso; User-Agent necessario

### Arquivos modificados/criados
| Arquivo | Mudanca |
|---------|---------|
| `src/services/yahooService.js` | +fetchYahooDividends (cache 24h, &events=div) |
| `src/services/dividendService.js` | Criado — fetchDividendsBrapi, fetchDividendsStatusInvest, mergeDividends, mapLabelToTipo, shouldSyncDividends, runDividendSync (BR+INT) |
| `src/screens/home/HomeScreen.js` | Auto-trigger fire-and-forget dividend sync, linha stock_int no breakdown |
| `src/screens/renda/RendaResumoView.js` | Linha stock_int no breakdown de dividendos |
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
| `src/screens/home/HomeScreen.js` | Salva snapshot ao abrir |
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

## Tooltips InfoTip (Implementado)

Componente `InfoTip` com icone Ionicons `information-circle-outline` (14px, cor `C.accent`). Toque abre Modal com overlay escuro e texto explicativo. Botao "Entendi" para fechar.

### Props
- `text` (string) — texto explicativo exibido no modal
- `title` (string) — titulo opcional no topo do modal
- `size` (number, default 14) — tamanho do icone
- `color` (string, default `C.accent`) — cor do icone
- `style` (object) — estilo adicional no container

### Telas com tooltips

| Tela | Tooltips |
|------|----------|
| HomeScreen | Patrimonio Total, Renda do Mes, Alertas |
| CarteiraScreen | Posicoes (PM) |
| OpcoesScreen | Summary bar (moneyness/cobertura/DTE), Gregas BS, HV/IV |
| RendaResumoView | Renda do Mes, Media Anual |
| AnaliseScreen (Todos) | Retorno Mensal/Semanal, Drawdown, Rentabilidade por Ativo |
| AnaliseScreen (Indicadores) | Tabela resumo (HV, RSI, Beta, Max DD) |
| AnaliseScreen (Rebalanceamento) | Metas de alocacao |
| ProventosScreen | Titulo (tipos + sincronizar) |
| RendaFixaScreen | Titulo (indexadores/tipos) |
| ConfigSelicScreen | Taxa Selic |
| ConfigMetaScreen | Meta mensal |

### Arquivos modificados/criados
| Arquivo | Mudanca |
|---------|---------|
| `src/components/InfoTip.js` | Criado — componente InfoTip com Modal |
| `src/components/index.js` | Export do InfoTip |
| `src/screens/home/HomeScreen.js` | 3 tooltips (patrimonio, renda, alertas) |
| `src/screens/carteira/CarteiraScreen.js` | 1 tooltip (posicoes/PM) |
| `src/screens/opcoes/OpcoesScreen.js` | 3 tooltips (summary, gregas, HV/IV) |
| `src/screens/analise/AnaliseScreen.js` | 5 tooltips (retorno, drawdown, rentabilidade, indicadores, rebalanceamento) |
| `src/screens/proventos/ProventosScreen.js` | 1 tooltip (titulo) |
| `src/screens/rf/RendaFixaScreen.js` | 1 tooltip (titulo) |
| `src/screens/mais/config/ConfigSelicScreen.js` | 1 tooltip (taxa selic) |
| `src/screens/mais/config/ConfigMetaScreen.js` | 1 tooltip (meta mensal) |

## Correcao de Portugues (Implementado)

Revisao geral de textos UI para portugues correto com acentos. Todas as strings visiveis ao usuario foram corrigidas.

### Categorias de correcao
- **Setores/segmentos** (AnaliseScreen): Petroleo→Petróleo, Mineracao→Mineração, Saude→Saúde, Construcao→Construção, Industria→Indústria, Logistica→Logística, Recebiveis→Recebíveis, Diagnosticos→Diagnósticos, Farmacias→Farmácias, Frigorificos→Frigoríficos, Escritorios→Escritórios, Concessoes→Concessões, etc.
- **Labels UI**: Amortizacao→Amortização, Bonificacao→Bonificação, Historico→Histórico, Posicao→Posição, Transacoes→Transações, Preco Medio→Preço Médio, Composicao→Composição, Visao Geral→Visão Geral, Premios→Prêmios, Acoes→Ações
- **Mensagens**: "Essa acao nao pode"→"Essa ação não pode", "ja pagos"→"já pagos", "ja esta"→"já está", "Cotacoes indisponiveis"→"Cotações indisponíveis"
- **Maps atomicos**: TICKER_SECTORS, FII_REBAL_MAP, FII_SECTORS_SET e mapBrapiSector atualizados em conjunto para manter consistencia de lookups

### Bug fixes incluidos
- `OpcoesScreen`: null guard `positions || []` em OpCard
- `AnaliseScreen`: `if (!p) continue` em enrichTickerSectors, `if (!pt || !pt.date)` em computeMonthlyReturns/computeWeeklyReturns
- `dividendService`: catches silenciosos trocados por `console.warn` com contexto (4 locais StatusInvest)

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/analise/AnaliseScreen.js` | ~40 setores/segmentos + 6 labels + 3 null guards |
| `src/screens/proventos/ProventosScreen.js` | Amortizacao, Bonificacao, Historico, acao nao pode, ja pagos |
| `src/screens/proventos/AddProventoScreen.js` | Amortizacao, Bonificacao |
| `src/screens/proventos/EditProventoScreen.js` | Amortizacao, Bonificacao, Salvar Alteracoes |
| `src/screens/carteira/AssetDetailScreen.js` | Periodo, Cotacoes, operacao, HISTORICO, POSICAO, Preco Medio, TRANSACOES |
| `src/screens/mais/HistoricoScreen.js` | Historico |
| `src/screens/mais/config/ConfigSelicScreen.js` | HISTORICO DE ALTERACOES |
| `src/services/dividendService.js` | 4 catches silenciosos → console.warn |
| `src/screens/opcoes/OpcoesScreen.js` | positions null guard |

## Gestao Financeira / Fluxo de Caixa (Implementado)

Tab "Carteira" (icone briefcase) com sub-tabs "Ativos" + "Caixa". Sistema completo de fluxo de caixa com registro de movimentações financeiras integrado ao resto do app.

### Estrutura
- **GestaoScreen**: wrapper com sub-tabs Pill (Ativos / Caixa), renderiza CarteiraScreen ou CaixaView
- **CaixaView**: dashboard de caixa com hero saldo, accordion de contas, resumo mensal, últimas movimentações, gráficos
- **AddMovimentacaoScreen**: form manual (tipo entrada/saída, categoria, conta, valor R$, ticker opcional, descrição, data)
- **ExtratoScreen**: extrato completo com filtros por período/conta, agrupado por mês, long-press para excluir manuais
- **AddContaScreen**: criar nova conta (nome, tipo corretora/banco/outro, saldo inicial)

### Tabela `movimentacoes`
- **tipo**: `entrada`, `saida`, `transferencia`
- **categoria**: `deposito`, `retirada`, `transferencia`, `compra_ativo`, `venda_ativo`, `premio_opcao`, `recompra_opcao`, `exercicio_opcao`, `dividendo`, `jcp`, `rendimento_fii`, `rendimento_rf`, `ajuste_manual`, `salario`, `despesa_fixa`, `despesa_variavel`, `outro`
- **referencia_id/referencia_tipo**: link para operação/opção/provento que gerou a movimentação
- **saldo_apos**: saldo da conta após a movimentação (calculado por `addMovimentacaoComSaldo`)

### Integração automática
| Tela | Ação | Movimentação |
|------|------|-------------|
| AddOperacaoScreen | Compra/venda ativo | Alert "Atualizar saldo em CORRETORA?" → `compra_ativo`/`venda_ativo` |
| AddOpcaoScreen | Venda opção | Alert "Creditar prêmio R$ X em CORRETORA?" → `premio_opcao` |
| OpcoesScreen | Recompra (handleClose) | `recompra_opcao` via `addMovimentacaoComSaldo` ao descontar do saldo |
| OpcoesScreen | Exercício | `exercicio_opcao` fire-and-forget após criar operação na carteira |
| OpcoesScreen | Expirou PÓ | `premio_opcao` informativo (prêmio mantido) |
| dividendService | Auto-sync dividendos | `dividendo`/`jcp`/`rendimento_fii` na primeira conta cadastrada |

### CaixaView — Seções
1. **Hero**: Glass card com saldo total + chips horizontais por conta
2. **Contas (Accordion)**: cada conta com ícone 2 letras, expandível com últimas 5 movimentações + botões Depositar/Retirar/Transferir/Excluir
3. **Resumo Mensal**: total entradas vs saídas vs saldo do período, comparação com mês anterior
4. **Últimas Movimentações**: 15 últimas com ícone colorido, descrição, valor, badge conta
5. **Gráfico Entradas vs Saídas**: barras lado a lado (verde/vermelho) últimos 6 meses
6. **Resumo por Categoria**: barras horizontais com % por categoria do mês atual

### Saldo livre removido da Carteira
A seção "SALDO DISPONÍVEL" foi removida do CarteiraScreen e movida para CaixaView no tab Carteira > Caixa. Todas as operações de saldo (depositar, deduzir, transferir, excluir) agora logam movimentações automaticamente.

### Arquivos criados/modificados
| Arquivo | Mudança |
|---------|---------|
| `supabase-migration.sql` | Tabela `movimentacoes` + indexes + RLS |
| `src/services/database.js` | 6 funções CRUD movimentações + helper `buildMovDescricao` |
| `src/navigation/AppNavigator.js` | Tab "Carteira" (briefcase), stack screens AddMovimentacao/Extrato/AddConta |
| `src/screens/gestao/GestaoScreen.js` | **Criado** — wrapper sub-tabs Ativos/Caixa |
| `src/screens/gestao/CaixaView.js` | **Criado** — dashboard de caixa completo + gráficos |
| `src/screens/gestao/AddMovimentacaoScreen.js` | **Criado** — form manual de movimentação |
| `src/screens/gestao/ExtratoScreen.js` | **Criado** — extrato com filtros e agrupamento por mês |
| `src/screens/gestao/AddContaScreen.js` | **Criado** — cadastro de nova conta |
| `src/screens/carteira/CarteiraScreen.js` | Removida seção saldo livre (movida para Caixa) |
| `src/screens/carteira/AddOperacaoScreen.js` | Alert de atualização de saldo + movimentação |
| `src/screens/opcoes/AddOpcaoScreen.js` | Alert creditar prêmio + movimentação |
| `src/screens/opcoes/OpcoesScreen.js` | Log movimentação em recompra/exercício/expirou PÓ |
| `src/services/dividendService.js` | Log movimentação no auto-sync de dividendos |

## Relatórios Detalhados (Implementado)

Tela de relatorios financeiros embedded na tab Renda (sub-tab "Relatórios"). Tambem acessivel como stack screen standalone. Prop `embedded` oculta header com back button. Quatro sub-tabs com filtros de periodo e graficos.

### Sub-tabs

| Sub-tab | Conteúdo |
|---------|----------|
| **Dividendos** | Summary (total/qty/ativos), evolução mensal (barras), por tipo (barras horizontais %), por ativo (cards com proventos detalhados), por corretora (agrupado com subtotais) |
| **Opções** | Summary (prêmios/recompras/resultado), cards por status (ativa/fechada/exercida/expirou PÓ), evolução mensal (barras duplas prêmios vs recompras), por ativo base (cards com P&L por opção) |
| **Operações** | Summary (compras/vendas/custos), evolução mensal (barras duplas compras vs vendas), por ativo (cards com PM compra/venda, custos) |
| **IR** | Summary (IR devido/meses/alertas >20k), prejuízo acumulado por classe, detalhamento mensal (vendas/ganhos/perdas/IR por classe, badges DARF e >20K) |

### Filtros
- Período: 3M, 6M, 1A, 2A, Tudo

### Gráficos SVG
- `BarChartSingle` — barras simples (dividendos por mês)
- `BarChartDual` — barras lado a lado (prêmios vs recompras, compras vs vendas)
- `HBarRow` — barras horizontais com % (tipos de provento)

### IR
Funções `computeIR()` e `computeTaxByMonth()` copiadas do AnaliseScreen. Calculam:
- Vendas/ganhos/perdas por classe (ações 15%, FIIs 20%, ETFs 15%)
- Isenção ações se vendas ≤ R$20k/mês
- Prejuízo acumulado transportado entre meses

### Arquivos criados/modificados
| Arquivo | Mudança |
|---------|---------|
| `src/screens/relatorios/RelatoriosScreen.js` | **Criado** — tela completa com 4 sub-tabs + graficos, prop `embedded` |
| `src/navigation/AppNavigator.js` | Embedded na tab Renda via RendaScreen |
| `src/screens/mais/MaisScreen.js` | Item "Relatorios" removido do menu (agora na tab Renda) |

## Multi-Moeda para Saldos (Implementado)

Permite cadastrar contas em moedas estrangeiras (USD, EUR, GBP, QAR, ARS, JPY, CHF). O sistema converte automaticamente para BRL ao somar no patrimonio total, mas exibe o valor na moeda original na tela da conta.

### Cambio
- brapi.dev API: `GET /api/v2/currency?currency=USD-BRL,EUR-BRL&token=...`
- Cache em memoria 30 minutos
- Fallback gracioso: se API falhar, usa cache anterior ou rate=1

### Comportamento
- **AddContaScreen**: picker de moeda (Pills: BRL, USD, EUR, GBP, QAR + "Outras"), prefixo dinamico
- **CaixaView**: saldo total em BRL (convertido), cards mostram moeda original + ≈ R$ convertido, badge de moeda
- **getDashboard**: converte saldos estrangeiros para BRL antes de somar ao patrimonio
- **Transferencias**: bloqueadas entre contas de moedas diferentes
- **Depositar/Retirar**: opera na moeda original da conta

### Editar saldo direto
Botao "Editar saldo" no card expandido da conta. Permite definir novo valor diretamente. Registra movimentacao `ajuste_manual` com diff (entrada se aumentou, saida se diminuiu). Descricao mostra valor anterior → novo.

### Excluir conta
Confirmacao com valor do saldo na mensagem. Error handling com Alert se falhar. Fecha expanded antes de excluir.

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/services/currencyService.js` | **Criado** — fetchExchangeRates, convertToBRL, getSymbol, MOEDAS |
| `src/services/database.js` | upsertSaldo aceita moeda, getDashboard converte saldos estrangeiros |
| `src/screens/gestao/AddContaScreen.js` | Picker moeda, prefixo dinamico, passa moeda ao criar |
| `src/screens/gestao/CaixaView.js` | Multi-moeda display, editar saldo, excluir melhorado |
| `supabase-migration.sql` | Coluna `moeda TEXT DEFAULT 'BRL'` em saldos_corretora |

## Melhorias UX P0-P12 (Implementado)

Treze rodadas (P0-P12) de melhorias de usabilidade cobrindo contraste, touch targets, validacao, feedback, keyboard handling, haptics, error states, toast, swipe-to-delete, performance, formularios avancados, animacoes e acessibilidade.

### P0 — Contraste e Touch Targets
- **Theme**: tokens `C.textSecondary` (#8888aa, WCAG AA) e `C.textTertiary` (#666688)
- **Tab labels**: fontSize 9→11px, icone/label unfocused usa `C.textTertiary`
- **Primitives**: Badge paddingVertical 3→4, Pill paddingVertical 6→8 + minHeight 36, Field height 42→44
- **Pill inactive text**: `C.dim` → `C.textSecondary`
- **SectionLabel**: `C.dim` → `C.textSecondary`
- **InfoTip hitSlop**: 8→12

### P1 — Home, Opcoes, Extrato
- **Home KPI bar**: substituiu GlassCard 4-StatRow por 3 chips horizontais (Rent. Mes, Posicoes, Opcoes)
- **Home alertas agrupados**: `alertsExpanded` state, separa criticos de info, colapsa info se >2
- **Skeleton loading**: espelha layout real da Home (hero, KPIs, renda, alertas, eventos)
- **OpcoesScreen**: removeu DTE duplicado dos greeks e corretora duplicada do bottom row
- **ExtratoScreen**: reverter saldo automaticamente ao excluir movimentacao (iguala CaixaView)

### P2 — Validacao e Acessibilidade
- **Validacao inline**: bordas verde/vermelha + mensagens erro em AddOperacaoScreen
- **Error handling**: try/catch + user-friendly alerts em telas de dados
- **FlatList**: substituiu ScrollView em listas longas para melhor performance
- **Acessibilidade**: accessibilityLabel e accessibilityRole em botoes interativos

### P3 — Keyboard e Focus
- **autoFocus**: primeiro campo dos formularios recebe foco automatico
- **returnKeyType**: "next" entre campos, "done" no ultimo campo
- **keyboardType**: tipos corretos (decimal-pad, numeric, email-address)
- **KeyboardAvoidingView**: behavior correto por plataforma (padding iOS, undefined Android)

### P4 — Haptics e Animacoes
- **Haptics**: feedback tatil em submit sucesso (notificationAsync Success)
- **LayoutAnimation**: transicoes suaves em expand/collapse
- **Scroll-to-top**: ScrollView volta ao topo ao mudar filtros/tabs
- **Confirmacoes**: Alert.alert antes de acoes destrutivas (excluir, descartar)
- **Loading states**: ActivityIndicator em todos os botoes de submit

### P5 — Font Sizes e Layout
- **Font size bump**: fontSize 8-9px → 10px em labels user-facing (Home, Proventos, Carteira, AssetDetail, Extrato, Historico)
- **Safe area**: respeita insets em todas as telas

### P6 — StatusBar e Error States
- **StatusBar**: `barStyle="light-content"` global no AppNavigator
- **Keyboard.dismiss()**: primeira linha de todos os handleSubmit (11 telas)
- **Error states com retry**: loadError + try/catch + EmptyState "Tentar novamente" em CarteiraScreen, OpcoesScreen, CaixaView, ProventosScreen

### P7 — Guards e Consistencia
- **beforeRemove**: warning "Descartar alteracoes?" em 6 telas Add (Operacao, Opcao, Provento, RendaFixa, Movimentacao, Conta)
- **Back button**: fontSize 34→28 em 3 telas RF (consistencia)
- **keyboardType**: numeric→decimal-pad em campos de valor (AddRendaFixa, EditRendaFixa, AddConta)
- **Double-tap guard**: useRef + useFocusEffect no CarteiraScreen previne navegacao duplicada

### P8 — Toast/Snackbar e Swipe-to-delete
- **Pull-to-refresh**: ja estava implementado em todas as 6 telas (HomeScreen, CarteiraScreen, OpcoesScreen, ProventosScreen, RendaFixaScreen, CaixaView)
- **Toast/Snackbar**: `react-native-toast-message` com visual dark/glass customizado (ToastConfig.js). Substitui Alert.alert de sucesso por toast nao-bloqueante em 10 telas (Edit*, Config*, AddConta, LoginScreen, ProventosScreen sync). Alerts com escolha "Adicionar outro/a" mantidos em telas Add
- **Swipe-to-delete**: componente `SwipeableRow` reutilizavel usando `Swipeable` de react-native-gesture-handler. Revela botao "Excluir" vermelho ao arrastar para esquerda. Haptic feedback ao revelar. Implementado em ExtratoScreen, CaixaView (2 locais) e ProventosScreen. Movimentacoes automaticas (auto) recebem `enabled={false}` — sem swipe

### Arquivos modificados (resumo)
| Arquivo | Mudancas principais |
|---------|-------------------|
| `src/theme/index.js` | Tokens textSecondary, textTertiary |
| `src/navigation/AppNavigator.js` | Tab labels 11px, StatusBar light-content |
| `src/components/Primitives.js` | Touch targets, contraste |
| `src/components/InfoTip.js` | hitSlop 12 |
| `src/components/States.js` | Skeleton espelhando Home |
| `src/screens/home/HomeScreen.js` | KPI bar, alertas agrupados, font bumps |
| `src/screens/opcoes/OpcoesScreen.js` | DTE/corretora dedup |
| `src/screens/gestao/ExtratoScreen.js` | Reverter saldo ao excluir |
| `src/screens/carteira/CarteiraScreen.js` | Error state, double-tap guard, font bumps |
| `src/screens/carteira/AddOperacaoScreen.js` | Validacao inline, beforeRemove |
| `src/screens/carteira/AssetDetailScreen.js` | Font bumps |
| `src/screens/proventos/ProventosScreen.js` | Error state, font bump |
| `src/screens/rf/AddRendaFixaScreen.js` | keyboardType, back button, beforeRemove |
| `src/screens/rf/EditRendaFixaScreen.js` | keyboardType, back button |
| `src/screens/rf/RendaFixaScreen.js` | Back button consistencia |
| `src/screens/gestao/CaixaView.js` | Error state |
| `src/screens/gestao/AddContaScreen.js` | keyboardType, beforeRemove |
| `src/screens/gestao/AddMovimentacaoScreen.js` | beforeRemove |
| `src/screens/opcoes/AddOpcaoScreen.js` | beforeRemove |
| `src/screens/proventos/AddProventoScreen.js` | beforeRemove |
| `src/components/ToastConfig.js` | **Novo** — config visual toast dark/glass |
| `src/components/SwipeableRow.js` | **Novo** — wrapper Swipeable com botao Excluir |
| `src/components/index.js` | Export ToastConfig, SwipeableRow |
| `src/navigation/AppNavigator.js` | Toast component integrado |
| `src/screens/auth/LoginScreen.js` | Alert → Toast (registro) |
| `src/screens/carteira/EditOperacaoScreen.js` | Alert → Toast + goBack |
| `src/screens/opcoes/EditOpcaoScreen.js` | Alert → Toast + goBack |
| `src/screens/proventos/EditProventoScreen.js` | Alert → Toast + goBack |
| `src/screens/proventos/ProventosScreen.js` | Alert sync → Toast, SwipeableRow em proventos |
| `src/screens/rf/EditRendaFixaScreen.js` | Alert → Toast + goBack |
| `src/screens/gestao/AddContaScreen.js` | Alert → Toast + goBack |
| `src/screens/gestao/ExtratoScreen.js` | SwipeableRow em movimentacoes (remove onLongPress) |
| `src/screens/gestao/CaixaView.js` | SwipeableRow em 2 locais (remove onLongPress) |
| `src/screens/mais/config/ConfigSelicScreen.js` | Alert → Toast + goBack |
| `src/screens/mais/config/ConfigMetaScreen.js` | Alert → Toast + goBack |
| `src/screens/mais/config/ConfigAlertasScreen.js` | Alert → Toast + goBack |

### P9 — Performance e Listas
- **FlatList optimization**: `initialNumToRender={8}`, `maxToRenderPerBatch={10}`, `windowSize={5}` em ExtratoScreen e ProventosScreen
- **Infinite scroll ExtratoScreen**: paginacao com PAGE_SIZE=50, `onEndReached` carrega mais, ActivityIndicator no footer, agrupamento por mes preservado ao append
- **Paginacao database.js**: offset/limit com `.range()` em `getMovimentacoes` e `getProventos`
- **ProventosScreen**: limit 500 + FlatList props (infinite scroll inviavel por split pendente/historico client-side)
- **React.memo**: PositionCard (CarteiraScreen) e OpCard (OpcoesScreen) evitam re-renders desnecessarios
- **Lazy loading tabs**: ja implementado via useFocusEffect + render condicional (documentado)

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/services/database.js` | offset em getMovimentacoes e getProventos via `.range()` |
| `src/screens/gestao/ExtratoScreen.js` | Infinite scroll (PAGE_SIZE=50, loadMore, onEndReached) + FlatList props |
| `src/screens/proventos/ProventosScreen.js` | limit 500 + FlatList optimization props |
| `src/screens/carteira/CarteiraScreen.js` | React.memo em PositionCard |
| `src/screens/opcoes/OpcoesScreen.js` | React.memo em OpCard |

### P10 — Formularios Avancados
- **beforeRemove em 4 Edit screens**: dirty check comparando valores atuais vs originais, savedRef para skip apos save. EditOperacaoScreen, EditOpcaoScreen, EditProventoScreen, EditRendaFixaScreen
- **Mascara de valor AddProventoScreen**: onChangeVal com centavos (pattern dos outros forms), parseBR para converter "1.234,56" → float
- **Autocomplete ticker**: componente TickerInput reutilizavel com dropdown de sugestoes filtradas (tickers da carteira via getPositions). Integrado em AddOperacaoScreen, AddOpcaoScreen, AddProventoScreen
- **Undo ao excluir**: tipo `undo` no ToastConfig com botao "Desfazer" (amarelo). ProventosScreen re-insere provento via addProvento. ExtratoScreen re-insere movimentacao via addMovimentacaoComSaldo (reverte saldo). visibilityTime 5s

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/carteira/EditOperacaoScreen.js` | beforeRemove com dirty check + savedRef |
| `src/screens/opcoes/EditOpcaoScreen.js` | beforeRemove com dirty check + savedRef |
| `src/screens/proventos/EditProventoScreen.js` | beforeRemove com dirty check + savedRef |
| `src/screens/rf/EditRendaFixaScreen.js` | beforeRemove com dirty check + savedRef |
| `src/screens/proventos/AddProventoScreen.js` | onChangeVal mascara + parseBR + TickerInput |
| `src/components/TickerInput.js` | **Novo** — autocomplete com dropdown de sugestoes |
| `src/components/index.js` | Export TickerInput |
| `src/screens/carteira/AddOperacaoScreen.js` | TickerInput + getPositions |
| `src/screens/opcoes/AddOpcaoScreen.js` | TickerInput + getPositions |
| `src/components/ToastConfig.js` | Tipo undo com botao Desfazer |
| `src/screens/proventos/ProventosScreen.js` | Undo ao excluir provento |
| `src/screens/gestao/ExtratoScreen.js` | Undo ao excluir movimentacao |

### P11 — Visual e Animacoes
- **PressableCard**: componente wrapper com Animated.spring scale (0.97 press in, 1.0 press out). Substituiu TouchableOpacity nos cards expandiveis de CarteiraScreen (PositionCard, RFCard) e CaixaView (contas)
- **EmptyState com Ionicons**: prop `ionicon` renderiza Ionicons em vez de unicode chars. Atualizado em todas as ~30 telas/contextos que usam EmptyState. Mapeamento: error→alert-circle-outline, carteira→briefcase-outline, opcoes→trending-up-outline, proventos→cash-outline, rf→document-text-outline, etc.
- **Skeleton por tela**: 5 skeletons especificos (SkeletonCarteira, SkeletonOpcoes, SkeletonCaixa, SkeletonProventos, SkeletonRendaFixa) espelhando layout real de cada tela. Substituem LoadingScreen generico
- **Transicoes de navegacao**: `animation: 'slide_from_bottom'` em 11 telas de formulario (Add/Edit) no AppNavigator. Stacks de navegacao e config manteem slide_from_right padrao

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/components/PressableCard.js` | **Novo** — wrapper com Animated.spring scale |
| `src/components/States.js` | Ionicons import, prop ionicon no EmptyState, 5 skeletons por tela |
| `src/components/index.js` | Export PressableCard + 5 skeletons |
| `src/navigation/AppNavigator.js` | slide_from_bottom em 11 Add/Edit screens |
| `src/screens/carteira/CarteiraScreen.js` | PressableCard + SkeletonCarteira + Ionicons EmptyState |
| `src/screens/opcoes/OpcoesScreen.js` | SkeletonOpcoes + Ionicons EmptyState |
| `src/screens/gestao/CaixaView.js` | PressableCard + SkeletonCaixa + Ionicons EmptyState |
| `src/screens/proventos/ProventosScreen.js` | SkeletonProventos + Ionicons EmptyState |
| `src/screens/rf/RendaFixaScreen.js` | SkeletonRendaFixa + Ionicons EmptyState |
| `src/screens/home/HomeScreen.js` | Ionicons EmptyState |
| `src/screens/mais/HistoricoScreen.js` | Ionicons EmptyState |
| `src/screens/analise/AnaliseScreen.js` | Ionicons EmptyState (~10 contextos) |
| `src/screens/relatorios/RelatoriosScreen.js` | Ionicons EmptyState (5 contextos) |

### P12 — Acessibilidade Avancada
- **Helper a11y**: `src/utils/a11y.js` com `shouldAnimate()` e `animateLayout()` — detecta ReduceMotion via `AccessibilityInfo.isReduceMotionEnabled()`, centraliza `UIManager.setLayoutAnimationEnabledExperimental` para Android
- **Componentes reutilizaveis**: accessibilityRole/Label/Hint em PressableCard, SwipeableRow, TickerInput, EmptyState (States.js), Glass, ToastConfig (undo button)
- **10 telas Add/Edit**: accessibilityLabel="Voltar" no back button + accessibilityRole/Label no submit button em AddOperacao, EditOperacao, AddOpcao, EditOpcao, AddRendaFixa, EditRendaFixa, AddProvento, EditProvento, AddMovimentacao, AddConta
- **Telas principais**: accessibilityLabel com valores dinamicos em PositionCard/RFCard (CarteiraScreen), account cards (CaixaView), action buttons (Comprar/Vender/Depositar/Retirar/etc)
- **ReduceMotion**: `animateLayout()` substitui `LayoutAnimation.configureNext()` em 9 telas (20 instancias). PressableCard nao anima se reduceMotion. Skeleton pulse fica estatico
- **Font scaling**: `maxFontSizeMultiplier={1.5}` em valores monetarios F.mono (HomeScreen ~16 instancias, CarteiraScreen ~3, OpcoesScreen ~2) para evitar overflow de layout

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/utils/a11y.js` | **Novo** — shouldAnimate(), animateLayout(), ReduceMotion listener, UIManager setup |
| `src/components/PressableCard.js` | a11y props passthrough + reduceMotion guard na animacao |
| `src/components/SwipeableRow.js` | accessibilityLabel/Role no delete button + hint no wrapper |
| `src/components/TickerInput.js` | a11y labels no input, dropdown e itens |
| `src/components/States.js` | EmptyState a11y + skeleton reduceMotion guard |
| `src/components/Glass.js` | accessibilityLabel passthrough via props |
| `src/components/ToastConfig.js` | a11y no botao undo |
| `src/screens/carteira/CarteiraScreen.js` | a11y labels em cards + animateLayout() |
| `src/screens/carteira/AssetDetailScreen.js` | animateLayout() |
| `src/screens/carteira/AddOperacaoScreen.js` | a11y labels + animateLayout() |
| `src/screens/carteira/EditOperacaoScreen.js` | a11y labels + animateLayout() |
| `src/screens/opcoes/OpcoesScreen.js` | maxFontSizeMultiplier em tooltip payoff |
| `src/screens/gestao/CaixaView.js` | a11y labels + animateLayout() |
| `src/screens/gestao/ExtratoScreen.js` | animateLayout() |
| `src/screens/proventos/ProventosScreen.js` | animateLayout() |
| `src/screens/rf/RendaFixaScreen.js` | animateLayout() |
| `src/screens/analise/AnaliseScreen.js` | animateLayout() (9 instancias) |
| `src/screens/home/HomeScreen.js` | maxFontSizeMultiplier em ~16 valores monetarios |
| + 8 telas Add/Edit restantes | a11y labels back/submit |

## Ativos Internacionais (Implementado)

Suporte a stocks e ETFs internacionais (NYSE/NASDAQ) com cotacoes via Yahoo Finance e precos em USD convertidos para BRL.

### Categorias
| Categoria | Tipo | Mercado | Moeda | API de Precos |
|-----------|------|---------|-------|---------------|
| `acao` | Acao BR | BR | BRL | brapi.dev |
| `fii` | FII | BR | BRL | brapi.dev |
| `etf` | ETF BR ou INT | BR ou INT | BRL ou USD | brapi ou Yahoo |
| `stock_int` | Stock Internacional | INT | USD | Yahoo Finance |

### Campo `mercado` (operacoes)
- `'BR'` (default) — ativo brasileiro, cotacao via brapi.dev
- `'INT'` — ativo internacional, cotacao via Yahoo Finance
- ETFs internacionais usam `categoria='etf', mercado='INT'`

### Campo `taxa_cambio` (operacoes)
- Cambio USD→BRL no momento da operacao, usado para calculo de IR
- Apenas preenchido para operacoes `mercado='INT'`

### Yahoo Finance Service (`src/services/yahooService.js`)
- `fetchYahooPrices(tickers)` — Cotacoes atuais (cache 60s)
- `fetchYahooHistory(tickers)` — Historico 1 mes closes (cache 5min)
- `fetchYahooHistoryLong(tickers)` — Historico 6 meses OHLCV (cache 1h)
- `fetchYahooDividends(ticker)` — Dividendos ultimo ano via `&events=div` (cache 24h)
- API: `https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}`
- Precos retornados em USD (moeda original)
- Fetch um ticker por vez com timeout 8s

### Routing de Precos (priceService.js)
- `enrichPositionsWithPrices` separa tickers BR vs INT pelo campo `mercado`
- Busca BR via `fetchPrices` (brapi) e INT via `fetchYahooPrices` (Yahoo) em paralelo
- Converte precos INT para BRL via `fetchExchangeRates(['USD'])`
- Campos adicionais para INT: `preco_atual_usd`, `moeda`, `taxa_cambio` (rate atual do enrich)
- `fetchPricesRouted`, `fetchHistoryRouted`, `fetchHistoryLongRouted` — roteamento por mercadoMap

### Conversao USD/BRL em posicoes INT
- `getPositions()` calcula `taxa_cambio_media` (media ponderada do cambio historico das compras): `_custo_brl / custo_total`
- CarteiraScreen usa `fxRate = pos.taxa_cambio || pos.taxa_cambio_media || 1` para converter custos INT para BRL
- Totais (totalPositions, totalCusto) convertem posicoes INT para BRL antes de somar
- Cards INT exibem "Custo (US$)", "Custo (R$)" e "Valor atual" separadamente no expandido
- Encerradas usam simbolo correto (US$/R$) baseado no campo `mercado`
- AssetDetailScreen recebe `mercado` via route.params para exibir prefixo correto (US$/R$)

### UI
- **AddOperacaoScreen**: 5 categorias (Acao, FII, ETF BR, Stocks, ETF INT), moeda dinamica R$/US$, corretoras BR vs INT, taxa_cambio salva na operacao
- **CarteiraScreen**: filtro "Stocks" (fuchsia), badge INT/BR nos cards, dual price "US$ X ≈ R$ Y", corretoras INT (Avenue, Nomad, Interactive Brokers, etc.), totais convertem INT→BRL, cards expandidos mostram custo US$/R$ separado, encerradas com simbolo correto
- **HomeScreen**: categoria stock_int na alocacao e renda mensal, linha "Dividendos Stocks" no breakdown
- **RendaResumoView**: linha "Dividendos Stocks" (fuchsia) no breakdown de dividendos
- **AnaliseScreen**: stock_int em performance, IR (15% sem isencao 20k), rebalanceamento (perfis atualizados)
- **RelatoriosScreen**: IR com secao "Stocks Internacionais"
- **AssetDetailScreen**: routing Yahoo para ativos INT, precos em US$, recebe `mercado` via route.params

### IR — Stocks Internacionais
- 15% sobre ganho de capital, SEM isencao de R$20k/mes
- Prejuizo acumulado transportado entre meses
- P&L calculado em BRL usando taxa_cambio da operacao

### Indicadores
- `runDailyCalculation`: separa BR/INT, busca Yahoo para INT
- Beta de stocks INT usa S&P 500 (`^GSPC`) como benchmark (vs `^BVSP` para BR)

### Cor Theme
- `C.stock_int: '#E879F9'` (fuchsia)
- `PRODUCT_COLORS['stock_int']` mapeado

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/services/yahooService.js` | **Criado** — Yahoo Finance API service |
| `supabase-migration.sql` | CHECK categoria + colunas mercado, taxa_cambio |
| `src/theme/index.js` | Cor stock_int + PRODUCT_COLORS |
| `src/services/priceService.js` | Routing BR/INT, enrichPositionsWithPrices, funcoes Routed |
| `src/services/database.js` | getPositions com mercado + taxa_cambio_media, getDashboard com stock_int |
| `src/services/indicatorService.js` | Routing BR/INT, benchmark S&P 500 |
| `src/services/dividendService.js` | Sync BR (brapi+StatusInvest) + INT (Yahoo Finance + USD→BRL) |
| `src/screens/carteira/AddOperacaoScreen.js` | 5 categorias, moeda dinamica, corretoras INT |
| `src/screens/carteira/CarteiraScreen.js` | Filtro Stocks, badge INT, dual price, allocMap, totais INT→BRL, custo US$/R$ expandido, encerradas com simbolo correto |
| `src/screens/carteira/EditOperacaoScreen.js` | stock_int label, badge INT, mercado persist |
| `src/screens/carteira/AssetDetailScreen.js` | Routing Yahoo, moeda US$, recebe mercado via route.params |
| `src/screens/home/HomeScreen.js` | stock_int na alocacao, renda e breakdown dividendos |
| `src/screens/analise/AnaliseScreen.js` | ~15 locais: categorias, IR 15%, rebalance, perfSub |
| `src/screens/relatorios/RelatoriosScreen.js` | IR stock_int, catColor |
| `supabase/functions/weekly-snapshot/index.ts` | Yahoo prices + cambio USD |

## Simplificacao HomeScreen P0 (Implementado)

Refactor para reduzir complexidade visual e scroll depth da HomeScreen. Reduziu de ~1533 linhas/60+ data points para ~960 linhas/~25 data points visíveis (~2 telas de scroll).

### Removido
- **DonutMini** (~300 linhas SVG triple-ring) — import `react-native-svg` removido
- **Ganhos Acumulados** — GlassCard com breakdown por categoria (duplicava info da Carteira/Analise)
- **Maiores Altas/Baixas** — 10 tickers com 5 campos cada (pertence a Carteira)
- **Meus Ativos fallback** — raramente exibido (pertence a Carteira)
- Componentes: QuoteRow, IncomeCard, fmtDonut, StatRow
- Computacoes: ganhosPorCat, ganhosTotal, topGainers, topLosers, posWithPrice, sorted

### Simplificado
- **Renda do Mes**: removido DonutMini + subtitle "ATUAL vs ANTERIOR". Novo layout com total grande (R$) + badge comparativo vs mes anterior (% verde/vermelho). Breakdown rows e meta progress bar mantidos

### Reordenado
- **KPI Bar** movido de apos Ganhos Acumulados para logo apos Patrimonio Hero

### Limitado
- **Proximos Eventos**: de `slice(0, 5)` para `slice(0, 3)`

### Metricas
| Metrica | Antes | Depois |
|---------|-------|--------|
| Linhas de codigo | ~1.533 | ~960 (-37%) |
| Data points visiveis | 60+ | ~25 (-58%) |
| Componentes SVG | DonutMini (300 linhas) | 0 |
| Scroll depth | 5+ telas | ~2 telas |
| Secoes removidas | 0 | 4 |

## Reestruturacao Navegacao (Implementado)

Reorganizacao das 5 tabs para acesso direto a features core. Motivacao: Carteira enterrada sob "Gestao" (nome vago), Proventos/Renda enterrados no menu "Mais", Analise (10.4k linhas) como tab de uso ocasional ocupando espaco primario.

### Mudanca de tabs

| Posicao | Antes | Depois |
|---------|-------|--------|
| 1 | Home | Home (inalterada) |
| 2 | Gestao (Carteira/Caixa/Relatorios) | **Carteira** (Ativos/Caixa) |
| 3 | Opcoes (6 sub-tabs) | **Opcoes** (5 sub-tabs, sem Indicadores) |
| 4 | Analise (4 sub-tabs) | **Renda** (Resumo/Proventos/Relatorios) |
| 5 | Mais (Config/Operacoes/Aprender/App) | **Mais** (+Analise Completa, -Proventos) |

### Novos arquivos
- `src/screens/renda/RendaScreen.js` — wrapper com 3 sub-tabs Pill (Resumo/Proventos/Relatorios)
- `src/screens/renda/RendaResumoView.js` — dashboard de renda com 3 GlassCards (Hero renda do mes + Dividendos recebidos/a receber + KPIs), dados via `getDashboard`, pull-to-refresh

### Prop `embedded`
ProventosScreen e RelatoriosScreen aceitam prop `embedded` que oculta o header com back button. Usado quando renderizados dentro da tab Renda.

### AnaliseScreen como stack
AnaliseScreen agora aceita `props` (navigation), exibe header com back button, acessado via Mais → Analise Completa.

### OpcoesScreen — Indicadores removido
Sub-tab "Indicadores" removida (~300 linhas). Indicadores continuam disponiveis na AnaliseScreen (via Mais) e nos cards de opcoes (HV/IV). Auto-trigger de `runDailyCalculation` mantido.

### MaisScreen reestruturado
- Adicionada secao "ANALISE" com item "Analise Completa" (navega para stack screen)
- Removido item "Proventos" de OPERACOES (agora na tab Renda)

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/renda/RendaScreen.js` | **Criado** — wrapper 3 sub-tabs |
| `src/screens/renda/RendaResumoView.js` | **Criado** — dashboard renda completo |
| `src/screens/proventos/ProventosScreen.js` | Prop `embedded` — condiciona header |
| `src/screens/relatorios/RelatoriosScreen.js` | Prop `embedded` — condiciona header |
| `src/screens/analise/AnaliseScreen.js` | Aceita props, header com back button |
| `src/screens/gestao/GestaoScreen.js` | Simplificado para 2 sub-tabs (Ativos/Caixa) |
| `src/screens/mais/MaisScreen.js` | +secao Analise, -item Proventos |
| `src/navigation/AppNavigator.js` | Tabs renomeadas, +import RendaScreen, +stack Analise, -stacks Proventos/Relatorios |
| `src/screens/opcoes/OpcoesScreen.js` | Removido sub-tab Indicadores (~300 linhas) |

## Busca e Validacao de Tickers (Implementado)

Busca em tempo real de tickers via APIs durante o cadastro de operacoes, opcoes e proventos. Resolve validacao (ticker existe?) e normalizacao (BRK.B vs BRK-B → formato canonico da API).

### APIs de busca
| API | Mercado | Endpoint | Retorno |
|-----|---------|----------|---------|
| brapi.dev | BR | `GET /api/quote/list?search=QUERY&token=TOKEN&limit=8` | `stocks[]: { stock, name, type, sector }` |
| Yahoo Finance | INT | `GET /v1/finance/search?q=QUERY&quotesCount=8&lang=pt-BR` | `quotes[]: { symbol, longname, exchange, quoteType }` — filtrado EQUITY/ETF |

### Fluxo
1. Usuario digita no TickerInput (min 2 chars)
2. Debounce 300ms cancela timer anterior, so ultima query dispara
3. `searchTickers(query, mercado)` roteia para `searchBR` ou `searchINT`
4. Cache 24h por key `mercado:QUERY` evita chamadas repetidas
5. Dropdown mostra portfolio matches (max 3, badge CARTEIRA) + API results (dedup, total max 8)
6. Cada item mostra ticker + nome da empresa (2 linhas)
7. Selecionar define o ticker com formato canonico da API

### Integracoes
| Tela | Handler | Mercado |
|------|---------|---------|
| AddOperacaoScreen | `searchTickers(query, getRealMercado(categoria))` | BR ou INT conforme categoria |
| AddOpcaoScreen | `searchTickers(query, 'BR')` | Sempre BR (opcoes sao B3) |
| AddProventoScreen | `searchTickers(query, 'BR')` | Sempre BR |

### Comportamento sem rede
Se API falhar ou timeout (5s), `searchTickers` retorna `[]`. TickerInput continua mostrando sugestoes do portfolio normalmente.

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/services/tickerSearchService.js` | **Criado** — searchBR, searchINT, searchTickers, cache 24h, fetchWithTimeout |
| `src/components/TickerInput.js` | onSearch prop, debounce 300ms, merge portfolio+API, ActivityIndicator, badge CARTEIRA, nome empresa |
| `src/screens/carteira/AddOperacaoScreen.js` | import + onSearch roteado por categoria + limpar ticker em troca BR↔INT |
| `src/screens/opcoes/AddOpcaoScreen.js` | import + onSearch BR |
| `src/screens/proventos/AddProventoScreen.js` | import + onSearch BR |

## Corretora Customizavel + Multi-Moeda (Implementado)

Componente `CorretoraSelector` reutilizavel que substitui listas hardcoded de corretoras em 10 telas. Suporta ~60 instituicoes com metadados (moeda, tipo), autocomplete com busca, corretoras customizadas do usuario, e contas multi-moeda por instituicao.

### CorretoraSelector — Componente

**Props**:
| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| `value` | string | `''` | Corretora selecionada |
| `onSelect` | function(name, meta) | — | Callback com nome + metadados ({moeda, tipo} ou null se custom) |
| `userId` | string | — | Para buscar user_corretoras |
| `mercado` | string | `'BR'` | `'BR'` ou `'INT'` (determina defaults e sugestoes) |
| `color` | string | `C.acoes` | Cor das Pills |
| `label` | string | `'CORRETORA'` | Texto do label |
| `showLabel` | boolean | `true` | Mostrar label |
| `defaults` | array | `null` | Override da lista padrao |

**Exports**: `CorretoraSelector` (default), `DEFAULTS_RF`, `ALL_INSTITUTIONS`, `getInstitutionMeta`

**ALL_INSTITUTIONS** (~60 entradas): array com `{ name, moeda, tipo }` para cada instituicao. Inclui corretoras BR (Clear, XP, Rico, Genial, BTG...), bancos BR (Inter, Nubank, Itau, Bradesco, Santander...), fintechs (C6 Bank, PagBank, Mercado Pago...) e corretoras INT (Avenue, Nomad, Interactive Brokers, Stake, Charles Schwab...).

**getInstitutionMeta(name)**: lookup case-insensitive que retorna `{name, moeda, tipo}` ou null.

**UX**:
1. Pills rapidas: corretoras do usuario (por count DESC) + defaults baseados em `mercado`
2. Pill "+ Outra": abre TextInput com dropdown de sugestoes filtradas
3. Cada sugestao mostra: nome + badge moeda (R$/US$) + badge "MINHA" se do usuario
4. "Usar [texto]" como ultima opcao para nomes totalmente customizados
5. `normalizeCorretora(name)`: trim + collapse espacos multiplos
6. Ao selecionar pill ou sugestao, chama `onSelect(nome, meta)` — parent recebe moeda sugerida

### Multi-Moeda por Instituicao

Mesma corretora/banco pode ter contas em moedas diferentes (ex: Inter BRL + Inter USD, XP BRL + XP USD).

**Constraint SQL**: `UNIQUE(user_id, name, moeda)` em vez de `UNIQUE(user_id, name)`.
Migration: `fix-multi-moeda-constraint.sql`

**addMovimentacaoComSaldo**: busca conta por `conta + moeda` quando moeda informada:
```
.eq('corretora', mov.conta)
if (mov.moeda) { .eq('moeda', mov.moeda) }
```

### Integracao nas telas

| Tela | Mudanca |
|------|---------|
| AddOperacaoScreen | CorretoraSelector com mercado BR/INT, passa `moeda` no Alert de saldo |
| EditOperacaoScreen | CorretoraSelector + incrementCorretora no submit |
| AddOpcaoScreen | CorretoraSelector BR + incrementCorretora no submit |
| EditOpcaoScreen | CorretoraSelector BR + incrementCorretora no submit |
| AddProventoScreen | CorretoraSelector BR (removeu fetch manual getUserCorretoras) + incrementCorretora |
| EditProventoScreen | CorretoraSelector BR (removeu fetch manual) |
| AddRendaFixaScreen | CorretoraSelector com `defaults={DEFAULTS_RF}` (inclui bancos) |
| EditRendaFixaScreen | CorretoraSelector com `defaults={DEFAULTS_RF}` + incrementCorretora |
| AddContaScreen | Merge user corretoras nas sugestoes + auto-selecao moeda/tipo via getInstitutionMeta |

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/components/CorretoraSelector.js` | **Criado** — Pills + autocomplete ~60 instituicoes com metadados |
| `src/components/index.js` | Export CorretoraSelector, DEFAULTS_RF, ALL_INSTITUTIONS, getInstitutionMeta |
| `fix-multi-moeda-constraint.sql` | **Criado** — ALTER UNIQUE para (user_id, name, moeda) |
| `src/services/database.js` | addMovimentacaoComSaldo: busca por conta + moeda |
| `src/screens/carteira/AddOperacaoScreen.js` | CorretoraSelector + moeda no Alert de saldo |
| `src/screens/carteira/EditOperacaoScreen.js` | CorretoraSelector + incrementCorretora |
| `src/screens/opcoes/AddOpcaoScreen.js` | CorretoraSelector + incrementCorretora |
| `src/screens/opcoes/EditOpcaoScreen.js` | CorretoraSelector + incrementCorretora |
| `src/screens/proventos/AddProventoScreen.js` | CorretoraSelector (removeu fetch manual) + incrementCorretora |
| `src/screens/proventos/EditProventoScreen.js` | CorretoraSelector (removeu fetch manual) |
| `src/screens/rf/AddRendaFixaScreen.js` | CorretoraSelector com DEFAULTS_RF |
| `src/screens/rf/EditRendaFixaScreen.js` | CorretoraSelector com DEFAULTS_RF + incrementCorretora |
| `src/screens/gestao/AddContaScreen.js` | Merge user corretoras + auto-moeda/tipo via getInstitutionMeta |

## Indicadores Fundamentalistas no Card Expandido (Implementado)

Cards expandidos na CarteiraScreen agora incluem 6 secoes accordion com indicadores de opcoes e fundamentalistas. Dados fundamentalistas buscados via brapi.dev (BR) e Yahoo Finance (INT) com cache 24h. Lazy loading ao expandir card.

### Secoes accordion (dentro do card expandido)
1. **Opcoes** — Ativas, Cobertura, Premios Rec., P&L Opcoes, HV 20d, IV Media, Yield Opcoes, Prox. Venc. (so para acoes com opcoes)
2. **Valuation** — P/L, P/VP, EV/EBITDA, EV/EBIT, VPA, LPA, P/Ativo, P/SR, PEG, D.Y.
3. **Endividamento** — Div.Liq/PL, Div.Liq/EBITDA, Passivos/Ativos, PL/Ativos
4. **Eficiencia** — M. Bruta, M. EBITDA, M. EBIT, M. Liquida
5. **Rentabilidade** — ROE, ROIC, ROA, Giro Ativos
6. **Crescimento (5A)** — CAGR Receitas, CAGR Lucros

### Comportamento por tipo de ativo
- **Acoes BR**: todas 6 secoes (opcoes + 5 fundamentalistas)
- **Stocks INT**: 5 secoes fundamentalistas (sem opcoes)
- **FIIs**: tipicamente P/VP e D.Y. (demais null = ocultados)
- **ETFs**: muito limitado, secoes vazias nao renderizam

### Features
- Tooltips (InfoTip) por metrica com explicacao em portugues
- Icone grafico (📊) abre modal com barras de 5 anos (FundamentalChart)
- Cores semanticas: verde/vermelho por indicador (ROE >15% verde, <5% vermelho, etc.)
- Div.Liq/EBITDA negativo exibe "Caixa Liq." em verde
- Black-Scholes para IV media das opcoes ativas

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/services/fundamentalService.js` | **Criado** — fetchFundamentals, clearFundamentalsCache, cache 24h, brapi+Yahoo |
| `src/components/FundamentalAccordion.js` | **Criado** — 6 secoes accordion com BS helpers, tooltips, graficos |
| `src/components/FundamentalChart.js` | **Criado** — Modal com grafico de barras 5 anos |
| `src/components/index.js` | Export FundamentalAccordion, FundamentalChart |
| `src/screens/carteira/CarteiraScreen.js` | States fundamentals/opcoes/indicators, getOpcoes no load, toggleExpand com lazy fetch, FundamentalAccordion no expanded, props no PositionCard |

## Analise IA com Claude (Implementado)

Edge Function `analyze-option` usa Claude Haiku 4.5 via API Anthropic para analisar operacoes de opcoes. A chave fica como secret `ANTHROPIC_API_KEY` no Supabase (nunca exposta ao client).

### Arquitetura
- **Edge Function**: `supabase/functions/analyze-option/index.ts` (Deno runtime)
- **Client**: `src/services/geminiService.js` (nome legado, chama Edge Function via `supabase.functions.invoke`)
- **Model**: `claude-haiku-4-5-20251001`, max_tokens 8192
- **API**: `POST https://api.anthropic.com/v1/messages`, header `x-api-key` + `anthropic-version: 2023-06-01`
- **Deploy**: `npx supabase functions deploy analyze-option --no-verify-jwt --project-ref zephynezarjsxzselozi`

### Prompt dinamico
- **Objetivo**: usuario escolhe Renda/Protecao/Especulacao (`aiObjetivo` state). Cada objetivo gera prompt com contexto e instrucoes especificas
- **4 secoes obrigatorias**: [RISCO], [ESTRATEGIAS], [CENARIOS], [EDUCACIONAL]
- **Tom didatico**: "explique como para investidor iniciante/intermediario, termos tecnicos com explicacao entre parenteses"
- **Sizing por capital**: se capital informado, IA calcula e sugere qtd exata de opcoes por estrategia (max 2-5% capital por operacao)
- **Multi-leg**: descreve cada perna individualmente, identifica nome da estrategia, analisa posicao combinada
- **Contexto**: inclui portfolio do usuario, posicao no ativo, indicadores tecnicos (HV, RSI, Beta)
- **Regra de brevidade**: max 800 chars por secao para nao estourar tokens

### Fluxo client-side
1. SimuladorBS monta payload com `legs[]`, `objetivo`, `capital`, `portfolio`, gregas agregadas, cenarios
2. `geminiService.analyzeOption(data)` envia via Edge Function (cache 5min, cooldown 10s)
3. Edge Function autentica usuario, monta prompt, chama Claude API, parseia resposta em 4 secoes
4. `AiAnalysisModal` exibe resultado em ScrollView com secoes colapsaveis

### Cache key
`buildCacheKey` inclui: spot, iv, dte, objetivo, capital + hash de todas as legs (tipo+direcao+strike+premio+qty)

## Simulador Multi-Leg (Implementado)

Simulador de opcoes suporta multiplas pernas para montar spreads, iron condors, straddles etc. com payoff combinado.

### Arquitetura de estado (SimuladorBS)
- **Shared params**: `spot`, `ivInput`, `dte` — mesmos para todas as pernas
- **Per-leg array**: `legs = [{ id, tipo, direcao, strike, premio, qty }]`
- **Active leg**: `activeLeg` (indice), `nextLegId` (contador)
- **Helpers**: `updateLeg(idx, field, val)`, `addLeg(params)`, `removeLeg(idx)`
- Pills Tipo/Direcao e inputs Strike/Premio/Qty editam `legs[activeLeg]`

### PayoffChart multi-leg
- Aceita prop `legs[]` (backward-compat: se nao receber, monta array de 1 dos props antigos)
- `calcPL(price)` loop sobre todas as pernas, soma P&L
- Range dinamico: min/max de todos os strikes
- Breakeven: zero-crossings por interpolacao linear (pode ter multiplos)
- Max ganho/perda dos data points reais

### Gregas agregadas
- Net delta/gamma/theta/vega = soma(leg_greek * qty * sign) onde sign = -1 para venda, +1 para compra
- Per-leg IV computada via Black-Scholes do premio (ou IV base como fallback)
- Display adaptivo: single-leg mostra gregas por opcao, multi-leg mostra posicao liquida

### Resumo multi-leg
- Single-leg: Premio total, Theta/dia, Breakeven, Contratos
- Multi-leg: Credito/Debito liquido, Theta/dia total, Pernas, Total opcoes

### Cenarios What-If multi-leg
- `calcScenarioResult(pctMove)` loop sobre todas as pernas com BS re-pricing

### Leg Cards UI
- Cards compactos por perna: Badge CALL/PUT + V/C + strike + premio + qty
- Perna ativa com borda glow `C.opcoes`, toque para ativar
- Botao [X] para remover (minimo 1 perna)
- Botao "+ Adicionar Perna" com estilo dashed

### 6 Presets de Estrategia
- Pills horizontais: Credit Call, Credit Put, Iron Condor, Straddle, Strangle, Butterfly
- `applyPreset(key)` calcula strikes a partir do spot (step: <20→1, ≤50→2, else→5)
- Premios preenchidos via Black-Scholes com IV base

### CadeiaSintetica — Modo Multi-Perna
- Toggle "Modo Multi-Perna ON/OFF" (`addLegMode` state)
- Quando ON, toque na cadeia adiciona perna nova (`addAsLeg: true` no simParams)
- Quando OFF, toque substitui simulador inteiro (comportamento original)

### simParams useEffect
- `addAsLeg` flag: chama `addLeg()` em vez de substituir
- Shared params (spot, iv, dte) sempre atualizam independente do modo

### AI payload multi-leg
- `data.legs[]` array com tipo/direcao/strike/premio/qty por perna
- Gregas liquidas da posicao combinada
- `netPremio` (credito/debito liquido)

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/opcoes/OpcoesScreen.js` | PayoffChart multi-leg, SimuladorBS legs state + helpers, Leg Cards UI, Presets, CadeiaSintetica addLegMode |
| `supabase/functions/analyze-option/index.ts` | Claude Haiku API, prompt multi-leg + didatico + sizing, max_tokens 8192 |
| `src/services/geminiService.js` | Cache key com legs hash + objetivo + capital |

## Bugs Conhecidos / Investigar

- [ ] **IA truncando resposta na secao estrategias**: mesmo com max_tokens 8192 (maximo do Haiku), a resposta da Edge Function `analyze-option` corta no meio da secao [ESTRATÉGIAS]. Ja tentado: aumentar max_tokens (2048→4096→6000→8192), reduzir prompt (3→2 estrategias, max 800 chars/secao). Possíveis causas a investigar:
  - Timeout da Edge Function Supabase (default 60s) — Haiku pode estar demorando mais que o timeout
  - `stop_reason` pode ser `max_tokens` ou outro — adicionar log de `claudeJson.usage.output_tokens` e `claudeJson.stop_reason` na resposta para diagnosticar
  - Testar reduzir ainda mais o prompt ou usar `temperature: 0` para respostas mais curtas
  - Arquivo: `supabase/functions/analyze-option/index.ts`

## Proximas Melhorias Possiveis

- [ ] Rolagem de opcoes (fechar atual + abrir nova com um clique)
- [ ] Notificacoes push para vencimentos proximos
- [ ] Importacao de operacoes via CSV/Excel
- [ ] Integracao com CEI/B3 para importacao automatica
- [ ] Dark/Light mode toggle
- [ ] Backup/restore de dados
- [ ] Screen reader flow: testar e ajustar ordem de leitura com accessibilityOrder
