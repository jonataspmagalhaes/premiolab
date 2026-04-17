-- Fix + Extensao: trigger tg_operacoes_saldo()
--
-- Problema 1 (bloqueante): a funcao criada em 20260415190000_caixa_saldo_triggers.sql
-- referenciava NEW.custos / OLD.custos, mas a tabela operacoes sempre teve os custos
-- split em 3 colunas (custo_corretagem + custo_emolumentos + custo_impostos).
-- Qualquer INSERT/UPDATE/DELETE estava falhando com
-- "record \"new\" has no field \"custos\"".
--
-- Problema 2 (cripto multi-moeda): a trigger derivava moeda do saldo apenas do
-- campo `mercado` ('INT' => USD, senao BRL). Isso quebra pra cripto: user que
-- compra BTC-USD na Revolut (saldo USD) teria saldo BRL debitado por engano.
--
-- Solucao: nova coluna operacoes.moeda_quote (opcional) que quando presente
-- prevalece sobre o fallback por mercado. Valores esperados: 'USD', 'EUR', 'BRL'.

BEGIN;

-- 1. Adiciona coluna moeda_quote (nullable, sem default)
ALTER TABLE operacoes
  ADD COLUMN IF NOT EXISTS moeda_quote TEXT;

-- 2. Recria funcao com:
--    - Soma correta dos 3 campos de custo
--    - Moeda derivada de moeda_quote quando presente, senao do mercado (retrocompat)
CREATE OR REPLACE FUNCTION tg_operacoes_saldo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_moeda TEXT;
  v_delta NUMERIC;
  v_old_delta NUMERIC;
  v_old_custos NUMERIC;
  v_new_custos NUMERIC;
  v_old_moeda TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_old_moeda := COALESCE(
        NULLIF(OLD.moeda_quote, ''),
        CASE WHEN OLD.mercado = 'INT' THEN 'USD' ELSE 'BRL' END
      );
      v_old_custos := COALESCE(OLD.custo_corretagem, 0)
                    + COALESCE(OLD.custo_emolumentos, 0)
                    + COALESCE(OLD.custo_impostos, 0);
      v_old_delta := CASE
        WHEN OLD.tipo = 'compra' THEN -(OLD.quantidade * OLD.preco + v_old_custos)
        WHEN OLD.tipo = 'venda'  THEN  (OLD.quantidade * OLD.preco - v_old_custos)
        ELSE 0
      END;
      PERFORM _apply_saldo_delta(OLD.user_id, OLD.corretora, v_old_moeda, -v_old_delta);
    END IF;
    RETURN OLD;
  END IF;

  v_moeda := COALESCE(
    NULLIF(NEW.moeda_quote, ''),
    CASE WHEN NEW.mercado = 'INT' THEN 'USD' ELSE 'BRL' END
  );
  v_new_custos := COALESCE(NEW.custo_corretagem, 0)
                + COALESCE(NEW.custo_emolumentos, 0)
                + COALESCE(NEW.custo_impostos, 0);
  v_delta := CASE
    WHEN NEW.tipo = 'compra' THEN -(NEW.quantidade * NEW.preco + v_new_custos)
    WHEN NEW.tipo = 'venda'  THEN  (NEW.quantidade * NEW.preco - v_new_custos)
    ELSE 0
  END;

  IF TG_OP = 'UPDATE' THEN
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_old_moeda := COALESCE(
        NULLIF(OLD.moeda_quote, ''),
        CASE WHEN OLD.mercado = 'INT' THEN 'USD' ELSE 'BRL' END
      );
      v_old_custos := COALESCE(OLD.custo_corretagem, 0)
                    + COALESCE(OLD.custo_emolumentos, 0)
                    + COALESCE(OLD.custo_impostos, 0);
      v_old_delta := CASE
        WHEN OLD.tipo = 'compra' THEN -(OLD.quantidade * OLD.preco + v_old_custos)
        WHEN OLD.tipo = 'venda'  THEN  (OLD.quantidade * OLD.preco - v_old_custos)
        ELSE 0
      END;
      PERFORM _apply_saldo_delta(
        OLD.user_id, OLD.corretora,
        v_old_moeda,
        -v_old_delta
      );
    END IF;
  END IF;

  IF _should_affect_saldo(NEW.portfolio_id) THEN
    PERFORM _apply_saldo_delta(NEW.user_id, NEW.corretora, v_moeda, v_delta);
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
