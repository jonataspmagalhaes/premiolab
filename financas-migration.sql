-- ═══════════════════════════════════════════════════════
-- FINANCAS MIGRATION — Gestão de Gastos Pessoais
-- ═══════════════════════════════════════════════════════

-- 1. Coluna subcategoria em movimentacoes (detalhe fino de categorias pessoais)
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS subcategoria TEXT;

-- 2. Tabela orcamentos (limites mensais por grupo de gastos)
CREATE TABLE IF NOT EXISTS orcamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  grupo TEXT NOT NULL,
  valor_limite NUMERIC NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, grupo)
);
CREATE INDEX IF NOT EXISTS idx_orcamentos_user ON orcamentos(user_id);
ALTER TABLE orcamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orcamentos_own" ON orcamentos;
CREATE POLICY "orcamentos_own" ON orcamentos FOR ALL USING (auth.uid() = user_id);

-- 3. Tabela transacoes_recorrentes (despesas/receitas que se repetem)
CREATE TABLE IF NOT EXISTS transacoes_recorrentes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria TEXT NOT NULL,
  subcategoria TEXT,
  conta TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  descricao TEXT,
  frequencia TEXT NOT NULL CHECK (frequencia IN ('semanal', 'quinzenal', 'mensal', 'anual')),
  dia_vencimento INTEGER DEFAULT 1,
  proximo_vencimento DATE NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recorrentes_user ON transacoes_recorrentes(user_id);
CREATE INDEX IF NOT EXISTS idx_recorrentes_venc ON transacoes_recorrentes(user_id, proximo_vencimento);
ALTER TABLE transacoes_recorrentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recorrentes_own" ON transacoes_recorrentes;
CREATE POLICY "recorrentes_own" ON transacoes_recorrentes FOR ALL USING (auth.uid() = user_id);

-- 4. Coluna moeda em orcamentos (moeda do limite, default BRL)
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS moeda TEXT DEFAULT 'BRL';
