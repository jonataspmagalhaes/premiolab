-- Migration: sync-proventos-cron
-- Cria unique index na tabela proventos para suportar UPSERT idempotente
-- Chave: (user_id, ticker, corretora, data_com, tipo, portfolio_id) NULLS NOT DISTINCT
-- Necessaria para o cron job sync-proventos-cron

-- 1. Drop old partial index if exists
DROP INDEX IF EXISTS idx_proventos_upsert_key;

-- 2. Backfill data_com para proventos que nao tem (usar data_pagamento como fallback)
UPDATE proventos
SET data_com = data_pagamento
WHERE data_com IS NULL AND data_pagamento IS NOT NULL;

-- 3. Remover duplicatas antes de criar unique index (manter mais recente por id)
DELETE FROM proventos
WHERE id IN (
  SELECT p1.id
  FROM proventos p1
  INNER JOIN proventos p2 ON
    p1.user_id = p2.user_id
    AND p1.ticker = p2.ticker
    AND p1.tipo = p2.tipo
    AND p1.data_com IS NOT DISTINCT FROM p2.data_com
    AND p1.corretora IS NOT DISTINCT FROM p2.corretora
    AND p1.portfolio_id IS NOT DISTINCT FROM p2.portfolio_id
    AND p1.id < p2.id
);

-- 4. Criar unique index FULL (nao parcial) com NULLS NOT DISTINCT
-- Permite UPSERT via Supabase client sem precisar de RPC
CREATE UNIQUE INDEX idx_proventos_upsert_key
  ON proventos (user_id, ticker, corretora, data_com, tipo, portfolio_id)
  NULLS NOT DISTINCT;

-- 5. Cron job: executar diariamente as 7h BRT (10h UTC)
-- Requer pg_cron + pg_net habilitados no projeto Supabase
SELECT cron.schedule(
  'sync-proventos-daily',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zephynezarjsxzselozi.supabase.co/functions/v1/sync-proventos-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
