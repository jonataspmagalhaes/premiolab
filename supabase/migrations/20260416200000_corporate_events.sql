-- Suporte a eventos corporativos: desdobramentos e bonificacoes
-- tipo operacao: 'desdobramento' e 'bonificacao' (alem de compra/venda)
-- ratio: formato 'X:Y' (ex: '2:1' = split 2 pra 1, '10:1' = bonus 10%)

-- Campo ratio na tabela operacoes
ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS ratio TEXT;

-- Campo fonte para distinguir manual vs auto-detectado
ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS fonte TEXT DEFAULT 'manual';

COMMENT ON COLUMN operacoes.ratio IS 'Ratio do evento corporativo no formato X:Y. Ex: 2:1 (split), 10:1 (bonus 10%)';
COMMENT ON COLUMN operacoes.fonte IS 'Origem: manual ou auto (detectado por cron)';
