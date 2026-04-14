-- ═══════════ MULTI-PORTFOLIO ═══════════

-- Tabela portfolios
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  nome TEXT NOT NULL,
  cor TEXT DEFAULT '#6C5CE7',
  icone TEXT DEFAULT 'briefcase-outline',
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolios_user_nome ON portfolios(user_id, nome);
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY portfolios_user ON portfolios FOR ALL USING (auth.uid() = user_id);

-- Coluna portfolio_id nas operacoes (nullable = portfolio default / sem portfolio)
ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) DEFAULT NULL;
ALTER TABLE opcoes ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) DEFAULT NULL;
ALTER TABLE renda_fixa ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) DEFAULT NULL;
