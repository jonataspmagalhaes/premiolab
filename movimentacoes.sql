CREATE TABLE IF NOT EXISTS movimentacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  conta TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  descricao TEXT,
  referencia_id UUID,
  referencia_tipo TEXT,
  ticker TEXT,
  conta_destino TEXT,
  saldo_apos NUMERIC,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mov_user ON movimentacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_mov_conta ON movimentacoes(user_id, conta);
CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(user_id, data);
CREATE INDEX IF NOT EXISTS idx_mov_ref ON movimentacoes(referencia_id);

ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mov_own" ON movimentacoes FOR ALL USING (auth.uid() = user_id);
