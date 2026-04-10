-- Fase J reconstrucao: agendamento do relatorio mensal de renda.
-- Roda todo dia 5 do mes as 13h UTC (10h BRT).
-- Edge function correspondente: monthly-income-report
-- (criada na Fase 10 da revolucao renda).

SELECT cron.schedule(
  'monthly-income-report-day-5',
  '0 13 5 * *',
  $$
  SELECT net.http_post(
    url := 'https://zephynezarjsxzselozi.supabase.co/functions/v1/monthly-income-report',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  )
  $$
);
