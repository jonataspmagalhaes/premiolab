-- Migration: Adicionar portfolio_id aos cartões de crédito
-- Executar no SQL Editor do Supabase Dashboard

-- 1. Adicionar coluna portfolio_id na tabela cartoes_credito
ALTER TABLE cartoes_credito ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL DEFAULT NULL;

-- 2. Cartões existentes ficam com portfolio_id = NULL (pertence ao portfolio "Padrão")
-- Nenhuma ação necessária — NULL já é o default
