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
    carteira/      Portfolio (Carteira, AddOperacao, EditOperacao, AssetDetail, ImportOperacoes)
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
    csvImportService.js Parse CSV/TSV/XML/nota de corretagem, detect B3/CEI/generic, validate, deduplicate
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
3. **Opcoes** - Cards com gregas BS, moneyness, cobertura, simulador, historico. 4 sub-tabs (ativas, pendentes, sim, hist)
4. **Renda** - Sub-tabs "Resumo" (RendaResumoView) + "Proventos" (ProventosScreen embedded) + "Relatorios" (RelatoriosScreen embedded). Icone cash. Componente: RendaScreen
5. **Mais** - Menu de configuracoes, utilidades + acesso a Analise Completa (stack screen)

### Stacks modais
- AddOperacao, EditOperacao, AssetDetail, ImportOperacoes
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
| `profiles` | id, nome, meta_mensal, selic, last_dividend_sync, trial_pro_used, trial_pro_start, trial_premium_used, trial_premium_start, referral_code(UNIQUE), referred_by, referral_reward_tier, referral_reward_end, device_id, opcoes_favorites(JSONB), opcoes_watchlist(JSONB), gastos_rapidos(JSONB) |
| `operacoes` | ticker, tipo(compra/venda), categoria(acao/fii/etf/stock_int), quantidade, preco, custos, corretora, data, mercado(BR/INT), taxa_cambio |
| `opcoes` | ativo_base, ticker_opcao, tipo(call/put), direcao(venda/compra/lancamento), strike, premio, quantidade, vencimento, data_abertura, status, corretora, premio_fechamento, data_fechamento, alerta_pl |
| `proventos` | ticker, tipo_provento, valor_por_cota, quantidade, valor_total, data_pagamento |
| `renda_fixa` | tipo(cdb/lci_lca/tesouro_*), emissor, taxa, indexador, valor_aplicado, vencimento |
| `saldos_corretora` | name, saldo, tipo(corretora/banco), moeda(BRL/USD/EUR/etc, default BRL). UNIQUE(user_id, name, moeda) — permite mesma instituicao com contas em moedas diferentes |
| `user_corretoras` | name, count |
| `alertas_config` | flags de alertas + thresholds |
| `indicators` | HV, RSI, SMA, EMA, Beta, ATR, BB, MaxDD por ticker (UNIQUE user_id+ticker) |
| `rebalance_targets` | class_targets(JSONB), sector_targets(JSONB), ticker_targets(JSONB) — metas de rebalanceamento persistidas |
| `patrimonio_snapshots` | user_id, data(DATE), valor, portfolio_id(UUID nullable) — snapshot diario/semanal do patrimonio real. NULL=global, UUID=portfolio custom, sentinela `00000000-0000-0000-0000-000000000001`=Padrao. UNIQUE via index COALESCE |
| `movimentacoes` | conta, tipo(entrada/saida/transferencia), categoria, valor, descricao, referencia_id, ticker, conta_destino, saldo_apos, data — fluxo de caixa completo |
| `vip_overrides` | email(UNIQUE), tier(pro/premium), motivo, concedido_por, ativo(bool) — bypass de acesso VIP gerenciado via SQL |
| `referrals` | referrer_id, referred_id, referred_email, device_id, status(pending/active/expired), activated_at — programa de indicacao. UNIQUE(referred_id), RLS por referrer_id |

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
- **Opcoes**: getOpcoes, addOpcao, updateOpcaoAlertaPL
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

### csvImportService.js - Funcoes exportadas
- `parseCSVText(text)` - Parse CSV/TSV → { headers, rows }. Converte XML Spreadsheet automaticamente
- `parseCEI(headers, rows)` - Parse formato CEI → operacoes/opcoes/exercicios normalizados
- `parseB3(headers, rows)` - Parse formato B3 → operacoes normalizadas
- `parseGeneric(headers, rows)` - Parse CSV generico → operacoes normalizadas
- `isNotaCorretagem(text)` - Detecta nota de corretagem por score de keywords
- `parseNotaCorretagem(text)` - Parse nota completa: header + trades + custos pro-rata
- `detectFormat(headers)` - Detecta formato: 'cei', 'b3', 'generic', 'unknown'
- `findDuplicates(newOps, existingOps, existingOpcoes)` - Dedup exact/partial/opcao match
- `validateRow(op)` - Validacao por _importType
- `decodeCSVBuffer(buffer)` - Detecta encoding UTF-8/Latin-1
- `decodeOptionTicker(ticker)` - Decode ticker opcao B3 (PETRC402 → base/tipo/mes/strike)
- `estimateStrike(strikeRef)` - Heuristica strike B3
- `extractTicker(produto)` - Extrai ticker de campo Produto B3
- `mapCorretora(nome)` - Nome legal B3 → nome comercial
- `detectCategory(ticker)` - Classifica acao/fii/etf

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
- Treemap de exposicao visual (heatmap com variacao diaria, cores verde/vermelho por intensidade) + modal fullscreen com detalhes expandidos (ticker, variacao, qty, PM, preco atual, P&L)
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

### Opcoes (OpcoesScreen) — 4 sub-tabs (ativas, pendentes, sim, hist)
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
  - **Fullscreen**: botao expand-outline no header abre Modal tela cheia com TODOS os strikes da serie (inline mostra 5+ATM+5=11). Toque em strike no fullscreen preenche simulador e fecha modal automaticamente
- **HV/IV nos cards**: linha "HV: XX% | IV: YY%" + badge "IV ALTA" (>130% HV) / "IV BAIXA" (<70% HV)
- **Badge direcao VENDA/COMPRA**: badge dedicado no header do card entre CALL/PUT e cobertura. VENDA em amarelo (`C.etfs`), COMPRA em ciano (`C.rf`), sempre visivel independente da cobertura
- **Corretora visivel**: label da corretora no card de opcao ativa (abaixo do header)
- **Historico**: resumo P&L total (considera premio_fechamento para fechadas), contadores expiradas PO/exercidas/fechadas + lista detalhada com P&L real por opcao, detalhes de recompra (preco, qty, data) nas fechadas. Cards fechadas mostram linha resumo: Recebido (premio total), Recompra (custo total), Resultado (P&L com cor verde/vermelha)
- **Data abertura**: campo data_abertura nas opcoes, premios calculados com D+1 (liquidacao)
- DTE badge no header de cada card

### Home (HomeScreen)
- **Patrimonio Hero**: card principal com valor total, rentabilidade mes (%), breakdown RV/RF, InteractiveChart com pontos semanais, allocation bar + legenda
- **KPI Bar**: 3 chips horizontais logo apos o hero (Rent. Mes %, Posicoes count, Opcoes count + venc 7d)
- **Renda do Mes** (simplificado): total grande com badge comparativo vs mes anterior (% em verde/vermelho + valor do mes anterior "Ant: R$ X"), 5 breakdown rows compactos (dot + label + valor), meta progress bar + % + faltam R$
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

Apos `supabase-migration.sql`, executar tambem:
- `fix-multi-moeda-constraint.sql` — UNIQUE (user_id, name, moeda) em saldos_corretora
- `subscription-trial-migration.sql` — colunas trial_pro/premium no profiles
- `subscription-extras-migration.sql` — tabela vip_overrides + tabela referrals + RPCs anti-fraude + colunas referral/device_id no profiles

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
| 3 | Opcoes (6 sub-tabs) | **Opcoes** (4 sub-tabs: ativas, pendentes, calculadora, historico) |
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
- **Contexto**: inclui portfolio do usuario, posicao no ativo, indicadores tecnicos (HV, RSI, Beta), indicadores manuais (VH, VWAP, OI)
- **Regra de brevidade**: max 800 chars por secao para nao estourar tokens

### Regras do prompt da IA
| Regra | Descricao |
|-------|-----------|
| COBERTURA (ABSOLUTA) | Nunca sugere venda descoberta/naked de CALL. Se usuario tem N acoes, max N opcoes de CALL vendidas. Se 0 acoes, redireciona para CSP ou compra |
| CLAREZA | Cada perna de cada estrategia no formato 'VENDER X CALL strike R$Y a R$Z' — nunca omitir COMPRAR/VENDER ou CALL/PUT |
| RISCO-PRIMEIRO | Sempre apresentar perda maxima ANTES do ganho potencial |
| SAIDA | Toda estrategia DEVE incluir criterios de saida: quando lucrar, quando cortar perda, quando rolar |
| CSP | Para toda PUT vendida: capital necessario se exercida (strike x qty), preco efetivo de compra (strike - premio) |
| COVERED CALL | Para toda CALL vendida coberta: strike vs PM (lucro se exercida?), yield mensal, custo de oportunidade |
| REGRAS B3 | Opcoes americanas (exercicio a qualquer momento), liquidacao fisica D+1, risco de exercicio antecipado perto de data-ex |
| IR | 15% swing / 20% day trade, sem isencao R$20k, premios sao receita tributavel |
| QUANTIDADE | Sempre em numero de opcoes (ex: 'vender 200 opcoes'), nunca contratos ou lotes |
| STRIKES | Se cadeia disponivel, IA so pode usar strikes da lista fornecida |

### Alertas dinamicos no prompt (ativados por contexto)
| Alerta | Condicao | Acao |
|--------|----------|------|
| DTE Curto | DTE <= 7 dias | Alerta gamma explosivo e pin risk |
| DTE Ideal | DTE 30-45 dias | Menciona zona ideal de decaimento de theta |
| VI Baixa | VI < 70% da VH | Alerta premios baratos demais para venda |
| Liquidez Baixa | OI < 200 | Alerta risco de spread largo |

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
| `supabase/functions/analyze-option/index.ts` | Claude Haiku API, prompt multi-leg + didatico + sizing + regras B3/IR/cobertura/saida, max_tokens 8192 |
| `src/services/geminiService.js` | Cache key com legs hash + objetivo + capital |

## Filtros de Periodo e Tipo em Listas (Implementado)

### HistoricoScreen — Filtro de periodo
- Pills de periodo (1M, 3M, 6M, 1A, Tudo) acima dos filtros de categoria
- Default: "Tudo" (comportamento original preservado)
- `filterByPeriod(items, dateField, days)` filtra por `item.date >= cutoffStr`
- Contagem "Todos (N)" reflete itens no periodo selecionado
- Combina com filtros de categoria (Operacoes/Opcoes/Proventos) e sub-filtros
- Trocar periodo reseta sub-filtro

### CaixaView — Movimentacoes Recentes com filtros
- **Filtro de periodo**: Pills 7 dias / 15 dias / 30 dias (default: 7 dias)
- **Filtro de tipo**: Pills horizontais scrollaveis — Todos, Entradas, Saidas, Dividendos, JCP, Opcoes, Ativos, Transf.
- Fetch limit aumentado de 15 para 100 para cobrir 30 dias de dados
- Filtragem em duas etapas: `movsByDate` (periodo) → `movsFiltered` (tipo)
- Contagem dinamica na Pill ativa
- Mensagem de estado vazio adaptada (sem movimentacoes vs sem resultados no filtro)
- Trocar periodo reseta filtro de tipo para "Todos"

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/mais/HistoricoScreen.js` | PERIODOS, filterByPeriod, periodo state, Pills UI, contagem dinamica |
| `src/screens/gestao/CaixaView.js` | MOVS_PERIODOS, MOVS_TIPOS, movsPeriodo/movsTipo states, filtro 2 etapas, Pills UI, limit 100 |

## Bugs Conhecidos / Investigar

- [ ] **IA truncando resposta na secao estrategias**: mesmo com max_tokens 8192 (maximo do Haiku), a resposta da Edge Function `analyze-option` corta no meio da secao [ESTRATÉGIAS]. Ja tentado: aumentar max_tokens (2048→4096→6000→8192), reduzir prompt (3→2 estrategias, max 800 chars/secao). Possíveis causas a investigar:
  - Timeout da Edge Function Supabase (default 60s) — Haiku pode estar demorando mais que o timeout
  - `stop_reason` pode ser `max_tokens` ou outro — adicionar log de `claudeJson.usage.output_tokens` e `claudeJson.stop_reason` na resposta para diagnosticar
  - Testar reduzir ainda mais o prompt ou usar `temperature: 0` para respostas mais curtas
  - Arquivo: `supabase/functions/analyze-option/index.ts`

## Grade Real de Opcoes — Dados de Mercado B3 (A Implementar)

Substituir a cadeia sintetica BS por dados reais de opcoes da B3 via API de mercado, com precos teoricos BS lado a lado para comparacao.

### Arquitetura

1. **Edge Function `oplab-options`**: proxy seguro (API key como Supabase secret, nunca exposta ao client)
   - Endpoint principal: `GET /v3/market/instruments/series/{ticker}?bs=true&irate={selic}`
   - Retorna: spot + series (por vencimento) + strikes com CALL/PUT (bid, ask, close, volume, delta, gamma, theta, vega, IV, moneyness)
   - Auth: header `Access-Token: {key}`
   - Rate limits: 50 req/s, 100 req/min
   - Client chama via `supabase.functions.invoke('oplab-options', { body: { ticker, selic } })`
   - Ver `memory/oplab.md` para credenciais e comando de deploy

2. **Service `src/services/oplabService.js`**: client-side com cache 5min
   - `fetchOptionsChain(ticker, selic)` — chama Edge Function, normaliza resposta
   - Estrutura normalizada: `{ spot, iv_current, ewma_current, beta_ibov, series: [{ due_date, days_to_maturity, label, strikes: [{ strike, call: {symbol, bid, ask, close, volume, delta, gamma, theta, vega, iv, moneyness}, put: {...} }] }] }`

3. **Nova Grade Profissional** (substituir CadeiaSintetica atual):
   - **Dropdown de vencimento**: Pills com meses disponiveis (ate 3 meses). Primeiro = mais proximo (default)
   - **Strike no centro**: coluna central com valor do strike
   - **CALL a esquerda**: Bid, Ask, Teorico (BS), Delta, Volume
   - **PUT a direita**: Bid, Ask, Teorico (BS), Delta, Volume
   - **Spot line**: linha horizontal amarela que marca o preco atual, rola com a grade
   - **Zona ITM/OTM**: fundo sutil — ITM mais denso, OTM mais claro
   - **Preco Teorico**: coluna "Teor" com valor BS calculado localmente (mesmo calculo atual), cor mais dim que bid/ask
   - **Scroll vertical**: ScrollView com spot line centralizado inicialmente
   - **Toque em row**: mesma interacao atual (setStrikeInput ou addLeg em modo multi-perna)
   - **Indicadores no header**: IV real, HV 20d (indicatorService), Beta

4. **Auto-completar indicadores na Calculadora**: ao selecionar strike na grade real:
   - IV: preenche com IV real da opcao em vez de HV
   - Premio: preenche com mid-price real (bid+ask)/2
   - DTE: preenche com days_to_maturity do vencimento selecionado
   - Ticker opcao: mostra ticker real (ex: PETRH325)
   - Delta/Gamma/Theta/Vega: exibe gregas reais
   - Volume: exibe no card de resumo

5. **Fallback**: se API falhar, mostra grade sintetica BS atual com badge "Dados teoricos (BS)"

6. **Esquema de cores Real vs Teorico**: cor do Bid/Ask indica se opcao esta cara ou barata vs BS
   - Mid real > Teorico +10%: `C.yellow` (laranja) — opcao cara, premio inflado
   - Mid real < Teorico -10%: `C.rf` (ciano) — opcao barata, possivel oportunidade
   - Diferenca < 10%: `C.text` (branco) — preco justo, alinhado com BS
   - Coluna Teorico sempre em `C.dim` (cinza) para nao competir visualmente

7. **Alertas de Preco de Opcoes** (A Implementar):
   - Long press ou botao sino no strike da grade → configura alerta
   - Tipos de alerta:
     - **Preco alvo**: avisar quando bid/ask atingir valor definido
     - **Divergencia Real vs Teorico**: avisar quando preco real divergir >X% do BS
     - **IV**: avisar quando IV do ativo ultrapassar threshold
     - **Volume/OI**: avisar quando volume de um strike superar X
   - Tabela `alertas_opcoes` no Supabase: user_id, ticker_opcao, tipo_alerta (preco/divergencia/iv/volume), valor_alvo, direcao (acima/abaixo), ativo (bool), criado_em
   - Checagem ao abrir app (como alertas atuais da Home) + possibilidade futura de Edge Function cron + push notification
   - Card de alertas ativos na Home (integrado aos alertas existentes)

### Layout da Grade

```
CALL                    │         │                   PUT
Bid   Ask  Teor  D  Vol │ STRIKE  │ Bid   Ask  Teor  D   Vol
─────────────────────────│─────────│────────────────────────────
0.02  0.05 0.03 .04 120 │  37.00  │ 2.10 2.25 2.18 -.96  80   OTM PUT
0.15  0.22 0.18 .12 450 │  36.00  │ 1.05 1.18 1.12 -.88 230
0.48  0.58 0.52 .28 890 │  35.00  │ 0.52 0.62 0.55 -.72 670   ← SPOT
1.12  1.25 1.18 .55 1200│  34.00  │ 0.18 0.28 0.22 -.45 340
2.05  2.18 2.10 .78 560 │  33.00  │ 0.05 0.10 0.07 -.22 150   OTM CALL
● Real    ○ Teorico (BS)          Toque para simular
```

### Endpoints API uteis (ver docs completos em memoria)

| Endpoint | Descricao |
|----------|-----------|
| `GET /v3/market/instruments/series/{ticker}?bs=true&irate=X` | Cadeia completa com gregas (PRINCIPAL) |
| `GET /v3/market/options/{ticker}` | Lista todas opcoes do ativo (sem gregas) |
| `GET /v3/market/options/details/{symbol}` | Quote individual de uma opcao |
| `GET /v3/market/options/bs?symbol=X&irate=Y&...` | Calculadora BS individual |
| `GET /v3/market/stocks/{ticker}` | Dados do ativo com iv_current, ewma, beta |

### Arquivos a criar/modificar

| Arquivo | Acao |
|---------|------|
| `supabase/functions/oplab-options/index.ts` | **Criar** — Edge Function proxy |
| `src/services/oplabService.js` | **Criar** — client service com cache 5min |
| `src/screens/opcoes/OpcoesScreen.js` | **Modificar** — nova grade, dropdown vencimento, auto-fill indicadores |
| `src/services/geminiService.js` | **Modificar** — prompt IA com dados reais (strikes, OI, volume) |

### Deploy
```
npx supabase secrets set OPLAB_API_KEY="<ver memoria>" --project-ref zephynezarjsxzselozi
npx supabase functions deploy oplab-options --no-verify-jwt --project-ref zephynezarjsxzselozi
```

## Grade Fullscreen + Treemap Carteira + Renda Mes Anterior (Implementado)

Tres melhorias visuais: grade de opcoes em tela cheia, treemap heatmap na carteira, e valor do mes anterior na renda da Home.

### Grade de Opcoes Fullscreen (OpcoesScreen)
- Botao `expand-outline` no header da grade (ao lado do timestamp)
- `renderGradeContent(isFullscreen)`: funcao extraida que renderiza info row, vencimento pills, grade real/sintetica
- **Inline** (`isFullscreen=false`): mostra 5+ATM+5 = 11 strikes (comportamento original)
- **Fullscreen** (`isFullscreen=true`): Modal `animationType="slide"` com TODOS os strikes da serie
- Header do modal: titulo + badge REAL/BS + botao fechar (Ionicons "close")
- Toque em strike no fullscreen preenche simulador e fecha modal automaticamente
- Contagem "X strikes disponiveis" no rodape do fullscreen

### Treemap Heatmap na Carteira (CarteiraScreen)
- Copiado `squarify` (algoritmo squarified treemap) e `TreemapChart` (SVG renderer) do AnaliseScreen
- Posicionado entre PATRIMONIO hero e POSICOES filter pills
- Dados: `change_day` (variacao diaria), cores verde/vermelho por intensidade
- Botao `expand-outline` abre Modal fullscreen (`animationType="fade"`, fundo `rgba(0,0,0,0.95)`)
- Modal fullscreen: legenda (Alta/Queda), TreemapChart em tela cheia, tooltip detalhado (ticker, variacao, qty, PM, preco atual, P&L)
- Tooltip inline so aparece quando modal NAO esta aberto

### Renda do Mes Anterior (HomeScreen)
- Badge comparativo agora exibe 2 linhas: % de variacao (verde/vermelho) + valor do mes anterior ("Ant: R$ X")
- Variavel `rendaAnteriorLabel` calculada quando `rendaTotalMesAnterior > 0`

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/opcoes/OpcoesScreen.js` | State `gradeFullscreen`, `renderGradeContent(isFullscreen)`, Modal fullscreen, botao expandir |
| `src/screens/carteira/CarteiraScreen.js` | Import SVG (Rect, G, Text), `squarify`, `TreemapChart`, states `selectedTile`/`treemapModalVisible`, treemap inline + Modal fullscreen |
| `src/screens/home/HomeScreen.js` | `rendaAnteriorLabel`, badge 2 linhas (% + valor anterior) |

### Build
- Versao: 4.1.0 (build 10)
- TestFlight: publicado via `eas build --platform ios --non-interactive` + `eas submit --platform ios --non-interactive --latest`

## Analise Tecnica com Grafico Anotado (Implementado)

Grafico de precos SVG interativo com suportes, resistencias, topos, fundos, tendencia, SMAs e indicadores toggleaveis na aba Calc do OpcoesScreen. Dados tecnicos enviados a IA para enriquecer analise.

### Arquitetura

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/services/technicalAnalysisService.js` | **Criado** ~500 linhas | Calculos deterministicos: pivots fractais, volume profile, numeros redondos, clustering adaptativo, tendencia |
| `src/components/TechnicalChart.js` | **Criado** ~700 linhas | Grafico SVG anotado com 10+ camadas, touch interativo, indicadores toggleaveis |
| `src/screens/opcoes/OpcoesScreen.js` | **Modificado** +~300 linhas | Integracao: states, useEffect fetch, render inline + fullscreen, toggles, AI payload |
| `supabase/functions/analyze-option/index.ts` | **Modificado** +~4 linhas | Prompt IA com periodo dinamico + suportes/resistencias |
| `src/components/index.js` | **Modificado** +1 linha | Export TechnicalChart |

### technicalAnalysisService.js — Funcoes exportadas

| Funcao | Retorno |
|--------|---------|
| `calcSMASeries(closes, period)` | `number[]` (null nos primeiros period-1) |
| `findPivotPoints(highs, lows, volumes, avgVol, lookback, totalLen)` | `{ pivotHighs, pivotLows }` com volRatio e recency |
| `clusterLevels(pivots, atr, spotPrice, totalCandles, type)` | `[{price, strength, compositeScore, hasVolumeNode, hasRound, maxVolRatio}]` |
| `detectTrend(closes, sma20, sma50)` | `{ direction, strength, label }` |
| `detectBreakouts(analysis, spot)` | `[{title, message, actionHint, icon, color}]` alertas de proximidade |
| `analyzeTechnicals(ohlcv, strikePrice)` | Objeto completo com tudo acima |
| `buildTechnicalSummary(analysis, spot)` | String compacta para prompt IA |

### Deteccao de Suportes/Resistencias (3 fontes)

1. **Pivots fractais**: candle cujo high/low e extremo local (lookback 5 major, 3 minor, adaptativo para periodos curtos). Volume-weighted: pivots com volume > media recebem bonus
2. **Volume Profile**: bins de preco (30 bins), nodes com volume > 1.5x media viram candidatos a suporte/resistencia
3. **Numeros redondos psicologicos**: step adaptativo ao preco (0.50 para <10, 1 para <50, 5 para <200, 10 para >200)

### Clustering adaptativo
- Tolerancia baseada em ATR (1 ATR / spot, clamped 0.8%–3.5%) em vez de % fixo
- Score composto (0-100): toques 40% + volume 25% + recencia 20% + confirmacao 15%
- Maximo 5 niveis por lado (suporte/resistencia)
- Campos extras: `hasVolumeNode`, `hasRound`, `maxVolRatio`

### TechnicalChart.js — Camadas SVG

1. Grid horizontal (4 linhas, labels preco no eixo Y)
2. Linha SMA 50 (tracejada, `C.etfs + '80'`)
3. Linha SMA 20 (tracejada, `C.rf + '80'`)
4. Area high-low range (sombreado sutil `C.text + '08'` entre highs e lows)
5. Linha de preco (solida, `C.text`, bezier suavizada)
6. Bollinger Bands (area sombreada `C.accent + '22'` + linhas tracejadas `C.accent + '80'`, 1.3px)
7. Expected Move ±1σ (faixa `C.opcoes`, labels dentro da banda)
8. Volume bars (18% altura, verde/vermelho, opacity 40%)
9. Linhas de suporte (horizontal tracejada verde)
10. Linhas de resistencia (horizontal tracejada vermelha)
11. Linha do strike (pontilhada roxa)
12. Linha do spot (solida fina amarela)
13. Marcadores de topos (triangulo vermelho) e fundos (triangulo verde)
14. RSI panel (60px abaixo do grafico principal, zonas 30/70)
15. Cursor touch + tooltip (data, close, SMA20, SMA50, BB, RSI, Volume)

### Indicadores toggleaveis (4)

| Indicador | Prop key | Descricao | Default |
|-----------|----------|-----------|---------|
| Bollinger Bands | `bb` | Periodo 20, 2 desvios. Area + linhas tracejadas | OFF |
| RSI (14) | `rsi` | Painel dedicado 60px abaixo do grafico. Zonas 30/70 | OFF |
| Volume | `volume` | Barras na base do grafico (18% altura). Verde/vermelho | OFF |
| ±1σ Movimento Esperado | `expectedMove` | Faixa baseada em HV + DTE. Requer DTE e HV > 0 | OFF |

Cada indicador tem pill toggle + InfoTip com tooltip explicativo (inline + fullscreen).

### Filtros de periodo

Pills: 1M, 3M, 6M (default), 1A. Usa `fetchPriceHistoryRange(ticker, period)`. Minimo 20 candles para analise. Textos dinamicos via `techPeriodLabel`.

### Fullscreen com landscape

- Modal `animationType="fade"`, `supportedOrientations={['portrait', 'landscape']}`
- `expo-screen-orientation`: portrait travado globalmente, desbloqueado ao abrir fullscreen, retravado ao fechar
- Layout responsivo via `onLayout` + `techFsDims`:
  - Portrait: header paddingTop 54, chart h-260, width w-36
  - Landscape: header paddingTop 10, paddingHorizontal 44 (safe area), chart h-90, width w-88 (panoramico)
- Cleanup useEffect restaura portrait se componente desmontar com modal aberto

### Integracao IA

- `technicalSummary` adicionado ao payload de `handleAiAnalysis`
- `technicalPeriod` com label dinamico do periodo
- Edge Function usa periodo no prompt: "Analise tecnica (X meses): ..."
- IA integra suportes/resistencias em [RISCO] e [CENARIOS], nao cria secao separada

### Configuracao necessaria (novo build nativo)

```
app.json: "orientation": "default" (era "portrait")
plugins: + "expo-screen-orientation"
```
Requer `eas build` para gerar novo binario com o plugin nativo.

### Arquivos modificados/criados (resumo)
| Arquivo | Mudanca |
|---------|---------|
| `src/services/technicalAnalysisService.js` | **Criado** — 3 fontes de S/R, clustering adaptativo, score composto |
| `src/components/TechnicalChart.js` | **Criado** — SVG 15 camadas, 4 indicadores, touch, RSI panel, high-low range |
| `src/screens/opcoes/OpcoesScreen.js` | States tech*, toggles, periodo, fullscreen landscape, ScreenOrientation, AI payload |
| `supabase/functions/analyze-option/index.ts` | Periodo dinamico no prompt |
| `src/components/index.js` | Export TechnicalChart |
| `src/navigation/AppNavigator.js` | Import + lockAsync PORTRAIT_UP global |
| `app.json` | orientation default, plugin expo-screen-orientation |

## Favoritos e Watchlist no Supabase (Implementado)

Migração de favoritos (tickers favoritos) e watchlist (lista de análise) do AsyncStorage local para Supabase, permitindo persistência cross-device.

### Antes vs Depois
| Dado | Antes | Depois |
|------|-------|--------|
| Favoritos (tickers) | AsyncStorage `@premiolab_opcoes_favorites` | `profiles.opcoes_favorites` JSONB |
| Watchlist (análise) | AsyncStorage `@premiolab_opcoes_watchlist` | `profiles.opcoes_watchlist` JSONB |
| Análises salvas IA | Já no Supabase (`saved_analyses`) | Inalterado |

### Migração transparente
Na primeira abertura após a atualização:
1. Lê `profiles` do Supabase
2. Se colunas vazias (`[]`), importa dados do AsyncStorage local
3. Salva no Supabase via `updateProfile`
4. Limpa AsyncStorage local (`multiRemove`)
5. Se Supabase já tem dados, usa esses e limpa local

### SQL executado
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS opcoes_favorites JSONB DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS opcoes_watchlist JSONB DEFAULT '[]'::jsonb;
```

### Arquivos modificados
| Arquivo | Mudança |
|---------|---------|
| `src/screens/opcoes/OpcoesScreen.js` | Import `updateProfile`, `useAuth` movido para cima, `saveFavorites`/`saveWatchlist` usam `updateProfile`, useEffect com migração AsyncStorage→Supabase, removido `authUser` duplicado |
| `add-opcoes-favorites-columns.sql` | **Criado** — migration SQL |

## Treemap Heatmap — Legibilidade (Implementado)

Correcao de legibilidade nos 2 treemaps do app (CarteiraScreen e AnaliseScreen). Numeros de variacao ficavam cortados e dificeis de ler.

### Problemas corrigidos
1. **Primeiro digito cortado**: texto SVG transbordava limites do tile. Corrigido com `<ClipPath>` por tile
2. **Texto ilegivel**: texto colorido (verde/vermelho) sobre fundo colorido (verde/vermelho) sem contraste. Corrigido com texto branco + sombra preta (texto duplicado com fill preto opacity 0.4 atras)
3. **Sinais +/- sobrepostos**: em tiles estreitos, `+12.3%` era longo demais. Corrigido com formatacao adaptativa por largura do tile

### Formatacao adaptativa
| Largura tile | Formato | Exemplo |
|-------------|---------|---------|
| >= 58px | Sinal + valor + % | `+2.3%` |
| < 58px, valor < 10 | Valor + % (sem sinal) | `2.3%` |
| < 58px, valor >= 10 | Valor inteiro + % (sem sinal) | `12%` |

Cor do tile (verde/vermelho) indica direcao, dispensando o sinal em tiles estreitos.

### Thresholds adaptativos de exibicao
| Conteudo | Antes | Depois |
|----------|-------|--------|
| Ticker (label) | tile >= 40x30 | tile >= 36x26 |
| Variacao (%) | tile >= 30x20 | tile >= 26x18 |
| Font size ticker | 10px fixo | 10px (wide) / 9px (narrow) |

### Tecnica SVG
- `<Defs>` com `<ClipPath id="tc-{i}">` por tile usando `<Rect>` com mesmas dimensoes
- `<G clipPath="url(#tc-{i})">` agrupa textos do tile
- Sombra: `<SvgText fill="black" opacity={0.4}>` renderizado antes do texto branco

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/carteira/CarteiraScreen.js` | TreemapChart: ClipPath, texto branco + sombra, pctStr adaptativo, thresholds relaxados |
| `src/screens/analise/AnaliseScreen.js` | TreemapChart: mesmas correcoes (codigo identico) |

## Patrimonio Livre Dropdown (Implementado)

No card hero da CarteiraScreen, o valor de "Patrimonio Livre" agora e clicavel e exibe um dropdown com detalhes de cada conta e saldo.

### Comportamento
- Toque no valor de patrimonio livre (ou no icone chevron) abre/fecha dropdown
- Dropdown renderiza full-width abaixo da linha INVESTIDO/PATRIMONIO LIVRE
- Cada conta mostra: icone circular (2 letras iniciais), nome da conta, saldo na moeda original
- Contas em moeda estrangeira exibem linha adicional "≈ R$ X" com valor convertido
- Prefixo de moeda via `getSymbol(moeda)` do currencyService

### Visual
- Background `C.bg` (solido) com borderRadius 10, padding 12
- Icone circular: 28px, fundo `C.accent + '22'`, texto branco 11px bold
- Nome da conta: fontSize 13, `C.text`, maxWidth 140 (trunca com ellipsis)
- Saldo: fontSize 13, font mono, cor `C.rf` (ciano)
- Conversao BRL: fontSize 10, `C.dim`
- Chevron: Ionicons `chevron-down`/`chevron-up`, 14px, cor `C.dim`

### State
```
var _showSaldosDD = useState(false); var showSaldosDD = _showSaldosDD[0]; var setShowSaldosDD = _showSaldosDD[1];
```

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/carteira/CarteiraScreen.js` | Import `getSymbol`, state `showSaldosDD`, TouchableOpacity no valor livre, dropdown panel full-width com contas |

## Importacao de Operacoes — CSV, B3 Excel, Nota de Corretagem (Implementado)

Tela de importacao completa com 5 modos de input, auto-detect de formato, preview com dedup, e importacao em batch. Suporta operacoes (acoes/FIIs/ETFs), opcoes (call/put), exercicios. Futuros e termos sao exibidos mas nao importados.

### Modos de input

| Modo | Descricao |
|------|-----------|
| CEI/B3 | CSV do CEI (cei.b3.com.br). Upload ou colar. Suporta Latin-1 e UTF-8 |
| B3 (Excel) | Extrato da B3 (investidor.b3.com.br). XML Spreadsheet 2003 convertido para TSV |
| Nota PDF | Texto copiado de nota de corretagem em PDF. Auto-detect de formato |
| Colar CSV | Colar dados CSV/TSV diretamente |
| CSV Generico | CSV com colunas: Data, Tipo, Ticker, Quantidade, Preco |

### csvImportService.js — Funcoes exportadas

| Funcao | Descricao |
|--------|-----------|
| `parseCSVText(text)` | Parse CSV/TSV → { headers, rows }. Converte XML Spreadsheet 2003 automaticamente |
| `parseCEI(headers, rows)` | Parse formato CEI → operacoes/opcoes/exercicios normalizados |
| `parseB3(headers, rows)` | Parse formato B3 → operacoes normalizadas |
| `parseGeneric(headers, rows)` | Parse CSV generico → operacoes normalizadas |
| `isNotaCorretagem(text)` | Detecta nota de corretagem por score de keywords (>=3 de 8 padroes) |
| `parseNotaCorretagem(text)` | Orquestrador: header + trades + custos → ops normalizadas com custos pro-rata |
| `detectFormat(headers)` | Detecta formato pelos headers: 'cei', 'b3', 'generic', 'unknown' |
| `findDuplicates(newOps, existingOps, existingOpcoes)` | Dedup: exact match, partial match, opcao match |
| `validateRow(op)` | Validacao por tipo (_importType): ticker, preco, qty, data |
| `decodeCSVBuffer(buffer)` | Detecta encoding UTF-8/Latin-1 automaticamente |
| `decodeOptionTicker(ticker)` | PETRC402 → { ativoBase, tipo, monthIdx, strikeRef } |
| `estimateStrike(strikeRef)` | 402 → 40.20, 25 → 25 (heuristica B3) |
| `extractTicker(produto)` | Remove sufixo F (fracionario), extrai ticker de "PETR4 - PETROBRAS PN N2" |
| `mapCorretora(nome)` | CORRETORA_MAP: nome legal B3 → nome comercial |
| `detectCategory(ticker)` | Classifica acao/fii/etf por ticker |
| `parseBRNumber(str)` | "1.234,56" → 1234.56 |
| `parseDateBR(str)` | "23/02/2026" → "2026-02-23" |

### Nota de Corretagem — Parsing detalhado

Parser de texto copiado de PDF de nota de corretagem. Formato padronizado pela B3 (todas as corretoras seguem layout similar).

**Funcoes internas:**
- `parseNotaHeader(text)` — Extrai data pregao (DD/MM/YYYY), nr nota, corretora (via CORRETORA_MAP)
- `parseNotaTrades(text)` — Regex trailing: `desc qty preco valor D/C` por linha. Filtra por venue (B3/BOVESPA/LISTADO) ou validacao qty*preco≈valor
- `parseTradeDescription(desc)` — Remove venue prefix, extrai C/V, tipo mercado (VISTA/FRACIONARIO/OPCAO DE COMPRA/OPCAO DE VENDA/EXERCICIO/TERMO/FUTURO), prazo MM/YY, spec text
- `extractNotaStrike(specText)` — Strike de "PN XX,XX" ou "ON XX,XX" (override de estimateStrike)
- `parseNotaCosts(text)` — Taxa de liquidacao, registro, emolumentos, clearing (Outras Bovespa), ISS, IRRF
- `thirdFriday(year, month)` — 3a sexta-feira do mes (vencimento opcoes B3)
- `inferAtivoBase(base4)` — PETR→PETR4 (PN), VALE→VALE3 (ON) via heuristica

**Custos pro-rata:** `custoProRata = (trade.valor / somaValores) * custosTotais`. Cada operacao recebe sua fracao proporcional dos custos totais da nota.

**C/V vs D/C:**
- C/V na descricao = Compra/Venda (fonte primaria)
- D/C no final = Debito/Credito (fallback: D=compra, C=venda)

**Campos extras nas ops de nota:** `_notaNumero` (numero da nota), `_notaCustos` (custos pro-rata), `_strikeEstimated` (strike veio do ticker, nao da spec)

### ImportOperacoesScreen.js — Fluxo

**Step 1 (Input):**
- Pills de modo (CEI/B3, B3 Excel, Nota PDF, Colar CSV, CSV Generico)
- Help card por modo com instrucoes
- File picker (CSV/Excel) ou textarea para colar
- Auto-detect: colar nota em qualquer modo → detecta automaticamente via `isNotaCorretagem()`

**Step 2 (Preview):**
- Summary card com contagem por tipo e formato detectado
- Filter pills: Todas, Novas, Duplicados, Possiveis, Erros, Ignoradas
- Cards por operacao com checkbox, badge status, badge tipo (ACAO/OPCAO/EXERCICIO)
- Opcoes mostram: ticker_opcao, CALL/PUT, VENDA/COMPRA, base, strike (badge ESTIMADO se heuristico), vencimento
- Notas mostram custos pro-rata e numero da nota
- Selecionar novas / Todas / Nenhuma
- Botao importar floating com contagem

**Step 3 (Resultado):**
- Contagem importada por tipo
- Erros detalhados se houver
- Botoes "Importar mais" e "Concluir"

### Deduplicacao

| Tipo | Chave exact | Chave partial |
|------|-------------|---------------|
| Operacao | ticker + data + tipo + qty + preco | ticker + data + tipo |
| Opcao | ticker_opcao + data_abertura + premio + qty | — |

### Arquivos

| Arquivo | Acao |
|---------|------|
| `src/services/csvImportService.js` | **Criado** — parse CSV/TSV/XML/nota, detect, validate, dedup (~1450 linhas) |
| `src/screens/carteira/ImportOperacoesScreen.js` | **Criado** — tela 3 steps, 5 modos input, preview, import batch (~1250 linhas) |

## Sistema de Gestão de Gastos Pessoais — Finanças (Implementado)

Sub-tab "Finanças" em Carteira (Ativos / Caixa / Finanças) com dashboard de gastos pessoais, orçamentos, transações recorrentes, gráfico pizza, comparativo mensal.

### Arquitetura de Categorias

Sistema de 2 níveis: `categoria` (campo legado, CHECK constraint inalterado) + `subcategoria` (novo campo TEXT). Módulo centralizado `src/constants/financeCategories.js` substitui definições inline duplicadas em CaixaView, ExtratoScreen, AddMovimentacaoScreen.

**12 grupos**: moradia, alimentacao, transporte, saude, educacao, lazer, compras, servicos, seguros, renda, investimento (auto, excluído de orçamentos), outro.

**Subcategorias por grupo** (~30): moradia_aluguel, alimentacao_supermercado, transporte_combustivel, etc.

### Tabelas SQL (financas-migration.sql)

| Tabela | Descrição |
|--------|-----------|
| `orcamentos` | user_id, grupo, valor_limite, ativo. UNIQUE(user_id, grupo) + RLS |
| `transacoes_recorrentes` | user_id, tipo, categoria, subcategoria, conta, valor, frequencia, dia_vencimento, proximo_vencimento, ativo + RLS |
| `movimentacoes.subcategoria` | Nova coluna TEXT (nullable) |

### Telas

| Tela | Descrição |
|------|-----------|
| `FinancasView.js` (~872 linhas) | Dashboard: hero (saldo + poupança), DonutChart pizza de gastos, progress bars orçamentos, comparativo mensal, próximas recorrentes, FAB |
| `OrcamentoScreen.js` (~339 linhas) | Configuração de limites por grupo com máscara R$ + switch ativo |
| `RecorrentesScreen.js` (~413 linhas) | Lista agrupada por frequência, SwipeableRow, ativo toggle, summary |
| `AddRecorrenteScreen.js` (~529 linhas) | Form: tipo, grupo, subcategoria, conta, valor, frequência, dia, preview próximas 3 |

### database.js — Funções adicionadas

- `getOrcamentos(userId)`, `upsertOrcamentos(userId, budgets)`, `deleteOrcamento(userId, grupo)`
- `getRecorrentes(userId)`, `addRecorrente(userId, data)`, `updateRecorrente(userId, id, updates)`, `deleteRecorrente(id)`, `advanceRecorrente(id, novaData)`
- `getFinancasSummary(userId, mes, ano)` — agrega por grupo/subcategoria, exclui auto-categorias
- `processRecorrentes(userId)` — processa recorrentes vencidas, cria movimentações reais, avança datas

### Integrações

- **HomeScreen**: fire-and-forget `processRecorrentes()` ao abrir (como dividendos/indicadores)
- **AddMovimentacaoScreen**: após salvar saída, verifica orçamento do grupo via `checkBudgetAlert()`. >90% → toast warning, >100% → toast error com valor excedido
- **AddMovimentacaoScreen**: subcategoria picker (grupo pills → subcategory pills) salva no payload
- **GestaoScreen**: 3ª sub-tab "Finanças" renderiza FinancasView
- **AppNavigator**: +3 stack screens (Orcamento, Recorrentes, AddRecorrente)
- **States.js**: SkeletonFinancas

### Arquivos criados/modificados

| Arquivo | Ação |
|---------|------|
| `financas-migration.sql` | **Criado** — SQL para orcamentos + transacoes_recorrentes + subcategoria |
| `src/constants/financeCategories.js` | **Criado** — módulo centralizado de categorias (~323 linhas) |
| `src/screens/gestao/FinancasView.js` | **Criado** — dashboard principal (~872 linhas) |
| `src/screens/gestao/OrcamentoScreen.js` | **Criado** — configuração de orçamentos |
| `src/screens/gestao/RecorrentesScreen.js` | **Criado** — lista de recorrentes |
| `src/screens/gestao/AddRecorrenteScreen.js` | **Criado** — form de recorrente |
| `src/services/database.js` | +~180 linhas CRUD orçamentos, recorrentes, summary, processRecorrentes |
| `src/screens/gestao/GestaoScreen.js` | +import FinancasView, +3ª sub-tab |
| `src/screens/gestao/AddMovimentacaoScreen.js` | +subcategoria picker, +budget alert toast |
| `src/screens/gestao/CaixaView.js` | Import categorias do módulo compartilhado |
| `src/screens/gestao/ExtratoScreen.js` | Import categorias do módulo compartilhado |
| `src/screens/home/HomeScreen.js` | +fire-and-forget processRecorrentes |
| `src/navigation/AppNavigator.js` | +3 stack screens |
| `src/components/States.js` | +SkeletonFinancas |
| `src/components/index.js` | +export SkeletonFinancas |

## Gastos Rapidos + Widget Nativo (Implementado)

Feature de registro rapido de despesas no cartao de credito com 2 partes: telas in-app para configurar presets de gastos frequentes + widget nativo para iOS (SwiftUI) e Android (JSX) na home screen do celular.

### Fase 1 — Gastos Rapidos (in-app)

**Data Model**: coluna JSONB `gastos_rapidos` em `profiles`, array de ate 8 presets com id, label, valor, cartao_id, categoria, subcategoria, icon, ordem.

**Telas**:
| Tela | Descricao |
|------|-----------|
| `ConfigGastosRapidosScreen.js` (~431 linhas) | Lista editavel com SwipeableRow, reorder via chevron-up/down, toque para editar |
| `AddGastoRapidoScreen.js` (~468 linhas) | Form: nome, valor R$ (mascara centavos), cartao (Pills), grupo/subcategoria, icone (grid 4x5 Ionicons), preview Glass |

**Acesso**: Mais > Gastos Rapidos (item CONFIGURACOES) + botao flash-outline no header da FaturaScreen.

**database.js — 3 funcoes**:
- `getGastosRapidos(userId)` — profile.gastos_rapidos || []
- `saveGastosRapidos(userId, presets)` — updateProfile
- `executeGastoRapido(userId, preset)` — addMovimentacaoCartao com dados do preset

### Fase 2 — Widget Nativo (iOS + Android)

| Plataforma | Pacote | Widget UI | Data Bridge |
|-----------|--------|-----------|-------------|
| iOS | `@bacons/apple-targets` | SwiftUI | App Groups + NSUserDefaults |
| Android | `react-native-android-widget` | JSX (FlexWidget/TextWidget) | AsyncStorage + requestWidgetUpdate |

**Layout do widget** (medium size, 4x2):
- Header: label cartao + fatura total + vencimento + barra limite (ProgressView/LinearGradient)
- Grid 2x2: 4 presets com icone + label + valor
- Footer: "+ Outro" (abre AddMovimentacao) + "Config" (abre ConfigGastosRapidos)

**widgetBridge.js** (~120 linhas): API unificada para compartilhar dados entre app e widget nativo.
- `updateWidgetData(cartao, faturaTotal, limite, vencimento, moeda, presets)` — salva JSON
- `updateWidgetFromContext(userId, database, currencyService)` — busca dados e atualiza widget
- iOS: NSUserDefaults via App Group `group.com.premiotrader.app.data`
- Android: AsyncStorage + `requestWidgetUpdate('QuickExpenseWidget')`

**Deep Linking**: scheme `premiolab://` com 4 rotas:
- `premiolab://gasto-rapido/{presetId}` — executa gasto automaticamente + toast confirmacao
- `premiolab://add-gasto` — abre AddMovimentacaoScreen
- `premiolab://config-gastos` — abre ConfigGastosRapidosScreen
- `premiolab://fatura/{cartaoId}` — abre FaturaScreen

**Widget data atualizado em**: HomeScreen (load), AddMovimentacaoScreen (submit), FaturaScreen (pagar fatura), ConfigGastosRapidosScreen (delete/reorder), AddGastoRapidoScreen (save preset), AddCartaoScreen (save/edit cartao).

### SQL Migration (gastos-rapidos-migration.sql)
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gastos_rapidos JSONB DEFAULT '[]'::jsonb;
```

### Arquivos criados/modificados
| Arquivo | Acao |
|---------|------|
| `gastos-rapidos-migration.sql` | **Criado** — ALTER TABLE profiles |
| `src/services/database.js` | +3 funcoes gastos rapidos |
| `src/services/widgetBridge.js` | **Criado** — bridge nativo iOS/Android |
| `src/screens/gestao/ConfigGastosRapidosScreen.js` | **Criado** — lista editavel |
| `src/screens/gestao/AddGastoRapidoScreen.js` | **Criado** — form preset |
| `targets/widget/expo-target.config.js` | **Criado** — config Apple target |
| `targets/widget/Widget.swift` | **Criado** — SwiftUI widget iOS |
| `src/widgets/QuickExpenseWidget.js` | **Criado** — widget Android JSX |
| `src/widgets/widgetTaskHandler.js` | **Criado** — handler eventos Android |
| `src/navigation/AppNavigator.js` | +2 stack screens, deep linking config, gasto-rapido handler |
| `src/screens/mais/MaisScreen.js` | +item Gastos Rapidos |
| `src/screens/gestao/FaturaScreen.js` | +botao flash header + widget update |
| `src/screens/gestao/AddMovimentacaoScreen.js` | +widget update apos submit |
| `src/screens/gestao/AddCartaoScreen.js` | +widget update apos save |
| `src/screens/home/HomeScreen.js` | +widget update fire-and-forget |
| `App.js` | +Android widget task handler registration |
| `app.json` | +plugins (apple-targets, android-widget), +entitlements App Group |

### Build
Requer `eas build` para gerar binario com plugins nativos. Widget nao funciona em Expo Go.

## Logo Real do App + Splash Screen (Implementado)

Substituicao dos placeholders (SVG generico "PL" com moleculas, caractere unicode `◈`, avatar com inicial do email) pela imagem real do logo do app em 3 telas. Splash screen atualizada para o novo icone.

### Assets

| Arquivo | Descricao |
|---------|-----------|
| `assets/icon.png` | Icone oficial 1024x1024 (AppStore, adaptive-icon) |
| `assets/splash-icon.png` | Splash screen oficial (substitui splash.png antigo, removido) |
| `assets/Icone_header.jpg` | Logo horizontal "PL + PremioLab" com fundo preto (fonte original) |
| `assets/logo-header.png` | Versao otimizada 400x148 do header, fundo cor `#070a11` (app bg) |
| `assets/logo.png` | Icone 200x200 cropado (PL grafico) para LoginScreen e MaisScreen |

### Mudancas

| Tela | Antes | Depois |
|------|-------|--------|
| HomeScreen (header) | `<Logo>` SVG + `<Wordmark>` texto | `<Image>` logo-header.png (PL + PremioLab horizontal, 66px altura) |
| LoginScreen | `<LinearGradient>` + caractere `◈` | `<Image>` logo.png (72x72, borderRadius 20) |
| MaisScreen | Avatar circular com inicial do email | `<Image>` logo.png (42x42, borderRadius 12) |
| Splash screen | `splash.png` (antigo) | `splash-icon.png` (novo icone) |

### Logo.js — Componente

- **Antes**: SVG complexo com gradientes, "PL" e moleculas (~60 linhas, import react-native-svg)
- **Depois**: `Image` do React Native com `require('../../assets/logo.png')`, props `size` e `borderRadius` proporcional (~15 linhas)
- `Wordmark` inalterado (texto "PremioLab" bicolor)

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `assets/logo-header.png` | **Criado** — 400x148, otimizado do Icone_header.jpg |
| `assets/logo.png` | **Criado** — 200x200, cropado do icon.png |
| `assets/splash.png` | **Removido** — substituido por splash-icon.png |
| `src/components/Logo.js` | SVG → Image, remove import react-native-svg |
| `src/screens/home/HomeScreen.js` | Logo+Wordmark → Image logo-header.png, remove import Logo/Wordmark |
| `src/screens/auth/LoginScreen.js` | LinearGradient+◈ → Image logo.png |
| `src/screens/mais/MaisScreen.js` | Avatar inicial → Image logo.png |
| `app.json` | splash.png → splash-icon.png, buildNumber 9 → 10, removido App Groups entitlement |

### Build
- Versao: 4.1.0 (build 10)
- TestFlight: publicado via `eas build --platform ios --non-interactive` + `eas submit --platform ios --non-interactive --latest`

## Preco Atual + P&L nas Opcoes Ativas + Alerta P&L (Implementado)

Cards de opcoes ativas agora exibem preco atual de mercado (via OpLab API) e P&L em tempo real. Usuario pode definir alertas de P&L alvo por opcao.

### Prefetch de cadeias OpLab
- No `load()` do OpcoesScreen, coleta tickers unicos de `ativo_base` das opcoes ativas
- Chama `fetchOptionsChain` para cada (fire-and-forget, paralelo)
- Resultado fica no cache do oplabService (5min), cards usam `getCachedOptionData`/`getCachedChain`
- State `chainsReady` (timestamp) forca re-render apos prefetch completar
- `onRefresh` limpa cache OpLab (`clearOplabCache`) + recarrega

### Preco atual + P&L no OpCard
- Secao **MERCADO** apos PREMIO: mid-price `(bid+ask)/2` com bid/ask em parenteses
- P&L calculo: VENDA `premio - precoAtual`, COMPRA `precoAtual - premio`
- `plTotal = plUnit * quantidade`, `plPct = (plUnit / premio) * 100`
- Verde (lucro) / vermelho (prejuizo), bold
- Sem dados OpLab: "Preço indisponível" em dim

### Alerta de P&L por opcao
- Coluna `opcoes.alerta_pl` (NUMERIC, NULL = sem alerta). Valor em % (ex: 50 = lucro 50%, -20 = prejuizo 20%)
- `updateOpcaoAlertaPL(opcaoId, valor)` em database.js
- Icone sino (`notifications-outline`/`notifications`) ao lado do P&L
- Toque abre editor inline com campo R$ + Salvar/Remover
- `useEffect` em `chainsReady` checa alertas: toast + haptic quando P&L % atinge alvo
- Badge "ALERTA P&L" amarelo no card quando atingido
- `alertsFired` state previne disparo repetido na mesma sessao

### Summary bar atualizado
- Segunda linha abaixo de PUTs/CALLs/ATM/ITM/VENC7D (so aparece com dados OpLab)
- 3 KPIs: Premio Mes, Theta/Dia, P&L Total
- P&L Total: soma P&L de todas ativas com preco de mercado disponivel

### Migration SQL
```sql
ALTER TABLE opcoes ADD COLUMN IF NOT EXISTS alerta_pl NUMERIC DEFAULT NULL;
```

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/opcoes/OpcoesScreen.js` | Prefetch chains no load, states chainsReady/alertsFired, MERCADO section no OpCard com preco+P&L+sino+editor alerta, badge ALERTA P&L, useEffect checagem alertas, handleAlertaPLSave, summary bar com Premio Mes/Theta/P&L Total |
| `src/services/database.js` | +updateOpcaoAlertaPL |
| `alerta-pl-migration.sql` | Migration SQL para coluna alerta_pl |

## Cadastro Completo + Recuperar Senha + Perfil do Usuario (Implementado)

Sistema completo de registro com campos extras, recuperacao de senha, e tela de perfil editavel com troca de senha segura.

### Registro com campos extras (LoginScreen)
- 5 campos adicionais no modo registro: Nome (obrigatorio), Pais (default "Brasil"), Cidade, Data de nascimento (DD/MM/AAAA), Sexo (Pills)
- Campos salvos como `user_metadata` no signUp, depois persistidos no profiles durante onboarding
- `maskDate` e `parseDate` helpers para data BR
- ScrollView no modo registro (form maior)

### Recuperacao de senha (RecuperarSenhaScreen)
- Tela acessada via "Esqueceu a senha?" no LoginScreen
- `supabase.auth.resetPasswordForEmail(email)` envia link de reset
- 2 estados: form (input email + botao) e sent (confirmacao)

### Perfil do usuario (ProfileScreen)
- 6 campos editaveis: Nome, Email, Pais, Cidade, Data de nascimento, Sexo
- Troca de email via `supabase.auth.updateUser({ email })` com verificacao
- beforeRemove dirty check com `origRef` e `savedRef`
- Acessado via MaisScreen (toque no card do perfil)

### Troca de senha segura (ProfileScreen)
- Secao expansivel "Alterar senha" com 3 campos: Senha atual, Nova senha, Confirmar senha
- Verificacao da senha atual via `supabase.auth.signInWithPassword` antes de permitir troca
- `supabase.auth.updateUser({ password })` para aplicar nova senha
- Validacoes: senha atual obrigatoria, nova senha min 6 chars, confirmacao deve coincidir

### Migration SQL (profile-fields-migration.sql)
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cidade TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sexo TEXT DEFAULT '';
```

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `profile-fields-migration.sql` | **Criado** — 4 colunas novas em profiles |
| `src/contexts/AuthContext.js` | signUp aceita profileData (3o param), completeOnboarding merge user_metadata |
| `src/screens/auth/LoginScreen.js` | 5 campos registro, ScrollView, maskDate, parseDate, link "Esqueceu a senha?" |
| `src/screens/auth/RecuperarSenhaScreen.js` | **Criado** — tela de recuperacao de senha |
| `src/screens/auth/OnboardingScreen.js` | Pre-fill nome do profile ou user_metadata |
| `src/screens/mais/ProfileScreen.js` | **Criado** — edicao de perfil + troca de senha segura |
| `src/screens/mais/MaisScreen.js` | Card perfil clicavel, profileNome, chevron |
| `src/navigation/AppNavigator.js` | +RecuperarSenha (AuthStack), +Profile (AppStack) |

## Sistema de Assinaturas — Free / PRO / Premium (Implementado)

Monetizacao com 3 tiers de assinatura. RevenueCat SDK preparado (try/catch guard — funciona sem SDK instalado). Admin email com bypass permanente. VIP emails via tabela. Programa de indicacao com anti-fraude.

### Tiers e Precos

| Tier | Mensal | Anual | Trial |
|------|--------|-------|-------|
| Free | R$ 0 | — | — |
| PRO | R$ 19,90 | R$ 179,90 | 7 dias |
| Premium | R$ 29,90 | R$ 269,90 | 7 dias |

### Features por Tier

| Feature | Free | PRO | Premium |
|---------|------|-----|---------|
| Posicoes na carteira | Max 5 | Ilimitado | Ilimitado |
| Opcoes ativas | Max 3 | Ilimitado | Ilimitado |
| Grafico tecnico anotado | — | Sim | Sim |
| Indicadores tecnicos/fundamentalistas | — | Sim | Sim |
| Analise Completa, Relatorios, Import CSV | — | Sim | Sim |
| Financas (orcamentos/recorrentes) | — | Sim | Sim |
| Auto-sync dividendos | — | Sim | Sim |
| Analise IA Claude | — | — | Sim |
| Analises salvas IA | — | — | Sim |

### Hierarquia de acesso (ordem de verificacao)

1. **Admin** — `jonataspmagalhaes@gmail.com` hardcoded → Premium permanente
2. **VIP** — tabela `vip_overrides` (email + tier) → tier configuravel via SQL
3. **RevenueCat** — `Purchases.getCustomerInfo()` entitlements → tier do entitlement
4. **Referral reward** — `profiles.referral_reward_tier/end` → tier temporario (30 dias)
5. **Trial local** — `profiles.trial_pro_start/trial_premium_start` + 7 dias → tier do trial
6. **Default** → free

### Arquitetura

| Arquivo | Descricao |
|---------|-----------|
| `src/constants/subscriptionFeatures.js` | TIERS, FEATURES map, LIMITS, PRICES, TIER_LABELS, TIER_COLORS, isAdminEmail, tierMeetsMin, getRequiredTier, generateReferralCode, REFERRAL_THRESHOLDS |
| `src/contexts/SubscriptionContext.js` | Provider + hook `useSubscription()`. Exports: tier, tierLabel, tierColor, isAdmin, isVip, loading, trialInfo, trialExpiredRecently, referralCode, referralCount, canAccess, isAtLimit, startTrial, purchase, restore, refresh, applyReferralCode |
| `src/components/UpgradePrompt.js` | Componente reutilizavel de bloqueio. Props: feature, compact, navigation, message. Modo bloco (Glass+lock+CTA) e modo compact (inline lock+badge) |
| `src/screens/mais/PaywallScreen.js` | 3 cards tier com feature comparison, toggle mensal/anual, trial buttons, purchase, restore, secao "Indique amigos" com codigo + share + contagem, badge VIP |

### 14 Gates nas telas

**Limites Free (2)**:
1. CarteiraScreen — FAB desabilitado quando positions >= 5 e !canAccess('POSITIONS_UNLIMITED')
2. OpcoesScreen — Adicionar opcao bloqueado quando ativas >= 3 e !canAccess('OPTIONS_UNLIMITED')

**Features PRO (10)**:
3. OpcoesScreen — Grafico tecnico: !canAccess('TECHNICAL_CHART')
4. CarteiraScreen — FundamentalAccordion: !canAccess('FUNDAMENTALS')
5. MaisScreen — Import CSV item com lock: !canAccess('CSV_IMPORT')
6. AnaliseScreen — Tela inteira: !canAccess('ANALYSIS_TAB')
7. RelatoriosScreen — Tela inteira: !canAccess('REPORTS')
8. GestaoScreen — Sub-tab Financas: !canAccess('FINANCES')
9. FinancasView — Conteudo inteiro: !canAccess('FINANCES')
10. ProventosScreen — Botao sync oculto: !canAccess('AUTO_SYNC_DIVIDENDS')
11. HomeScreen — Auto-calc indicadores: !canAccess('INDICATORS')
12. MaisScreen — Analise Completa item com lock: !canAccess('ANALYSIS_TAB')

**Features Premium (2)**:
13. OpcoesScreen — Botao IA: !canAccess('AI_ANALYSIS')
14. OpcoesScreen — Analises salvas: !canAccess('SAVED_ANALYSES')

### VIP Override

Gerenciado via SQL Editor no Supabase Dashboard:
```sql
-- Conceder acesso
INSERT INTO vip_overrides (email, tier, motivo) VALUES ('email@exemplo.com', 'pro', 'Parceria');
-- Revogar
UPDATE vip_overrides SET ativo = FALSE WHERE email = 'email@exemplo.com';
```
Client consulta via RPC `check_vip_override(email)` (SECURITY DEFINER).

### RevenueCat — Configuracao para Cobrancas Reais (A Fazer)

O codigo do app ja esta preparado para RevenueCat (try/catch guard — funciona sem SDK instalado). Para ativar cobrancas reais, seguir os passos abaixo:

**Passo 1 — App Store Connect (portal Apple)**:
1. Acessar App Store Connect → seu app → Subscriptions
2. Criar Subscription Group (ex: "PremioLab Plans")
3. Criar 4 produtos de assinatura auto-renovavel:
   - `premiolab_pro_monthly` — PRO Mensal R$ 19,90
   - `premiolab_pro_annual` — PRO Anual R$ 199,90
   - `premiolab_premium_monthly` — Premium Mensal R$ 29,90
   - `premiolab_premium_annual` — Premium Anual R$ 299,90
4. Configurar periodo de trial gratuito se desejado (Apple gerencia)
5. Submeter para review da Apple (pode levar 1-2 dias)

**Passo 2 — Conta RevenueCat (revenueCat.com)**:
1. Criar conta gratuita em revenueCat.com
2. Criar projeto "PremioLab"
3. Conectar com App Store Connect (Apple App-Specific Shared Secret)
4. Criar 2 Entitlements: `pro` e `premium`
5. Criar Offerings com os 4 produtos do App Store Connect
6. Mapear produtos → entitlements (pro_monthly e pro_annual → `pro`, premium_monthly e premium_annual → `premium`)
7. Copiar API Key publica (iOS) para usar no app

**Passo 3 — Instalar SDK no app**:
```bash
npx expo install react-native-purchases
```

**Passo 4 — Configurar no app**:
Adicionar em `App.js` ou no `SubscriptionContext.js` (antes do Provider):
```javascript
if (Purchases) {
  Purchases.configure({ apiKey: 'SUA_REVENUECAT_API_KEY_IOS' });
  if (user) Purchases.logIn(user.id);
}
```

**Passo 5 — Build nativo**:
```bash
eas build --platform ios
```
RevenueCat precisa de modulo nativo — nao funciona em Expo Go.

**Passo 6 — Testar**:
- Usar Sandbox Tester (App Store Connect → Users and Access → Sandbox Testers)
- Assinaturas sandbox renovam em minutos (nao meses)
- Verificar entitlements no dashboard RevenueCat

**Resumo da arquitetura**:

| Parte | Onde | O que faz |
|-------|------|-----------|
| App Store Connect | Site Apple | Cria produtos, precos, review |
| RevenueCat | revenueCat.com | Gerencia assinaturas, analytics, webhooks, promotional |
| SDK `react-native-purchases` | Codigo JS | Paywall, compra, restore, listener |
| SubscriptionContext.js | App | Ja preparado — detecta entitlements automaticamente |

### RevenueCat Promotional

Ja suportado automaticamente. Quando admin concede entitlement "pro" ou "premium" via Dashboard RevenueCat:
1. Dashboard → Customers → buscar App User ID
2. Grant Promotional → selecionar entitlement + duracao
3. App detecta via `addCustomerInfoUpdateListener` em tempo real

### Programa de Indicacao

**Regras**:
- Cada usuario recebe codigo unico `PL-XXXXXX` (gerado no primeiro acesso)
- Novo usuario insere codigo do amigo no registro (campo opcional)
- Indicacao fica "pending" ate indicado iniciar trial ou assinar
- 3 indicados ativos → 1 mes PRO gratis para o referrer
- 5 indicados ativos → 1 mes Premium gratis para o referrer

**Anti-fraude (3 camadas)**:
1. **Rate limiting** — max 10 indicacoes/mes por referrer (RPC `check_referral_rate_limit`)
2. **Device ID** — UUID unico por instalacao (AsyncStorage), salvo em profiles + referrals. RPC `check_referral_device` bloqueia mesmo dispositivo referindo ao mesmo referrer
3. **Ativacao condicional** — referral so vira "active" quando indicado realmente assina/trial (nao basta criar conta)

Outras protecoes: email verificado (Supabase Auth), codigo proprio bloqueado, UNIQUE(referred_id)

### Trial — 7 dias por plano, 1 vez cada

- Cada usuario pode testar PRO 7 dias (1 vez) e Premium 7 dias (1 vez), independentemente
- Controle via profiles: `trial_pro_used` + `trial_pro_start`, `trial_premium_used` + `trial_premium_start`
- Ao iniciar: marca `used = TRUE` + salva `start = hoje`
- SubscriptionContext verifica `start + 7 dias > hoje`
- Expirado: tier volta a free automaticamente
- HomeScreen exibe alerta quando trial com <= 2 dias restantes

### Arquivos criados/modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/constants/subscriptionFeatures.js` | **Criado** — constantes, helpers, REFERRAL_THRESHOLDS, generateReferralCode |
| `src/contexts/SubscriptionContext.js` | **Criado** — Provider com 6 checks hierarquicos, trial, VIP, referral, RevenueCat |
| `src/components/UpgradePrompt.js` | **Criado** — lock/upgrade component (bloco + compact) |
| `src/screens/mais/PaywallScreen.js` | **Criado** — 3 tier cards, billing toggle, trial, purchase, restore, referral section |
| `src/utils/deviceId.js` | **Criado** — UUID unico por instalacao para anti-fraude |
| `subscription-trial-migration.sql` | **Criado** — 4 colunas trial no profiles |
| `subscription-extras-migration.sql` | **Criado** — tabela vip_overrides, tabela referrals, RPCs anti-fraude, colunas referral/device no profiles |
| `App.js` | +SubscriptionProvider entre AuthProvider e PrivacyProvider |
| `src/components/index.js` | +export UpgradePrompt |
| `src/navigation/AppNavigator.js` | +PaywallScreen stack screen |
| `src/screens/mais/MaisScreen.js` | +secao ASSINATURA, +badge tier, +gates em items, +item "Indicar amigos" |
| `src/screens/auth/LoginScreen.js` | +campo "Codigo de indicacao" no registro |
| `src/contexts/AuthContext.js` | +processamento referral code no onboarding, +device ID save |
| `src/services/database.js` | +checkVipOverride, +getReferralsByReferrer, +getReferralCount, +addReferral, +activateReferral, +findReferrerByCode, +applyReferralReward, +checkReferralRateLimit, +checkReferralDevice, +saveDeviceId |
| `src/screens/analise/AnaliseScreen.js` | +gate ANALYSIS_TAB (full screen) |
| `src/screens/relatorios/RelatoriosScreen.js` | +gate REPORTS (full screen) |
| `src/screens/gestao/GestaoScreen.js` | +gate FINANCES (sub-tab) |
| `src/screens/gestao/FinancasView.js` | +gate FINANCES (conteudo) |
| `src/screens/proventos/ProventosScreen.js` | +gate AUTO_SYNC_DIVIDENDS (sync button) |
| `src/screens/home/HomeScreen.js` | +gates INDICATORS/AUTO_SYNC_DIVIDENDS, +alerta trial expirando |
| `src/screens/opcoes/OpcoesScreen.js` | +4 gates (OPTIONS_UNLIMITED, TECHNICAL_CHART, AI_ANALYSIS, SAVED_ANALYSES) |
| `src/screens/carteira/CarteiraScreen.js` | +3 gates (POSITIONS_UNLIMITED, FUNDAMENTALS, CSV_IMPORT) |

## Creditos IA + Limites de Uso + Consumable IAP (Implementado)

Sistema de controle de uso de IA com limites por plano e venda de creditos extras via compra consumivel (in-app purchase).

### Limites por plano

| Plano | Limite diario | Limite mensal | Creditos extras |
|-------|---------------|---------------|-----------------|
| Free | 0 | 0 | Nao pode comprar |
| PRO | 0 | 0 | Nao pode comprar |
| Premium | 5 analises | 100 analises | Sim |

### Custos e margens

| Metrica | Valor |
|---------|-------|
| Custo por analise (Haiku 4.5) | ~R$ 0,10 (~$0,016) |
| Receita liquida Premium (apos Apple 30%) | ~R$ 20,93/mes |
| Alocacao IA (~35% do liquido) | ~R$ 7,33/mes |
| Custo medio real (utilizacao ~30%) | ~R$ 3-4/mes |

### Pacotes de creditos extras (Consumable IAP)

| Product ID | Creditos | Preco | Por credito | Margem liquida |
|------------|----------|-------|-------------|----------------|
| `premiolab_ai_20` | 20 analises | R$ 9,90 | R$ 0,50 | ~72% |
| `premiolab_ai_50` | 50 analises | R$ 19,90 | R$ 0,40 | ~75% |
| `premiolab_ai_150` | 150 analises | R$ 44,90 | R$ 0,30 | ~77% |

### Tabelas SQL

```sql
-- Log de uso de IA
CREATE TABLE ai_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  tipo TEXT NOT NULL,           -- 'opcao', 'carteira', 'ativo', 'resumo'
  tokens_in INTEGER,
  tokens_out INTEGER,
  custo_estimado NUMERIC,
  resultado_id TEXT             -- referencia para recuperar analise salva
);
CREATE INDEX idx_ai_usage_user_date ON ai_usage(user_id, created_at);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_user ON ai_usage FOR ALL USING (auth.uid() = user_id);

-- Creditos extras no perfil
ALTER TABLE profiles ADD COLUMN ai_credits_extra INTEGER DEFAULT 0;
```

### Fluxo de verificacao (Edge Function)

```
1. Verifica tier Premium (RevenueCat)
   - Nao Premium → retorna 403
2. Conta uso hoje: SELECT COUNT FROM ai_usage WHERE date = today
   - < 5 → OK (limite diario do plano)
   - >= 5 → verifica creditos extras
3. Creditos extras? profiles.ai_credits_extra > 0
   - Sim → reserva 1 credito (decrementa)
   - Nao → verifica limite mensal
4. Limite mensal? COUNT mes < 100
   - Sim → OK
   - Nao → retorna 429 "Limite atingido"
5. Chama Claude API
6. SUCESSO → INSERT ai_usage (confirma debito)
   ERRO → restaura credito reservado (refund automatico)
7. Retorna resultado
```

### Protecao contra erros (refund automatico)

**Principio**: credito so e debitado definitivamente APOS sucesso da analise.

| Cenario de erro | Acao | Credito |
|-----------------|------|---------|
| Claude API timeout/500 | Edge Function retorna erro | Nao debita (restaura se reservado) |
| Resposta truncada/invalida | Detecta e retorna erro | Nao debita (restaura se reservado) |
| Edge Function crash | Nenhum INSERT ai_usage | Nao debita |
| Rede do usuario cai | Analise salva no servidor | Debita (analise gerada e recuperavel) |

**Recuperacao de analise perdida**: se a rede caiu mas a analise foi gerada, o app busca `GET /ai-usage/last` na proxima abertura e exibe a analise pendente. O campo `resultado_id` na tabela `ai_usage` referencia a analise completa salva.

**Implementacao na Edge Function**:
```
// Pseudo-codigo
var creditoUsado = false;
if (usoHoje >= 5 && creditosExtras > 0) {
  await decrementCredito(userId);  // reserva
  creditoUsado = true;
}
try {
  var resultado = await chamarClaude(prompt);
  if (!resultado || resultado.truncado) throw new Error('resposta invalida');
  await insertAiUsage(userId, tipo, tokens);
  return resultado;
} catch (erro) {
  if (creditoUsado) await incrementCredito(userId);  // refund
  return { error: erro.message };
}
```

### Venda de creditos — RevenueCat Consumables

**Product type**: Consumable (nao subscription)
**Webhook**: RevenueCat → Edge Function `add-ai-credits` → incrementa `profiles.ai_credits_extra`
**Nunca confiar no client**: creditos adicionados apenas via webhook server-side

### Pontos de entrada para compra

1. **PaywallScreen** — secao "Creditos IA extras" abaixo dos planos de assinatura
2. **Tela de analise IA** — Alert quando atinge limite: "Comprar mais creditos?"
3. **MaisScreen** — item "Creditos IA" com saldo atual + botao comprar

### UI de saldo
Header da analise IA ou MaisScreen:
```
Analises IA: 3/5 hoje | 47/100 mes | +12 creditos extras
```

### Tipos de analise IA (todos compartilham o mesmo limite)

| Tipo | Descricao | Tela |
|------|-----------|------|
| `opcao` | Analise de operacao de opcoes (existente) | OpcoesScreen > Simulador |
| `carteira` | Analise completa da carteira | CarteiraScreen ou AnaliseScreen |
| `ativo` | Analise individual de ativo | AssetDetailScreen |
| `resumo` | Resumo diario/semanal inteligente | HomeScreen |
| `estrategia` | Sugestao de covered calls/CSP | OpcoesScreen |
| `renda` | Analise de renda passiva/proventos | RendaScreen |

### Arquivos criados/modificados

| Arquivo | Acao |
|---------|------|
| `creditos-ia-migration.sql` | **Criado** — tabela ai_usage + coluna ai_credits_extra + 5 RPCs (get_ai_usage_today, get_ai_usage_month, decrement_ai_credit, increment_ai_credit, add_ai_credits) |
| `supabase/functions/analyze-option/index.ts` | **Modificado** — supabaseAdmin service role, verificacao limites (5/dia, 100/mes), reserva credito, refund em 3 pontos (API error, empty response, catch), log ai_usage, retorna _usage |
| `supabase/functions/add-ai-credits/index.ts` | **Criado** — webhook RevenueCat (INITIAL_PURCHASE/NON_RENEWING_PURCHASE) + admin manual call, 3 pacotes (20/50/150 creditos) |
| `src/services/aiUsageService.js` | **Criado** — getAiUsageToday, getAiUsageMonth, getAiCreditsExtra, logAiUsage, getAiUsageSummary, checkAiLimit |
| `src/screens/mais/PaywallScreen.js` | **Modificado** — secao "Creditos IA" com 3 KPIs (hoje/mes/extras) + 3 pacotes de compra (preview, sem IAP ativo ainda) |
| `src/screens/opcoes/OpcoesScreen.js` | **Modificado** — import aiUsageService, state aiUsage, fetch summary no load, exibe uso inline (Hoje: X/5, Mes: X/100, +N extras), atualiza apos analise via _usage |

## 4 Novos Widgets iOS — Patrimonio, Heatmap, Vencimentos, Renda (Implementado)

5 widgets iOS nativos via WidgetBundle no mesmo target. Dados sincronizados via UserDefaults (App Group) com payload unificado. Deep links para navegacao direta por tab.

### Widgets

| Widget | Tamanho | Descricao | Deep Link |
|--------|---------|-----------|-----------|
| QuickExpense | medium | Gastos rapidos no cartao (existente) | premiolab://gasto-rapido/{id} |
| Patrimonio | small + medium | Valor total + rentabilidade % + sparkline 30d | premiolab://tab/home |
| Heatmap | medium | Grid 4x2 com top 8 posicoes e variacao diaria colorida | premiolab://tab/carteira |
| Vencimentos | medium | 3 proximas opcoes a vencer com DTE badge (verm/amar/verde) | premiolab://tab/opcoes |
| Renda | small | Total mensal + progress bar meta + comparativo mes anterior | premiolab://tab/renda |

### Arquitetura de dados

- **Payload unificado**: key `allWidgetData` no UserDefaults (App Group), JSON com 5 slices
- **Sync**: `widgetBridge.updateAllWidgetsFromDashboard()` recebe resultado do getDashboard (zero queries extras para patrimonio/heatmap/vencimentos/renda), busca cartoes/fatura/presets separadamente para QuickExpense
- **Compatibilidade**: mantem key `widgetData` para QuickExpense legado, `loadAllWidgetData()` faz fallback
- **Limites**: 30 history points, 8 positions, 3 opcoes

### Deep links de tab

`premiolab://tab/{home,carteira,opcoes,renda,mais}` via linkingConfig do React Navigation com nested screens em MainTabs.

### Arquivos modificados/criados

| Arquivo | Mudanca |
|---------|---------|
| `src/services/database.js` | +`opsAtivasData` no return de getDashboard (array completo de opcoes ativas) |
| `src/services/widgetBridge.js` | +`updateAllWidgetsFromDashboard()`, +`saveAllWidgetData()`, +`parseLocalDate()` |
| `src/screens/home/HomeScreen.js` | Troca `updateWidgetFromContext` por `updateAllWidgetsFromDashboard` com result do dashboard |
| `src/navigation/AppNavigator.js` | +deep links `tab/{home,carteira,opcoes,renda,mais}` no linkingConfig |
| `targets/widget/Widget.swift` | WidgetBundle com 5 widgets, 5 models Codable, 5 providers, 5 views, sparkline Shape |
| `targets/widget/expo-target.config.js` | displayName atualizado para 'PremioLab Widgets' |

## PIX como Meio de Pagamento (Implementado)

PIX diferenciado de debito e cartao em todo o fluxo de despesas. Campo `meio_pagamento` na tabela `movimentacoes` identifica o meio usado (pix, debito, credito, null=legado).

### Migration SQL (pix-migration.sql)
```sql
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS meio_pagamento TEXT DEFAULT NULL;
```

### Valores do campo `meio_pagamento`
| Valor | Significado |
|-------|-------------|
| `null` | Legado / sistema (compra_ativo, dividendo, etc.) |
| `'pix'` | Pagamento via PIX (debita saldo da conta) |
| `'debito'` | Debito direto da conta |
| `'credito'` | Cartao de credito (vai para fatura) |

### Fluxo por meio de pagamento
| Meio | Funcao | Efeito |
|------|--------|--------|
| PIX | `addMovimentacaoComSaldo` | Debita saldo da conta + registra mov com `meio_pagamento: 'pix'` |
| Conta | `addMovimentacaoComSaldo` | Debita saldo da conta + registra mov com `meio_pagamento: 'debito'` |
| Cartao | `addMovimentacaoCartao` | Registra mov na fatura com `meio_pagamento: 'credito'` |

### Gastos Rapidos com PIX
- Presets agora aceitam `meio_pagamento: 'pix'` ou `'credito'`
- PIX presets salvam `conta` (nome) e `conta_moeda` em vez de `cartao_id`
- `executeGastoRapido` roteia: PIX/debito → `addMovimentacaoComSaldo`, credito → `addMovimentacaoCartao`
- Widget iOS mostra icone raio (bolt.fill, verde) para PIX, icone original para cartao

### UI
- **AddMovimentacaoScreen**: 3 pills (Conta / PIX / Cartao). PIX mostra selector de conta
- **CaixaView**: filtro "PIX" nas movimentacoes. Badge "PIX" verde + icone flash nos itens
- **AddGastoRapidoScreen**: toggle Cartao/PIX no topo. PIX mostra selector de conta
- **ConfigGastosRapidosScreen**: badge "PIX" (verde) ou "CARTAO" (accent) em cada preset
- **FinancasView**: secao "MEIO DE PAGAMENTO" com 3 cards (PIX/Cartao/Debito) mostrando valor + %
- **FinancasView FAB**: item "PIX" com icone flash para criar despesa PIX rapidamente

### getFinancasSummary — porMeioPagamento
Retorno inclui `porMeioPagamento: { pix: X, credito: Y, debito: Z, outro: W }` com totais de saidas por meio.

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `pix-migration.sql` | **Criado** — ALTER TABLE movimentacoes ADD meio_pagamento |
| `src/services/database.js` | addMovimentacaoCartao salva meio_pagamento, executeGastoRapido roteia PIX/cartao, getFinancasSummary agrega porMeioPagamento |
| `src/screens/gestao/AddMovimentacaoScreen.js` | 3 pills pagamento (Conta/PIX/Cartao), suporte presetPayMethod='pix', meio_pagamento no payload |
| `src/screens/gestao/CaixaView.js` | Filtro PIX em MOVS_TIPOS, icone flash + badge PIX nos itens |
| `src/screens/gestao/AddGastoRapidoScreen.js` | Toggle Cartao/PIX, selector conta para PIX, preset salva meio_pagamento/conta/conta_moeda |
| `src/screens/gestao/ConfigGastosRapidosScreen.js` | Badge PIX/CARTAO no card do preset |
| `src/screens/gestao/FinancasView.js` | Secao MEIO DE PAGAMENTO (3 cards), item PIX no FAB |
| `src/services/widgetBridge.js` | Preset inclui meio_pagamento e conta |
| `targets/widget/Widget.swift` | WidgetPreset +meio_pagamento +conta, icone bolt verde para PIX |
| `src/navigation/AppNavigator.js` | Toast "via PIX" no deep link gasto-rapido |

## Subcategorias Expandidas + UI Profissional (Implementado)

Expansao massiva do sistema de subcategorias financeiras e padronizacao visual de todas as telas de movimentacao.

### Categorias expandidas (financeCategories.js)

- **14 grupos**: moradia, alimentacao, transporte, saude, educacao, lazer, compras, servicos, seguros, pessoal, pets, renda, investimento, outro
- **~90+ subcategorias**: cobrindo praticamente todos os gastos do dia a dia
- **2 grupos novos**: `pessoal` (cabeleireiro, cosmeticos, vestuario, calcados, academia) e `pets` (racao, veterinario, petshop, medicamentos pet)
- **Exports centralizados**: SUBCATS_SAIDA, SUBCATS_ENTRADA, getGrupoMeta, getCatIcon, getCatColor, getCatLabel, getSubcatLabel

### UI Card Grid para selecao de grupo/subcategoria

**AddMovimentacaoScreen** e **AddRecorrenteScreen**: selecao de grupo usa card grid profissional com Glass cards contendo icone + label do grupo como header, subcategorias como Pills dentro. Padrao identico para entrada e saida.

### Subcategoria visivel em todas as telas

**ExtratoScreen** e **CaixaView** (3 locais): movimentacoes usam icone, cor e label da subcategoria quando disponivel (`finCats.SUBCATEGORIAS[mov.subcategoria]`). Badge do grupo exibido. PIX badge verde. Ionicons substituem setas de texto.

### Renomeacao "Conta" para "Debito"

AddMovimentacaoScreen: pill de meio de pagamento renomeada de "Conta" para "Debito". Resumo exibe "DEBITO" em vez de "CONTA". Tres meios: Debito, PIX, Cartao.

### Correcao de portugues

- `financeCategories.js`: "Cabelereiro/Barbeiro" → "Cabeleireiro/Barbeiro" (2 ocorrencias)

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/constants/financeCategories.js` | +2 grupos (pessoal, pets), ~60 subcategorias novas, fix "Cabeleireiro" |
| `src/screens/gestao/AddMovimentacaoScreen.js` | Card grid para entrada (igual saida), "Conta" → "Debito", subcategoria picker profissional |
| `src/screens/gestao/AddRecorrenteScreen.js` | Card grid para grupo/subcategoria (entrada e saida) |
| `src/screens/gestao/ExtratoScreen.js` | Subcategoria icon/color/label, PIX badge, grupo badge, Ionicons |
| `src/screens/gestao/CaixaView.js` | 3 locais atualizados com subcategoria metadata, PIX badge, grupo badge |

## FaturaScreen — Fix Teclado + Cashback Melhorado (Implementado)

Correcao de bugs de teclado e melhoria na exibicao de cashback/pontos na fatura e no card do cartao.

### Bugs corrigidos

1. **Teclado sumindo/voltando ao digitar R$**: painel "Lancar total manual" estava dentro do `ListHeaderComponent` do FlatList. Cada keystroke causava re-render do header, remontando o TextInput e dismissing o teclado. **Fix**: moveu o painel para FORA do FlatList, renderizado acima dele como componente independente.
2. **Cursor pulando para R$ ao digitar observacao**: mesma causa — TextInputs dentro de `ListHeaderComponent` perdiam foco ao re-render. **Fix**: ambos campos agora estao fora do FlatList. Adicionado `returnKeyType="next"` e `returnKeyType="done"`.

### Cashback/pontos mais visivel (FaturaScreen)

Card redesenhado com layout profissional:
- Icone circular (36px) com fundo colorido (amarelo pontos, verde cashback)
- Nome do programa + "Acumulado este mes"
- Valor grande centralizado (24px, bold)
- Unidade abaixo: "pontos" ou "X% da fatura"
- Badges de taxa por regra (ex: "3x", "1.5% (USD)")

### Cashback/pontos no card do cartao (CaixaView)

- Badge compacto abaixo do nome do cartao no card de credito
- Icone estrela (pontos) ou cifrao (cashback) + valor + nome do programa
- Dados calculados no `load()` via `getRegrasPontos` + `calcPontos` para cada cartao
- State `cardPontos` armazena valores por cartao

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/screens/gestao/FaturaScreen.js` | Painel manual fora do FlatList, card cashback redesenhado, novos styles |
| `src/screens/gestao/CaixaView.js` | +import getRegrasPontos, +calcPontos helper, +state cardPontos, badge cashback no card |

## Logo PL Recentralizado (Implementado)

Recorte do logo PL do icon.png com melhor centralizacao e tamanho maior. Logo anterior estava ligeiramente deslocado para a esquerda.

### Mudancas

- `assets/logo.png`: recortado do icon.png (1024x1024) com offset (165, 175, 700x700) → 200x200, PL maior e centrado
- `LoginScreen.js`: logo 96x96 → 120x120, borderRadius 24 → 28

### Build

- Versao: 4.1.0 (build 17)
- Widget.swift: fix parametros faltantes `meio_pagamento` e `conta` nos presets de exemplo
- TestFlight: publicado

## Alertas de Preco de Opcoes (Implementado)

Sistema de alertas configuráveis para opções na grade real OpLab. Usuário pode criar alertas de preço, divergência BS, IV e volume diretamente na grade de opções.

### Tipos de alerta

| Tipo | Descrição | Verificação |
|------|-----------|-------------|
| `preco` | Preço mid (bid+ask)/2 atinge valor alvo | mid >= ou <= valor_alvo |
| `divergencia` | Divergência entre preço real e teórico BS | abs(mid - bs_price) / bs_price * 100 |
| `iv` | Volatilidade implícita atinge threshold | IV da opção >= ou <= valor_alvo |
| `volume` | Volume ultrapassa mínimo | volume >= valor_alvo |

### Tabela `alertas_opcoes`
- user_id, ticker_opcao, ativo_base, tipo_alerta, valor_alvo, direcao (acima/abaixo), tipo_opcao (call/put), strike, vencimento, ativo, disparado, disparado_em, criado_em
- RLS por user_id, index no user_id

### UI na grade (OpcoesScreen)
- Ícone sino (notifications-outline) em cada strike row, ao lado do moneyness badge
- Sino preenchido (amarelo) se já tem alerta ativo naquele strike
- Toque abre Modal bottom sheet com:
  - Info do strike + ticker + valores atuais (mid, IV, volume)
  - Pills tipo de alerta (Preço, Divergência BS, IV, Volume)
  - Pills CALL/PUT
  - Pills direção (Cair abaixo de / Subir acima de)
  - Input valor alvo (decimal-pad)
  - Lista de alertas ativos no mesmo strike com botão excluir
  - Botão "Criar Alerta" com loading state

### Verificação de alertas
- useEffect no `chainsReady` + `priceAlerts` constrói mapa de chains cached e chama `checkPriceAlerts`
- Alertas disparados: toast + haptic warning + notificação local push + markAlertaDisparado no DB
- State `priceAlertsFired` previne disparo repetido na mesma sessão

### database.js — Funções adicionadas
- `getAlertasOpcoes(userId)` — busca alertas ativos
- `addAlertaOpcao(userId, data)` — insere novo alerta
- `deleteAlertaOpcao(id)` — exclui alerta
- `markAlertaDisparado(id)` — marca como disparado com timestamp
- `deactivateAlertaOpcao(id)` — desativa alerta
- `savePushToken(userId, token, platform)` — upsert token push

### Arquivos criados/modificados
| Arquivo | Mudança |
|---------|---------|
| `alertas-opcoes-notif-migration.sql` | **Criado** — tabelas alertas_opcoes + push_tokens |
| `src/services/database.js` | +6 funções CRUD alertas + push tokens |
| `src/screens/opcoes/OpcoesScreen.js` | Import alertas, states, bell icon na grade, Modal criação, useEffect verificação |

## Notificações Push (Implementado)

Push notifications via expo-notifications para vencimentos de opções, renda fixa, e alertas de preço. Registro automático de token, agendamento local, handler foreground.

### Arquitetura

| Componente | Descrição |
|------------|-----------|
| `expo-notifications` | SDK Expo para push notifications (local + remote) |
| `notificationService.js` | Service com 8 funções: register, save token, schedule, check, send, setup |
| `push_tokens` (Supabase) | Tabela com tokens por usuário para futuro push server-side |
| `App.js` | Handler foreground + canal Android configurados no startup |
| `HomeScreen.js` | Register token + schedule expiry notifications no load |
| `OpcoesScreen.js` | Check price alerts quando chains carregam |

### Notificações locais agendadas

| Evento | Antecedência | Título |
|--------|-------------|--------|
| Opção vencendo | 7d, 3d, 1d | "Opção vencendo em X dias" |
| Renda fixa vencendo | 7d, 1d | "Renda fixa vencendo em X dias" |
| Alerta preço disparado | Imediato | "Alerta de opção disparado" |

### Agendamento
- `scheduleOptionExpiryNotifications`: cancela todos os agendados primeiro, depois agenda para cada opção ativa nos triggers 7d/3d/1d. Horário: 9h BRT (12h UTC)
- `scheduleRFExpiryNotifications`: agenda para RF nos triggers 7d/1d
- Re-agendado a cada abertura do app (HomeScreen load)

### notificationService.js — Funções exportadas
- `registerForPushNotifications()` — pede permissão, retorna Expo push token
- `savePushToken(userId, token, platform)` — upsert na tabela push_tokens
- `scheduleOptionExpiryNotifications(opcoes)` — agenda notifs locais para opções
- `scheduleRFExpiryNotifications(rendaFixa)` — agenda notifs locais para RF
- `checkPriceAlerts(userId, alertasOpcoes, chainsCache)` — verifica 4 tipos de alerta contra cache OpLab
- `sendLocalNotification(title, body, data)` — notificação local imediata
- `setupNotificationChannel()` — canal Android (HIGH importance)
- `setNotificationHandler()` — handler foreground (show alert + sound)

### Configuração (app.json)
```json
["expo-notifications", { "icon": "./assets/icon.png", "color": "#6C5CE7", "sounds": [], "defaultChannel": "default" }]
```

### Build
Requer `eas build` para gerar binário com expo-notifications nativo. Notificações locais funcionam sem servidor. Push remoto futuro via Expo Push API + tokens salvos.

### Arquivos criados/modificados
| Arquivo | Mudança |
|---------|---------|
| `alertas-opcoes-notif-migration.sql` | **Criado** — tabela push_tokens |
| `src/services/notificationService.js` | **Criado** — 8 funções de notificação |
| `app.json` | +plugin expo-notifications |
| `App.js` | +setup handler + canal Android |
| `src/screens/home/HomeScreen.js` | +register token, +schedule option/RF expiry notifications |
| `src/screens/opcoes/OpcoesScreen.js` | +check price alerts, +send local notification on trigger |
| `package.json` | +expo-notifications dependency |

## Parcelamento de Cartao de Credito (Implementado)

Compras no cartao de credito podem ser parceladas em ate 12x. Cada parcela vira uma movimentacao separada com data deslocada por mes.

### Arquitetura

- `addMovimentacaoCartao` em database.js aceita `mov.parcelas` (default 1)
- Multi-parcela gera `parcela_grupo_id` UUID para agrupar
- `valorParcela = valor / parcelas` (ultima parcela absorve centavos residuais)
- Cada payload tem `parcela_atual`, `parcela_total`, `parcela_grupo_id`
- Descricao acrescida de `(1/3)`, `(2/3)`, etc.
- Single parcela usa `.insert().select().single()`, multi usa `.insert(payloads).select()`

### UI (AddMovimentacaoScreen)
- Pills 1-12x em ScrollView horizontal (so aparece quando `payMethod === 'cartao' && cartaoId`)
- Preview: "3x de R$ 33,33 (total R$ 100,00)"
- Reset parcelas ao "Adicionar outra"

### Badges
- CaixaView (2 locais), ExtratoScreen e FaturaScreen exibem badge amarelo `1/3` quando parcela

### Migration SQL (parcelamento-migration.sql)
```sql
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS parcela_atual INTEGER DEFAULT NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS parcela_total INTEGER DEFAULT NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS parcela_grupo_id UUID DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_movimentacoes_parcela_grupo ON movimentacoes(parcela_grupo_id) WHERE parcela_grupo_id IS NOT NULL;
```

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `parcelamento-migration.sql` | **Criado** — 3 colunas + index |
| `src/services/database.js` | addMovimentacaoCartao com batch parcelas |
| `src/screens/gestao/AddMovimentacaoScreen.js` | Pills 1-12x, preview, state parcelas |
| `src/screens/gestao/CaixaView.js` | Badge parcela em 2 locais |
| `src/screens/gestao/ExtratoScreen.js` | Badge parcela |
| `src/screens/gestao/FaturaScreen.js` | Badge parcela |

## Sparkline por Ativo no Card Expandido (Implementado)

Cards expandidos na CarteiraScreen agora incluem grafico de historico de precos com filtros de periodo. Lazy loading ao expandir.

### Comportamento
- Secao "HISTORICO DE PRECOS" entre DESEMPENHO e FundamentalAccordion
- Pills de periodo: 1M, 3M (default), 6M, 1A
- InteractiveChart (120px altura) com dados OHLCV via `fetchPriceHistoryRange`
- Loading spinner enquanto busca dados
- Dados transformados de OHLCV `{date, close}` para `[{value, date}]`

### States no PositionCard
```javascript
var _chartData = useState(null); var chartData = _chartData[0]; var setChartData = _chartData[1];
var _chartPeriod = useState('3mo'); var chartPeriod = _chartPeriod[0]; var setChartPeriod = _chartPeriod[1];
var _chartLoading = useState(false); var chartLoading = _chartLoading[0]; var setChartLoading = _chartLoading[1];
```

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/carteira/CarteiraScreen.js` | Import InteractiveChart + fetchPriceHistoryRange, states chart*, loadChart(), handleChartPeriod(), secao HISTORICO DE PRECOS com pills + chart |

## Botao Meta no Card Expandido (Implementado)

Botao "Meta" (icone flag) no card expandido da CarteiraScreen que navega direto para Analise > Rebalanceamento.

### Comportamento
- Botao amarelo (C.etfs) na segunda linha de acoes (ao lado de "Mais")
- Navega para `navigation.navigate('Analise', { initialTab: 'rebal' })`
- AnaliseScreen aceita `route.params.initialTab` para abrir na sub-tab correta

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/carteira/CarteiraScreen.js` | Botao Meta com Ionicons flag-outline |
| `src/screens/analise/AnaliseScreen.js` | Aceita `route.params.initialTab` no useState |

## Push Notifications Server-Side (Implementado)

Edge Function `check-price-alerts` roda a cada 5 minutos durante horario de mercado via pg_cron. Verifica alertas de preco de opcoes contra dados reais do mercado (OpLab API) e envia push notifications via Expo Push API.

### Arquitetura
- **Edge Function**: `supabase/functions/check-price-alerts/index.ts`
- **Cron**: `check-alerts-cron.sql` — pg_cron `*/5 * * * *`, filtra seg-sex 10-18h BRT
- **Dados**: OpLab API `/v3/market/instruments/series/{ticker}?bs=true`
- **Push**: Expo Push API `https://exp.host/--/api/v2/push/send`
- **Tokens**: tabela `push_tokens` (registrados via `notificationService.registerPushToken`)

### Tipos de alerta verificados
| Tipo | Verificacao |
|------|-------------|
| `preco` | Mid-price (bid+ask)/2 vs valor_alvo, direcao acima/abaixo |
| `divergencia` | % divergencia mid vs preco teorico BS |
| `iv` | IV da opcao vs threshold |
| `volume` | Volume da opcao vs threshold |

### Fluxo
1. Busca alertas ativos nao disparados (`alertas_opcoes WHERE ativo=true AND disparado=false`)
2. Agrupa por `ativo_base`, busca cadeia OpLab para cada
3. Encontra opcao na cadeia por `ticker_opcao`
4. Verifica condicao do alerta
5. Se disparado: marca `disparado=true`, busca push tokens do usuario, envia via Expo Push API
6. Max 50 notificacoes por execucao

### Deploy
```
npx supabase functions deploy check-price-alerts --no-verify-jwt --project-ref zephynezarjsxzselozi
```
Apos deploy, executar `check-alerts-cron.sql` no SQL Editor do Supabase Dashboard.

### Arquivos criados
| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/check-price-alerts/index.ts` | **Criado** — Edge Function com OpLab + Expo Push |
| `check-alerts-cron.sql` | **Criado** — pg_cron job cada 5min em horario de mercado |

## Proximas Melhorias Possiveis

- [x] Rolagem de opcoes (fechar atual + abrir nova com um clique)
- [x] Notificacoes push para vencimentos proximos
- [x] Alertas de preco de opcoes (grade OpLab)
- [x] Importacao de operacoes via CSV/Excel/Nota de Corretagem
- [x] Push notifications server-side via Expo Push API (Edge Function cron)
- [x] Parcelamento de cartao de credito (1-12x)
- [x] Sparkline por ativo no card expandido
- [x] Ordenacao de posicoes (sort por valor, nome, variacao, P&L)
- [x] Export CSV de relatorios (botao download + compartilhar)
- [x] Comparativo entre ativos (grafico normalizado ate 3 tickers)
- [x] Multi-portfolio (portfolios nomeados com cor/icone)
- [x] Resumo IA diario/semanal com push notification
- [ ] Integracao com CEI/B3 para importacao automatica
- [x] Backup/restore de dados
- [ ] Screen reader flow: testar e ajustar ordem de leitura com accessibilityOrder

## Ordenacao de Posicoes na Carteira (Implementado)

Sort pills abaixo dos filtros de categoria na CarteiraScreen. Permite ordenar posicoes por 4 criterios.

### Opcoes de ordenacao
| Chave | Label | Logica |
|-------|-------|--------|
| `valor` | Valor | Qty × preco atual, DESC (default) |
| `nome` | A-Z | Ticker alphabetico, ASC |
| `var` | Variacao | Variacao diaria %, DESC |
| `pl` | P&L | P&L absoluto (R$), DESC |

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/carteira/CarteiraScreen.js` | State `sortKey`, logica sort em `filteredPositions`, pills UI com setas direcao |

## Export CSV de Relatorios (Implementado)

Botao de download no canto superior direito dos Relatorios. Gera CSV da sub-tab ativa e abre share sheet do sistema.

### Formato CSV por sub-tab
| Sub-tab | Colunas |
|---------|---------|
| Caixa | Data, Tipo, Categoria, Conta, Valor, Descricao |
| Dividendos | Data, Ticker, Tipo, Valor/Cota, Quantidade, Total |
| Opcoes | Data Abertura, Ativo Base, Ticker Opcao, Tipo, Direcao, Strike, Premio, Qtd, Status, Premio Fech. |
| Operacoes | Data, Ticker, Tipo, Categoria, Qtd, Preco, Custos, Corretora |
| IR | Mes + vendas/ganhos/perdas/IR por classe (Acoes, FII, ETF, Stocks) |

### Dependencias
- `expo-file-system` — escrever CSV no cache
- `expo-sharing` — abrir share sheet nativa

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/relatorios/RelatoriosScreen.js` | Import FileSystem+Sharing, state exporting, handleExport com CSV builder por sub-tab, botao download no header |

## Comparativo entre Ativos (Implementado)

Sub-tab "Comparativo" na AnaliseScreen. Permite selecionar ate 3 tickers do portfolio e ver grafico de retorno normalizado comparando performance lado a lado.

### Funcionalidades
- Ticker selector: Pills mostrando todos os tickers do portfolio, toggle ate 3
- Periodo: Pills 1M, 3M, 6M (default), 1A
- Grafico SVG: linhas normalizadas `(close/firstClose - 1) * 100` por ticker
- 3 cores distintas: `C.acoes`, `C.fiis`, `C.opcoes`
- Touch interativo com tooltip mostrando data + retorno % + preco de todos tickers
- Legenda com ticker + cor + retorno total %
- Dots com glow no ultimo ponto de cada serie

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/analise/AnaliseScreen.js` | Import fetchPriceHistoryRange, 5 states (compTickers, compPeriod, compData, compLoading, compTouch), sub-tab 'compar', ~250 linhas de chart SVG |

## Multi-Portfolio / Portfólios de Família (Implementado)

Sistema de portfolios nomeados para separar investimentos (ex: "Meu", "Esposa", "Filho", "Previdencia"). Feature opcional — sem portfolios, zero mudancas na UI. Visao combinada "Todos (Família)" mostra breakdown por portfolio.

### Tabela `portfolios`
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID | PK auto-gerado |
| user_id | UUID | FK auth.users |
| nome | TEXT | Nome do portfolio |
| cor | TEXT | Hex color |
| icone | TEXT | Ionicons name |
| ordem | INTEGER | Ordem de exibicao |

### Colunas com `portfolio_id`
- `operacoes.portfolio_id` UUID nullable FK
- `opcoes.portfolio_id` UUID nullable FK
- `renda_fixa.portfolio_id` UUID nullable FK
- `proventos.portfolio_id` UUID nullable (migration: family-portfolio-migration.sql)
- `movimentacoes.portfolio_id` UUID nullable (migration: family-portfolio-migration.sql)

### Filtro por portfolio em database.js
- `getPositions(userId, portfolioId)` — filtra operacoes. Valor especial `'__null__'` filtra operacoes SEM portfolio
- `getOpcoes(userId, portfolioId)` — filtra opcoes
- `getOperacoes(userId, filters)` — `filters.portfolioId`
- `getRendaFixa(userId, portfolioId)` — filtra RF
- `getProventos(userId, filters)` — `filters.portfolioId`
- `getMovimentacoes(userId, filters)` — `filters.portfolioId`
- `deletePortfolio(id)` — nullifica portfolio_id em operacoes, opcoes, renda_fixa, proventos e movimentacoes

### Telas com pills de portfolio
| Tela | Descricao |
|------|-----------|
| ConfigPortfoliosScreen | Lista editavel de portfolios com Glass cards, SwipeableRow delete, editor inline com nome + cor (9 opcoes) + icone (9 opcoes) |
| GestaoScreen | Dropdown selector "Todos (Família)" + portfolios individuais, icones Ionicons no dropdown |
| CarteiraScreen | Aceita `portfolioId` e `portfolios` props. Filtra posicoes, RF e opcoes. Card "PORTFÓLIOS" com breakdown por portfolio (valor, ativos, %, barra de progresso) quando na visao "Todos" |
| AddOperacaoScreen | Pills de portfolio quando usuario tem portfolios, salva `portfolio_id` |
| AddOpcaoScreen | Pills de portfolio, salva `portfolio_id` na opcao |
| AddRendaFixaScreen | Pills de portfolio, salva `portfolio_id` na RF |
| AddProventoScreen | Pills de portfolio, salva `portfolio_id` no provento |

### Visao Família (CarteiraScreen)
Quando `portfolioId === null` e existem portfolios:
- Card "PORTFÓLIOS" entre hero e mapa de calor
- Cada portfolio mostra: icone circular, nome, valor (custo), qtd ativos, % do total, barra de progresso colorida
- "Sem portfólio" aparece se existem ativos nao atribuidos a nenhum portfolio
- Computado via getPositions paralelo por portfolio no load()

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `multi-portfolio-migration.sql` | **Criado** — tabela + colunas FK |
| `family-portfolio-migration.sql` | **Criado** — portfolio_id em proventos + movimentacoes |
| `src/screens/mais/config/ConfigPortfoliosScreen.js` | **Criado** — gestao de portfolios |
| `src/services/database.js` | getPortfolios, addPortfolio, updatePortfolio, deletePortfolio (com proventos+movimentacoes), filtro portfolioId em 6 funcoes, suporte '__null__' em getPositions |
| `src/screens/gestao/GestaoScreen.js` | Dropdown "Todos (Família)" com icones, passa portfolios prop ao CarteiraScreen |
| `src/screens/carteira/CarteiraScreen.js` | Prop portfolios, state familyBreakdown, card PORTFÓLIOS, getRendaFixa com portfolioId |
| `src/screens/carteira/AddOperacaoScreen.js` | Pills portfolio + portfolio_id no payload |
| `src/screens/opcoes/AddOpcaoScreen.js` | +getPortfolios, +pills portfolio, +portfolio_id no addOpcao |
| `src/screens/rf/AddRendaFixaScreen.js` | +getPortfolios, +pills portfolio, +portfolio_id no addRendaFixa |
| `src/screens/proventos/AddProventoScreen.js` | +getPortfolios, +pills portfolio, +portfolio_id no addProvento |
| `src/navigation/AppNavigator.js` | +ConfigPortfolios stack screen |
| `src/screens/mais/MaisScreen.js` | +item Portfolios em CONFIGURACOES |

## Resumo IA Diario/Semanal com Push Notification (Implementado)

Resumos automaticos da carteira gerados por Claude Haiku, enviados via push notification. Feature Premium-only com configuracao de frequencia (diario/semanal/desativado).

### Arquitetura

- **Edge Function `ai-summary`**: roda via pg_cron as 18h BRT (21h UTC) em dias uteis. Sexta-feira processa tanto daily quanto weekly
- **Claude Haiku 4.5**: gera resumo com 3 secoes (RESUMO, ACOES URGENTES, DICA DO DIA) + teaser de 1 linha
- **Expo Push API**: envia notificacao com teaser do resumo
- **Tabela `ai_summaries`**: armazena resumos com campos por secao, tokens, custo, flag lido
- **Perfil `ai_summary_frequency`**: preferencia do usuario (daily/weekly/off)

### Fluxo

1. pg_cron dispara Edge Function as 21h UTC (seg-sex)
2. Edge Function busca usuarios com `ai_summary_frequency` = 'daily' ou 'weekly'
3. Para cada usuario: busca posicoes, opcoes, proventos, RF, saldos, snapshots
4. Busca cotacoes brapi em batch (todos tickers BR de todos usuarios)
5. Monta prompt com dados da carteira + enrichment de precos
6. Chama Claude Haiku → parseia resposta em 3 secoes + teaser
7. Insere em `ai_summaries` + log em `ai_usage`
8. Envia push notification via Expo Push API com teaser

### Prompt

| Secao | Conteudo |
|-------|----------|
| [RESUMO] | 3-5 frases da situacao. Diario: foco no dia. Semanal: comparativo inicio vs fim |
| [ACOES URGENTES] | 1-3 acoes que precisam de atencao (opcoes vencendo, ativo caindo, meta atrasada) |
| [DICA DO DIA] | 1 dica pratica e acionavel baseada nos dados |
| [TEASER] | 1 linha (max 100 chars) com insight mais importante (para push notification) |

### HomeScreen — Card de Resumo IA

- Card expansivel entre VENCIMENTOS e FAB
- Collapsed: icone sparkles, "Resumo IA", badge NOVO se nao lido, teaser, data
- Expanded: 3 secoes completas (RESUMO, ACOES URGENTES, DICA DO DIA)
- Marca como lido ao primeiro toque
- Busca ultimo resumo no load() para usuarios Premium (fire-and-forget)

### ConfigResumoIAScreen

- 3 opcoes radio: Diario, Semanal, Desativado
- Premium gate (UpgradePrompt se nao Premium)
- Salva `ai_summary_frequency` no profile
- Card "Como funciona" com 4 bullets informativos

### MaisScreen

- Item "Resumo IA" em CONFIGURACOES com gate AI_SUMMARY
- Valor dinamico: Diario/Semanal/Desativado baseado no profile

### Tabela ai_summaries

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID | PK |
| user_id | UUID | FK auth.users |
| created_at | TIMESTAMPTZ | Timestamp |
| tipo | TEXT | 'daily' ou 'weekly' |
| resumo | TEXT | Secao RESUMO |
| acoes_urgentes | TEXT | Secao ACOES URGENTES |
| dica_do_dia | TEXT | Secao DICA DO DIA |
| teaser | TEXT | Teaser para push (max 100 chars) |
| tokens_in | INTEGER | Input tokens |
| tokens_out | INTEGER | Output tokens |
| custo_estimado | NUMERIC | Custo estimado USD |
| lido | BOOLEAN | Flag de leitura |

### pg_cron

- Job `ai-summary-daily`: `0 21 * * 1-5` (seg-sex 18h BRT)
- Sexta: mode=both (daily + weekly users)
- Seg-qui: mode=daily (so daily users)

### Arquivos criados/modificados

| Arquivo | Mudanca |
|---------|---------|
| `ai-summary-migration.sql` | **Criado** — tabela ai_summaries + coluna ai_summary_frequency + pg_cron |
| `supabase/functions/ai-summary/index.ts` | **Criado** — Edge Function batch: fetch data, brapi prices, Claude, push |
| `src/services/database.js` | +getLatestAiSummary, getAiSummaries, markSummaryRead |
| `src/constants/subscriptionFeatures.js` | +AI_SUMMARY feature gate |
| `src/screens/mais/config/ConfigResumoIAScreen.js` | **Criado** — settings screen com radio options |
| `src/screens/mais/MaisScreen.js` | +item Resumo IA com valor dinamico + gate |
| `src/screens/home/HomeScreen.js` | +card expansivel de resumo IA com badge NOVO |
| `src/navigation/AppNavigator.js` | +ConfigResumoIA stack screen |

### Deploy

```bash
npx supabase functions deploy ai-summary --no-verify-jwt --project-ref zephynezarjsxzselozi
```
Aplicar `ai-summary-migration.sql` via SQL Editor do Supabase Dashboard.

## Enforcement operacoes_contas por Portfolio (Implementado)

Quando um portfolio tem `operacoes_contas=false`, NENHUMA movimentacao automatica e criada. Enforcement aplicado em todos os 8+ pontos de criacao automatica.

### Pontos de enforcement

| Tela/Servico | Acao | Guard |
|--------------|------|-------|
| AddOperacaoScreen | Compra/venda → saldo | `portOpContas` check antes do Alert |
| AddOpcaoScreen | Venda opcao → creditar premio | `&& portOpContas` na condicao |
| OpcoesScreen | Recompra opcao → debitar saldo | `canLogMov(original)` |
| OpcoesScreen | Exercicio manual → movimentacao | `canLogMov(expOp)` |
| OpcoesScreen | Exercicio automatico → movimentacao | `canLogMov(autoOp)` |
| OpcoesScreen | Expirou PO → movimentacao | `canLogMov(expOp)` |
| dividendService | Auto-sync dividendos → movimentacao | `isMovBlocked(pos)` check |

### Helper canLogMov (OpcoesScreen)
```javascript
var canLogMov = function(opcao) {
  if (!opcao || !opcao.portfolio_id) return true;
  for (var pi = 0; pi < portfolios.length; pi++) {
    if (portfolios[pi].id === opcao.portfolio_id && portfolios[pi].operacoes_contas === false) {
      return false;
    }
  }
  return true;
};
```

### Helper isMovBlocked (dividendService)
Busca portfolios do usuario, monta `portfolioBlockedMap` com IDs bloqueados, verifica `pos.portfolio_ids` contra o mapa.

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/carteira/AddOperacaoScreen.js` | Guard `portOpContas` no Alert de saldo |
| `src/screens/opcoes/AddOpcaoScreen.js` | `&& portOpContas` na condicao de creditar premio |
| `src/screens/opcoes/OpcoesScreen.js` | Helper `canLogMov`, aplicado em 4 locais (recompra, exercicio auto/manual, expirou PO) |
| `src/services/dividendService.js` | Import getPortfolios, helper `isMovBlocked`, aplicado em BR/INT dividendos + retroativos |

## Limite de 5 Portfolios + UI Condicional (Implementado)

Maximo de 5 portfolios (Padrao + 4 custom). Selecao de portfolio oculta quando usuario nao tem portfolios custom. Tudo default para Padrao (null portfolio_id).

### Regras
- **Padrao** (portfolio_id NULL) sempre existe, nao conta como custom
- Maximo 4 portfolios custom (total 5 com Padrao)
- Secao de selecao de portfolio oculta em todas as telas Add quando `portfolios.length === 0`
- Pill "+ Novo" oculta quando `portfolios.length >= 4`
- ConfigPortfoliosScreen: guard no `handleAdd`, contador X/5 no header

### Telas com portfolio oculto condicionalmente
- AddOperacaoScreen: `{portfolios.length > 0 ? ... : null}`
- AddOpcaoScreen: mesma logica
- AddProventoScreen: mesma logica
- AddRendaFixaScreen: mesma logica
- AddCartaoScreen: mesma logica

### ConfigPortfoliosScreen — Contador e limite
- Header exibe `{(portfolios.length + 1) + '/5'}` com cor vermelha quando no limite
- `handleAdd`: `if (portfolios.length >= 4) { Alert... return; }`

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/carteira/AddOperacaoScreen.js` | Portfolio section condicional + limite "+ Novo" |
| `src/screens/opcoes/AddOpcaoScreen.js` | Portfolio section condicional + limite "+ Novo" |
| `src/screens/proventos/AddProventoScreen.js` | Portfolio section condicional + limite "+ Novo" |
| `src/screens/rf/AddRendaFixaScreen.js` | Portfolio section condicional + limite "+ Novo" |
| `src/screens/gestao/AddCartaoScreen.js` | Portfolio section condicional + limite "+ Novo" |
| `src/screens/mais/config/ConfigPortfoliosScreen.js` | Guard handleAdd, contador X/5, cor vermelha no limite |

## Widgets Sempre Usam Portfolio Padrao (Implementado)

Widgets iOS nao tem seletor de portfolio, entao sempre refletem dados do portfolio Padrao (null portfolio_id).

### Logica (HomeScreen)
- Se dashboard ja usa Padrao (`!dashPortfolioId || dashPortfolioId === '__null__'`): usa resultado direto
- Se dashboard usa portfolio custom: busca Padrao separadamente via `getDashboard(user.id, '__null__')` para widgets

### widgetBridge
- `getCartoes(userId)` → `getCartoes(userId, '__null__')` para filtrar cartoes do Padrao

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `src/screens/home/HomeScreen.js` | Widget sync condicional com fallback para Padrao |
| `src/services/widgetBridge.js` | getCartoes filtrado por portfolio Padrao |

## Exclusao de Portfolio com Escolha + Backup (Implementado)

Ao excluir portfolio com dados, usuario escolhe entre "Mover para Padrao" ou "Excluir tudo". Exclusao permanente faz backup automatico recuperavel por 30 dias.

### Fluxo de exclusao
1. Alert com 2 opcoes: "Mover dados para Padrao" / "Excluir portfolio e dados"
2. **Mover**: `deletePortfolio(id, false)` — dados migram para Padrao (portfolio_id = NULL)
3. **Excluir**: dupla confirmacao → `deletePortfolio(id, true)` — backup + delete cascade

### database.js — deletePortfolio(id, deleteData)
- `deleteData=false`: UPDATE operacoes/opcoes/renda_fixa/saldos_corretora/cartoes_credito SET portfolio_id=NULL, depois DELETE portfolio
- `deleteData=true`: chama `backupPortfolioData(id)` primeiro, depois DELETE cascade

### database.js — backupPortfolioData(portfolioId)
- Fetch paralelo de operacoes, opcoes, renda_fixa, saldos, cartoes vinculados ao portfolio
- Salva como JSONB na tabela `portfolio_backups` com nome, cor, icone do portfolio

### database.js — restorePortfolioBackup(backupId)
- Recria portfolio com mesmo nome/cor/icone
- Re-insere todos dados com novo portfolio_id
- Marca backup como expirado

### ConfigPortfoliosScreen — Secao BACKUPS
- Lista backups nao expirados via `getPortfolioBackups`
- Botao "Restaurar" com confirmacao
- Exibe nome do portfolio + data de exclusao + contagem de registros

### Tabela portfolio_backups (portfolio-backup-migration.sql)
```sql
CREATE TABLE portfolio_backups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  portfolio_name TEXT NOT NULL,
  portfolio_cor TEXT,
  portfolio_icone TEXT,
  dados JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);
```
pg_cron purge diario de backups expirados.

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `portfolio-backup-migration.sql` | **Criado** — tabela portfolio_backups + pg_cron purge |
| `src/services/database.js` | +deletePortfolio(id, deleteData), +backupPortfolioData, +getPortfolioBackups, +restorePortfolioBackup |
| `src/screens/mais/config/ConfigPortfoliosScreen.js` | Escolha mover/excluir, dupla confirmacao, secao BACKUPS com restore |

## Backup Diario Completo do Usuario (Implementado)

Sistema automatico de backup diario de TODOS os dados do usuario. Snapshot JSONB com retencao de 30 dias. Tela para browsing e restauracao de qualquer data.

### Arquitetura
- **Edge Function `daily-backup`**: roda 2h BRT (5h UTC) via pg_cron, faz snapshot de 15 tabelas por usuario
- **Tabela `user_backups`**: JSONB com dados completos, UNIQUE(user_id, backup_date)
- **Purge automatico**: pg_cron as 3:30h UTC remove backups > 30 dias
- **Tela BackupScreen**: lista backups disponiveis, cards expandiveis com detalhes por tabela, restauracao com dupla confirmacao

### Tabelas copiadas no backup (15)
profiles, portfolios, operacoes, opcoes, renda_fixa, proventos, movimentacoes, saldos_corretora, cartoes_credito, orcamentos, transacoes_recorrentes, alertas_config, indicators, rebalance_targets, alertas_opcoes

### Edge Function daily-backup
- Busca todos profiles, processa em batches de 5
- Pula usuarios sem dados (0 operacoes E 0 saldos)
- Upsert por `user_id + backup_date` (idempotente)
- Calcula `size_bytes` e `tabelas_count` por tabela
- Retorna JSON com stats: users_backed, users_skipped, total_size_mb

### database.js — Funcoes de backup
- `getUserBackups(userId)` — lista backups ordenados por data DESC (sem dados JSONB)
- `restoreUserBackup(userId, backupId)` — restauracao completa:
  1. Busca backup com dados JSONB
  2. Deleta TODOS dados atuais do usuario (15 tabelas)
  3. Re-insere dados do snapshot (ordem de dependencias)
  4. Atualiza profile

### BackupScreen (src/screens/mais/config/BackupScreen.js)
- Info card: "Backup automatico diario, retencao 30 dias"
- Lista de backups com data, dia da semana, contagem de registros, tamanho
- Badge "HOJE" para backup do dia atual
- Cards expandiveis com grid de registros por tabela (15 tabelas com labels traduzidos)
- Botao "Restaurar para esta data" com dupla confirmacao
- Warning: "Seus dados atuais serao substituidos pelos deste backup"
- Empty state quando sem backups disponiveis

### Migration SQL (user-backup-migration.sql)
```sql
CREATE TABLE user_backups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  backup_date DATE NOT NULL,
  dados JSONB NOT NULL,
  tabelas_count JSONB DEFAULT '{}'::jsonb,
  size_bytes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, backup_date)
);
```
- Index em (user_id, backup_date DESC)
- RLS policy por user_id
- pg_cron purge 30 dias + trigger diario Edge Function

### Deploy
```bash
npx supabase functions deploy daily-backup --no-verify-jwt --project-ref zephynezarjsxzselozi
```
Aplicar `user-backup-migration.sql` via SQL Editor do Supabase Dashboard.

### Arquivos criados/modificados
| Arquivo | Mudanca |
|---------|---------|
| `user-backup-migration.sql` | **Criado** — tabela + index + RLS + pg_cron (purge + trigger) |
| `supabase/functions/daily-backup/index.ts` | **Criado** — Edge Function snapshot 15 tabelas, batches de 5 |
| `src/services/database.js` | +getUserBackups, +restoreUserBackup |
| `src/screens/mais/config/BackupScreen.js` | **Criado** — tela completa de browsing e restauracao |
| `src/navigation/AppNavigator.js` | +import BackupScreen, +SafeBackupScreen, +Stack.Screen Backup |
| `src/screens/mais/MaisScreen.js` | +item "Backup" em CONFIGURACOES |

## Snapshots de Patrimonio por Portfolio (Implementado)

Snapshots de patrimonio agora sao salvos por portfolio, permitindo graficos de retorno semanal independentes por portfolio na CarteiraScreen.

### Convencao portfolio_id nos snapshots
| Valor | Significado |
|-------|-------------|
| `NULL` | Snapshot global (patrimonio total de todos portfolios) |
| UUID de portfolio | Snapshot daquele portfolio especifico |
| `00000000-0000-0000-0000-000000000001` | Snapshot do "Padrao" (operacoes sem portfolio_id) |

### Logica de busca (getPatrimonioSnapshots)
- `portfolioId = null/undefined` → busca global (`IS NULL`)
- `portfolioId = '__null__'` → busca Padrao (sentinela UUID)
- `portfolioId = UUID` → busca portfolio especifico

### Logica de gravacao (upsertPatrimonioSnapshot)
- `portfolioId = null/undefined` → salva global (`portfolio_id = NULL`)
- `portfolioId = '__null__'` → salva Padrao (sentinela UUID)
- `portfolioId = UUID` → salva portfolio especifico
- Usa update+insert manual (COALESCE index nao suporta upsert nativo)

### HomeScreen — Gravacao de snapshots
- Visao "Todos" (`!dashPortfolioId`): salva global + fire-and-forget per-portfolio (cada portfolio custom + Padrao via getDashboard)
- Visao "Padrao" (`__null__`): salva como Padrao (sentinela)
- Visao portfolio especifico: salva per-portfolio

### CarteiraScreen — Leitura de snapshots
- `getPatrimonioSnapshots(user.id, portfolioId)` filtra conforme o portfolio selecionado
- Grafico de retorno semanal agora reflete dados do portfolio ativo

### AssetDetailScreen — Transacoes por portfolio
- Recebe `portfolioId` via route.params
- `getOperacoes`, `getProventos`, `getOpcoes` filtram por portfolio

### Edge Function weekly-snapshot
- Salva snapshot global (`NULL`) + per-portfolio (UUID custom ou sentinela Padrao)
- Busca `portfolio_id` das operacoes e renda fixa para agregar por portfolio

### Migration SQL (snapshot-portfolio-migration.sql)
```sql
ALTER TABLE patrimonio_snapshots ADD COLUMN IF NOT EXISTS portfolio_id UUID DEFAULT NULL;
ALTER TABLE patrimonio_snapshots DROP CONSTRAINT IF EXISTS patrimonio_snapshots_user_id_data_key;
CREATE UNIQUE INDEX idx_snapshots_user_date_portfolio ON patrimonio_snapshots (user_id, data, COALESCE(portfolio_id, '00000000-0000-0000-0000-000000000000'));
```

### Arquivos modificados
| Arquivo | Mudanca |
|---------|---------|
| `snapshot-portfolio-migration.sql` | **Criado** — coluna portfolio_id + UNIQUE index com COALESCE |
| `src/services/database.js` | getPatrimonioSnapshots e upsertPatrimonioSnapshot aceitam portfolioId, helper snapshotPortfolioId, constante PADRAO_SNAPSHOT_ID, getDashboard filtra snapshots por portfolio |
| `src/screens/home/HomeScreen.js` | Salva snapshots global + per-portfolio fire-and-forget |
| `src/screens/carteira/CarteiraScreen.js` | Busca snapshots com portfolioId, passa portfolioId ao navegar para AssetDetail |
| `src/screens/carteira/AssetDetailScreen.js` | Extrai portfolioId dos route.params, filtra getOperacoes/getProventos/getOpcoes por portfolio |
| `supabase/functions/weekly-snapshot/index.ts` | Agrega posicoes por portfolio, salva snapshots per-portfolio + global |
