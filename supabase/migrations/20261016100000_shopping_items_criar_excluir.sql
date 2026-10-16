-- A lista nasceu de uma carga única, então o id nunca teve default e o RLS só
-- liberava leitura e edição. Para o app poder criar e excluir itens na aba
-- Decisões, o id passa a vir de uma sequence e o anon ganha insert/delete —
-- mesmo desenho das tabelas da obra: o app vive inteiro atrás do
-- APP_ACCESS_CODE verificado no middleware.ts.

create sequence if not exists public.shopping_items_id_seq owned by public.shopping_items.id;

select setval(
  'public.shopping_items_id_seq',
  greatest((select coalesce(max(id), 0) from public.shopping_items), 1),
  (select count(*) > 0 from public.shopping_items)
);

alter table public.shopping_items
  alter column id set default nextval('public.shopping_items_id_seq');

grant usage, select on sequence public.shopping_items_id_seq to anon, authenticated;

drop policy if exists "public insert shopping items" on public.shopping_items;
create policy "public insert shopping items" on public.shopping_items
  for insert to anon with check (true);

drop policy if exists "public delete shopping items" on public.shopping_items;
create policy "public delete shopping items" on public.shopping_items
  for delete to anon using (true);
