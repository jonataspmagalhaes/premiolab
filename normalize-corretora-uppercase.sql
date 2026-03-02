-- ============================================================
-- Normalizar nomes de corretoras/contas para UPPERCASE
-- Executar no SQL Editor do Supabase Dashboard
-- ============================================================

-- 1. SALDOS_CORRETORA (tem UNIQUE(user_id, corretora, moeda))
-- Se existirem duplicatas com casing diferente (ex: "Clear" e "CLEAR"),
-- mescla saldos somando e deleta o registro de casing errado.

-- 1a. Identificar e mesclar duplicatas: soma saldo no registro UPPERCASE, deleta os outros
WITH dupes AS (
  SELECT
    s1.id AS keep_id,
    s2.id AS drop_id,
    s2.saldo AS drop_saldo
  FROM saldos_corretora s1
  JOIN saldos_corretora s2
    ON s1.user_id = s2.user_id
   AND s1.moeda = s2.moeda
   AND UPPER(TRIM(s1.corretora)) = UPPER(TRIM(s2.corretora))
   AND s1.id < s2.id
),
updated AS (
  UPDATE saldos_corretora sc
  SET saldo = sc.saldo + d.drop_saldo
  FROM dupes d
  WHERE sc.id = d.keep_id
  RETURNING sc.id
)
DELETE FROM saldos_corretora
WHERE id IN (SELECT drop_id FROM dupes);

-- 1b. Agora normalizar todos para UPPERCASE
UPDATE saldos_corretora
SET corretora = UPPER(TRIM(corretora))
WHERE corretora IS DISTINCT FROM UPPER(TRIM(corretora));

-- 2. USER_CORRETORAS (tem UNIQUE(user_id, name))
-- Mesclar duplicatas somando count, deletar extras

WITH dupes_uc AS (
  SELECT
    u1.id AS keep_id,
    u2.id AS drop_id,
    u2.count AS drop_count
  FROM user_corretoras u1
  JOIN user_corretoras u2
    ON u1.user_id = u2.user_id
   AND UPPER(TRIM(u1.name)) = UPPER(TRIM(u2.name))
   AND u1.id < u2.id
),
updated_uc AS (
  UPDATE user_corretoras uc
  SET count = uc.count + d.drop_count
  FROM dupes_uc d
  WHERE uc.id = d.keep_id
  RETURNING uc.id
)
DELETE FROM user_corretoras
WHERE id IN (SELECT drop_id FROM dupes_uc);

UPDATE user_corretoras
SET name = UPPER(TRIM(name))
WHERE name IS DISTINCT FROM UPPER(TRIM(name));

-- 3. MOVIMENTACOES (sem constraint unique em conta)
UPDATE movimentacoes
SET conta = UPPER(TRIM(conta))
WHERE conta IS NOT NULL
  AND conta IS DISTINCT FROM UPPER(TRIM(conta));

UPDATE movimentacoes
SET conta_destino = UPPER(TRIM(conta_destino))
WHERE conta_destino IS NOT NULL
  AND conta_destino IS DISTINCT FROM UPPER(TRIM(conta_destino));

-- 4. OPERACOES
UPDATE operacoes
SET corretora = UPPER(TRIM(corretora))
WHERE corretora IS NOT NULL
  AND corretora IS DISTINCT FROM UPPER(TRIM(corretora));

-- 5. PROVENTOS
UPDATE proventos
SET corretora = UPPER(TRIM(corretora))
WHERE corretora IS NOT NULL
  AND corretora IS DISTINCT FROM UPPER(TRIM(corretora));

-- 6. OPCOES
UPDATE opcoes
SET corretora = UPPER(TRIM(corretora))
WHERE corretora IS NOT NULL
  AND corretora IS DISTINCT FROM UPPER(TRIM(corretora));

-- 7. RENDA FIXA
UPDATE renda_fixa
SET corretora = UPPER(TRIM(corretora))
WHERE corretora IS NOT NULL
  AND corretora IS DISTINCT FROM UPPER(TRIM(corretora));
