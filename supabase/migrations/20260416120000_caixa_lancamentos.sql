-- Caixa lancamentos: modelo simplificado de caixa como entradas +/- (aporte/saida)
-- Substitui a tela /app/financeiro (baseada em saldos_corretora) no web.
-- Saldo atual por corretora+moeda = SUM(valor) agrupado.
-- Somente BRL e USD. Caixa conta no patrimonio total mas nao no "investido".
--
-- saldos_corretora (mobile ainda usa) fica mantida. Backfill gera um lancamento
-- inicial por linha existente pra preservar o patrimonio no momento do corte.

-- ====================================================================
-- 1. TABELA
-- ====================================================================
CREATE TABLE IF NOT EXISTS caixa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  corretora TEXT NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL' CHECK (moeda IN ('BRL', 'USD')),
  valor NUMERIC NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caixa_user_data ON caixa(user_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_caixa_user_corretora_moeda ON caixa(user_id, corretora, moeda);

ALTER TABLE caixa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caixa_own_select" ON caixa;
CREATE POLICY "caixa_own_select" ON caixa FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "caixa_own_insert" ON caixa;
CREATE POLICY "caixa_own_insert" ON caixa FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "caixa_own_update" ON caixa;
CREATE POLICY "caixa_own_update" ON caixa FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "caixa_own_delete" ON caixa;
CREATE POLICY "caixa_own_delete" ON caixa FOR DELETE USING (auth.uid() = user_id);

-- ====================================================================
-- 2. BACKFILL a partir de saldos_corretora
-- ====================================================================
-- Cada linha de saldos_corretora com saldo != 0 vira 1 lancamento inicial.
-- Somente BRL/USD (outras moedas sao ignoradas — nao suportadas no novo modelo).
-- Idempotente via NOT EXISTS: so insere se o user ainda nao tem NENHUM caixa.
-- Isso evita duplicar o backfill se a migration rodar de novo.

INSERT INTO caixa (user_id, corretora, moeda, valor, data, descricao)
SELECT
  s.user_id,
  s.corretora,
  COALESCE(NULLIF(s.moeda, ''), 'BRL') AS moeda,
  s.saldo,
  CURRENT_DATE,
  'Saldo inicial importado'
FROM saldos_corretora s
WHERE s.saldo IS NOT NULL
  AND s.saldo <> 0
  AND COALESCE(s.moeda, 'BRL') IN ('BRL', 'USD')
  AND NOT EXISTS (
    SELECT 1 FROM caixa c WHERE c.user_id = s.user_id
  );

-- ====================================================================
-- 3. RPC pra rename/merge de corretora em todas as tabelas
-- ====================================================================
-- Usado pelo CorretorasManagerSheet no web. Propaga um rename atomico
-- em todas as tabelas que tem campo `corretora`. Se o destino ja existe
-- (merge), as linhas da origem sao reapontadas pro mesmo nome.

CREATE OR REPLACE FUNCTION rename_corretora(p_from TEXT, p_to TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR trim(p_from) = '' OR trim(p_to) = '' THEN
    RAISE EXCEPTION 'Invalid corretora name';
  END IF;

  -- Tabelas com campo `corretora` (user-scoped via RLS ja barra cross-user)
  UPDATE operacoes SET corretora = p_to WHERE user_id = v_user AND corretora = p_from;
  UPDATE opcoes SET corretora = p_to WHERE user_id = v_user AND corretora = p_from;
  UPDATE proventos SET corretora = p_to WHERE user_id = v_user AND corretora = p_from;
  UPDATE renda_fixa SET corretora = p_to WHERE user_id = v_user AND corretora = p_from;
  UPDATE fundos SET corretora = p_to WHERE user_id = v_user AND corretora = p_from;
  UPDATE caixa SET corretora = p_to WHERE user_id = v_user AND corretora = p_from;
END;
$$;

GRANT EXECUTE ON FUNCTION rename_corretora(TEXT, TEXT) TO authenticated;
