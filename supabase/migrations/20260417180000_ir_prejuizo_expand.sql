-- Expande o campo profiles.prejuizo_anterior para cobrir os 11 silos usados
-- pela biblioteca IR (web/src/lib/ir/tax.ts + operacoes.ts).
--
-- Silos novos em relacao ao schema original (4 silos: acoes, fii, etf,
-- stock_int): bdr, adr, reit, opcoes_swing, opcoes_day, cripto_swing,
-- cripto_day.

alter table profiles
  alter column prejuizo_anterior
  set default '{"acao":0,"fii":0,"etf":0,"bdr":0,"adr":0,"reit":0,"stock_int":0,"opcoes_swing":0,"opcoes_day":0,"cripto_swing":0,"cripto_day":0}'::jsonb;

-- Backfill: registros existentes ganham os silos faltantes preservando valores
update profiles
set prejuizo_anterior = coalesce(prejuizo_anterior, '{}'::jsonb)
  || jsonb_build_object(
    'bdr', coalesce((prejuizo_anterior->>'bdr')::numeric, 0),
    'adr', coalesce((prejuizo_anterior->>'adr')::numeric, 0),
    'reit', coalesce((prejuizo_anterior->>'reit')::numeric, 0),
    'opcoes_swing', coalesce((prejuizo_anterior->>'opcoes_swing')::numeric, 0),
    'opcoes_day', coalesce((prejuizo_anterior->>'opcoes_day')::numeric, 0),
    'cripto_swing', coalesce((prejuizo_anterior->>'cripto_swing')::numeric, 0),
    'cripto_day', coalesce((prejuizo_anterior->>'cripto_day')::numeric, 0)
  )
where prejuizo_anterior is null
   or not (prejuizo_anterior ? 'bdr' and prejuizo_anterior ? 'cripto_swing');

-- Adiciona coluna categoria em ir_pagamentos pra permitir DARFs distintas
-- no mesmo mes (codigo 6015 RV × 4600 cripto).
alter table ir_pagamentos add column if not exists categoria text default 'rv';

-- Ajusta unique constraint: agora (user_id, month, categoria)
alter table ir_pagamentos drop constraint if exists ir_pagamentos_user_id_month_key;
alter table ir_pagamentos
  add constraint ir_pagamentos_user_month_categoria_unique
  unique (user_id, month, categoria);
