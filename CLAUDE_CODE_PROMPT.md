# PremioLab — Contexto Completo para Claude Code

## O QUE É
App React Native (Expo) de gestão de investimentos focado em opções (venda coberta, CSP).
Tema dark glassmorphism premium. Dados reais via Supabase + brapi.dev API.

## STACK
- React Native + Expo SDK 51 (managed workflow)
- Supabase (auth + PostgreSQL)
- react-native-svg (gráficos custom)
- @react-navigation/bottom-tabs + native-stack
- brapi.dev API (cotações em tempo real, sem API key)
- JavaScript puro (sem TypeScript, sem arrow functions — compatibilidade Hermes)

## REGRA CRÍTICA: SINTAXE
NÃO usar arrow functions. Hermes tem problemas. Sempre usar:
```js
var _s = useState(false); var value = _s[0]; var setValue = _s[1];
function handlePress() { ... }
array.map(function(item) { return ... })
```

## REGRA CRÍTICA: DADOS
ZERO dados fake. Sem Math.random(), sem Math.sin(), sem arrays hardcoded.
Tudo vem do Supabase ou da brapi.dev API. Se não tem dado, mostra empty state.

## ESTRUTURA DO PROJETO
```
C:\app\premiolab\
├── App.js
├── src/
│   ├── theme/index.js          — Design system (C, F, SIZE, PRODUCT_COLORS)
│   ├── contexts/AuthContext.js  — Supabase auth
│   ├── services/
│   │   ├── database.js          — Queries Supabase (getPositions, getOpcoes, getDashboard, etc)
│   │   ├── priceService.js      — brapi.dev API (fetchPrices, fetchPriceHistory, enrichPositionsWithPrices)
│   │   └── supabase.js          — Cliente Supabase
│   ├── components/
│   │   ├── index.js             — Glass, Badge, Pill, SectionLabel, GradientButton, etc
│   │   ├── InteractiveChart.js  — Gráfico touch-draggable + MiniLineChart (sparklines)
│   │   └── States.js            — LoadingScreen, EmptyState
│   ├── screens/
│   │   ├── Home/HomeScreen.js
│   │   ├── Carteira/CarteiraScreen.js    ← RECÉM REFEITO (verificar)
│   │   ├── Opcoes/OpcoesScreen.js
│   │   ├── Analise/AnaliseScreen.js
│   │   ├── Mais/MaisScreen.js
│   │   ├── RendaFixa/RendaFixaScreen.js
│   │   ├── AddOperacao/AddOperacaoScreen.js
│   │   ├── AddOpcao/AddOpcaoScreen.js
│   │   ├── AddRendaFixa/AddRendaFixaScreen.js
│   │   └── Edit*/Edit*Screen.js
│   └── navigation/AppNavigator.js — Tab + Stack navigation
```

## DESIGN SYSTEM (theme/index.js)
```js
C.bg = '#070a11'         // fundo escuro
C.card = 'rgba(255,255,255,0.015)'
C.border = 'rgba(255,255,255,0.04)'
C.text = '#f1f1f4'       // texto principal
C.sub = '#9999aa'        // texto secundário
C.dim = '#555577'        // texto terciário
C.accent = '#6C5CE7'     // roxo principal
C.acoes = '#3B82F6'      // azul
C.fiis = '#10B981'       // verde
C.opcoes = '#8B5CF6'     // roxo claro
C.etfs = '#F59E0B'       // amarelo
C.rf = '#06B6D4'         // cyan
C.green = '#22C55E'      // lucro
C.red = '#EF4444'        // prejuízo

F.display = 'DMSans-Bold'
F.body = 'DMSans-Medium'
F.mono = 'JetBrainsMono-Regular'
```

## TABELAS SUPABASE
- **operacoes**: id, user_id, ticker, tipo(compra/venda), quantidade, preco, corretora, data, categoria(acao/fii/etf)
- **opcoes**: id, user_id, ticker, tipo_opcao(call/put), direcao(lancamento/compra), strike, premio, quantidade, vencimento, corretora, status(ativa/exercida/expirada/recomprada), ticker_opcao, ativo_base
- **renda_fixa**: id, user_id, tipo(cdb/tesouro_ipca/etc), valor_aplicado, taxa, indexador(cdi/ipca/selic/prefixado), vencimento, corretora
- **saldos**: id, user_id, name(nome corretora), saldo
- **dividendos**: id, user_id, ticker, tipo(dividendo/jcp/rendimento), valor, data
- **metas**: id, user_id, meta_mensal

## TELAS E STATUS

### ✅ HomeScreen (PRONTA)
- Patrimônio total (renda var + renda fixa)
- Gráfico interativo touch-draggable com filtros 1M/3M/6M/1A/Tudo
- Barra de alocação (Ações % | RF %)
- Renda do mês (prêmios + dividendos + RF)
- Meta mensal com barra progresso
- Resumo do portfólio
- Alertas
- Maiores altas/baixas (brapi.dev real-time)
- Calendário de vencimentos

### 🔧 CarteiraScreen (RECÉM REFEITA — TESTAR)
Deve ter estas 12 seções:
1. Hero — patrimônio + P&L + stats (ativos, classes, corretoras)
2. Alocação por classe — donut chart SVG + legenda
3. Peso por ativo — barras horizontais % de cada ativo
4. Treemap — blocos visuais proporcionais, cor = performance
5. Rentabilidade por ativo — barras P&L% ordenadas
6. P&L por classe — contribuição R$ de cada classe
7. Comparativo benchmark — Carteira vs CDI (linhas)
8. Ferramenta de rebalanceamento — atual vs meta editável + sugestões
9. Filter pills — Todos/Ações/FIIs/ETFs/RF com contadores
10. Position cards — expandíveis com sparkline + botões (Comprar/Vender/Lançar opção)
11. RF cards — expandíveis com detalhes
12. Saldos por corretora — com ícone

### 🔧 OpcoesScreen (REFEITA — TESTAR)
- Summary bar: prêmio mês, theta/dia, operações
- Sub-tabs: Ativas, Simulador, Histórico
- Ativas: cards com gregas (delta, theta, IV, DTE), status (coberta/descoberta/CSP)
- Simulador BS: inputs + gregas + what-if scenarios
- Histórico: resumo + lista com status badges

### ⬜ AnaliseScreen (NÃO IMPLEMENTADA)
### ⬜ MaisScreen (NÃO IMPLEMENTADA)

## MOCKUP DE REFERÊNCIA
O arquivo `premiolab-app-mockup-final.jsx` na raiz do projeto contém o mockup React
completo com todas as telas. Use como referência visual para fontes, espaçamentos,
cores, layout de cards, e estilo geral.

## PRICE SERVICE (brapi.dev)
```js
// Cotação atual
fetchPrices(['PETR4','VALE3']) → { PETR4: { price, change, changePercent }, ... }

// Histórico 30 dias (pra sparklines)
fetchPriceHistory(['PETR4']) → { PETR4: [34.2, 34.5, 35.1, ...] }

// Enriquece positions com preço real
enrichPositionsWithPrices(positions) → positions com preco_atual, change_day
```

## COMPONENTES COMPARTILHADOS
- **Glass**: card glassmorphism com glow opcional
- **Badge**: badge colorido com dot
- **Pill**: filter pill ativo/inativo
- **SectionLabel**: label de seção uppercase
- **InteractiveChart**: gráfico touch-draggable com tooltip (usa onResponder* pra ScrollView)
- **MiniLineChart**: sparkline SVG pequena pra rows
- **LoadingScreen**: loading state
- **EmptyState**: empty state com ícone + CTA

## O QUE FAZER AGORA
1. Verificar se CarteiraScreen.js está funcionando — abrir o app, ir na aba Carteira
2. Se tiver erros, corrigir (olhar console do Expo)
3. Verificar OpcoesScreen.js
4. Se tudo ok, implementar AnaliseScreen
5. Implementar MaisScreen (configurações, perfil, etc)

## COMO TESTAR
```bash
cd C:\app\premiolab
npx expo start --web
```
Abre http://localhost:8081 no browser.

## COMO FAZER PUSH
```bash
git add .
git commit -m "feat: descrição da mudança"
git push origin main
```

## REPO
https://github.com/jonataspmagalhaes/premiolab
