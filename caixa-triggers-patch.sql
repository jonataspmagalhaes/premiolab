-- Patch: trigger de operacoes usava OLD.custos / NEW.custos, mas schema
-- real split em custo_corretagem + custo_emolumentos + custo_impostos.
-- Substitui a function tg_operacoes_saldo com a soma correta.

BEGIN;

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
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_moeda := CASE WHEN OLD.mercado = 'INT' THEN 'USD' ELSE 'BRL' END;
      v_old_custos := COALESCE(OLD.custo_corretagem, 0) + COALESCE(OLD.custo_emolumentos, 0) + COALESCE(OLD.custo_impostos, 0);
      v_old_delta := CASE
        WHEN OLD.tipo = 'compra' THEN -(OLD.quantidade * OLD.preco + v_old_custos)
        WHEN OLD.tipo = 'venda'  THEN  (OLD.quantidade * OLD.preco - v_old_custos)
        ELSE 0
      END;
      PERFORM _apply_saldo_delta(OLD.user_id, OLD.corretora, v_moeda, -v_old_delta);
    END IF;
    RETURN OLD;
  END IF;

  v_moeda := CASE WHEN NEW.mercado = 'INT' THEN 'USD' ELSE 'BRL' END;
  v_new_custos := COALESCE(NEW.custo_corretagem, 0) + COALESCE(NEW.custo_emolumentos, 0) + COALESCE(NEW.custo_impostos, 0);
  v_delta := CASE
    WHEN NEW.tipo = 'compra' THEN -(NEW.quantidade * NEW.preco + v_new_custos)
    WHEN NEW.tipo = 'venda'  THEN  (NEW.quantidade * NEW.preco - v_new_custos)
    ELSE 0
  END;

  IF TG_OP = 'UPDATE' THEN
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_old_custos := COALESCE(OLD.custo_corretagem, 0) + COALESCE(OLD.custo_emolumentos, 0) + COALESCE(OLD.custo_impostos, 0);
      v_old_delta := CASE
        WHEN OLD.tipo = 'compra' THEN -(OLD.quantidade * OLD.preco + v_old_custos)
        WHEN OLD.tipo = 'venda'  THEN  (OLD.quantidade * OLD.preco - v_old_custos)
        ELSE 0
      END;
      PERFORM _apply_saldo_delta(
        OLD.user_id, OLD.corretora,
        CASE WHEN OLD.mercado = 'INT' THEN 'USD' ELSE 'BRL' END,
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
