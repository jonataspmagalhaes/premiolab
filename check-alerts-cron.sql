-- CHECK PRICE ALERTS — CRON JOB (cada 5 min, horario de mercado)
-- Edge Function deployed com --no-verify-jwt, nao precisa de auth header

SELECT cron.unschedule('check-price-alerts')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-price-alerts'
);

SELECT cron.schedule(
  'check-price-alerts',
  '*/5 * * * *',
  $$
  DO $body$
  DECLARE
    _hora_brt INTEGER;
    _dow INTEGER;
  BEGIN
    _hora_brt := EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Sao_Paulo');
    _dow := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo');
    IF _dow BETWEEN 1 AND 5 AND _hora_brt BETWEEN 10 AND 17 THEN
      PERFORM net.http_post(
        url := 'https://zephynezarjsxzselozi.supabase.co/functions/v1/check-price-alerts',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    END IF;
  END
  $body$;
  $$
);

SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'check-price-alerts';
