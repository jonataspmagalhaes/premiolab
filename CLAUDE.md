# PREMIOLAB - Documentacao do Projeto

## Sobre o App

PremioLab e um app de investimentos focado no mercado brasileiro, construido com React Native (Expo) + Supabase. O publico-alvo sao investidores que operam opcoes (venda coberta, CSP, wheel strategy) e querem acompanhar premios, gregas, carteira de acoes/FIIs/ETFs e renda fixa em um unico lugar.

## Stack Tecnica

- **Frontend**: React Native 0.81 + Expo SDK 54
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Cotacoes**: brapi.dev API (token: tEU8wyBixv8hCi7J3NCjsi)
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
  components/      Componentes reutilizaveis (Glass, Badge, Pill, Charts, States)
  config/          Supabase client
  contexts/        AuthContext (login, session, onboarding)
  navigation/      AppNavigator (tabs + stacks)
  screens/
    analise/       Dashboard analitico
    auth/          Login + Onboarding
    carteira/      Portfolio (Carteira, AddOperacao, EditOperacao, AssetDetail)
    home/          Dashboard principal
    mais/          Menu + Configs (Meta, Corretoras, Alertas, Selic, Guia, Sobre, Historico)
    opcoes/        Opcoes (lista, add, edit, simulador BS)
    proventos/     Proventos (lista, add, edit)
    rf/            Renda Fixa (lista, add, edit)
  services/
    database.js    Todas as funcoes CRUD do Supabase
    priceService.js Cotacoes em tempo real + cache
  theme/
    index.js       Cores (C), Fontes (F), Tamanhos (SIZE), Sombras (SHADOW)
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
| `profiles` | id, nome, meta_mensal, selic |
| `operacoes` | ticker, tipo(compra/venda), categoria(acao/fii/etf), quantidade, preco, custos, corretora, data |
| `opcoes` | ativo_base, ticker_opcao, tipo(call/put), direcao(venda/compra/lancamento), strike, premio, quantidade, vencimento, data_abertura, status, corretora, premio_fechamento |
| `proventos` | ticker, tipo_provento, valor_por_cota, quantidade, valor_total, data_pagamento |
| `renda_fixa` | tipo(cdb/lci_lca/tesouro_*), emissor, taxa, indexador, valor_aplicado, vencimento |
| `saldos_corretora` | name, saldo, tipo(corretora/banco) |
| `user_corretoras` | name, count |
| `alertas_config` | flags de alertas + thresholds |

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
- **Dashboard**: getDashboard (endpoint agregado: patrimonio, renda, eventos, historico)

### priceService.js - Funcoes exportadas
- `fetchPrices(tickers)` - Cotacoes atuais (cache 60s)
- `fetchPriceHistory(tickers)` - Historico 1 mes (cache 5min)
- `enrichPositionsWithPrices(positions)` - Adiciona preco_atual, variacao, P&L
- `clearPriceCache()` - Limpa cache manualmente
- `getLastPriceUpdate()` - Timestamp da ultima atualizacao

## Componentes

| Componente | Arquivo | Uso |
|------------|---------|-----|
| `Glass` | Glass.js | Card com glassmorphism + glow opcional |
| `Badge` | Primitives.js | Label pequeno colorido (fonte 9, padding 8x3) |
| `Pill` | Primitives.js | Botao selecionavel com estado ativo |
| `SectionLabel` | Primitives.js | Titulo de secao |
| `Field` | Primitives.js | Input com label, prefixo/sufixo |
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
- **Historico**: resumo total recebido, expiradas PO, exercidas + lista detalhada
- **Data abertura**: campo data_abertura nas opcoes, premios calculados com D+1 (liquidacao)
- DTE badge no header de cada card

### Home (HomeScreen)
- Card de patrimonio com variacao
- Card de renda mensal (dividendos + premios + RF)
- Alertas inteligentes
- Timeline de eventos (vencimentos opcoes, vencimentos RF)
- Grafico de historico patrimonial

### Renda Fixa (RendaFixaScreen)
- Suporte a CDB, LCI/LCA, Tesouro Selic/IPCA/Pre, Debenture
- Indexadores: prefixado, CDI, IPCA, Selic
- Contagem regressiva de vencimento com cores de urgencia

### Proventos (ProventosScreen)
- Tipos: dividendo, JCP, rendimento, juros RF, amortizacao, bonificacao
- Filtros por tipo
- Valor por cota + total

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

- [ ] Rolagem de opcoes (fechar atual + abrir nova com um clique)
- [ ] Grafico de P&L de opcoes por mes (premios recebidos historico)
- [ ] Notificacoes push para vencimentos proximos
- [ ] Importacao de operacoes via CSV/Excel
- [ ] Calculo de IR (darf mensal, swing trade, day trade)
- [ ] Integracao com CEI/B3 para importacao automatica
- [ ] Dark/Light mode toggle
- [ ] Backup/restore de dados
