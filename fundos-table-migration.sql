-- Migration: tabela `fundos` para fundos de investimento.
-- Identificados por CNPJ. Cota varia diariamente (preco atual via DM /v1/funds/{cnpj}).

CREATE TABLE IF NOT EXISTS fundos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  cnpj TEXT NOT NULL,
  nome TEXT NOT NULL,
  classe TEXT CHECK (classe IN (
    'renda_fixa', 'multimercado', 'acoes', 'cambial',
    'previdencia', 'imobiliario', 'outros'
  )),
  valor_aplicado NUMERIC NOT NULL,
  qtde_cotas NUMERIC,
  valor_cota_compra NUMERIC,
  data_aplicacao DATE NOT NULL DEFAULT CURRENT_DATE,
  corretora TEXT,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL DEFAULT NULL,
  taxa_admin NUMERIC,
  taxa_perf NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fundos_user ON fundos(user_id);
CREATE INDEX IF NOT EXISTS idx_fundos_cnpj ON fundos(user_id, cnpj);

ALTER TABLE fundos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fundos_own" ON fundos;
CREATE POLICY "fundos_own" ON fundos FOR ALL USING (auth.uid() = user_id);
