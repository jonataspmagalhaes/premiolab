-- Migration: Garantias configuráveis por corretora
-- Permite marcar ativos como garantia principal para PUTs por corretora
-- Formato JSONB: { "Clear": ["PETR4", "LFTB11"], "XP": ["BBAS3"] }

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS garantias_config JSONB DEFAULT '{}'::jsonb;
