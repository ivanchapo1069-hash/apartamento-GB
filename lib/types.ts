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
  comprado_em: string | null;
  valor_pago: number | null;
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

export type AppView = "decisoes" | "cotacoes" | "obra" | "orcamento";

export type QuotePatch = Pick<
  ShoppingItem,
  "quote_image_url" | "quote_price" | "quote_store" | "quote_product_url" | "quote_checked_at"
>;

// ---------- Obra: contratos e pagamentos ----------

export type GatilhoParcela = "data" | "marco";

export type ContratoStatus = "ativo" | "concluido" | "cancelado";

export interface ObraContrato {
  id: number;
  fornecedor: string;
  categoria: string;
  escopo: string | null;
  valor_total: number;
  data_contrato: string | null;
  condicoes: string | null;
  contato: string | null;
  status: ContratoStatus;
  observacao: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Repare que não existe campo de status. "Atrasado" é derivado de
 * vencimento + pago_em em lib/obra.ts — gravar esse estado deixaria a tela
 * desatualizada no dia seguinte.
 */
export interface ObraParcela {
  id: number;
  contrato_id: number;
  numero: number;
  descricao: string;
  valor: number;
  gatilho: GatilhoParcela;
  vencimento: string | null;
  marco_descricao: string | null;
  marco_entregue_em: string | null;
  prazo_dias: number;
  pago_em: string | null;
  valor_pago: number | null;
  forma_pagamento: string | null;
  comprovante_url: string | null;
  observacao: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ParcelaStatusKey = "pago" | "atrasado" | "proximo" | "avencer" | "aguardando";

export interface ParcelaStatus {
  key: ParcelaStatusKey;
  label: string;
  vencimento: string | null;
  /** Dias até o vencimento. Negativo = atrasado. Nulo quando não há vencimento. */
  dias: number | null;
}

// ---------- Orçamento: entradas, saldo e projeção ----------

/**
 * Aporte de dinheiro que banca a reforma. Como na parcela, o único estado
 * gravado é o fato: `recebido_em` preenchido ou nulo. Previsto e atrasado
 * são derivados em lib/orcamento.ts.
 */
export interface OrcamentoEntrada {
  id: number;
  descricao: string;
  valor: number;
  data_prevista: string | null;
  recebido_em: string | null;
  origem: string | null;
  observacao: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EntradaStatusKey = "recebido" | "atrasado" | "previsto";

export interface EntradaStatus {
  key: EntradaStatusKey;
  label: string;
}

/** Só o que o cálculo do orçamento precisa saber de uma linha de iluminação. */
export interface IluminacaoItem {
  id: number;
  comprado_em: string | null;
  valor_pago: number | null;
}

export interface IluminacaoCotacao {
  lighting_item_id: number;
  line_total: number;
  is_selected: boolean;
}

export type ComprasPatch = Pick<ShoppingItem, "comprado_em" | "valor_pago">;
