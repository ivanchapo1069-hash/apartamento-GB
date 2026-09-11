import type { ObraContrato, ObraParcela, ParcelaStatus, ParcelaStatusKey } from "./types";

const DIA_MS = 86_400_000;

/**
 * Datas de vencimento são `date` no Postgres ("2026-09-07"), sem fuso.
 * `new Date("2026-09-07")` é meia-noite UTC — no horário de Brasília isso vira
 * dia 06 às 21h, e a tela mostraria a data errada. Ancorar ao meio-dia local
 * resolve sem depender de biblioteca.
 */
export function parseDataISO(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function hojeISO(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function somaDias(iso: string, dias: number): string {
  const d = new Date(parseDataISO(iso).getTime() + dias * DIA_MS);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function somaMeses(iso: string, meses: number): string {
  const base = parseDataISO(iso);
  const diaDesejado = base.getDate();
  const d = new Date(base.getFullYear(), base.getMonth() + meses, 1, 12, 0, 0);
  const ultimoDiaDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(diaDesejado, ultimoDiaDoMes));
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Dias de `iso` em relação a `referencia`. Negativo = já passou. */
export function diffDias(iso: string, referencia: string): number {
  return Math.round((parseDataISO(iso).getTime() - parseDataISO(referencia).getTime()) / DIA_MS);
}

/**
 * Quando a parcela realmente vence.
 * Parcela por marco só ganha vencimento depois que a entrega acontece —
 * até lá ela não pode estar atrasada.
 */
export function vencimentoEfetivo(parcela: ObraParcela): string | null {
  if (parcela.gatilho === "data") return parcela.vencimento;
  if (!parcela.marco_entregue_em) return null;
  return somaDias(parcela.marco_entregue_em, parcela.prazo_dias ?? 0);
}

/**
 * O coração do modelo: nenhum destes estados é gravado no banco.
 * A parcela guarda fatos (pago_em, vencimento, marco_entregue_em) e o status
 * é calculado toda vez que a tela desenha — assim ela nunca fica desatualizada.
 */
export function statusParcela(parcela: ObraParcela, hoje: string = hojeISO()): ParcelaStatus {
  if (parcela.pago_em) {
    return { key: "pago", label: "Pago", vencimento: vencimentoEfetivo(parcela), dias: null };
  }

  const vencimento = vencimentoEfetivo(parcela);
  if (!vencimento) {
    return { key: "aguardando", label: "Aguardando entrega", vencimento: null, dias: null };
  }

  const dias = diffDias(vencimento, hoje);
  if (dias < 0) {
    return { key: "atrasado", label: `Atrasado há ${plural(-dias, "dia", "dias")}`, vencimento, dias };
  }
  if (dias === 0) {
    return { key: "atrasado", label: "Vence hoje", vencimento, dias };
  }
  if (dias <= 7) {
    return { key: "proximo", label: `Vence em ${plural(dias, "dia", "dias")}`, vencimento, dias };
  }
  return { key: "avencer", label: `Vence em ${formatDataCurta(vencimento)}`, vencimento, dias };
}

export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompacto = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function formatBRL(valor: number | null | undefined): string {
  return brl.format(Number(valor ?? 0));
}

export function formatBRLCompacto(valor: number | null | undefined): string {
  return brlCompacto.format(Number(valor ?? 0));
}

export function formatDataCurta(iso: string | null): string {
  if (!iso) return "—";
  return parseDataISO(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatDataLonga(iso: string | null): string {
  if (!iso) return "—";
  return parseDataISO(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function valorEfetivoPago(parcela: ObraParcela): number {
  return Number(parcela.valor_pago ?? parcela.valor ?? 0);
}

export interface ResumoContrato {
  pago: number;
  aberto: number;
  vencido: number;
  qtdPagas: number;
  qtdTotal: number;
  percentual: number;
  somaParcelas: number;
  /** Diferença entre o valor do contrato e a soma das parcelas. 0 = bate. */
  diferenca: number;
  temAtraso: boolean;
}

export function resumoContrato(
  contrato: ObraContrato,
  parcelas: ObraParcela[],
  hoje: string = hojeISO(),
): ResumoContrato {
  let pago = 0;
  let vencido = 0;
  let qtdPagas = 0;
  let somaParcelas = 0;
  let temAtraso = false;

  for (const parcela of parcelas) {
    somaParcelas += Number(parcela.valor ?? 0);
    if (parcela.pago_em) {
      pago += valorEfetivoPago(parcela);
      qtdPagas += 1;
      continue;
    }
    if (statusParcela(parcela, hoje).key === "atrasado") {
      vencido += Number(parcela.valor ?? 0);
      temAtraso = true;
    }
  }

  const total = Number(contrato.valor_total ?? 0);
  return {
    pago,
    aberto: total - pago,
    vencido,
    qtdPagas,
    qtdTotal: parcelas.length,
    percentual: total > 0 ? Math.min(100, Math.round((pago / total) * 100)) : 0,
    somaParcelas,
    diferenca: Math.round((total - somaParcelas) * 100) / 100,
    temAtraso,
  };
}

export interface ResumoGeral {
  contratado: number;
  pago: number;
  aberto: number;
  vencido: number;
  qtdContratos: number;
  qtdVencidas: number;
  qtdAbertas: number;
  percentualPago: number;
}

export function resumoGeral(
  contratos: ObraContrato[],
  parcelas: ObraParcela[],
  hoje: string = hojeISO(),
): ResumoGeral {
  const ativos = contratos.filter((c) => c.status !== "cancelado");
  const idsAtivos = new Set(ativos.map((c) => c.id));
  const doEscopo = parcelas.filter((p) => idsAtivos.has(p.contrato_id));

  const contratado = ativos.reduce((total, c) => total + Number(c.valor_total ?? 0), 0);
  let pago = 0;
  let vencido = 0;
  let qtdVencidas = 0;
  let qtdAbertas = 0;

  for (const parcela of doEscopo) {
    if (parcela.pago_em) {
      pago += valorEfetivoPago(parcela);
      continue;
    }
    qtdAbertas += 1;
    if (statusParcela(parcela, hoje).key === "atrasado") {
      vencido += Number(parcela.valor ?? 0);
      qtdVencidas += 1;
    }
  }

  return {
    contratado,
    pago,
    aberto: contratado - pago,
    vencido,
    qtdContratos: ativos.length,
    qtdVencidas,
    qtdAbertas,
    percentualPago: contratado > 0 ? Math.round((pago / contratado) * 100) : 0,
  };
}

export interface ItemAgenda {
  parcela: ObraParcela;
  contrato: ObraContrato;
  status: ParcelaStatus;
}

/** Vencidas + a vencer nos próximos `dias`, em ordem cronológica. */
export function agendaPagamentos(
  contratos: ObraContrato[],
  parcelas: ObraParcela[],
  dias = 30,
  hoje: string = hojeISO(),
): ItemAgenda[] {
  const porId = new Map(contratos.map((c) => [c.id, c]));
  const limite = somaDias(hoje, dias);

  return parcelas
    .filter((p) => !p.pago_em)
    .map((parcela) => ({
      parcela,
      contrato: porId.get(parcela.contrato_id),
      status: statusParcela(parcela, hoje),
    }))
    .filter(
      (item): item is ItemAgenda =>
        Boolean(item.contrato) &&
        item.contrato?.status !== "cancelado" &&
        Boolean(item.status.vencimento) &&
        diffDias(item.status.vencimento as string, limite) <= 0,
    )
    .sort((a, b) =>
      (a.status.vencimento as string).localeCompare(b.status.vencimento as string),
    );
}

export const FILTROS_OBRA: { key: ObraFiltro; label: string }[] = [
  { key: "todos", label: "Todas" },
  { key: "atrasado", label: "Atrasadas" },
  { key: "proximos30", label: "Próximos 30 dias" },
  { key: "aguardando", label: "Aguardando entrega" },
  { key: "pago", label: "Pagas" },
];

export type ObraFiltro = "todos" | "atrasado" | "proximos30" | "aguardando" | "pago";

export function parcelaPassaNoFiltro(
  parcela: ObraParcela,
  filtro: ObraFiltro,
  hoje: string = hojeISO(),
): boolean {
  if (filtro === "todos") return true;
  const status = statusParcela(parcela, hoje);
  if (filtro === "pago") return status.key === "pago";
  if (filtro === "atrasado") return status.key === "atrasado";
  if (filtro === "aguardando") return status.key === "aguardando";
  if (filtro === "proximos30") {
    if (status.key === "pago" || !status.vencimento) return false;
    const dias = diffDias(status.vencimento, hoje);
    return dias >= 0 && dias <= 30;
  }
  return true;
}

export const CATEGORIAS_OBRA = [
  "Projeto de interiores",
  "Marcenaria planejada",
  "Obra civil",
  "Elétrica",
  "Hidráulica",
  "Climatização",
  "Vidraçaria",
  "Serralheria",
  "Pintura",
  "Gesso e forro",
  "Mármore e granito",
  "Outros",
];

export const FORMAS_PAGAMENTO = [
  "PIX",
  "Transferência",
  "Boleto",
  "Cartão",
  "Dinheiro",
  "Cheque",
];

export const STATUS_CONTRATO: { key: ObraContrato["status"]; label: string }[] = [
  { key: "ativo", label: "Ativo" },
  { key: "concluido", label: "Concluído" },
  { key: "cancelado", label: "Cancelado" },
];

export interface NovaParcela {
  numero: number;
  descricao: string;
  valor: number;
  gatilho: ObraParcela["gatilho"];
  vencimento: string | null;
  marco_descricao: string | null;
  prazo_dias: number;
}

export interface PlanoParcelamento {
  valorTotal: number;
  entradaPercentual: number;
  entradaVencimento: string;
  quantidade: number;
  primeiroVencimento: string;
}

/**
 * Gera o parcelamento mais comum em obra: uma entrada em percentual e N parcelas
 * mensais iguais. A sobra dos centavos vai para a última parcela, para a soma
 * fechar exatamente com o valor do contrato.
 */
export function gerarParcelas(plano: PlanoParcelamento): NovaParcela[] {
  const total = Math.round(Number(plano.valorTotal || 0) * 100);
  if (total <= 0) return [];

  const parcelas: NovaParcela[] = [];
  const percentual = Math.min(100, Math.max(0, Number(plano.entradaPercentual || 0)));
  const entrada = Math.round((total * percentual) / 100);
  const quantidade = Math.max(0, Math.floor(Number(plano.quantidade || 0)));

  if (entrada > 0) {
    parcelas.push({
      numero: 1,
      descricao: `Entrada (${percentual}%)`,
      valor: entrada / 100,
      gatilho: "data",
      vencimento: plano.entradaVencimento,
      marco_descricao: null,
      prazo_dias: 0,
    });
  }

  const restante = total - entrada;
  if (quantidade > 0 && restante > 0) {
    const base = Math.floor(restante / quantidade);
    for (let i = 0; i < quantidade; i += 1) {
      const ultima = i === quantidade - 1;
      parcelas.push({
        numero: parcelas.length + 1,
        descricao: `Parcela ${i + 1} de ${quantidade}`,
        valor: (ultima ? restante - base * (quantidade - 1) : base) / 100,
        gatilho: "data",
        vencimento: somaMeses(plano.primeiroVencimento, i),
        marco_descricao: null,
        prazo_dias: 0,
      });
    }
  } else if (restante > 0) {
    parcelas.push({
      numero: parcelas.length + 1,
      descricao: "Saldo",
      valor: restante / 100,
      gatilho: "data",
      vencimento: plano.primeiroVencimento,
      marco_descricao: null,
      prazo_dias: 0,
    });
  }

  return parcelas;
}

export const CHIP_POR_STATUS: Record<ParcelaStatusKey, string> = {
  pago: "obra-chip--pago",
  atrasado: "obra-chip--atrasado",
  proximo: "obra-chip--proximo",
  aguardando: "obra-chip--aguardando",
  avencer: "obra-chip--avencer",
};
