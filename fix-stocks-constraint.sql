ALTER TABLE operacoes DROP CONSTRAINT IF EXISTS operacoes_categoria_check;

ALTER TABLE operacoes ADD CONSTRAINT operacoes_categoria_check CHECK (categoria IN ('acao', 'fii', 'etf', 'stock_int'));

ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS mercado TEXT DEFAULT 'BR';

ALTER TABLE operacoes DROP CONSTRAINT IF EXISTS operacoes_mercado_check;

ALTER TABLE operacoes ADD CONSTRAINT operacoes_mercado_check CHECK (mercado IN ('BR', 'INT'));

ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS taxa_cambio NUMERIC;

UPDATE operacoes SET mercado = 'BR' WHERE mercado IS NULL;
