-- Cron: daily-backup as 2h BRT (5h UTC) todos os dias
-- Edge Function deployed com --no-verify-jwt, nao precisa de auth header
SELECT cron.unschedule('daily-backup')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-backup'
);

SELECT cron.schedule(
  'daily-backup',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zephynezarjsxzselozi.supabase.co/functions/v1/daily-backup',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
