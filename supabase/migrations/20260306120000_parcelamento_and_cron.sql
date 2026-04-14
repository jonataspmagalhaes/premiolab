-- Parcelamento de cartao de credito
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS parcela_atual INTEGER DEFAULT NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS parcela_total INTEGER DEFAULT NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS parcela_grupo_id UUID DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_movimentacoes_parcela_grupo ON movimentacoes(parcela_grupo_id) WHERE parcela_grupo_id IS NOT NULL;

-- Cron: check-price-alerts a cada 5 min em horario de mercado
SELECT cron.unschedule('check-price-alerts')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-price-alerts'
);

SELECT cron.schedule(
  'check-price-alerts',
  '*/5 * * * *',
  $cron$
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
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    END IF;
  END
  $body$;
  $cron$
);
