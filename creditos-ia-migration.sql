-- Migration: Créditos IA + Limites de Uso
-- Executar no SQL Editor do Supabase Dashboard

-- 1. Tabela de log de uso de IA
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  tipo TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  custo_estimado NUMERIC,
  resultado_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage(user_id, created_at);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_user ON ai_usage FOR ALL USING (auth.uid() = user_id);

-- 2. Coluna de créditos extras no perfil
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_credits_extra INTEGER DEFAULT 0;

-- 3. RPC para contar uso diário (evita expor lógica no client)
-- Exclui resumos automáticos (summary_daily/summary_weekly) da contagem — não penaliza o usuário
CREATE OR REPLACE FUNCTION get_ai_usage_today(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM ai_usage
  WHERE user_id = p_user_id
    AND created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date::timestamptz
    AND tipo NOT IN ('summary_daily', 'summary_weekly');
$$;

-- 4. RPC para contar uso mensal
CREATE OR REPLACE FUNCTION get_ai_usage_month(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM ai_usage
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::timestamptz
    AND tipo NOT IN ('summary_daily', 'summary_weekly');
$$;

-- 5. RPC para decrementar crédito extra (retorna TRUE se sucesso)
CREATE OR REPLACE FUNCTION decrement_ai_credit(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  SELECT ai_credits_extra INTO current_credits
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF current_credits IS NULL OR current_credits <= 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET ai_credits_extra = ai_credits_extra - 1
  WHERE id = p_user_id;
  RETURN TRUE;
END;
$$;

-- 6. RPC para incrementar crédito extra (refund)
CREATE OR REPLACE FUNCTION increment_ai_credit(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles SET ai_credits_extra = COALESCE(ai_credits_extra, 0) + 1
  WHERE id = p_user_id;
$$;

-- 7. RPC para adicionar créditos em batch (webhook RevenueCat)
CREATE OR REPLACE FUNCTION add_ai_credits(p_user_id UUID, p_amount INTEGER)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles SET ai_credits_extra = COALESCE(ai_credits_extra, 0) + p_amount
  WHERE id = p_user_id;
$$;
