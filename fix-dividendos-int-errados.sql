-- ═══════════════════════════════════════════════════════════════
-- FIX: Limpar dividendos e movimentacoes de BITO, QQQ, VOO
-- que foram creditados em contas erradas pelo bug do auto-sync
-- ═══════════════════════════════════════════════════════════════

-- 1. Listar movimentacoes afetadas (CONFERIR ANTES DE DELETAR)
SELECT id, conta, categoria, valor, ticker, descricao, data, created_at
FROM movimentacoes
WHERE user_id = auth.uid()
  AND ticker IN ('BITO', 'QQQ', 'VOO')
  AND categoria = 'dividendo'
ORDER BY data DESC;

-- 2. Listar proventos afetados
SELECT id, ticker, tipo, valor_por_cota, quantidade, valor_total, data_pagamento
FROM proventos
WHERE user_id = auth.uid()
  AND ticker IN ('BITO', 'QQQ', 'VOO')
ORDER BY data_pagamento DESC;

-- 3. DELETAR movimentacoes de dividendos dos tickers INT afetados
-- (EXECUTAR APOS CONFERIR O SELECT ACIMA)
DELETE FROM movimentacoes
WHERE user_id = auth.uid()
  AND ticker IN ('BITO', 'QQQ', 'VOO')
  AND categoria = 'dividendo';

-- 4. DELETAR proventos dos tickers INT afetados
DELETE FROM proventos
WHERE user_id = auth.uid()
  AND ticker IN ('BITO', 'QQQ', 'VOO');

-- 5. Recalcular saldos das contas afetadas
-- OPCAO A: Se voce sabe o saldo correto, atualizar direto:
-- UPDATE saldos_corretora SET saldo = <VALOR_CORRETO> WHERE user_id = auth.uid() AND name = '<NOME_CONTA>';

-- OPCAO B: Usar a funcao recalcularSaldos() do app (via Caixa > puxar para atualizar)
-- Isso reconstroi os saldos a partir das movimentacoes restantes

-- 6. Verificar que foi limpo
SELECT COUNT(*) as movs_restantes FROM movimentacoes
WHERE user_id = auth.uid() AND ticker IN ('BITO', 'QQQ', 'VOO') AND categoria = 'dividendo';

SELECT COUNT(*) as provs_restantes FROM proventos
WHERE user_id = auth.uid() AND ticker IN ('BITO', 'QQQ', 'VOO');
