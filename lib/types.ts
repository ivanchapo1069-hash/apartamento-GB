export type Decision = "FICA" | "SAI" | "TROCAR" | null;

export interface ShoppingItem {
  id: number;
  section: string;
  item: string;
  specification: string | null;
  decision: Decision;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
}

export type UserName = "Ivan" | "Giovana";

export type FilterKey = "todos" | "pendentes" | "fica" | "sai" | "trocar";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
