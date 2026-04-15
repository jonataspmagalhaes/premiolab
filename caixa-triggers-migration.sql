-- ════════════════════════════════════════════════════════════════════
-- Caixa triggers — auto-ajuste de saldos_corretora.saldo
-- ════════════════════════════════════════════════════════════════════
-- Objetivo: saldo na conta/corretora reflete automaticamente operacoes,
-- opcoes e proventos. User so edita saldo manual quando precisa corrigir.
--
-- Regra de portfolio:
--   - portfolio_id IS NULL (Padrao)                     → SEMPRE ajusta saldo
--   - portfolio_id = UUID e operacoes_contas = true     → ajusta saldo
--   - portfolio_id = UUID e operacoes_contas = false    → NAO ajusta
--
-- Mecanica das opcoes (venda B3):
--   - Venda opcao (direcao='venda'|'lancamento') abertura → +premio*qty
--   - Compra opcao (direcao='compra')          abertura → -premio*qty
--   - Fechar venda: +(-premio_fechamento*qty) = recompra sai do caixa
--   - Fechar compra: +premio_fechamento*qty = venda entra
--   - Exercida venda CALL: entrada strike*qty (ações saem via 'operacoes')
--   - Exercida venda PUT:  saida strike*qty  (ações entram via 'operacoes')
--
-- REVISE antes de rodar em producao. Mantem backward-compat com RN app:
-- tabelas movimentacoes/orcamentos/etc NAO sao dropadas aqui (Fase 2).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────── Helpers ─────────────────────────

-- Decide se o portfolio afeta o saldo
CREATE OR REPLACE FUNCTION _should_affect_saldo(p_portfolio_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_flag BOOLEAN;
BEGIN
  IF p_portfolio_id IS NULL THEN
    RETURN TRUE;
  END IF;
  SELECT operacoes_contas INTO v_flag
  FROM portfolios
  WHERE id = p_portfolio_id;
  RETURN COALESCE(v_flag, TRUE);
END;
$$;

-- Aplica delta em saldos_corretora (name + user_id)
-- Se conta nao existe, nao faz nada (user precisa cadastrar primeiro).
CREATE OR REPLACE FUNCTION _apply_saldo_delta(
  p_user_id UUID,
  p_corretora TEXT,
  p_moeda TEXT,
  p_delta NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_corretora IS NULL OR p_delta = 0 THEN RETURN; END IF;
  -- Match case-insensitive + trim pra absorver variacoes leves
  -- (ex: "XP" vs "XP Investimentos" NAO bate — normalizar no app via canonicalName).
  UPDATE saldos_corretora
  SET saldo = COALESCE(saldo, 0) + p_delta
  WHERE user_id = p_user_id
    AND LOWER(TRIM(corretora)) = LOWER(TRIM(p_corretora))
    AND COALESCE(moeda, 'BRL') = COALESCE(p_moeda, 'BRL');
END;
$$;

-- ───────────────────────── Operacoes ─────────────────────────
-- compra: saldo -= qty*preco + custos
-- venda:  saldo += qty*preco - custos
-- Moeda segue operacao.mercado (BR=BRL, INT=USD)

CREATE OR REPLACE FUNCTION tg_operacoes_saldo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_moeda TEXT;
  v_delta NUMERIC;
  v_old_delta NUMERIC;
BEGIN
  -- DELETE: estornar
  IF TG_OP = 'DELETE' THEN
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_moeda := CASE WHEN OLD.mercado = 'INT' THEN 'USD' ELSE 'BRL' END;
      v_old_delta := CASE
        WHEN OLD.tipo = 'compra' THEN -(OLD.quantidade * OLD.preco + COALESCE(OLD.custos, 0))
        WHEN OLD.tipo = 'venda'  THEN  (OLD.quantidade * OLD.preco - COALESCE(OLD.custos, 0))
        ELSE 0
      END;
      PERFORM _apply_saldo_delta(OLD.user_id, OLD.corretora, v_moeda, -v_old_delta);
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT/UPDATE: calcula novo delta
  v_moeda := CASE WHEN NEW.mercado = 'INT' THEN 'USD' ELSE 'BRL' END;
  v_delta := CASE
    WHEN NEW.tipo = 'compra' THEN -(NEW.quantidade * NEW.preco + COALESCE(NEW.custos, 0))
    WHEN NEW.tipo = 'venda'  THEN  (NEW.quantidade * NEW.preco - COALESCE(NEW.custos, 0))
    ELSE 0
  END;

  IF TG_OP = 'UPDATE' THEN
    -- estorna old primeiro
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_old_delta := CASE
        WHEN OLD.tipo = 'compra' THEN -(OLD.quantidade * OLD.preco + COALESCE(OLD.custos, 0))
        WHEN OLD.tipo = 'venda'  THEN  (OLD.quantidade * OLD.preco - COALESCE(OLD.custos, 0))
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

DROP TRIGGER IF EXISTS operacoes_saldo_trigger ON operacoes;
CREATE TRIGGER operacoes_saldo_trigger
  AFTER INSERT OR UPDATE OR DELETE ON operacoes
  FOR EACH ROW EXECUTE FUNCTION tg_operacoes_saldo();

-- ───────────────────────── Opcoes ─────────────────────────
-- Abertura (INSERT):
--   venda/lancamento: +premio*qty
--   compra:           -premio*qty
-- Fechamento (premio_fechamento setado em UPDATE):
--   venda:  -premio_fechamento*qty (recompra)
--   compra: +premio_fechamento*qty (venda)
-- Moeda: sempre BRL (opcoes B3). Se um dia suportar US options, tratar.

CREATE OR REPLACE FUNCTION _opcao_abertura_delta(p_direcao TEXT, p_premio NUMERIC, p_qty NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_direcao IN ('venda', 'lancamento') THEN  p_premio * p_qty
    WHEN p_direcao = 'compra'                  THEN -p_premio * p_qty
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION _opcao_fechamento_delta(p_direcao TEXT, p_premio_fechamento NUMERIC, p_qty NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_premio_fechamento IS NULL THEN 0
    WHEN p_direcao IN ('venda', 'lancamento') THEN -p_premio_fechamento * p_qty
    WHEN p_direcao = 'compra'                  THEN  p_premio_fechamento * p_qty
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION tg_opcoes_saldo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_delta NUMERIC;
  v_old_delta NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_old_delta := _opcao_abertura_delta(OLD.direcao, OLD.premio, OLD.qty)
                   + _opcao_fechamento_delta(OLD.direcao, OLD.premio_fechamento, OLD.qty);
      PERFORM _apply_saldo_delta(OLD.user_id, OLD.corretora, 'BRL', -v_old_delta);
    END IF;
    RETURN OLD;
  END IF;

  v_new_delta := _opcao_abertura_delta(NEW.direcao, NEW.premio, NEW.qty)
               + _opcao_fechamento_delta(NEW.direcao, NEW.premio_fechamento, NEW.qty);

  IF TG_OP = 'UPDATE' THEN
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_old_delta := _opcao_abertura_delta(OLD.direcao, OLD.premio, OLD.qty)
                   + _opcao_fechamento_delta(OLD.direcao, OLD.premio_fechamento, OLD.qty);
      PERFORM _apply_saldo_delta(OLD.user_id, OLD.corretora, 'BRL', -v_old_delta);
    END IF;
  END IF;

  IF _should_affect_saldo(NEW.portfolio_id) THEN
    PERFORM _apply_saldo_delta(NEW.user_id, NEW.corretora, 'BRL', v_new_delta);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opcoes_saldo_trigger ON opcoes;
CREATE TRIGGER opcoes_saldo_trigger
  AFTER INSERT OR UPDATE OR DELETE ON opcoes
  FOR EACH ROW EXECUTE FUNCTION tg_opcoes_saldo();

-- ───────────────────────── Proventos ─────────────────────────
-- Pagamento: saldo += valor_por_cota * quantidade
-- Sem coluna de moeda; assume BRL (proventos BR). Se proventos INT forem
-- adicionados depois, derivar moeda do ticker ou da operacao origem.

CREATE OR REPLACE FUNCTION tg_proventos_saldo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_delta NUMERIC;
  v_old_delta NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_old_delta := COALESCE(OLD.valor_por_cota, 0) * COALESCE(OLD.quantidade, 0);
      PERFORM _apply_saldo_delta(OLD.user_id, OLD.corretora, 'BRL', -v_old_delta);
    END IF;
    RETURN OLD;
  END IF;

  v_new_delta := COALESCE(NEW.valor_por_cota, 0) * COALESCE(NEW.quantidade, 0);

  IF TG_OP = 'UPDATE' THEN
    IF _should_affect_saldo(OLD.portfolio_id) THEN
      v_old_delta := COALESCE(OLD.valor_por_cota, 0) * COALESCE(OLD.quantidade, 0);
      PERFORM _apply_saldo_delta(OLD.user_id, OLD.corretora, 'BRL', -v_old_delta);
    END IF;
  END IF;

  IF _should_affect_saldo(NEW.portfolio_id) THEN
    PERFORM _apply_saldo_delta(NEW.user_id, NEW.corretora, 'BRL', v_new_delta);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proventos_saldo_trigger ON proventos;
CREATE TRIGGER proventos_saldo_trigger
  AFTER INSERT OR UPDATE OR DELETE ON proventos
  FOR EACH ROW EXECUTE FUNCTION tg_proventos_saldo();

COMMIT;

-- ────────────────────────────────────────────────────────────────────
-- FASE 2 (rodar depois que RN app parar de ler movimentacoes/orcamentos/
-- transacoes_recorrentes/cartoes_credito/user_corretoras):
--
-- DROP TABLE movimentacoes CASCADE;
-- DROP TABLE orcamentos CASCADE;
-- DROP TABLE transacoes_recorrentes CASCADE;
-- DROP TABLE cartoes_credito CASCADE;
-- DROP TABLE user_corretoras CASCADE;
--
-- Remover do profiles: gastos_rapidos (JSONB)
-- ────────────────────────────────────────────────────────────────────
