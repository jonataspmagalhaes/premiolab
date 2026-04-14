-- Dividend sync reliability improvements
-- - dividend_sync_log: telemetria por ticker/fonte para detectar gaps (VGIP11 etc)
-- - proventos.fonte: qual fonte(s) retornaram o provento (auditoria)

-- ══════════ 1. Tabela de telemetria ══════════

create table if not exists dividend_sync_log (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  categoria text,
  source text not null,            -- 'brapi' | 'statusinvest' | 'massive' | 'merged'
  dividends_found int not null default 0,
  http_status int,
  error_message text,
  ran_at timestamptz not null default now()
);

create index if not exists idx_dividend_sync_log_ticker
  on dividend_sync_log (ticker, ran_at desc);

create index if not exists idx_dividend_sync_log_ran_at
  on dividend_sync_log (ran_at desc);

-- View util: ultimo resultado por ticker/fonte
create or replace view v_dividend_sync_latest as
select distinct on (ticker, source)
  ticker, categoria, source, dividends_found, http_status, error_message, ran_at
from dividend_sync_log
order by ticker, source, ran_at desc;

-- View util: tickers com zero resultados em todas as fontes (gap real)
create or replace view v_dividend_sync_gaps as
select ticker
from v_dividend_sync_latest
group by ticker
having sum(dividends_found) = 0;

-- ══════════ 2. proventos.fonte ══════════

alter table proventos
  add column if not exists fonte text;

-- backfill existentes como 'legado' para distinguir de novos sync
update proventos set fonte = 'legado' where fonte is null;

comment on column proventos.fonte is
  'Origem do provento: dadosdemercado | brapi | statusinvest | b3 | yahoo | massive | merged | manual | legado';

-- ══════════ 3. RLS ══════════

alter table dividend_sync_log enable row level security;

-- Apenas service_role grava (edge function); usuarios nao leem essa tabela
create policy "dividend_sync_log service role only" on dividend_sync_log
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
