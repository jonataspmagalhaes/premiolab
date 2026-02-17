-- ═══════════════════════════════════════════════════
-- PREMIOLAB v5.0.0 — SUPABASE MIGRATION
-- Execute no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  nome TEXT DEFAULT '',
  meta_mensal NUMERIC DEFAULT 6000,
  selic NUMERIC DEFAULT 13.25,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id);

-- 2. OPERAÇÕES
CREATE TABLE IF NOT EXISTS operacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  ticker TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('compra', 'venda')),
  categoria TEXT NOT NULL DEFAULT 'acao' CHECK (categoria IN ('acao', 'fii', 'etf')),
  quantidade NUMERIC NOT NULL,
  preco NUMERIC NOT NULL,
  custo_corretagem NUMERIC DEFAULT 0,
  custo_emolumentos NUMERIC DEFAULT 0,
  custo_impostos NUMERIC DEFAULT 0,
  corretora TEXT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_operacoes_user ON operacoes(user_id);
CREATE INDEX idx_operacoes_ticker ON operacoes(user_id, ticker);
ALTER TABLE operacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operacoes_own" ON operacoes FOR ALL USING (auth.uid() = user_id);

-- 3. PROVENTOS
CREATE TABLE IF NOT EXISTS proventos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  ticker TEXT NOT NULL,
  tipo_provento TEXT NOT NULL CHECK (tipo_provento IN ('dividendo', 'jcp', 'rendimento', 'juros_rf', 'amortizacao', 'bonificacao')),
  valor_por_cota NUMERIC,
  quantidade NUMERIC,
  valor_total NUMERIC NOT NULL,
  data_com DATE,
  data_pagamento DATE NOT NULL,
  corretora TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_proventos_user ON proventos(user_id);
ALTER TABLE proventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proventos_own" ON proventos FOR ALL USING (auth.uid() = user_id);

-- 4. OPÇÕES
CREATE TABLE IF NOT EXISTS opcoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  ativo_base TEXT NOT NULL,
  ticker_opcao TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('call', 'put')),
  direcao TEXT NOT NULL CHECK (direcao IN ('lancamento', 'compra', 'venda')),
  strike NUMERIC NOT NULL,
  premio NUMERIC NOT NULL,
  quantidade INTEGER NOT NULL,
  vencimento DATE NOT NULL,
  corretora TEXT,
  status TEXT DEFAULT 'ativa' CHECK (status IN ('ativa', 'exercida', 'expirada', 'fechada')),
  custo_corretagem NUMERIC DEFAULT 0,
  custo_emolumentos NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_opcoes_user ON opcoes(user_id);
ALTER TABLE opcoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opcoes_own" ON opcoes FOR ALL USING (auth.uid() = user_id);

-- 5. RENDA FIXA
CREATE TABLE IF NOT EXISTS renda_fixa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('cdb', 'lci_lca', 'tesouro_ipca', 'tesouro_selic', 'tesouro_pre', 'debenture')),
  emissor TEXT,
  taxa NUMERIC,
  valor_aplicado NUMERIC NOT NULL,
  vencimento DATE,
  corretora TEXT,
  custodia TEXT DEFAULT 'corretora' CHECK (custodia IN ('corretora', 'emissor')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rf_user ON renda_fixa(user_id);
ALTER TABLE renda_fixa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renda_fixa_own" ON renda_fixa FOR ALL USING (auth.uid() = user_id);

-- 6. USER CORRETORAS
CREATE TABLE IF NOT EXISTS user_corretoras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, name)
);
CREATE INDEX idx_user_corretoras ON user_corretoras(user_id);
ALTER TABLE user_corretoras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_corretoras_own" ON user_corretoras FOR ALL USING (auth.uid() = user_id);

-- 7. SALDOS CORRETORA
CREATE TABLE IF NOT EXISTS saldos_corretora (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  tipo TEXT DEFAULT 'corretora' CHECK (tipo IN ('corretora', 'banco')),
  saldo NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);
CREATE INDEX idx_saldos_user ON saldos_corretora(user_id);
ALTER TABLE saldos_corretora ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saldos_own" ON saldos_corretora FOR ALL USING (auth.uid() = user_id);

-- 8. ALERTAS CONFIG
CREATE TABLE IF NOT EXISTS alertas_config (
  user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
  descobertas BOOLEAN DEFAULT TRUE,
  margem BOOLEAN DEFAULT TRUE,
  margem_threshold TEXT DEFAULT '80',
  vencimento BOOLEAN DEFAULT TRUE,
  vencimento_threshold TEXT DEFAULT '7',
  proventos BOOLEAN DEFAULT TRUE,
  meta BOOLEAN DEFAULT TRUE,
  variacao BOOLEAN DEFAULT FALSE,
  variacao_threshold TEXT DEFAULT '5',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE alertas_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alertas_config_own" ON alertas_config FOR ALL USING (auth.uid() = user_id);

-- 9. INSTITUIÇÕES
CREATE TABLE IF NOT EXISTS instituicoes (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  tipo TEXT,
  segmento TEXT
);
INSERT INTO instituicoes (nome, tipo) VALUES
  ('Clear Corretora', 'corretora'), ('XP Investimentos', 'corretora'),
  ('Rico Investimentos', 'corretora'), ('Modal DTVM', 'corretora'),
  ('Genial Investimentos', 'corretora'), ('Banco Inter', 'banco'),
  ('Nu Invest', 'banco'), ('Itaú Corretora', 'corretora'),
  ('Bradesco Corretora', 'corretora'), ('Banco do Brasil', 'banco'),
  ('BTG Pactual', 'corretora'), ('Santander', 'banco'),
  ('C6 Bank', 'banco'), ('Safra', 'banco')
ON CONFLICT DO NOTHING;
ALTER TABLE instituicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instituicoes_read" ON instituicoes FOR SELECT USING (true);

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  INSERT INTO alertas_config (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ═══════════════════════════════════════════════════
-- MIGRATION FROM v4 TO v5 (run if upgrading)
-- ═══════════════════════════════════════════════════

-- Operações: rename tipo_ativo → categoria, split custos into 3 columns
-- ALTER TABLE operacoes RENAME COLUMN tipo_ativo TO categoria;
-- ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS custo_corretagem NUMERIC DEFAULT 0;
-- ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS custo_emolumentos NUMERIC DEFAULT 0;
-- ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS custo_impostos NUMERIC DEFAULT 0;
-- UPDATE operacoes SET custo_corretagem = custos WHERE custos > 0;
-- ALTER TABLE operacoes DROP COLUMN IF EXISTS custos;
-- ALTER TABLE operacoes DROP COLUMN IF EXISTS observacao;
-- UPDATE operacoes SET categoria = 'acao' WHERE categoria = 'AÇ';
-- UPDATE operacoes SET categoria = 'fii' WHERE categoria = 'FII';
-- UPDATE operacoes SET categoria = 'etf' WHERE categoria = 'ETF';

-- Opções: rename columns to match code
-- ALTER TABLE opcoes RENAME COLUMN ticker_subjacente TO ativo_base;
-- ALTER TABLE opcoes RENAME COLUMN tipo_opcao TO tipo;
-- ALTER TABLE opcoes RENAME COLUMN premio_unitario TO premio;
-- ALTER TABLE opcoes ADD COLUMN IF NOT EXISTS ticker_opcao TEXT;
-- ALTER TABLE opcoes ADD COLUMN IF NOT EXISTS custo_corretagem NUMERIC DEFAULT 0;
-- ALTER TABLE opcoes ADD COLUMN IF NOT EXISTS custo_emolumentos NUMERIC DEFAULT 0;
-- ALTER TABLE opcoes DROP COLUMN IF EXISTS premio_total;
-- ALTER TABLE opcoes DROP COLUMN IF EXISTS coberta;
-- ALTER TABLE opcoes DROP COLUMN IF EXISTS custos;
-- UPDATE opcoes SET tipo = lower(tipo);

-- ═══════════════════════════════════════════════════
-- MIGRATION: Opcoes - status expirou_po + premio_fechamento
-- ═══════════════════════════════════════════════════
ALTER TABLE opcoes DROP CONSTRAINT IF EXISTS opcoes_status_check;
ALTER TABLE opcoes ADD CONSTRAINT opcoes_status_check
  CHECK (status IN ('ativa', 'exercida', 'expirada', 'fechada', 'expirou_po'));
ALTER TABLE opcoes ADD COLUMN IF NOT EXISTS premio_fechamento NUMERIC DEFAULT NULL;

ALTER TABLE opcoes DROP CONSTRAINT IF EXISTS opcoes_direcao_check;
ALTER TABLE opcoes ADD CONSTRAINT opcoes_direcao_check
  CHECK (direcao IN ('lancamento', 'compra', 'venda'));

-- MIGRATION: data_abertura (data em que a opcao foi aberta/vendida)
ALTER TABLE opcoes ADD COLUMN IF NOT EXISTS data_abertura DATE DEFAULT NULL;

-- MIGRATION: exercicio_auto em alertas_config
ALTER TABLE alertas_config ADD COLUMN IF NOT EXISTS exercicio_auto BOOLEAN DEFAULT FALSE;

-- ═══════════════════════════════════════════════════
-- 10. INDICADORES TÉCNICOS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS indicators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  ticker TEXT NOT NULL,
  data_calculo DATE NOT NULL DEFAULT CURRENT_DATE,
  hv_20 NUMERIC,
  hv_60 NUMERIC,
  sma_20 NUMERIC,
  sma_50 NUMERIC,
  ema_9 NUMERIC,
  ema_21 NUMERIC,
  rsi_14 NUMERIC,
  beta NUMERIC,
  atr_14 NUMERIC,
  max_drawdown NUMERIC,
  bb_upper NUMERIC,
  bb_lower NUMERIC,
  bb_width NUMERIC,
  iv_media NUMERIC,
  iv_rank NUMERIC,
  preco_fechamento NUMERIC,
  volume_medio_20 NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);
CREATE INDEX IF NOT EXISTS idx_indicators_user ON indicators(user_id);
CREATE INDEX IF NOT EXISTS idx_indicators_ticker ON indicators(user_id, ticker);
ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "indicators_own" ON indicators FOR ALL USING (auth.uid() = user_id);
