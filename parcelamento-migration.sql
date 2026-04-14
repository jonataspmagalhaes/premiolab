-- Migration: Parcelamento (compras parceladas no cartão de crédito)
-- Executar no SQL Editor do Supabase Dashboard

-- Colunas de parcelamento na tabela movimentacoes
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS parcela_atual INTEGER DEFAULT NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS parcela_total INTEGER DEFAULT NULL;
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS parcela_grupo_id UUID DEFAULT NULL;

-- Index para agrupar parcelas
CREATE INDEX IF NOT EXISTS idx_movimentacoes_parcela_grupo ON movimentacoes(parcela_grupo_id) WHERE parcela_grupo_id IS NOT NULL;
