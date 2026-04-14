-- Portfolio backups — snapshot antes de excluir (retencao 30 dias)
CREATE TABLE IF NOT EXISTS portfolio_backups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  portfolio_id UUID NOT NULL,
  portfolio_nome TEXT NOT NULL,
  dados JSONB NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_portfolio_backups_user ON portfolio_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_backups_expires ON portfolio_backups(expires_at);

ALTER TABLE portfolio_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY portfolio_backups_user ON portfolio_backups FOR ALL USING (auth.uid() = user_id);

-- Cleanup automatico: purgar backups expirados (rodar via pg_cron diariamente)
-- SELECT cron.schedule('purge-portfolio-backups', '0 3 * * *', $$DELETE FROM portfolio_backups WHERE expires_at < now()$$);
