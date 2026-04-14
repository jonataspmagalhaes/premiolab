-- AI Summaries — resumo diario/semanal automatico
CREATE TABLE IF NOT EXISTS ai_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  tipo TEXT NOT NULL DEFAULT 'daily',
  resumo TEXT,
  acoes_urgentes TEXT,
  dica_do_dia TEXT,
  teaser TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  custo_estimado NUMERIC,
  lido BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_user ON ai_summaries(user_id, created_at DESC);

ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_summaries_user ON ai_summaries
  FOR ALL USING (auth.uid() = user_id);

-- User preference column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_summary_frequency TEXT DEFAULT 'off';

-- Cron job: daily at 21:00 UTC (18:00 BRT) weekdays
SELECT cron.unschedule('ai-summary-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ai-summary-daily'
);

SELECT cron.schedule(
  'ai-summary-daily',
  '0 21 * * 1-5',
  $cron$
  DO $body$
  DECLARE
    _dow INTEGER;
  BEGIN
    _dow := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo');
    IF _dow = 5 THEN
      PERFORM net.http_post(
        url := 'https://zephynezarjsxzselozi.supabase.co/functions/v1/ai-summary',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{"mode":"both"}'::jsonb
      );
    ELSE
      PERFORM net.http_post(
        url := 'https://zephynezarjsxzselozi.supabase.co/functions/v1/ai-summary',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{"mode":"daily"}'::jsonb
      );
    END IF;
  END
  $body$;
  $cron$
);
