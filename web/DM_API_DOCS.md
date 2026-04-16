# DadosDeMercado API - Documentacao Endpoints

Base URL: `https://api.dadosdemercado.com.br/v1`
Auth: `Authorization: Bearer {token}`

---

## Empresas

### Indicadores de Mercado (Market Ratios)
```
GET /companies/:cvm_code/market_ratios?statement_type=con
```
Params: `statement_type` (con|ind), `period_init`, `period_end`
Response:
- `cvm_code`, `ticker`, `reference_date`, `shares`, `price`
- `earnings_per_share` (LPA), `equity_per_share` (VPA)
- `ebit_per_share`, `assets_per_share`, `net_sales_per_share`
- **`price_earnings`** (P/L), **`price_to_book`** (P/VP)
- `price_to_sales` (P/S), `price_to_cash_flow` (P/CF)
- `price_to_ebit`, `price_to_assets`

### Indicadores Financeiros (Financial Ratios)
```
GET /companies/:cvm_code/ratios?statement_type=con&period_type=ttm
```
Params: `statement_type` (con|ind|con*|ind*), `period_type` (year|ttm)
Response:
- **Margens**: `gross_margin`, `net_margin`, `ebit_margin`, `operating_margin`
- **Rentabilidade**: `return_on_equity` (ROE), `return_on_assets` (ROA), `return_on_invested_capital` (ROIC)
- **Liquidez**: `current_liquidity`, `quick_liquidity`, `cash_liquidity`
- **Divida**: `gross_debt`, `net_debt`, `total_debt`
- **EBITDA**: `ebitda`, `ebitda_margin`, `ebitda_adjusted`, `ebitda_margin_adjusted`
- `asset_turnover`, `working_capital`

### Dividendos
```
GET /companies/:ticker/dividends?date_from=YYYY-MM-DD
```

### Lista de Empresas
```
GET /companies
```

### Balancos
```
GET /companies/:cvm_code/balances?statement_type=con
```

### Resultados
```
GET /companies/:cvm_code/results?statement_type=con
```

### Fluxos de Caixa
```
GET /companies/:cvm_code/cash_flows?statement_type=con
```

### Numero de Acoes
```
GET /companies/:cvm_code/shares
```

---

## Bolsa

### Rendimento de Dividendos (DY historico)
```
GET /tickers/:ticker/dy
```
Response: `[{ year, amount, close, dy }]`

### Cotacoes
```
GET /tickers/:ticker/quotes?period_init=YYYY-MM-DD&period_end=YYYY-MM-DD
```

### Lista de Ativos
```
GET /tickers?ticker_type=stock|reit|etf
```

### Indices de Mercado
```
GET /indexes
```

### Detalhes/Componentes de um Indice
```
GET /indexes/IBOV
```

### Indicadores de Risco
```
GET /tickers/:ticker/risk_measures/IBOV?period_init&period_end
```

### Investidores Estrangeiros
```
GET /investors
```

---

## FIIs

### Lista de FIIs
```
GET /reits
```
Response: `name, about, trade_name, cnpj, founding_date, website, is_b3_listed, b3_issuer_code, b3_sector, b3_subsector, b3_segment`

### Dividendos FII
```
GET /reits/:ticker/dividends
```

---

## Fundos de Investimento

### Lista de Fundos
```
GET /funds
```
Response: `name, cnpj, net_worth, shareholders, management_fee, performance_fee, type, slug, fund_class`

### Historico de Cotacoes
```
GET /funds/:slug/history
```

### Ativos do Fundo
```
GET /funds/:slug/assets
```

---

## Titulos Publicos

### Lista
```
GET /bonds
```

### Historico de Precos
```
GET /bonds/:slug/history
```

### Tesouro Direto
```
GET /treasury
```

### Precos Tesouro Direto
```
GET /treasury/:slug/prices
```

---

## Macro

### Indices Economicos
```
GET /macro/{index}
```
Indices: igp-m, ipca, selic, cdi, dolar, etc.

### Expectativas
```
GET /macro/{index}/estimates?target_period=YYYY
```

### Boletim Focus
```
GET /macro/focus/selic
```

### Curvas de Juros
```
GET /macro/yield_curves/{curve}
```
Curves: ettj_ipca, ettj_pre

---

## Moedas

### Lista de Moedas
```
GET /currencies
```

### Conversao (por data)
```
GET /currencies/USD/BRL/2023-01-02
```

---

## Noticias

### Ultimas Noticias
```
GET /news?ticker=VALE3&limit=20
```

---

## Notas

- Rate limit: 1 req/s
- `cvm_code` pode ser obtido de `/companies` (campo `cvm_code`)
- Market ratios e financial ratios usam `cvm_code`, NAO ticker
- DY historico usa ticker direto: `/tickers/VALE3/dy`
- FIIs sao `/reits`, nao `/fiis`
