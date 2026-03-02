-- ══════════════════════════════════════════════════════
-- FIX: Remover proventos e movimentações duplicados
-- Executar no Supabase Dashboard > SQL Editor
-- ══════════════════════════════════════════════════════

-- PASSO 1: Identificar proventos duplicados (mesmo ticker + data_pagamento, mantém o mais antigo)
-- Preview primeiro:
SELECT
  ticker,
  data_pagamento,
  COUNT(*) as duplicatas,
  ARRAY_AGG(id ORDER BY created_at ASC) as ids,
  ARRAY_AGG(valor_por_cota ORDER BY created_at ASC) as valores,
  ARRAY_AGG(quantidade ORDER BY created_at ASC) as quantidades
FROM proventos
WHERE user_id = auth.uid()
GROUP BY ticker, data_pagamento
HAVING COUNT(*) > 1
ORDER BY ticker, data_pagamento;

-- PASSO 2: Deletar proventos duplicados (manter o mais antigo de cada grupo)
DELETE FROM proventos
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, ticker, data_pagamento
        ORDER BY created_at ASC
      ) as rn
    FROM proventos
    WHERE user_id = auth.uid()
  ) ranked
  WHERE rn > 1
);

-- PASSO 3: Identificar movimentações de dividendo duplicadas (mesmo ticker + data + categoria div/jcp/rend)
-- Preview primeiro:
SELECT
  ticker,
  data,
  categoria,
  COUNT(*) as duplicatas,
  ARRAY_AGG(id ORDER BY created_at ASC) as ids,
  ARRAY_AGG(valor ORDER BY created_at ASC) as valores
FROM movimentacoes
WHERE user_id = auth.uid()
  AND categoria IN ('dividendo', 'jcp', 'rendimento_fii')
GROUP BY ticker, data, categoria
HAVING COUNT(*) > 1
ORDER BY ticker, data;

-- PASSO 4: Deletar movimentações de dividendo duplicadas (manter a mais antiga de cada grupo)
DELETE FROM movimentacoes
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, ticker, data, categoria
        ORDER BY created_at ASC
      ) as rn
    FROM movimentacoes
    WHERE user_id = auth.uid()
      AND categoria IN ('dividendo', 'jcp', 'rendimento_fii')
  ) ranked
  WHERE rn > 1
);

-- PASSO 5: Após limpar duplicados, recalcular saldos manualmente
-- (o app faz isso automaticamente via CaixaView > Reconciliar)
-- Ou verifique os totais:
SELECT
  conta,
  SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) as total_entradas,
  SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as total_saidas,
  SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END) as saldo_calculado
FROM movimentacoes
WHERE user_id = auth.uid()
GROUP BY conta
ORDER BY conta;
