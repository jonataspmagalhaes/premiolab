-- Migration: Adicionar coluna alerta_pl na tabela opcoes
-- Valor em R$ total (positivo = alerta de lucro, negativo = alerta de prejuizo). NULL = sem alerta.

ALTER TABLE opcoes ADD COLUMN IF NOT EXISTS alerta_pl NUMERIC DEFAULT NULL;
