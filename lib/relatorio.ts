import { hojeISO, parseDataISO } from "./obra";
import { sortSections } from "./sections";
import type { ObraContrato, ObraParcela, ShoppingItem } from "./types";

function num(valor: number | string | null | undefined): number {
  return Number(valor ?? 0) || 0;
}

const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split("-");
  const indice = Number(mes) - 1;
  return `${MESES_CURTOS[indice] ?? mes}/${ano}`;
}

export interface PagamentoRealizado {
  chave: string;
  data: string;
  aQuem: string;
  descricao: string;
  valorPago: number;
  /** O que estava combinado. Diferente do pago = renegociação ou erro de lançamento. */
  valorCombinado: number;
  forma: string | null;
  origem: "obra" | "compra";
}

/**
 * Funde parcelas pagas e itens comprados numa única lista cronológica — é assim
 * que quem lê uma prestação de contas espera ver: por data, não por origem.
 */
export function pagamentosRealizados(
  contratos: ObraContrato[],
  parcelas: ObraParcela[],
  itens: ShoppingItem[],
): PagamentoRealizado[] {
  const porContrato = new Map(contratos.map((c) => [c.id, c]));
  const linhas: PagamentoRealizado[] = [];

  for (const parcela of parcelas) {
    if (!parcela.pago_em) continue;
    const contrato = porContrato.get(parcela.contrato_id);
    if (!contrato || contrato.status === "cancelado") continue;
    linhas.push({
      chave: `parcela-${parcela.id}`,
      data: parcela.pago_em,
      aQuem: contrato.fornecedor,
      descricao: parcela.descricao,
      valorPago: num(parcela.valor_pago ?? parcela.valor),
      valorCombinado: num(parcela.valor),
      forma: parcela.forma_pagamento,
      origem: "obra",
    });
  }

  for (const item of itens) {
    if (!item.comprado_em || item.decision !== "FICA") continue;
    linhas.push({
      chave: `item-${item.id}`,
      data: item.comprado_em,
      aQuem: item.quote_store ?? "Compra",
      descricao: item.item,
      valorPago: num(item.valor_pago ?? item.quote_price),
      valorCombinado: num(item.quote_price),
      forma: null,
      origem: "compra",
    });
  }

  return linhas.sort((a, b) => a.data.localeCompare(b.data));
}

export interface MesEmAberto {
  chave: string;
  rotulo: string;
  qtd: number;
  valor: number;
  /** Vencimento já passou e não foi pago. */
  vencido: boolean;
}

export interface AbertoPorMes {
  meses: MesEmAberto[];
  /** Parcelas por marco cuja entrega ainda não aconteceu: não têm data. */
  semData: { qtd: number; valor: number };
  total: number;
}

export function abertoPorMes(
  contratos: ObraContrato[],
  parcelas: ObraParcela[],
  hoje: string = hojeISO(),
): AbertoPorMes {
  const ativos = new Set(
    contratos.filter((c) => c.status !== "cancelado").map((c) => c.id),
  );
  const mapa = new Map<string, { qtd: number; valor: number }>();
  const semData = { qtd: 0, valor: 0 };
  let total = 0;

  for (const parcela of parcelas) {
    if (parcela.pago_em || !ativos.has(parcela.contrato_id)) continue;
    const valor = num(parcela.valor);
    total += valor;

    const vencimento =
      parcela.gatilho === "data"
        ? parcela.vencimento
        : parcela.marco_entregue_em
          ? parcela.marco_entregue_em
          : null;

    if (!vencimento) {
      semData.qtd += 1;
      semData.valor += valor;
      continue;
    }

    const chave = vencimento.slice(0, 7);
    const atual = mapa.get(chave) ?? { qtd: 0, valor: 0 };
    mapa.set(chave, { qtd: atual.qtd + 1, valor: atual.valor + valor });
  }

  const mesAtual = hoje.slice(0, 7);
  const meses = [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([chave, dados]) => ({
      chave,
      rotulo: rotuloMes(chave),
      qtd: dados.qtd,
      valor: dados.valor,
      vencido: chave < mesAtual,
    }));

  return { meses, semData, total };
}

export interface SecaoComprometida {
  secao: string;
  qtd: number;
  valor: number;
  semPreco: number;
}

/**
 * Agrupa por ambiente em vez de listar os 36 itens um a um: 36 linhas soltas
 * incham o PDF sem informar nada a quem está lendo a prestação de contas.
 */
export function comprometidoPorSecao(itens: ShoppingItem[]): SecaoComprometida[] {
  const mapa = new Map<string, SecaoComprometida>();

  for (const item of itens) {
    if (item.decision !== "FICA" || item.comprado_em) continue;
    const secao = item.section || "Sem seção";
    const atual =
      mapa.get(secao) ?? { secao, qtd: 0, valor: 0, semPreco: 0 };
    atual.qtd += 1;
    if (item.quote_price === null || item.quote_price === undefined) atual.semPreco += 1;
    else atual.valor += num(item.quote_price);
    mapa.set(secao, atual);
  }

  return sortSections([...mapa.keys()]).map((secao) => mapa.get(secao) as SecaoComprometida);
}

export function dataPorExtenso(iso: string = hojeISO()): string {
  return parseDataISO(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
