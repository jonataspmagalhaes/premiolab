-- Migration: Alertas de Opções + Push Tokens
-- Executar no SQL Editor do Supabase Dashboard

-- =============================================================
-- Tabela alertas_opcoes — alertas de preço/IV/volume para opções
-- =============================================================
CREATE TABLE IF NOT EXISTS alertas_opcoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  ticker_opcao TEXT NOT NULL,
  ativo_base TEXT NOT NULL,
  tipo_alerta TEXT NOT NULL CHECK (tipo_alerta IN ('preco','divergencia','iv','volume')),
  valor_alvo NUMERIC NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('acima','abaixo')),
  tipo_opcao TEXT CHECK (tipo_opcao IN ('call','put')),
  strike NUMERIC,
  vencimento DATE,
  ativo BOOLEAN DEFAULT TRUE,
  disparado BOOLEAN DEFAULT FALSE,
  disparado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertas_opcoes_user ON alertas_opcoes(user_id);

ALTER TABLE alertas_opcoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY alertas_opcoes_user ON alertas_opcoes
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================
-- Tabela push_tokens — tokens de push notification por usuário
-- =============================================================
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  token TEXT NOT NULL,
  platform TEXT DEFAULT 'ios',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_tokens_user ON push_tokens
  FOR ALL USING (auth.uid() = user_id);
