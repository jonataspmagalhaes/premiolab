-- Migration: Adicionar campo por_corretora JSONB na tabela proventos
-- Armazena posicao historica por corretora na data-com do dividendo
-- Exemplo: {"RICO": 7600, "GENIAL": 6400}
-- Proventos antigos terao NULL (fallback para posicao atual no display)

ALTER TABLE proventos ADD COLUMN IF NOT EXISTS por_corretora JSONB DEFAULT NULL;
