-- Tabela de cache compartilhado de calendario de proventos anunciados
-- (data-com, data-pagamento, valor-por-cota) por ticker.
--
-- Pra alimentar o card "Proximos Pagamentos" do menu Renda com a distincao
-- confirmado (oficialmente anunciado) vs estimado (inferido por historico).
--
-- Dados vem de DadosDeMercado (primario) e StatusInvest (fallback), via
-- edge function `proventos-calendar-fetch`. Como a informacao e publica e
-- independente de usuario, a tabela e compartilhada entre todos (RLS
-- permite SELECT a authenticated; INSERT/UPDATE apenas service_role).

create table if not exists public.proventos_agenda (
  id bigint generated always as identity primary key,
  ticker text not null,
  tipo text,                      -- dividendo | jcp | rendimento | amortizacao | bonificacao
  data_com date,
  data_pagamento date not null,
  valor_por_cota numeric,
  fonte text default 'dm',        -- dm | statusinvest | cache | manual
  updated_at timestamptz default now(),
  unique (ticker, data_pagamento, tipo)
);

create index if not exists proventos_agenda_ticker_data_idx
  on public.proventos_agenda (ticker, data_pagamento desc);

create index if not exists proventos_agenda_data_pagamento_idx
  on public.proventos_agenda (data_pagamento);

alter table public.proventos_agenda enable row level security;

drop policy if exists "proventos_agenda_read_authenticated" on public.proventos_agenda;
create policy "proventos_agenda_read_authenticated"
  on public.proventos_agenda
  for select
  to authenticated
  using (true);

drop policy if exists "proventos_agenda_service_role_write" on public.proventos_agenda;
create policy "proventos_agenda_service_role_write"
  on public.proventos_agenda
  for all
  to service_role
  using (true)
  with check (true);
