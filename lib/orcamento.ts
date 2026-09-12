import {
  agendaPagamentos,
  diffDias,
  formatDataCurta,
  hojeISO,
  plural,
} from "./obra";
import type {
  EntradaStatus,
  EntradaStatusKey,
  IluminacaoCotacao,
  IluminacaoItem,
  ObraContrato,
  ObraParcela,
  OrcamentoEntrada,
  ShoppingItem,
} from "./types";

/**
 * Mesma regra da parcela: o aporte guarda apenas `recebido_em`. Se a data
 * prevista passou e o dinheiro não caiu, isso é atraso — calculado, não digitado.
 */
export function statusEntrada(
  entrada: OrcamentoEntrada,
  hoje: string = hojeISO(),
): EntradaStatus {
  if (entrada.recebido_em) {
    return { key: "recebido", label: `Recebido ${formatDataCurta(entrada.recebido_em)}` };
  }
  if (!entrada.data_prevista) {
    return { key: "previsto", label: "Previsto, sem data" };
  }
  const dias = diffDias(entrada.data_prevista, hoje);
  if (dias < 0) {
    return { key: "atrasado", label: `Atrasado há ${plural(-dias, "dia", "dias")}` };
  }
  if (dias === 0) {
    return { key: "previsto", label: "Previsto para hoje" };
  }
  return { key: "previsto", label: `Previsto ${formatDataCurta(entrada.data_prevista)}` };
}

export const CHIP_POR_ENTRADA: Record<EntradaStatusKey, string> = {
  recebido: "obra-chip--pago",
  atrasado: "obra-chip--atrasado",
  previsto: "obra-chip--avencer",
};

function num(valor: number | string | null | undefined): number {
  return Number(valor ?? 0) || 0;
}

export interface ResumoOrcamento {
  /** Dinheiro que já caiu na conta. */
  entradasRecebidas: number;
  /** Aportes ainda por vir. */
  entradasPrevistas: number;
  /** Recebido + previsto: tudo que existe para gastar. */
  orcamentoTotal: number;

  realizadoObra: number;
  realizadoCompras: number;
  realizadoIluminacao: number;
  /** O que já saiu da conta, somando as três fontes. */
  realizado: number;

  comprometidoObra: number;
  comprometidoCompras: number;
  comprometidoIluminacao: number;
  /** Contratado ou escolhido, mas ainda não pago. */
  comprometido: number;

  /** Realizado + comprometido: o custo do projeto até onde se sabe hoje. */
  totalProjeto: number;
  /** Recebido − realizado: quanto sobra na conta agora. */
  saldoReal: number;
  /** Orçamento − total do projeto. Negativo = estouro. */
  projetado: number;

  /**
   * Itens que ficam mas ainda não têm preço. Nunca entram nas somas como zero —
   * um projetado que trata buraco como R$ 0 mente a favor de quem lê.
   */
  itensSemPreco: number;
  temEntradas: boolean;
}

export function resumoOrcamento(
  entradas: OrcamentoEntrada[],
  contratos: ObraContrato[],
  parcelas: ObraParcela[],
  itens: ShoppingItem[],
  iluminacaoItens: IluminacaoItem[],
  iluminacaoCotacoes: IluminacaoCotacao[],
): ResumoOrcamento {
  let entradasRecebidas = 0;
  let entradasPrevistas = 0;
  for (const entrada of entradas) {
    if (entrada.recebido_em) entradasRecebidas += num(entrada.valor);
    else entradasPrevistas += num(entrada.valor);
  }

  const contratosAtivos = new Set(
    contratos.filter((c) => c.status !== "cancelado").map((c) => c.id),
  );

  let realizadoObra = 0;
  let comprometidoObra = 0;
  for (const parcela of parcelas) {
    if (!contratosAtivos.has(parcela.contrato_id)) continue;
    if (parcela.pago_em) realizadoObra += num(parcela.valor_pago ?? parcela.valor);
    else comprometidoObra += num(parcela.valor);
  }

  let realizadoCompras = 0;
  let comprometidoCompras = 0;
  let itensSemPreco = 0;
  for (const item of itens) {
    if (item.decision !== "FICA") continue;
    if (item.comprado_em) {
      realizadoCompras += num(item.valor_pago ?? item.quote_price);
      continue;
    }
    if (item.quote_price === null || item.quote_price === undefined) {
      itensSemPreco += 1;
      continue;
    }
    comprometidoCompras += num(item.quote_price);
  }

  const totalSelecionadoPorItem = new Map<number, number>();
  for (const cotacao of iluminacaoCotacoes) {
    if (!cotacao.is_selected) continue;
    const atual = totalSelecionadoPorItem.get(cotacao.lighting_item_id) ?? 0;
    totalSelecionadoPorItem.set(cotacao.lighting_item_id, atual + num(cotacao.line_total));
  }

  let realizadoIluminacao = 0;
  let comprometidoIluminacao = 0;
  for (const item of iluminacaoItens) {
    const selecionado = totalSelecionadoPorItem.get(item.id) ?? 0;
    if (item.comprado_em) realizadoIluminacao += num(item.valor_pago ?? selecionado);
    else comprometidoIluminacao += selecionado;
  }

  const realizado = realizadoObra + realizadoCompras + realizadoIluminacao;
  const comprometido = comprometidoObra + comprometidoCompras + comprometidoIluminacao;
  const orcamentoTotal = entradasRecebidas + entradasPrevistas;
  const totalProjeto = realizado + comprometido;

  return {
    entradasRecebidas,
    entradasPrevistas,
    orcamentoTotal,
    realizadoObra,
    realizadoCompras,
    realizadoIluminacao,
    realizado,
    comprometidoObra,
    comprometidoCompras,
    comprometidoIluminacao,
    comprometido,
    totalProjeto,
    saldoReal: entradasRecebidas - realizado,
    projetado: orcamentoTotal - totalProjeto,
    itensSemPreco,
    temEntradas: entradas.length > 0,
  };
}

export interface Cobertura {
  vencendo: number;
  saldoReal: number;
  cobre: boolean;
  falta: number;
  qtdParcelas: number;
}

/**
 * A conta que evita a dor real: o dinheiro em conta cobre o que vence nos
 * próximos 30 dias? Só considera parcelas de obra, que são as que têm data.
 */
export function coberturaProximos30(
  contratos: ObraContrato[],
  parcelas: ObraParcela[],
  saldoReal: number,
  hoje: string = hojeISO(),
): Cobertura {
  const agenda = agendaPagamentos(contratos, parcelas, 30, hoje);
  const vencendo = agenda.reduce((total, item) => total + num(item.parcela.valor), 0);
  return {
    vencendo,
    saldoReal,
    cobre: saldoReal >= vencendo,
    falta: Math.max(0, vencendo - saldoReal),
    qtdParcelas: agenda.length,
  };
}

/** Quanto se economizou (positivo) ou estourou (negativo) no que já foi comprado. */
export function desvioCompras(itens: ShoppingItem[]): { desvio: number; qtd: number } {
  let desvio = 0;
  let qtd = 0;
  for (const item of itens) {
    if (!item.comprado_em || item.quote_price === null || item.valor_pago === null) continue;
    desvio += num(item.quote_price) - num(item.valor_pago);
    qtd += 1;
  }
  return { desvio, qtd };
}

export const ORIGENS_ENTRADA = [
  "Poupança",
  "Salário",
  "13º",
  "Venda de bem",
  "Financiamento",
  "Família",
  "Investimentos",
  "Outros",
];
