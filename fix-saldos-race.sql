-- Fix race condition: recalcular saldos baseado em todas movimentacoes
-- Para cada conta, somar todas entradas e subtrair saidas desde a criacao

-- Primeiro, pegar o saldo "base" (sem nenhuma movimentacao) e recalcular
-- Abordagem: saldo correto = soma de todas entradas - soma de todas saidas

UPDATE saldos_corretora sc
SET saldo = COALESCE(sub.net, 0),
    updated_at = now()
FROM (
  SELECT user_id, conta,
    SUM(CASE WHEN tipo = 'entrada' THEN valor::numeric ELSE -valor::numeric END) AS net
  FROM movimentacoes
  GROUP BY user_id, conta
) sub
WHERE sc.user_id = sub.user_id
  AND sc.corretora = sub.conta;
