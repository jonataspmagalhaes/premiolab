-- Migration: Suporte a ações fracionadas (fractional shares)
-- Altera operacoes.quantidade de INTEGER para NUMERIC para suportar frações
-- Ativos INT (stock_int, etf_int, adr, reit) podem ter quantidades fracionadas

-- 1. Dropar view que depende da coluna
DROP VIEW IF EXISTS v_posicoes;

-- 2. Alterar colunas
ALTER TABLE operacoes ALTER COLUMN quantidade TYPE NUMERIC USING quantidade::NUMERIC;
ALTER TABLE proventos ALTER COLUMN quantidade TYPE NUMERIC USING quantidade::NUMERIC;

-- 3. Recriar view com mesma lógica
CREATE OR REPLACE VIEW v_posicoes AS
SELECT user_id,
    ticker,
    categoria,
    sum(
        CASE
            WHEN tipo = 'compra' THEN quantidade
            ELSE - quantidade
        END) AS quantidade_total,
        CASE
            WHEN sum(
            CASE
                WHEN tipo = 'compra' THEN quantidade
                ELSE 0
            END) > 0 THEN sum(
            CASE
                WHEN tipo = 'compra' THEN quantidade * preco
                ELSE 0::numeric
            END) / sum(
            CASE
                WHEN tipo = 'compra' THEN quantidade
                ELSE 0
            END)
            ELSE 0::numeric
        END AS preco_medio,
    sum(
        CASE
            WHEN tipo = 'compra' THEN quantidade * preco + custo_corretagem + custo_emolumentos + custo_impostos
            ELSE 0::numeric
        END) AS custo_total,
    max(data) AS ultima_operacao
   FROM operacoes
  GROUP BY user_id, ticker, categoria
 HAVING sum(
        CASE
            WHEN tipo = 'compra' THEN quantidade
            ELSE - quantidade
        END) > 0;
