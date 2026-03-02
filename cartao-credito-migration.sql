-- ═══════════════════════════════════════════════════════
-- CARTÕES DE CRÉDITO + MULTI-MOEDA — Migration SQL
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. Tabela principal de cartões
CREATE TABLE IF NOT EXISTS cartoes_credito (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  ultimos_digitos TEXT NOT NULL CHECK (char_length(ultimos_digitos) = 4),
  bandeira TEXT NOT NULL CHECK (bandeira IN ('visa','mastercard','elo','amex','hipercard','outro')),
  apelido TEXT,
  dia_fechamento INTEGER NOT NULL DEFAULT 1 CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento INTEGER NOT NULL DEFAULT 10 CHECK (dia_vencimento BETWEEN 1 AND 31),
  limite NUMERIC,
  moeda TEXT DEFAULT 'BRL',
  conta_vinculada TEXT,
  tipo_beneficio TEXT CHECK (tipo_beneficio IN ('pontos', 'cashback') OR tipo_beneficio IS NULL),
  programa_nome TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ultimos_digitos, bandeira)
);

CREATE INDEX IF NOT EXISTS idx_cartoes_user ON cartoes_credito(user_id);

ALTER TABLE cartoes_credito ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cartoes_own" ON cartoes_credito;
CREATE POLICY "cartoes_own" ON cartoes_credito FOR ALL USING (auth.uid() = user_id);

-- 2. Tabela de regras de pontos/cashback
CREATE TABLE IF NOT EXISTS regras_pontos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cartao_id UUID REFERENCES cartoes_credito(id) ON DELETE CASCADE NOT NULL,
  moeda TEXT,
  valor_min NUMERIC DEFAULT 0,
  valor_max NUMERIC,
  taxa NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regras_cartao ON regras_pontos(cartao_id);

ALTER TABLE regras_pontos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "regras_own" ON regras_pontos;
CREATE POLICY "regras_own" ON regras_pontos FOR ALL
  USING (EXISTS (SELECT 1 FROM cartoes_credito WHERE id = cartao_id AND user_id = auth.uid()));

-- 3. Novas colunas em movimentacoes
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS cartao_id UUID REFERENCES cartoes_credito(id);
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS moeda_original TEXT;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS valor_original NUMERIC;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS taxa_cambio_mov NUMERIC;

CREATE INDEX IF NOT EXISTS idx_movimentacoes_cartao ON movimentacoes(cartao_id);

-- 4. Atualizar CHECK de categoria para incluir pagamento_fatura
ALTER TABLE movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_categoria_check;
ALTER TABLE movimentacoes ADD CONSTRAINT movimentacoes_categoria_check
  CHECK (categoria IN (
    'deposito', 'retirada', 'transferencia',
    'compra_ativo', 'venda_ativo',
    'premio_opcao', 'recompra_opcao', 'exercicio_opcao',
    'dividendo', 'jcp', 'rendimento_fii', 'rendimento_rf',
    'ajuste_manual', 'salario', 'despesa_fixa', 'despesa_variavel', 'outro',
    'pagamento_fatura'
  ));
