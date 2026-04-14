-- family-portfolio-migration.sql
-- Adds portfolio_id to proventos, saldos_corretora, movimentacoes for multi-portfolio support

ALTER TABLE proventos ADD COLUMN IF NOT EXISTS portfolio_id UUID DEFAULT NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS portfolio_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_proventos_portfolio ON proventos(portfolio_id) WHERE portfolio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimentacoes_portfolio ON movimentacoes(portfolio_id) WHERE portfolio_id IS NOT NULL;
