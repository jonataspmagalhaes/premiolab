-- ═══════════════════════════════════════════════════
-- PREMIOLAB v4.0.0 — SUPABASE MIGRATION
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
  tipo_ativo TEXT NOT NULL CHECK (tipo_ativo IN ('AÇ', 'FII', 'ETF')),
  quantidade NUMERIC NOT NULL,
  preco NUMERIC NOT NULL,
  custos NUMERIC DEFAULT 0,
  corretora TEXT,
  observacao TEXT,
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
  ticker_subjacente TEXT NOT NULL,
  tipo_opcao TEXT NOT NULL CHECK (tipo_opcao IN ('CALL', 'PUT')),
  direcao TEXT NOT NULL CHECK (direcao IN ('lancamento', 'compra')),
  strike NUMERIC NOT NULL,
  premio_unitario NUMERIC NOT NULL,
  quantidade INTEGER NOT NULL,
  premio_total NUMERIC GENERATED ALWAYS AS (premio_unitario * quantidade) STORED,
  vencimento DATE NOT NULL,
  corretora TEXT,
  coberta BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'ativa' CHECK (status IN ('ativa', 'exercida', 'expirada', 'fechada')),
  custos NUMERIC DEFAULT 0,
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
