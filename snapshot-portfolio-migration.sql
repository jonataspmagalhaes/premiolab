-- Migration: adicionar portfolio_id na patrimonio_snapshots
-- Permite snapshots separados por portfolio
--
-- Convencao:
--   portfolio_id IS NULL = snapshot global (patrimonio total, retrocompativel)
--   portfolio_id = UUID de portfolio custom = snapshot daquele portfolio
--   portfolio_id = '00000000-0000-0000-0000-000000000001' = snapshot do "Padrao" (ops sem portfolio)

-- Adicionar coluna portfolio_id (nullable = global/total)
ALTER TABLE patrimonio_snapshots ADD COLUMN IF NOT EXISTS portfolio_id UUID DEFAULT NULL;

-- Remover constraint antiga (user_id, data) — agora precisa incluir portfolio_id
ALTER TABLE patrimonio_snapshots DROP CONSTRAINT IF EXISTS patrimonio_snapshots_user_id_data_key;

-- Criar nova constraint UNIQUE incluindo portfolio_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_user_date_portfolio
  ON patrimonio_snapshots (user_id, data, COALESCE(portfolio_id, '00000000-0000-0000-0000-000000000000'));

-- Index para queries filtradas por portfolio
CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio ON patrimonio_snapshots(portfolio_id) WHERE portfolio_id IS NOT NULL;
