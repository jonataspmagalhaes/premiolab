-- Backup diario de dados do usuario (retencao 30 dias)
CREATE TABLE IF NOT EXISTS user_backups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  backup_date DATE NOT NULL,
  dados JSONB NOT NULL,
  tabelas_count JSONB DEFAULT '{}'::jsonb,
  size_bytes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, backup_date)
);

CREATE INDEX IF NOT EXISTS idx_user_backups_user_date ON user_backups(user_id, backup_date DESC);

ALTER TABLE user_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_backups_user ON user_backups FOR ALL USING (auth.uid() = user_id);

-- Cleanup automatico: purgar backups com mais de 30 dias
SELECT cron.schedule('purge-user-backups', '30 3 * * *', $$DELETE FROM user_backups WHERE backup_date < (CURRENT_DATE - INTERVAL '30 days')$$);

-- Trigger diario para Edge Function daily-backup (roda 2h BRT = 5h UTC, seg-dom)
SELECT cron.schedule(
  'daily-user-backup',
  '0 5 * * *',
  $$SELECT net.http_post(
    url := 'https://zephynezarjsxzselozi.supabase.co/functions/v1/daily-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('trigger', 'cron')
  )$$
);
