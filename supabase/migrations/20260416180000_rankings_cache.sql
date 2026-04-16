-- Rankings cache — dados fundamentalistas de mercado atualizados 1x/dia
-- Tabela publica (sem RLS) — dados de mercado, nao dados de usuario

CREATE TABLE IF NOT EXISTS rankings_cache (
  type TEXT PRIMARY KEY,           -- acoes, fiis, stocks, reits, fundos, tesouro
  assets JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array de RankedAsset
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sem RLS — qualquer usuario autenticado pode ler
ALTER TABLE rankings_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rankings_cache_read" ON rankings_cache FOR SELECT USING (true);

-- Indice nao necessario (6 rows max), mas garantir performance
COMMENT ON TABLE rankings_cache IS 'Cache de rankings fundamentalistas por tipo de ativo. Atualizado diariamente pela Edge Function update-rankings.';
