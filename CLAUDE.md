# PREMIOLAB

App investimentos BR (opções, ações, FIIs, ETFs, RF) — React Native (Expo) + Supabase.

## Stack

- **Frontend**: React Native 0.81 + Expo SDK 54
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Cotações**: brapi.dev (token: tEU8wyBixv8hCi7J3NCjsi) + StatusInvest + Yahoo Finance (INT)
- **Opções**: OpLab API (ver `memory/oplab.md`)
- **IA**: Claude Haiku 4.5 via Edge Function `analyze-option` (streaming SSE)
- **Fontes**: DM Sans (display/body), JetBrains Mono (números)
- **Nav**: React Navigation 7 (bottom tabs + stack)
- **Notif**: expo-notifications (local + push Expo Push API)
- **Widgets**: iOS SwiftUI @bacons/apple-targets, Android react-native-android-widget
- **Assinaturas**: RevenueCat (preparado, sem SDK)
- **Deploy**: `npx supabase functions deploy <name> --no-verify-jwt --project-ref zephynezarjsxzselozi`

## Regras de Código (OBRIGATÓRIO)

- Usar `var` (nunca const/let)
- Usar `function(){}` (nunca arrow functions)
- Sem destructuring, spread, optional chaining, template literals
- useState: `var _x = useState(val); var x = _x[0]; var setX = _x[1];`

## Estrutura

```
src/
  components/   Glass, Badge, Pill, Field, InteractiveChart, PressableCard, SwipeableRow,
                TickerInput, CorretoraSelector, ToastConfig, InfoTip, FundamentalAccordion,
                FundamentalChart, TechnicalChart, UpgradePrompt, Logo, States
  config/       Supabase client
  constants/    financeCategories.js, subscriptionFeatures.js
  contexts/     AuthContext, SubscriptionContext
  navigation/   AppNavigator (tabs + stacks + deep linking)
  screens/
    analise/    Dashboard analítico, Rebalanceamento, Comparativo, Indicadores
    auth/       Login, Onboarding, RecuperarSenha
    carteira/   Carteira, AddOperacao, EditOperacao, AssetDetail, ImportOperacoes
    gestao/     GestaoScreen, CaixaView, AddMovimentacao, Extrato, AddConta,
                FinancasView, Orcamento, Recorrentes, AddRecorrente,
                FaturaScreen, AddCartao, ConfigGastosRapidos, AddGastoRapido
    home/       Dashboard principal
    mais/       Menu + Configs
    opcoes/     Opcoes (ativas, pendentes, calc/simulador, radar, hist)
    proventos/  Proventos (lista, add, edit)
    relatorios/ Relatórios (dividendos, opções, operações, IR)
    renda/      Tab Renda (RendaScreen, RendaResumoView)
    rf/         Renda Fixa (lista, add, edit)
  services/
    database.js              CRUD Supabase (todas tabelas)
    priceService.js          Cotações BR (brapi) + routing BR/INT
    yahooService.js          Cotações INT (Yahoo Finance)
    oplabService.js          Grade opções reais (OpLab, cache 2min aberto/30min fechado)
    opportunityService.js    Radar de oportunidades (10 detectores, scan batch)
    indicatorService.js      HV, RSI, SMA, EMA, Beta, ATR, BB, MaxDD
    dividendService.js       Auto-sync dividendos
    tickerSearchService.js   Busca tickers (brapi BR, Yahoo INT)
    fundamentalService.js    Fundamentalistas (brapi+Yahoo, cache 24h)
    currencyService.js       Câmbio multi-moeda
    csvImportService.js      Parse CSV/TSV/XML/nota corretagem
    geminiService.js         Client IA (nome legado, chama Edge Function)
    aiUsageService.js        Controle limites IA (5/dia, 100/mês)
    notificationService.js   Push + notificações locais
    widgetBridge.js          Bridge app ↔ widgets nativos
    technicalAnalysisService.js  S/R, pivots, volume profile, tendência
  theme/index.js  Cores (C), Fontes (F), Tamanhos (SIZE)
  utils/          a11y.js, deviceId.js
supabase/functions/
    analyze-option/      IA opções (Claude Haiku, streaming SSE)
    oplab-options/       Proxy OpLab API
    weekly-snapshot/     Snapshot patrimônio semanal
    check-price-alerts/  Alertas opções 5min (OpLab + push)
    ai-summary/          Resumo IA diário/semanal
    daily-backup/        Backup diário 15 tabelas
    add-ai-credits/      Webhook RevenueCat créditos IA
```

## Navegação (5 Tabs)

1. **Home** — Patrimônio hero, KPI bar, renda mês, alertas, eventos, resumo IA
2. **Carteira** — Sub-tabs Ativos/Caixa/Finanças (GestaoScreen). Treemap, sort, portfolios
3. **Opções** — 5 sub-tabs (ativas, pendentes, calc, radar, hist). Grade OpLab, simulador BS, IA, radar oportunidades
4. **Renda** — Sub-tabs Resumo/Proventos/Relatórios
5. **Mais** — Config, Análise Completa, Paywall, Profile, Backup

Deep links: `premiolab://tab/{name}`, `premiolab://gasto-rapido/{id}`, `premiolab://add-gasto`, `premiolab://fatura/{id}`

## Theme

### Cores (C)
- bg: `#070a11` | text: `#f1f1f4` | accent: `#6C5CE7`
- textSecondary: `#8888aa` | textTertiary: `#666688`
- Produtos: ações `#3B82F6` | fiis `#10B981` | opções `#8B5CF6` | etfs `#F59E0B` | rf `#06B6D4` | stock_int `#E879F9`
- Status: green `#22C55E` | red `#EF4444` | yellow `#F59E0B`

### Fontes (F)
- display: `DMSans-Bold` | body: `DMSans-Medium` | mono: `JetBrainsMono-Regular`

### Tamanhos (SIZE)
- gap: 14 | padding: 18 | radius: 14 | tabBarHeight: 78

## Banco de Dados — RLS `auth.uid() = user_id`

| Tabela | Campos chave |
|--------|-------------|
| `profiles` | nome, meta_mensal, selic, last_dividend_sync, trial_pro/premium_used/start, referral_code, opcoes_favorites/watchlist (JSONB), gastos_rapidos (JSONB), ai_credits_extra, ai_summary_frequency, pais, cidade, data_nascimento, sexo |
| `portfolios` | nome, cor, icone, ordem, operacoes_contas (bool) |
| `operacoes` | ticker, tipo(compra/venda), categoria(acao/fii/etf/stock_int), qty, preco, custos, corretora, data, mercado(BR/INT), taxa_cambio, portfolio_id |
| `opcoes` | ativo_base, ticker_opcao, tipo(call/put), direcao(venda/compra/lancamento), strike, premio, qty, vencimento, data_abertura, status, corretora, premio_fechamento, data_fechamento, alerta_pl, portfolio_id |
| `proventos` | ticker, tipo_provento, valor_por_cota, qty, valor_total, data_pagamento, portfolio_id |
| `renda_fixa` | tipo, emissor, taxa, indexador, valor_aplicado, vencimento, portfolio_id |
| `saldos_corretora` | name, saldo, tipo, moeda. UNIQUE(user_id, name, moeda) |
| `movimentacoes` | conta, tipo(entrada/saida/transferencia), categoria, subcategoria, valor, descricao, referencia_id, ticker, saldo_apos, meio_pagamento(pix/debito/credito), parcela_atual/total/grupo_id, portfolio_id |
| `cartoes_credito` | nome, bandeira, limite, dia_fechamento, dia_vencimento, moeda, portfolio_id |
| `orcamentos` | grupo, valor_limite, ativo. UNIQUE(user_id, grupo) |
| `transacoes_recorrentes` | tipo, categoria, subcategoria, conta, valor, frequencia, dia_vencimento, proximo_vencimento, ativo |
| `indicators` | HV, RSI, SMA, EMA, Beta, ATR, BB, MaxDD por ticker. UNIQUE(user_id, ticker) |
| `rebalance_targets` | class_targets, sector_targets, ticker_targets (JSONB) |
| `patrimonio_snapshots` | data, valor, portfolio_id. NULL=global, UUID=custom, sentinela=Padrão |
| `alertas_config` | flags + thresholds |
| `alertas_opcoes` | ticker_opcao, ativo_base, tipo_alerta(preco/divergencia/iv/volume), valor_alvo, direcao, ativo, disparado |
| `ai_usage` | tipo, tokens_in/out, custo_estimado, resultado_id |
| `ai_summaries` | tipo(daily/weekly), resumo, acoes_urgentes, dica_do_dia, teaser, lido |
| `vip_overrides` | email(UNIQUE), tier(pro/premium), motivo, ativo |
| `referrals` | referrer_id, referred_id, status(pending/active/expired). UNIQUE(referred_id) |
| `user_corretoras` | name, count |
| `push_tokens` | token, platform |
| `portfolio_backups` | portfolio_name, dados(JSONB), expires_at(30d) |
| `user_backups` | backup_date, dados(JSONB), tabelas_count, size_bytes. UNIQUE(user_id, backup_date) |

### Enums
- Status opções: `ativa`, `exercida`, `expirada`, `fechada`, `expirou_po`
- Direção opções: `venda` (padrão), `compra`, `lancamento` (legado = venda)
- Categorias: `acao`, `fii`, `etf`, `stock_int`
- Mercado: `BR` (brapi) | `INT` (Yahoo). ETFs INT: categoria=etf, mercado=INT

## Services — API Principal

### database.js
- Profiles: getProfile, updateProfile
- Operações: getOperacoes, addOperacao, deleteOperacao
- Positions: getPositions(userId, portfolioId) — PM, por_corretora, taxa_cambio_media. `'__null__'`=sem portfolio
- Opções: getOpcoes, addOpcao, updateOpcaoAlertaPL
- Proventos: getProventos, addProvento, deleteProvento
- RF: getRendaFixa, addRendaFixa, deleteRendaFixa
- Saldos: getSaldos, upsertSaldo, deleteSaldo
- Dashboard: getDashboard (patrimônio, renda, eventos, histórico, proventosHoje, opsAtivasData)
- Indicadores: getIndicators, upsertIndicator, upsertIndicatorsBatch
- Rebalanceamento: getRebalanceTargets, upsertRebalanceTargets
- Snapshots: getPatrimonioSnapshots, upsertPatrimonioSnapshot
- Movimentações: getMovimentacoes, addMovimentacao, addMovimentacaoComSaldo, addMovimentacaoCartao, deleteMovimentacao, getMovimentacoesSummary
- Cartões: getCartoes, addCartao, updateCartao, deleteCartao
- Alertas: getAlertasConfig, updateAlertasConfig, getAlertasOpcoes, addAlertaOpcao, deleteAlertaOpcao, markAlertaDisparado
- Portfolios: getPortfolios, addPortfolio, updatePortfolio, deletePortfolio(id, deleteData)
- Backup: getUserBackups, restoreUserBackup, backupPortfolioData, restorePortfolioBackup
- Finanças: getOrcamentos, upsertOrcamentos, getRecorrentes, addRecorrente, processRecorrentes, getFinancasSummary
- Gastos Rápidos: getGastosRapidos, saveGastosRapidos, executeGastoRapido
- IA: getLatestAiSummary, markSummaryRead
- Referrals: findReferrerByCode, addReferral, applyReferralReward
- VIP: checkVipOverride | Push: savePushToken | Corretoras: getUserCorretoras, incrementCorretora

### Outros services
- **priceService**: fetchPrices, fetchPriceHistory(Long/Range), fetchTickerProfile, enrichPositionsWithPrices, fetch*Routed
- **oplabService**: fetchOptionsChain(ticker, selic), getCachedOptionData, getCachedChain, clearOplabCache
- **indicatorService**: calc(HV/SMA/EMA/RSI/Beta/ATR/BB/MaxDD), calcIVMedia/Rank, runDailyCalculation
- **dividendService**: runDividendSync, shouldSyncDividends
- **technicalAnalysisService**: analyzeTechnicals(ohlcv, strike), buildTechnicalSummary
- **opportunityService**: RADAR_TICKERS(30), buildTickerList, scanBatch(tickers,selic,onProgress), abortScan, getOpportunityMeta

## Padrões

- Tickers normalizados: `toUpperCase().trim()`
- Anti-duplicação: estado `submitted` em telas Add
- Multi-corretora: `por_corretora` em posições, cobertura mesma corretora
- beforeRemove: warning "Descartar alterações?" com dirty check
- Toast: `react-native-toast-message` dark/glass + undo
- SwipeableRow: swipe-to-delete (movimentações auto bloqueadas)
- PressableCard: Animated.spring (respeita ReduceMotion)
- Skeletons: por tela (Home, Carteira, Opções, Caixa, Proventos, RF, Finanças)
- maxFontSizeMultiplier={1.5}: valores monetários F.mono
- Portfolio: `'__null__'`=Padrão, `null`=todos
- Snapshot sentinela: `00000000-0000-0000-0000-000000000001`=Padrão
- Cache inteligente B3: TTL curto quando bolsa aberta, longo quando fechada (marketStatusService.isB3Open). Preços 60s/30min, OpLab 2min/30min, Hist 1h/4h
- Radar state: vive no OpcoesScreen (não no RadarView) para sobreviver troca de sub-tab

## Features Resumo

- **Carteira**: donut, treemap heatmap, benchmark CDI, cards expansíveis (sparkline, fundamentals), sort (valor/AZ/var/PL), multi-portfolio (5 max)
- **Opções**: BS completo, gregas, IV, cobertura inteligente, grade OpLab real, simulador multi-leg (6 presets), análise técnica SVG, IA streaming (regular 4 seções + smart scan 5 seções), alertas 4 tipos + push, radar de oportunidades (10 detectores, 30 tickers padrão + carteira, agrupado por ativo)
- **Home**: patrimônio hero + chart bezier, KPI bar, renda mês, alertas, resumo IA
- **Renda**: resumo, proventos (6 tipos, sync auto), relatórios 4 sub-tabs + CSV
- **Análise**: 14 indicadores, performance (vs CDI/IBOV), rebalanceamento hierárquico, comparativo 3 tickers
- **Gestão**: caixa (saldos, contas), finanças (gastos, orçamentos, recorrentes), 14 grupos ~90 subcategorias, parcelamento 1-12x
- **Internacional**: stock_int mercado=INT, Yahoo Finance, IR 15% sem isenção R$20k, Beta S&P500
- **Import CSV**: 5 modos (CEI/B3, Excel XML, Nota PDF, Colar, Genérico), dedup, preview
- **Assinaturas**: Admin(jonataspmagalhaes@gmail.com)→VIP→RevenueCat→Referral→Trial→Free. Free: 5pos/3ops. PRO: ilimitado. Premium: +IA. Trial 7d, referrals PL-XXXXXX (3→PRO, 5→Premium 30d), créditos IA 5/dia 100/mês
- **Widgets iOS**: 5 (QuickExpense, Patrimônio, Heatmap, Vencimentos, Renda), UserDefaults App Group
- **Notificações**: locais (vencimento 7d/3d/1d) + server (check-price-alerts 5min seg-sex 10-18h) + resumo IA push
- **Backup**: diário auto (2h BRT, 30d), portfolio backup/restore
- **Auth**: Supabase Auth, campos extras, confirmação email, recuperar senha, código indicação

## Migrations SQL (ordem)

1. supabase-migration.sql — base + RLS + triggers
2. fix-multi-moeda-constraint.sql
3. subscription-trial-migration.sql + subscription-extras-migration.sql
4. financas-migration.sql
5. gastos-rapidos-migration.sql
6. pix-migration.sql
7. parcelamento-migration.sql
8. multi-portfolio-migration.sql + family-portfolio-migration.sql
9. snapshot-portfolio-migration.sql
10. portfolio-backup-migration.sql
11. profile-fields-migration.sql
12. alerta-pl-migration.sql
13. alertas-opcoes-notif-migration.sql
14. creditos-ia-migration.sql
15. ai-summary-migration.sql
16. user-backup-migration.sql
17. add-opcoes-favorites-columns.sql
18. check-alerts-cron.sql

## Site

- https://premiolab.com.br (GitHub Pages, `docs/`)
- Landing + Privacidade + Termos
- DNS GoDaddy: 4 A records GitHub Pages + CNAME www
