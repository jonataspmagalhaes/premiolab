-- Migration: adiciona indexador em renda_fixa
-- Permite distinguir CDB Pré / 100% CDI / IPCA+ etc.
-- Backward-compat: NULL = comportamento antigo (taxa direta = prefixado).

ALTER TABLE renda_fixa
  ADD COLUMN IF NOT EXISTS indexador TEXT;

COMMENT ON COLUMN renda_fixa.indexador IS
  'pre | cdi | ipca | selic. NULL = pre (compat com registros antigos)';
