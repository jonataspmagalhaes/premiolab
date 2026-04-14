-- Cron: test-health as 6h BRT (9h UTC) todos os dias
-- Edge Function deployed com --no-verify-jwt
SELECT cron.unschedule('test-health-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'test-health-daily'
);

SELECT cron.schedule(
  'test-health-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zephynezarjsxzselozi.supabase.co/functions/v1/test-health',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
