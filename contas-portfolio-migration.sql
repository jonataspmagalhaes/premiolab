-- Migration: associar contas (saldos_corretora) a portfolios
-- + toggle por portfolio para ativar/desativar operacoes automaticas nas contas

-- 1. Adicionar portfolio_id nas contas
ALTER TABLE saldos_corretora ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL DEFAULT NULL;

-- 2. Toggle por portfolio: quando FALSE, operacoes (compra/venda) NAO afetam saldo da conta automaticamente
-- Quando TRUE (default), o app pergunta "Atualizar saldo?" ao comprar/vender
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS operacoes_contas BOOLEAN DEFAULT TRUE;

-- 3. Atualizar constraint UNIQUE para incluir portfolio_id
-- Permite mesma corretora+moeda em portfolios diferentes
ALTER TABLE saldos_corretora DROP CONSTRAINT IF EXISTS saldos_corretora_user_id_corretora_moeda_key;
ALTER TABLE saldos_corretora DROP CONSTRAINT IF EXISTS unique_user_corretora_moeda;

-- Nova constraint: user_id + corretora + moeda + portfolio_id
-- Usar COALESCE para tratar NULL como string vazia no unique
CREATE UNIQUE INDEX IF NOT EXISTS unique_saldo_user_corretora_moeda_portfolio
  ON saldos_corretora (user_id, corretora, moeda, COALESCE(portfolio_id::text, ''));
