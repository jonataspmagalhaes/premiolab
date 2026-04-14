-- Migration: saved_analyses para suportar análises gerais (estrategia, renda, ativo, carteira)
-- Novos campos: type, title, result (JSONB)
-- Relaxar NOT NULL em ticker e calculator_state (análises gerais não têm esses campos)

ALTER TABLE saved_analyses ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'opcao';
ALTER TABLE saved_analyses ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE saved_analyses ADD COLUMN IF NOT EXISTS result JSONB;

-- Relaxar constraints para aceitar análises sem ticker/calculator_state
ALTER TABLE saved_analyses ALTER COLUMN ticker DROP NOT NULL;
ALTER TABLE saved_analyses ALTER COLUMN calculator_state DROP NOT NULL;
