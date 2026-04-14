-- Cron: ai-summary diario as 18h BRT (21h UTC) seg-sex
-- Edge Function deployed com --no-verify-jwt, nao precisa de auth header
SELECT cron.unschedule('ai-summary-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ai-summary-daily'
);

SELECT cron.schedule(
  'ai-summary-daily',
  '0 21 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://zephynezarjsxzselozi.supabase.co/functions/v1/ai-summary',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode":"daily"}'::jsonb
  );
  $$
);
