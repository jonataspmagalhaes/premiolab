CREATE TABLE IF NOT EXISTS saved_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  ticker TEXT NOT NULL,
  strike NUMERIC,
  spot NUMERIC,
  iv NUMERIC,
  dte INTEGER,
  option_style TEXT DEFAULT 'europeia',
  skew TEXT DEFAULT 'auto',
  objetivo TEXT DEFAULT 'renda',
  capital NUMERIC,
  calculator_state JSONB NOT NULL,
  ai_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_analyses_user ON saved_analyses(user_id);

ALTER TABLE saved_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_analyses_own" ON saved_analyses FOR ALL USING (auth.uid() = user_id);
