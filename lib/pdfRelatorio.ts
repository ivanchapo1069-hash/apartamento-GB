import { formatBRL, formatDataCurta, hojeISO, plural } from "./obra";
import { resumoOrcamento, statusEntrada } from "./orcamento";
import {
  abertoPorMes,
  comprometidoPorSecao,
  dataPorExtenso,
  pagamentosRealizados,
} from "./relatorio";
import type {
  IluminacaoCotacao,
  IluminacaoItem,
  ObraContrato,
  ObraParcela,
  OrcamentoEntrada,
  ShoppingItem,
} from "./types";

export interface DadosRelatorio {
  entradas: OrcamentoEntrada[];
  contratos: ObraContrato[];
  parcelas: ObraParcela[];
  itens: ShoppingItem[];
  iluminacaoItens: IluminacaoItem[];
  iluminacaoCotacoes: IluminacaoCotacao[];
  emitidoPor: string;
  hoje: string;
}

const VERDE: [number, number, number] = [20, 83, 45];
const TINTA: [number, number, number] = [28, 35, 31];
const CINZA: [number, number, number] = [91, 102, 94];
const LINHA: [number, number, number] = [215, 218, 214];

/**
 * Monta o PDF com jsPDF em vez de mandar a página para a impressora.
 * window.print() no Safari em tela cheia simplesmente não abre nada, e mesmo
 * quando abre exige salvar o arquivo e ir procurá-lo para compartilhar.
 * Aqui o arquivo já sai pronto para a folha de compartilhamento do sistema.
 *
 * As bibliotecas entram por import dinâmico: só quem aperta o botão paga o
 * download delas.
 */
export async function gerarPdfRelatorio(dados: DadosRelatorio): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const {
    entradas,
    contratos,
    parcelas,
    itens,
    iluminacaoItens,
    iluminacaoCotacoes,
    emitidoPor,
    hoje,
  } = dados;

  const resumo = resumoOrcamento(
    entradas,
    contratos,
    parcelas,
    itens,
    iluminacaoItens,
    iluminacaoCotacoes,
  );
  const pagamentos = pagamentosRealizados(contratos, parcelas, itens);
  const aberto = abertoPorMes(contratos, parcelas, hoje);
  const secoes = comprometidoPorSecao(itens);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margem = 14;
  const larguraUtil = larguraPagina - margem * 2;

  // ---------- cabeçalho ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...CINZA);
  doc.text("APARTAMENTO GB", margem, 18);

  doc.setFontSize(20);
  doc.setTextColor(...TINTA);
  doc.text("Prestação de contas", margem, 27);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...CINZA);
  doc.text(
    `Emitido em ${dataPorExtenso(hoje)}${emitidoPor ? ` por ${emitidoPor}` : ""}`,
    margem,
    33,
  );

  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.5);
  doc.line(margem, 36, margem + larguraUtil, 36);

  let y = 44;

  function titulo(texto: string, posY: number): number {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TINTA);
    doc.text(texto, margem, posY);
    return posY + 3;
  }

  const estiloBase = {
    font: "helvetica",
    fontSize: 9,
    cellPadding: { top: 2, right: 2, bottom: 2, left: 0 },
    textColor: TINTA,
    lineColor: LINHA,
    lineWidth: { top: 0, right: 0, bottom: 0.1, left: 0 },
  } as const;

  const estiloCabecalho = {
    font: "helvetica",
    fontStyle: "bold",
    fontSize: 7.5,
    textColor: CINZA,
    fillColor: false,
    lineColor: CINZA,
    lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 },
    cellPadding: { top: 0, right: 2, bottom: 1.5, left: 0 },
  } as const;

  const estiloRodape = {
    font: "helvetica",
    fontStyle: "bold",
    fontSize: 9,
    textColor: TINTA,
    fillColor: false,
    lineColor: CINZA,
    lineWidth: { top: 0.4, right: 0, bottom: 0, left: 0 },
    cellPadding: { top: 2, right: 2, bottom: 0, left: 0 },
  } as const;

  function depoisDaTabela(): number {
    const final = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    return (final?.finalY ?? y) + 9;
  }

  // ---------- resumo ----------
  y = titulo("Resumo", y);
  const destaques = new Set([2, 5, 6, 7]);
  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem },
    theme: "plain",
    // O total repetido em toda página faria a primeira parecer erro de conta,
    // e uma linha partida deixa a forma de pagamento órfã na página seguinte.
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    styles: estiloBase,
    columnStyles: { 1: { halign: "right" } },
    body: [
      ["Entradas já recebidas", formatBRL(resumo.entradasRecebidas)],
      ["Entradas previstas", formatBRL(resumo.entradasPrevistas)],
      ["Orçamento total", formatBRL(resumo.orcamentoTotal)],
      ["Já pago", formatBRL(resumo.realizado)],
      ["Ainda comprometido", formatBRL(resumo.comprometido)],
      ["Custo do projeto até aqui", formatBRL(resumo.totalProjeto)],
      ["Saldo em conta hoje", formatBRL(resumo.saldoReal)],
      [
        resumo.projetado < 0 ? "Estouro projetado" : "Sobra projetada",
        formatBRL(resumo.projetado),
      ],
    ],
    didParseCell: (data) => {
      if (data.section === "body" && destaques.has(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = depoisDaTabela();

  // ---------- entradas ----------
  y = titulo("Entradas", y);
  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem },
    theme: "plain",
    // O total repetido em toda página faria a primeira parecer erro de conta,
    // e uma linha partida deixa a forma de pagamento órfã na página seguinte.
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    styles: estiloBase,
    headStyles: estiloCabecalho,
    footStyles: estiloRodape,
    columnStyles: { 1: { cellWidth: 34 }, 2: { halign: "right", cellWidth: 32 } },
    head: [["De onde vem", "Situação", "Valor"]],
    body: entradas.map((entrada) => [
      entrada.origem ? `${entrada.descricao}\n${entrada.origem}` : entrada.descricao,
      statusEntrada(entrada, hoje).label,
      formatBRL(entrada.valor),
    ]),
    foot: [
      [
        `Recebido (${plural(entradas.filter((e) => e.recebido_em).length, "entrada", "entradas")})`,
        "",
        formatBRL(resumo.entradasRecebidas),
      ],
      [
        `Previsto (${plural(entradas.filter((e) => !e.recebido_em).length, "entrada", "entradas")})`,
        "",
        formatBRL(resumo.entradasPrevistas),
      ],
    ],
  });
  y = depoisDaTabela();

  // ---------- pagamentos ----------
  y = titulo("Pagamentos realizados", y);
  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem },
    theme: "plain",
    // O total repetido em toda página faria a primeira parecer erro de conta,
    // e uma linha partida deixa a forma de pagamento órfã na página seguinte.
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    styles: estiloBase,
    headStyles: estiloCabecalho,
    footStyles: estiloRodape,
    columnStyles: {
      0: { cellWidth: 16 },
      3: { halign: "right", cellWidth: 32 },
    },
    head: [["Data", "A quem", "Referente a", "Pago"]],
    body: pagamentos.map((p) => {
      const notas = [p.forma];
      if (Math.abs(p.valorPago - p.valorCombinado) >= 0.01) {
        notas.push(`combinado ${formatBRL(p.valorCombinado)}`);
      }
      const detalhe = notas.filter(Boolean).join(" · ");
      return [
        formatDataCurta(p.data),
        p.aQuem,
        detalhe ? `${p.descricao}\n${detalhe}` : p.descricao,
        formatBRL(p.valorPago),
      ];
    }),
    foot: [["Total pago", "", "", formatBRL(resumo.realizado)]],
  });
  y = depoisDaTabela();

  // ---------- em aberto ----------
  y = titulo("Em aberto, mês a mês", y);
  const linhasAberto = aberto.meses.map((mes) => [
    mes.vencido ? `${mes.rotulo} (vencido)` : mes.rotulo,
    String(mes.qtd),
    formatBRL(mes.valor),
  ]);
  if (aberto.semData.qtd > 0) {
    linhasAberto.push([
      "Sem data (aguardando entrega)",
      String(aberto.semData.qtd),
      formatBRL(aberto.semData.valor),
    ]);
  }
  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem },
    theme: "plain",
    // O total repetido em toda página faria a primeira parecer erro de conta,
    // e uma linha partida deixa a forma de pagamento órfã na página seguinte.
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    styles: estiloBase,
    headStyles: estiloCabecalho,
    footStyles: estiloRodape,
    columnStyles: { 1: { halign: "right", cellWidth: 24 }, 2: { halign: "right", cellWidth: 32 } },
    head: [["Mês", "Parcelas", "Valor"]],
    body: linhasAberto.length ? linhasAberto : [["Nenhuma parcela em aberto", "", ""]],
    foot: [["Total em aberto nos contratos", "", formatBRL(aberto.total)]],
  });
  y = depoisDaTabela();

  // ---------- compras ----------
  y = titulo("Compras escolhidas e ainda não pagas", y);
  const linhasCompras = secoes.map((secao) => [
    secao.semPreco > 0
      ? `${secao.secao}\n${secao.semPreco} sem cotação, fora do valor ao lado`
      : secao.secao,
    String(secao.qtd),
    formatBRL(secao.valor),
  ]);
  linhasCompras.push([
    "Luminárias do projeto de iluminação\nlista própria, sem controle de compra no app",
    String(iluminacaoItens.length),
    formatBRL(resumo.comprometidoIluminacao),
  ]);
  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem },
    theme: "plain",
    // O total repetido em toda página faria a primeira parecer erro de conta,
    // e uma linha partida deixa a forma de pagamento órfã na página seguinte.
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    styles: estiloBase,
    headStyles: estiloCabecalho,
    footStyles: estiloRodape,
    columnStyles: { 1: { halign: "right", cellWidth: 20 }, 2: { halign: "right", cellWidth: 32 } },
    head: [["Ambiente", "Itens", "Cotado"]],
    body: linhasCompras,
    foot: [
      [
        "Total escolhido e não pago",
        "",
        formatBRL(resumo.comprometidoCompras + resumo.comprometidoIluminacao),
      ],
    ],
  });
  y = depoisDaTabela();

  // ---------- o que ainda não se sabe ----------
  if (resumo.itensSemPreco > 0) {
    if (y > doc.internal.pageSize.getHeight() - 45) {
      doc.addPage();
      y = 20;
    }
    y = titulo("O que ainda não se sabe", y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    const texto = doc.splitTextToSize(
      `${plural(resumo.itensSemPreco, "item ainda sem cotação", "itens ainda sem cotação")} — concentrados nos ambientes marcados acima. Eles estão fora de todos os números deste relatório: não valem R$ 0, apenas ainda não têm preço. O custo do projeto vai subir quando entrarem.`,
      larguraUtil - 6,
    );
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.2);
    doc.rect(margem, y + 1, larguraUtil, texto.length * 4.4 + 6);
    doc.text(texto, margem + 3, y + 7);
  }

  // ---------- rodapé em todas as páginas ----------
  const totalPaginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);
    const alturaPagina = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text(
      `Gerado pelo app Apartamento GB em ${dataPorExtenso(hoje)}. Valores em aberto são previsões.`,
      margem,
      alturaPagina - 8,
    );
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...VERDE);
    doc.text(`${pagina}/${totalPaginas}`, larguraPagina - margem, alturaPagina - 8, {
      align: "right",
    });
  }

  return doc.output("blob");
}

export function nomeArquivoRelatorio(hoje: string = hojeISO()): string {
  return `prestacao-de-contas-apartamento-gb-${hoje}.pdf`;
}
