-- Adicionar campos de componentes ao snapshot pra permitir graficos com linhas separadas
-- valor = patrimonio total (existente)
-- valor_investido = equity (acoes+FIIs+ETFs+RF) sem saldos
-- valor_saldos = caixa livre em contas
ALTER TABLE patrimonio_snapshots ADD COLUMN IF NOT EXISTS valor_investido numeric DEFAULT NULL;
ALTER TABLE patrimonio_snapshots ADD COLUMN IF NOT EXISTS valor_saldos numeric DEFAULT NULL;
