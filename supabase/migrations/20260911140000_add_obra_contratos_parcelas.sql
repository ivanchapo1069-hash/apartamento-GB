-- Acompanhamento de obra: contratos de serviço (arquiteta, marcenaria, empreiteiro)
-- e as parcelas de pagamento de cada um.
--
-- Decisão de modelagem: NÃO existe coluna "status" na parcela. Um campo gravado
-- com "atrasado" fica velho no dia seguinte e ninguém lembra de atualizar. O que
-- a tabela guarda é fato — pago_em, vencimento, marco_entregue_em — e o app
-- deriva pago / atrasado / a vencer / aguardando entrega na hora de exibir
-- (ver lib/obra.ts, statusParcela).

create table if not exists public.obra_contratos (
  id bigint generated always as identity primary key,
  fornecedor text not null,
  categoria text not null default 'Outros',
  escopo text,
  valor_total numeric(12, 2) not null default 0,
  data_contrato date,
  condicoes text,
  contato text,
  status text not null default 'ativo',
  observacao text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obra_contratos_fornecedor_nao_vazio check (length(btrim(fornecedor)) > 0),
  constraint obra_contratos_valor_nonnegative check (valor_total >= 0),
  constraint obra_contratos_status_valido check (status in ('ativo', 'concluido', 'cancelado'))
);

comment on table public.obra_contratos is
  'Contratos de serviço da obra do Apartamento GB (projeto, marcenaria, obra civil).';
comment on column public.obra_contratos.condicoes is
  'Condições de pagamento em texto livre, como combinado no contrato.';
comment on column public.obra_contratos.valor_total is
  'Valor fechado do contrato. As parcelas devem somar este valor.';

create table if not exists public.obra_parcelas (
  id bigint generated always as identity primary key,
  contrato_id bigint not null references public.obra_contratos (id) on delete cascade,
  numero integer not null default 1,
  descricao text not null default 'Parcela',
  valor numeric(12, 2) not null default 0,
  gatilho text not null default 'data',
  vencimento date,
  marco_descricao text,
  marco_entregue_em date,
  prazo_dias integer not null default 0,
  pago_em date,
  valor_pago numeric(12, 2),
  forma_pagamento text,
  comprovante_url text,
  observacao text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obra_parcelas_valor_nonnegative check (valor >= 0),
  constraint obra_parcelas_valor_pago_nonnegative check (valor_pago is null or valor_pago >= 0),
  constraint obra_parcelas_prazo_nonnegative check (prazo_dias >= 0),
  constraint obra_parcelas_numero_positivo check (numero >= 1),
  constraint obra_parcelas_gatilho_valido check (gatilho in ('data', 'marco')),
  -- parcela por data precisa de vencimento; parcela por marco precisa dizer qual marco
  constraint obra_parcelas_gatilho_coerente check (
    (gatilho = 'data' and vencimento is not null)
    or (gatilho = 'marco' and marco_descricao is not null)
  )
);

comment on table public.obra_parcelas is
  'Parcelas de pagamento de um contrato. Sem coluna de status: atrasado e demais estados são derivados no app.';
comment on column public.obra_parcelas.gatilho is
  'data = vence em data fixa; marco = só vence depois que a entrega acontece.';
comment on column public.obra_parcelas.marco_entregue_em is
  'Data da entrega que destrava o pagamento. Nulo = ainda não entregue, então a parcela não pode estar atrasada.';
comment on column public.obra_parcelas.prazo_dias is
  'Dias para pagar contados a partir de marco_entregue_em.';
comment on column public.obra_parcelas.pago_em is
  'Data do pagamento. Nulo = em aberto. É o único estado gravado.';

create index if not exists obra_parcelas_contrato_id_idx on public.obra_parcelas (contrato_id);
create index if not exists obra_parcelas_vencimento_idx on public.obra_parcelas (vencimento);
create index if not exists obra_parcelas_em_aberto_idx on public.obra_parcelas (vencimento)
  where pago_em is null;

-- updated_at mantido pelo banco, não pelo cliente
create or replace function public.obra_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists obra_contratos_touch_updated_at on public.obra_contratos;
create trigger obra_contratos_touch_updated_at
  before update on public.obra_contratos
  for each row execute function public.obra_touch_updated_at();

drop trigger if exists obra_parcelas_touch_updated_at on public.obra_parcelas;
create trigger obra_parcelas_touch_updated_at
  before update on public.obra_parcelas
  for each row execute function public.obra_touch_updated_at();

-- RLS: mesmo desenho das shopping_items — o app não tem login de usuário, ele vive
-- inteiro atrás do APP_ACCESS_CODE verificado no middleware.ts. Ver README.
alter table public.obra_contratos enable row level security;
alter table public.obra_parcelas enable row level security;

drop policy if exists obra_contratos_anon_all on public.obra_contratos;
create policy obra_contratos_anon_all on public.obra_contratos
  for all to anon using (true) with check (true);

drop policy if exists obra_parcelas_anon_all on public.obra_parcelas;
create policy obra_parcelas_anon_all on public.obra_parcelas
  for all to anon using (true) with check (true);

-- Realtime, para Ivan e Giovana verem a mesma tela ao mesmo tempo
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'obra_contratos'
  ) then
    alter publication supabase_realtime add table public.obra_contratos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'obra_parcelas'
  ) then
    alter publication supabase_realtime add table public.obra_parcelas;
  end if;
end
$$;
