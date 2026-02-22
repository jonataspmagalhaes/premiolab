-- Permitir mesma corretora/banco com moedas diferentes (ex: Inter USD + Inter BRL)
ALTER TABLE saldos_corretora DROP CONSTRAINT IF EXISTS saldos_corretora_user_id_name_key;
ALTER TABLE saldos_corretora DROP CONSTRAINT IF EXISTS saldos_corretora_user_id_corretora_key;

ALTER TABLE saldos_corretora ADD CONSTRAINT saldos_corretora_user_id_corretora_moeda_key UNIQUE (user_id, corretora, moeda);
