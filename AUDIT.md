# AUDIT — PremioLab
**Data:** 2026-04-10 · **Commit base:** `15485f39`

Inventário completo do app + classificação de cada peça + decisões propostas.
Este documento é a **Fase A** do plano de reconstrução. Nenhum código foi alterado.

## Sumário executivo

- **61 telas** (`src/screens/**`), **27 componentes** (`src/components/`), **23 services** (`src/services/`)
- **3 services órfãos** criados mas sem integração UI: `incomeScoreService`, `coveredCallSuggestionService`, `incomeAlertsService`
- **Telas gigantes sem coesão**: `OpcoesScreen.js` 8.780 linhas, `AnaliseScreen.js` 10.389 linhas, `CarteiraScreen.js` 3.830, `HomeScreen.js` 2.311, `RendaResumoView.js` 1.146. Essas 5 telas concentram ~26.500 das ~30.000 linhas de todo o diretório `screens/`.
- **Navegação em árvore profunda**: 5 tabs + 45 rotas stack + 4 telas com sub-tabs próprias (Opções 4, Gestão 3, Renda 3, Relatórios 5, Análise 5). 17 destinos só entre sub-tabs.
- **Duplicações conceituais**: renda aparece em 4 telas (Home, Renda, Relatórios, Análise/Renda Passiva); rebalanceamento começou em Analise e foi "integrado na CarteiraScreen" — ambos ainda existem; meta_mensal tem 2 fontes (profile + ConfigMeta); proventos têm lista em 3 lugares (ProventosScreen, RendaResumoView, Relatórios).
- **Pagamento**: `SubscriptionContext` já tem hooks pro RevenueCat (não instalado). Tier único PRO R$9.90/mês. Sem cobrança no site ainda.
- **Site**: `docs/` tem 3 HTMLs estáticos (index + privacidade + termos), GitHub Pages em `premiolab.com.br`. Zero integração com app ou Supabase.
- **Theme**: `theme/index.js` com cores hex cruas (sem semânticas), sizes misturando fonte e spacing, sem escala consistente.
- **Data layer**: 3 contexts (Auth, Privacy, Subscription). **Não existe app store de dados** — cada tela chama `getDashboard`/`getPositions`/`getProventos` independentemente.

---

## 1. SERVICES (`src/services/`)

| Arquivo | Status | Usado por | Decisão |
|---|---|---|---|
| `database.js` | 🟢 CORE | ~quase tudo (35+ arquivos) | **Manter**. Quebrar em submódulos depois: `db/proventos.js`, `db/operacoes.js`, `db/financas.js` etc. 3.174 linhas em 1 arquivo é ruim. |
| `priceService.js` | 🟢 CORE | HomeScreen, CarteiraScreen, AssetDetail, OpcoesScreen, analises | **Manter**. |
| `dividendService.js` | 🟢 CORE | runDividendSync no launch | **Manter**. |
| `fiiStatusInvestService.js` | 🟢 CORE | SimuladorFII, incomeForecast, SnowballCard | **Manter**. Fonte única de FIIs. |
| `yahooService.js` | 🟢 CORE | priceService (INT) | **Manter**. |
| `oplabService.js` | 🟢 CORE | OpcoesScreen, coveredCallSuggestion, opportunityService | **Manter**. |
| `currencyService.js` | 🟢 CORE | priceService, relatorios | **Manter**. |
| `incomeForecastService.js` | 🟢 CORE | RendaHero, GeradorRenda, incomeAlerts | **Manter**. Base da nova arquitetura de renda. |
| `yieldOnCostService.js` | 🟢 CORE | YoCCard | **Manter**. |
| `fundamentalService.js` | 🟡 SUPORTE | AssetDetail, FundamentalAccordion, geminiService | **Manter**. Pode virar submódulo. |
| `technicalAnalysisService.js` | 🟡 SUPORTE | opportunityService, OpcoesScreen | **Manter**. Só usado em Opções. |
| `indicatorService.js` | 🟡 SUPORTE | HomeScreen (daily calc), AssetDetail | **Manter**. |
| `opportunityService.js` | 🟡 SUPORTE | OpcoesScreen radar | **Manter**, renomear para `optionsRadarService.js` (nome atual é genérico demais). |
| `tickerSearchService.js` | 🟡 SUPORTE | TickerInput, AddOperacao, AssetDetail | **Manter**. |
| `marketStatusService.js` | 🟡 SUPORTE | priceService (cache TTL), HomeScreen | **Manter**. |
| `notificationService.js` | 🟡 SUPORTE | HomeScreen, incomeAlerts | **Manter**. |
| `aiUsageService.js` | 🟡 SUPORTE | geminiService, ConfigPerfilInvestidor | **Manter** enquanto IA existir; remover se IA for desativada totalmente. |
| `geminiService.js` | 🟡 SUPORTE | HomeScreen (resumo IA semanal) | **Manter reduzido**. Nome é legado — chama edge function `analyze-general`. Renomear pra `aiService.js`. |
| `csvImportService.js` | 🟡 SUPORTE | ImportOperacoes | **Manter**. |
| `widgetBridge.js` | 🟡 SUPORTE | HomeScreen | **Manter**. iOS widgets. |
| **`incomeScoreService.js`** | 🔴 ÓRFÃO | **ninguém** | **Integrar**. Plugar na Carteira (badge por ativo) + Home (score da carteira). |
| **`coveredCallSuggestionService.js`** | 🔴 ÓRFÃO | **ninguém** | **Integrar**. Plugar em tela "Ações" na nova IA + card na Home de renda. |
| **`incomeAlertsService.js`** | 🔴 ÓRFÃO | **ninguém** | **Integrar**. Plugar em seção "Alertas" na Home. |

**Ação imediata:** 3 services órfãos precisam de integração UI ou viram código morto. Decisão: **integrar todos** nas fases E-F.

---

## 2. COMPONENTS (`src/components/`)

| Arquivo | Status | Usado por | Decisão |
|---|---|---|---|
| `Glass.js` | 🟢 CORE | ~40+ telas | **Manter**. Base visual. |
| `Primitives.js` (Badge, Pill, SectionLabel, Field) | 🟢 CORE | 20+ telas | **Manter**. |
| `Charts.js` (Sparkline, Gauge) | 🟢 CORE | Home, Renda, Analise | **Manter**. |
| `States.js` (Skeleton*, LoadingScreen, EmptyState) | 🟢 CORE | 15+ telas | **Manter**. |
| `Sensitive.js` + `usePrivacyStyle` | 🟢 CORE | 30+ telas | **Manter**. |
| `InteractiveChart.js` | 🟢 CORE | Home, AssetDetail | **Manter**. |
| `Logo.js` (Logo, Wordmark) | 🟢 CORE | Splash, MaisScreen | **Manter**. |
| `ToastConfig.js` | 🟢 CORE | App.js root | **Manter**. |
| `TickerInput.js` | 🟢 CORE | AddOperacao, AddProvento, AddOpcao | **Manter**. |
| `Fab.js` | 🟢 CORE | Home | **Manter**. |
| `AiAnalysisModal.js` | 🟡 SUPORTE | Home, Opcoes, Analise | **Manter**. Usado pelo resumo IA semanal. |
| `AiConfirmModal.js` | 🟡 SUPORTE | Home | **Manter** enquanto IA existir. |
| `ShareCard.js` | 🟡 SUPORTE | Home | **Manter**. Compartilhamento de progresso. |
| `InfoTip.js` | 🟡 SUPORTE | Home, Renda, Analise | **Manter**. |
| `UpgradePrompt.js` | 🟡 SUPORTE | feature gates | **Manter**. |
| `PressableCard.js` | 🟡 SUPORTE | CarteiraScreen | **Manter**. |
| `SwipeableRow.js` | 🟡 SUPORTE | Extrato, Proventos | **Manter**. |
| `CorretoraSelector.js` | 🟡 SUPORTE | AddOperacao, AddOpcao, AddProvento, AddSaldo, AddCartao | **Manter**. |
| `PeriodFilter.js` | 🟡 SUPORTE | Analise, Relatorios | **Manter**. |
| `FundamentalAccordion.js` | 🟡 SUPORTE | AssetDetail | **Manter**. |
| `FundamentalChart.js` | 🟡 SUPORTE | FundamentalAccordion | **Manter**. |
| `TechnicalChart.js` | 🟡 SUPORTE | Opcoes | **Manter**. |
| `CurrencyPicker.js` | 🟡 SUPORTE | AddSaldo | **Manter**. |
| `RendaHero.js` | 🟢 CORE | HomeScreen | **Manter**. Core da nova arquitetura. |
| `YoCCard.js` | 🟢 CORE | RendaResumoView | **Manter**. |
| `SnowballCard.js` | 🟢 CORE | RendaResumoView | **Manter**. |

**Nenhum componente morto.** Estrutura saudável, só falta **escala de spacing e tokens semânticos** (atualmente cada tela hard-coda padding/margin).

---

## 3. SCREENS — visão por tab

### 3.1 Tab Home (`src/screens/home/`)
| Tela | Linhas | Decisão |
|---|---|---|
| `HomeScreen.js` | 2.311 | **Reescrever** na Fase E. Virar "Tela Renda" (única narrativa). Reaproveitar: hero, patrimônio, alertas, eventos, ShareCard. Eliminar: duplicação de renda do mês (RendaHero já cobre), cards desconexos. Meta: ≤ 800 linhas. |

### 3.2 Tab Carteira → `GestaoScreen.js` (wrapper com 3 sub-tabs)
| Tela | Linhas | Sub-tab | Decisão |
|---|---|---|---|
| `GestaoScreen.js` | 262 | wrapper | **Eliminar como wrapper**. Cada sub-tab vira tela própria no nav. |
| `CarteiraScreen.js` | 3.830 | ativos | **Quebrar**. Extrair: CarteiraHeatmap, CarteiraList, CarteiraSortBar, RebalanceSection. Meta: tela principal ≤ 600 linhas + 4-5 componentes. |
| `financeiro/FinanceiroView.js` | ? | financas | **Manter**, já é sub-view quebrada em seções (ContasSection, MovimentacoesSection, CartoesSection, BarChart6m, DonutChart). |
| `carteira/AddOperacaoScreen.js` | ? | modal | **Manter**. |
| `carteira/EditOperacaoScreen.js` | ? | modal | **Manter**. |
| `carteira/AssetDetailScreen.js` | ? | drill-in | **Manter**, **plugar incomeScoreService** (badge) + YoC por ativo. |
| `carteira/AddSaldoScreen.js` | ? | modal | **Manter**. |
| `carteira/AddAlertaPrecoScreen.js` | ? | modal | **Manter**. |
| `carteira/ImportOperacoesScreen.js` | ? | modal | **Manter**. |

### 3.3 Tab Opções → `OpcoesScreen.js`
| Tela | Linhas | Decisão |
|---|---|---|
| `OpcoesScreen.js` | **8.780** | **Quebrar OBRIGATORIAMENTE.** Essa tela tem 4 sub-tabs (ativas, pendentes, radar, hist) + calc + simulador multi-leg + IA streaming + radar de oportunidades. Extrair cada sub-tab pra arquivo próprio: `opcoes/views/AtivasView.js`, `PendentesView.js`, `RadarView.js`, `HistoricoView.js`, `CalcView.js`. Meta: arquivo raiz ≤ 400 linhas. |
| `opcoes/AddOpcaoScreen.js` | ? | **Manter**. |
| `opcoes/EditOpcaoScreen.js` | ? | **Manter**. |

**Observação crítica:** o Radar de Oportunidades foi feito pra viver no OpcoesScreen (ver memory `radar_oportunidades.md`). Na nova arquitetura ele vira parte da tab "Ações" (não "Opções").

### 3.4 Tab Renda → `RendaScreen.js` (wrapper com 3 sub-tabs)
| Tela | Linhas | Decisão |
|---|---|---|
| `RendaScreen.js` | 206 | **Eliminar wrapper**. Integrar direto no novo Home/Renda. |
| `RendaResumoView.js` | 1.146 | **Quebrar**. Já consome YoCCard + SnowballCard + navegação pra Calendário/Gerador. Mover o que serve pra Home, matar o resto. |
| `ProventosScreen.js` | ? | **Manter** como tela drill-in. |
| `proventos/AddProventoScreen.js` | ? | **Manter**. |
| `proventos/EditProventoScreen.js` | ? | **Manter**. |
| `RankingDividendosView.js` | ? | **Fundir** com Home → seção "top pagadores". |
| `CalendarioRendaScreen.js` | ~450 | **Manter**. Acesso direto via bottom tab ou card na Home. |
| `GeradorRendaScreen.js` | ~400 | **Manter**. Mover pra tab "Ações". |
| `relatorios/RelatoriosScreen.js` | ? | **Manter** mas atrás de 1 botão só ("Relatórios detalhados") na nova Home, sem sub-tabs expostas. 5 sub-tabs (Caixa/Div/Opc/Ops/IR) ficam internas na própria tela. |

### 3.5 Tab Mais → `MaisScreen.js` (menu)
| Tela | Linhas | Decisão |
|---|---|---|
| `MaisScreen.js` | 311 | **Renomear pra "Eu"** + limpar o menu. Hoje tem: Selic, Contas, Alertas, Meta, Gastos Rápidos, Portfolios, Perfil Investidor, Backup, Análise Completa, Simulador FII, Análises Salvas, Histórico, Renda Fixa, Importar, 3 Guias, Sobre = **18 itens**. Reduzir a 8: Perfil, Portfolios, Meta, Alertas, Contas/Corretoras, Backup, Assinatura, Sobre. |
| `mais/PaywallScreen.js` | ? | **Manter** (plugar Stripe/RevenueCat). |
| `mais/ProfileScreen.js` | ? | **Manter**. |
| `mais/SobreScreen.js` | ? | **Manter**. |
| `mais/GuiaScreen.js` | ? | **Manter** (covered call, CSP, wheel — conteúdo educacional útil pra tese). |
| `mais/HistoricoScreen.js` | ? | **Fundir** na CarteiraScreen como sub-view, não tela própria. |
| `mais/AnalisesSalvasScreen.js` | ? | **Matar**. IA de opções desativada (memory). Sem propósito. |
| `mais/config/ConfigMetaScreen.js` | ? | **Manter**, reposicionar no onboarding. |
| `mais/config/ConfigAlertasScreen.js` | ? | **Manter**. |
| `mais/config/ConfigSelicScreen.js` | ? | **Fundir** com ConfigPerfilInvestidor (é 1 campo). |
| `mais/config/ConfigCorretorasScreen.js` | ? | **Manter**. |
| `mais/config/ConfigPortfoliosScreen.js` | ? | **Manter**. |
| `mais/config/ConfigPerfilInvestidorScreen.js` | ? | **Manter**. |
| `mais/config/BackupScreen.js` | ? | **Manter**. |
| `analise/AnaliseScreen.js` | **10.389** | **Quebrar OBRIGATORIAMENTE.** 5 sub-tabs (Performance, Alocação, Composição, Comparativo, Renda Passiva). "Renda Passiva" é **duplicação** da tab Renda. Extrair: `analise/views/PerformanceView.js`, `AlocacaoView.js`, `ComposicaoView.js`, `ComparativoView.js`. **Matar** sub-tab "Renda Passiva" (já coberta pelo hero de renda). Meta: raiz ≤ 500 linhas + 4 views ≤ 1500 cada. |
| `simulador-fii/SimuladorFIIScreen.js` | ? | **Mover pra tab "Ações"**. Já tem a Carteira Teórica (recém-implementada) + previsão mensal + integração StatusInvest — ferramenta madura. |

### 3.6 Telas auth
| Tela | Decisão |
|---|---|
| `auth/LoginScreen.js` | **Manter**. |
| `auth/OnboardingScreen.js` | **Expandir** na Fase G — incluir meta mensal e primeira importação. |
| `auth/RecuperarSenhaScreen.js` | **Manter**. |

### 3.7 Telas gestão financeira
| Tela | Decisão |
|---|---|
| `gestao/AddMovimentacaoScreen.js` | **Manter**. |
| `gestao/EditMovimentacaoScreen.js` | **Manter**. |
| `gestao/ExtratoScreen.js` | **Manter**. |
| `gestao/AddContaScreen.js` | **Manter**. |
| `gestao/AddCartaoScreen.js` | **Manter**. |
| `gestao/FaturaScreen.js` | **Manter**. |
| `gestao/OrcamentoScreen.js` | **Manter**. |
| `gestao/RecorrentesScreen.js` | **Manter**. |
| `gestao/AddRecorrenteScreen.js` | **Manter**. |
| `gestao/ConfigGastosRapidosScreen.js` | **Manter**. |
| `gestao/AddGastoRapidoScreen.js` | **Manter**. |

Todas finanças estão coesas dentro de `financeiro/` com sub-sections. **Não mexer**.

### 3.8 Renda Fixa
| Tela | Decisão |
|---|---|
| `rf/RendaFixaScreen.js` | **Manter**. |
| `rf/AddRendaFixaScreen.js` | **Manter**. |
| `rf/EditRendaFixaScreen.js` | **Manter**. |

---

## 4. DUPLICAÇÕES identificadas

### 4.1 Renda do mês (4 lugares)
1. `HomeScreen` — card "renda do mês" antigo (fields `rendaTotalMes`, `rendaTotalMesAnterior`)
2. `RendaHero` — novo hero com projeção
3. `RendaResumoView` — "RENDA DO MÊS" como seção principal
4. `AnaliseScreen` sub-tab "Renda Passiva"

**Ação:** centralizar no `RendaHero` (via incomeForecastService). Matar card da HomeScreen e matar sub-tab "Renda Passiva" da Analise. RendaResumoView vira redundante com novo Home/Renda e deve ser eliminada.

### 4.2 Rebalanceamento (2 lugares)
- Começou em `AnaliseScreen`, memória diz "integrado na CarteiraScreen"
- Ainda há imports de rebalance em ambas

**Ação:** manter somente na CarteiraScreen. Remover resíduos da AnaliseScreen.

### 4.3 Meta mensal (2 lugares)
- `profile.meta_mensal` (DB)
- `ConfigMetaScreen` (UI isolada em Mais)

**Ação:** onboarding seta no primeiro login; edição fica em Profile (não Config separado).

### 4.4 Listagem de proventos (3 lugares)
1. `ProventosScreen` (tela dedicada)
2. `RendaResumoView` seção proventos
3. `RelatoriosScreen` sub-tab Dividendos

**Ação:** `ProventosScreen` como única lista. Relatórios filtra por tipo mas reusa componente. RendaResumoView deixa de existir.

### 4.5 Simulador vs Gerador de Renda
- `SimuladorFIIScreen` — simula rendimentos com DY real + carteira teórica
- `GeradorRendaScreen` — meta reversa → mix sugerido

**Ação:** manter os 2, mas agrupar na tab "Ações" (são ferramentas de ação, não acompanhamento).

### 4.6 Análise Completa vs Relatórios
- `AnaliseScreen` — Performance + Alocação + Composição + Comparativo + Renda Passiva (5 sub-tabs, 10k linhas)
- `RelatoriosScreen` — Caixa + Dividendos + Opções + Operações + IR (5 sub-tabs)

**Sobreposição:** Dividendos/Opções/Operações de Relatórios tem overlap com Renda Passiva/Performance de Analise.

**Ação:** **Fundir**. Virar 1 tela "Análise & Relatórios" com 4 seções (Performance, Alocação, Renda, IR). Elimina 3 sub-tabs redundantes. Meta: 1 tela, 4 views, ~2000 linhas total (hoje são ~12.500).

---

## 5. ÓRFÃOS confirmados

| Item | Situação | Ação |
|---|---|---|
| `incomeScoreService.js` | Criado Fase 2 revolução, zero imports | **Integrar** na CarteiraScreen (badge por ativo) + novo Home (score carteira) |
| `coveredCallSuggestionService.js` | Criado Fase 3 revolução, zero imports | **Integrar** em nova tela "Ações" (seção "Aumentar Renda") + card Home |
| `incomeAlertsService.js` | Criado Fase 9 revolução, zero imports | **Integrar** em seção "Alertas" do novo Home |
| edge function `monthly-income-report` | Criada Fase 10, não deployed, sem UI | **Deploy** + criar tela "Relatórios" em Eu → lista os PDFs salvos em `portfolio_backups` |

---

## 6. NAVEGAÇÃO (árvore atual)

```
MainTabs (5)
├── Home                      ← HomeScreen (2311 linhas)
├── Carteira                  ← GestaoScreen → 3 sub-tabs
│   ├── Ativos                ← CarteiraScreen (3830 linhas)
│   ├── Caixa                 ← saldos + contas (ok)
│   └── Finanças              ← FinanceiroView (ok)
├── Opcoes                    ← OpcoesScreen (8780 linhas) → 4 sub-tabs
│   ├── Posições
│   ├── Vencidas
│   ├── Radar
│   └── Histórico
├── Renda                     ← RendaScreen → 3 sub-tabs
│   ├── Resumo                ← RendaResumoView (1146 linhas)
│   ├── Proventos             ← ProventosScreen
│   └── Relatorios            ← RelatoriosScreen → 5 sub-tabs
│       ├── Caixa
│       ├── Dividendos
│       ├── Opções
│       ├── Operações
│       └── IR
└── Mais                      ← MaisScreen (menu com 18 itens)
    ├── Analise               ← AnaliseScreen (10389 linhas) → 5 sub-tabs
    │   ├── Performance
    │   ├── Alocação
    │   ├── Composição
    │   ├── Comparativo
    │   └── Renda Passiva     ← DUPLICAÇÃO
    ├── SimuladorFII
    ├── CalendarioRenda       ← novo, acesso só por RendaResumoView
    ├── GeradorRenda          ← novo, acesso só por RendaResumoView
    └── ... (15 outros)
```

**Problema:** 5 tabs + 20 sub-tabs = 25 destinos de primeiro/segundo nível. Usuário se perde.

### Nova navegação proposta (4 tabs, zero sub-tabs profundas)

```
MainTabs (4)
├── Renda                     ← ex-Home. 1 narrativa vertical.
│                               - Hero renda projetada
│                               - Meta mensal
│                               - Alertas acionáveis
│                               - Calendário (próximos 7d)
│                               - Snowball (se aplicável)
│                               - Breakdown 12m expandível
│                               - Link "Calendário completo" → CalendarioRendaScreen
│                               - Link "Relatórios" → tela combinada
├── Carteira                  ← ex-Gestão ativos. Sub-tabs horizontais simples:
│                               [Ativos] [Caixa] [Finanças]
│                               Ativos: heatmap + lista + rebalance inline
│                               Badge de score de renda por ativo
│                               YoC por ativo no AssetDetail
├── Ações                     ← NOVA. O que fazer pra aumentar renda:
│                               - Gerador de Renda (meta → mix)
│                               - Simulador FII
│                               - Sugestão Venda Coberta (covered call)
│                               - Radar de Oportunidades (ex-Opções/Radar)
│                               - Posições de opções ativas/vencidas
│                               - Calc de opções
│                               Matam: tab Opções separada
└── Eu                        ← ex-Mais, enxuto a 8 itens:
                                Profile, Portfolios, Meta,
                                Contas/Corretoras, Alertas, Backup,
                                Assinatura, Sobre
```

---

## 7. DESIGN SYSTEM — débito atual

`src/theme/index.js` tem:
- **Cores hex cruas** sem semântica. Não se sabe qual cor usar para "sucesso", "renda", "dívida".
- **Sizes** mistura tipografia + spacing + alturas de componentes.
- **Zero escala de spacing**. Cada tela usa `padding: 12/14/16/18/22` arbitrariamente.
- Sem tokens para shadows graduais, radii, z-index.

**Fase B criará `src/theme/tokens.js`:**
```
tokens.color.income, .growth, .danger, .info, .surface.1/2/3, .text.primary/secondary/muted
tokens.space.s1..s8  (4, 8, 12, 16, 24, 32, 48, 64)
tokens.type.display/h1/h2/body/caption/mono
tokens.radius.sm/md/lg
tokens.shadow.card/glow(color)
```

Refatoração de `Glass.js` + `Primitives.js` + criação de `Button.js` e `Row.js` como primitivos consistentes.

---

## 8. DATA LAYER — débito atual

3 contexts existentes:
- `AuthContext` — user, session
- `PrivacyContext` — modo "ocultar valores"
- `SubscriptionContext` — tier PRO/Free/VIP + RevenueCat hooks

**Não existe context/store para dados de negócio** (positions, proventos, forecast, score). Cada tela faz sua fetch, cada tela tem seu loading, cada tela tem seu cache.

**Resultado:** triplo-fetch do mesmo dado (Home + Renda + Analise chamam `getDashboard` independente).

**Fase C criará `AppStoreContext`:**
```
state: {
  user, profile, portfolios, selectedPortfolio,
  positions, proventos, opcoes, rf,
  forecast, score, yoc, calendarEvents, alerts,
  loading: {...}, lastFetch: {...}, error: {...}
}
hooks:
  useIncome() → { forecast, score, yoc, calendar, alerts }
  useCarteira() → { positions, rebalance, heatmap }
  useFinancas() → { movimentacoes, orcamentos, recorrentes }
  useRefresh() → refetch tudo
```

Cache 5min por dataset. Invalidação após addOperacao/addProvento/etc.
Telas consomem hooks, nunca chamam services diretamente.

---

## 9. SITE (`docs/`)

Estado atual:
- 3 HTMLs estáticos (index, privacidade, termos)
- GitHub Pages em `premiolab.com.br`
- DNS GoDaddy com A records + CNAME www
- Hero da landing: "Em breve na App Store" (memory)
- Zero JavaScript, zero integração Supabase, zero pagamento

**Gap pro objetivo de vender no site:**
1. Autenticação web (Supabase Auth JS)
2. Checkout/pagamento com webhook pro Supabase
3. Grant de entitlement pós-pagamento (coluna `tier` no `profiles` ou tabela `subscriptions`)
4. Deep link para abrir o app autenticado
5. Dashboard web básico (ou só venda + redirect pro app)

**Decisão crítica** (pra próxima sessão): **stack do site**.

### Opção A — Next.js novo (recomendado)
- Pasta `/web` ou `/site` com app Next.js separado
- Reusa tipos do app RN via pacote compartilhado
- Deploy Vercel (free tier) ou mantém GitHub Pages com static export
- Pros: SEO, perf, auth nativa, Stripe bem suportado, componentes web-first
- Contras: segundo codebase pra manter
- **Tempo:** 3-5 dias trabalho

### Opção B — Expo Web (mesmo código RN no web)
- Adiciona `react-native-web` ao projeto atual
- `expo export:web` gera bundle estático
- Pros: 1 codebase, 1 design system, mudanças sincronizadas
- Contras: SEO ruim, perf pior, landing/marketing fica sem-graça, Stripe precisa adaptar
- **Tempo:** 2-3 dias trabalho, mas depois toda mudança mobile reflete web

### Opção C — Estender `docs/` estático + Stripe Checkout Link
- Adiciona botões de assinatura no `index.html` com link pro Stripe Checkout Hosted
- Webhook Stripe → edge function Supabase atualiza `profiles.tier`
- Mantém tudo estático, zero runtime
- Pros: **mais rápido** (1-2 dias), zero stack nova, hospedagem grátis
- Contras: sem área logada no site, sem dashboard web. Se quiser mostrar dados do usuário na web depois, tem que migrar pra A ou B.
- **Tempo:** 1-2 dias

### Opção D — Hotmart / Kiwify
- Usa plataforma BR pronta (boleto, PIX, cartão, afiliados nativos)
- Integração via webhook pro Supabase
- Pros: zero trabalho de checkout, nota fiscal automática, antifraude, split nativo
- Contras: taxa mais alta (~10%), sem controle de UX, visual deles
- **Tempo:** 0.5-1 dia

**Minha recomendação:** começar com **Opção C (Stripe Checkout + docs estático)** pra validar vendas em 1-2 dias, e se crescer migrar pra **Opção A (Next.js)** pra ter dashboard web próprio.

---

## 10. PAGAMENTO

### Stripe vs Mercado Pago vs Hotmart vs RevenueCat

| Critério | Stripe | Mercado Pago | Hotmart/Kiwify | RevenueCat |
|---|---|---|---|---|
| BR-first (PIX, boleto) | Parcial (PIX novo) | ✅ Total | ✅ Total | ❌ (Apple/Google IAP) |
| Web | ✅ Checkout pronto | ✅ | ✅ | ❌ mobile only |
| Mobile | ✅ via link externo (App Store rule) | ✅ | ✅ | ✅ nativo |
| Taxa | 3.99% + R$0.39 | 4.99% + R$0.60 | ~10% | Apple/Google (15-30%) |
| Webhook pra Supabase | ✅ | ✅ | ✅ | ✅ |
| NF automática | ❌ | ✅ parcial | ✅ | ❌ |

**Restrição Apple/Google:** mobile apps não podem ter link direto pra pagamento web de assinatura digital (regra App Store). Duas saídas:
1. **Só vender no web + app usa a assinatura ativa** (legal, mas fricção: user vai ao site, compra, volta ao app)
2. **RevenueCat no mobile + Stripe no web**, ambos sincronizando `profiles.tier` — melhor UX mas dobra o trabalho

### Recomendação em 3 passos

**Passo 1 (agora):** Stripe Checkout no site (`docs/`) com PIX ativado. Webhook → edge function `stripe-webhook` → `profiles.tier = 'pro'` + `profiles.subscription_expires_at`. Cobrança R$9.90/mês ou R$99.90/ano. Já vende em 48h.

**Passo 2 (médio):** RevenueCat mobile com mesma tabela `profiles.tier`. SubscriptionContext já tem hooks preparados (linhas 15, 73, 151, 165). Só instalar SDK e configurar produtos.

**Passo 3 (longo):** Migrar site pra Next.js com área logada → dashboard web → mesma base de dados.

---

## 11. PLANO DE EXECUÇÃO CONSOLIDADO

Ordem de fases + estimativa + sessões:

| Fase | Tarefa | Tempo estimado | Risco | Bloqueadores |
|---|---|---|---|---|
| **A** | ✅ Este AUDIT.md | ~1h | baixo | — |
| **B** | Design tokens + primitives refactor (`theme/tokens.js`, `Glass/Button/Row/Card` refatorados) | ~3h | baixo | — |
| **C** | `AppStoreContext` com `useIncome`, `useCarteira`, `useFinancas`. Migrar 1 tela pra validar. | ~4h | médio | Decisões sobre cache TTL e invalidação |
| **D** | Nova Info Architecture: 4 tabs + navigation rewrite + matar wrappers Gestão/Renda | ~3h | alto | User tem que validar estrutura de 4 tabs |
| **E** | Reescrever HomeScreen como "Renda" (narrativa única) integrando forecast + score + alerts + covered call + calendar compacto | ~5h | alto | Fases B, C, D prontas |
| **F** | Quebrar OpcoesScreen e AnaliseScreen em views + mover Simulador/Gerador pra "Ações" + fundir Analise+Relatorios | ~6h | alto | Fase E pronta |
| **G** | Onboarding expandido + matar telas órfãs + limpar Mais/Eu | ~2h | médio | Fase F pronta |
| **H** | Site: Stripe Checkout no `docs/` + edge function webhook + coluna expire_at em profiles | ~3h | médio | **Decisão**: Stripe vs Mercado Pago |
| **I** | RevenueCat mobile SDK + sincronização com mesma base | ~4h | médio | Fase H pronta |
| **J** | Deploy edge function `monthly-income-report` + tela de histórico de relatórios | ~1h | baixo | — |

**Total:** ~32 horas de trabalho focado distribuído em **8-10 sessões**.

---

## 12. DECISÕES que preciso de você antes da Fase B

1. **Site stack:** Opção A (Next.js), B (Expo Web), **C (docs estático + Stripe link)** ou D (Hotmart)?
2. **Processador de pagamento:** **Stripe**, Mercado Pago, Hotmart, ou RevenueCat mobile + Stripe web?
3. **Estratégia iOS:** só vender no site (usuário compra web, usa app) ou dual stack (RevenueCat no mobile + Stripe no web)?
4. **Preço:** manter R$9.90/mês ou adicionar anual com desconto (R$99/ano = 17% off)? Adicionar lifetime?
5. **Nova navegação (4 tabs):** aprovada ou quer ajustar (ex.: manter Opções separado)?
6. **Matar features:**
   - AnalisesSalvasScreen (IA desativada) — **aprovar matar**?
   - Sub-tab "Renda Passiva" da Analise (duplicação) — **aprovar matar**?
   - ConfigSelicScreen (fundir com Perfil Investidor) — **aprovar**?
   - RendaResumoView (absorvida pela nova Home/Renda) — **aprovar matar**?

---

## Resumo de 1 parágrafo

O app tem fundação sólida (services bem organizados, componentes reutilizáveis, 3 contextos funcionais, tese clara após a revolução) mas sofre de **árvore de navegação profunda demais** (25 destinos), **3 telas gigantes** (Opcoes 8.8k + Analise 10.4k + Carteira 3.8k linhas) que concentram quase 80% do código, **4 duplicações conceituais** de renda/proventos/rebalance/meta, e **3 services órfãos** criados na revolução mas sem UI. Caminho de cura: criar tokens semânticos (Fase B), criar store de dados central (C), colapsar navegação pra 4 tabs (D), reescrever Home como narrativa única de renda (E), quebrar as 3 telas gigantes em views (F), limpar órfãos (G), e em paralelo colocar Stripe Checkout no site estático pra começar a vender (H). Total: ~8-10 sessões.
