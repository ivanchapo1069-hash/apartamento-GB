export type Decision = "FICA" | "SAI" | "TROCAR" | null;

export interface ShoppingItem {
  id: number;
  section: string;
  item: string;
  specification: string | null;
  style_reference: string | null;
  decision: Decision;
  note: string | null;
  quote_image_url: string | null;
  quote_price: number | null;
  quote_store: string | null;
  quote_product_url: string | null;
  quote_checked_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface ItemSuggestion {
  id: number;
  shopping_item_id: number;
  price: number | null;
  store: string | null;
  product_url: string | null;
  image_url: string | null;
  label: string | null;
  created_at: string;
}

export type UserName = "Ivan" | "Giovana";

export type FilterKey = "todos" | "pendentes" | "fica" | "sai" | "trocar";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type AppView = "decisoes" | "cotacoes";

export type QuotePatch = Pick<
  ShoppingItem,
  "quote_image_url" | "quote_price" | "quote_store" | "quote_product_url" | "quote_checked_at"
>;
