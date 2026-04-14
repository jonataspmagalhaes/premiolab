-- Migration: Adicionar BDR, ADR e REIT como categorias de operacoes
-- Executar no SQL Editor do Supabase Dashboard

-- 1. Remover CHECK constraint antigo
ALTER TABLE operacoes DROP CONSTRAINT IF EXISTS operacoes_categoria_check;

-- 2. Adicionar novo CHECK com bdr, adr e reit
ALTER TABLE operacoes ADD CONSTRAINT operacoes_categoria_check
  CHECK (categoria IN ('acao', 'fii', 'etf', 'stock_int', 'bdr', 'adr', 'reit'));
