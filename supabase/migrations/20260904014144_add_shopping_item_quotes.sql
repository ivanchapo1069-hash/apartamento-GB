alter table public.shopping_items
  add column if not exists quote_image_url text,
  add column if not exists quote_price numeric(12, 2),
  add column if not exists quote_store text,
  add column if not exists quote_product_url text,
  add column if not exists quote_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_items_quote_price_nonnegative'
      and conrelid = 'public.shopping_items'::regclass
  ) then
    alter table public.shopping_items
      add constraint shopping_items_quote_price_nonnegative
      check (quote_price is null or quote_price >= 0);
  end if;
end
$$;

comment on column public.shopping_items.quote_image_url is 'Public product image URL for the selected quote.';
comment on column public.shopping_items.quote_price is 'Current quoted unit price in BRL.';
comment on column public.shopping_items.quote_store is 'Store or supplier for the selected quote.';
comment on column public.shopping_items.quote_product_url is 'Direct URL to the quoted product.';
comment on column public.shopping_items.quote_checked_at is 'When the selected quote was last reviewed.';
