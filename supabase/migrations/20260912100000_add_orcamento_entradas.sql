-- Orçamento do apartamento: de onde vem o dinheiro (aportes) e o que já foi
-- efetivamente comprado, para fechar a conta entre entradas e saídas.
--
-- Mesma decisão de modelagem da obra: o estado não é gravado, é derivado.
-- O aporte guarda apenas recebido_em (preenchido ou nulo); "previsto" e
-- "atrasado" saem da comparação com a data de hoje, em lib/orcamento.ts.

create table if not exists public.orcamento_entradas (
  id bigint generated always as identity primary key,
  descricao text not null,
  valor numeric(12, 2) not null default 0,
  data_prevista date,
  recebido_em date,
  origem text,
  observacao text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orcamento_entradas_descricao_nao_vazia check (length(btrim(descricao)) > 0),
  constraint orcamento_entradas_valor_nonnegative check (valor >= 0)
);

comment on table public.orcamento_entradas is
  'Aportes de dinheiro que bancam a reforma: poupança, 13º, venda de bem, liberação de financiamento.';
comment on column public.orcamento_entradas.recebido_em is
  'Data em que o dinheiro caiu na conta. Nulo = ainda previsto. É o único estado gravado.';
comment on column public.orcamento_entradas.data_prevista is
  'Quando o aporte é esperado. Passou e recebido_em segue nulo: o app mostra como atrasado.';
comment on column public.orcamento_entradas.origem is
  'De onde vem o dinheiro (conta, pessoa, banco).';

create index if not exists orcamento_entradas_previstas_idx on public.orcamento_entradas (data_prevista)
  where recebido_em is null;

-- Cotado não é comprado. Sem estas colunas o "resultado real" ignoraria toda
-- compra de eletro, móvel e iluminação já paga.
alter table public.shopping_items
  add column if not exists comprado_em date,
  add column if not exists valor_pago numeric(12, 2);

alter table public.lighting_items
  add column if not exists comprado_em date,
  add column if not exists valor_pago numeric(12, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shopping_items_valor_pago_nonnegative'
      and conrelid = 'public.shopping_items'::regclass
  ) then
    alter table public.shopping_items
      add constraint shopping_items_valor_pago_nonnegative
      check (valor_pago is null or valor_pago >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lighting_items_valor_pago_nonnegative'
      and conrelid = 'public.lighting_items'::regclass
  ) then
    alter table public.lighting_items
      add constraint lighting_items_valor_pago_nonnegative
      check (valor_pago is null or valor_pago >= 0);
  end if;
end
$$;

comment on column public.shopping_items.comprado_em is
  'Data da compra efetiva. Nulo = ainda só cotado, entra como comprometido e não como realizado.';
comment on column public.shopping_items.valor_pago is
  'Quanto saiu de fato. Pode diferir de quote_price — a diferença é economia ou estouro.';
comment on column public.lighting_items.comprado_em is
  'Data da compra efetiva. Nulo = ainda só selecionado.';
comment on column public.lighting_items.valor_pago is
  'Quanto saiu de fato nesta linha de iluminação.';

-- updated_at mantido pelo banco (função criada na migration da obra)
drop trigger if exists orcamento_entradas_touch_updated_at on public.orcamento_entradas;
create trigger orcamento_entradas_touch_updated_at
  before update on public.orcamento_entradas
  for each row execute function public.obra_touch_updated_at();

-- RLS: mesmo desenho das demais tabelas — o app vive atrás do APP_ACCESS_CODE
alter table public.orcamento_entradas enable row level security;

drop policy if exists orcamento_entradas_anon_all on public.orcamento_entradas;
create policy orcamento_entradas_anon_all on public.orcamento_entradas
  for all to anon using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orcamento_entradas'
  ) then
    alter publication supabase_realtime add table public.orcamento_entradas;
  end if;
end
$$;
