"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatBRL, formatDataCurta, hojeISO, plural } from "@/lib/obra";
import { resumoOrcamento, statusEntrada } from "@/lib/orcamento";
import {
  abertoPorMes,
  comprometidoPorSecao,
  dataPorExtenso,
  pagamentosRealizados,
} from "@/lib/relatorio";
import { gerarPdfRelatorio, nomeArquivoRelatorio } from "@/lib/pdfRelatorio";
import type {
  IluminacaoCotacao,
  IluminacaoItem,
  ObraContrato,
  ObraParcela,
  OrcamentoEntrada,
  ShoppingItem,
} from "@/lib/types";

const USER_STORAGE_KEY = "gb-current-user";

export default function RelatorioView() {
  const [entradas, setEntradas] = useState<OrcamentoEntrada[]>([]);
  const [contratos, setContratos] = useState<ObraContrato[]>([]);
  const [parcelas, setParcelas] = useState<ObraParcela[]>([]);
  const [itens, setItens] = useState<ShoppingItem[]>([]);
  const [iluminacaoItens, setIluminacaoItens] = useState<IluminacaoItem[]>([]);
  const [iluminacaoCotacoes, setIluminacaoCotacoes] = useState<IluminacaoCotacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [emitidoPor, setEmitidoPor] = useState("");
  const [gerando, setGerando] = useState(false);
  const [avisoPdf, setAvisoPdf] = useState("");
  const [podeCompartilhar, setPodeCompartilhar] = useState(false);

  // A folha de compartilhamento do sistema (onde mora o WhatsApp) só aceita
  // arquivo em navegador com Web Share nível 2. Onde não houver, o botão baixa.
  useEffect(() => {
    try {
      const teste = new File(["teste"], "teste.pdf", { type: "application/pdf" });
      setPodeCompartilhar(Boolean(navigator.canShare?.({ files: [teste] })));
    } catch {
      setPodeCompartilhar(false);
    }
  }, []);

  const hoje = hojeISO();

  useEffect(() => {
    try {
      setEmitidoPor(window.localStorage.getItem(USER_STORAGE_KEY) ?? "");
    } catch {
      // localStorage indisponível — o relatório sai sem o nome de quem emitiu
    }
  }, []);

  const carregar = useCallback(async () => {
    const [resEntradas, resContratos, resParcelas, resItens, resIlum, resIlumCot] =
      await Promise.all([
        supabase.from("orcamento_entradas").select("*").order("id", { ascending: true }),
        supabase.from("obra_contratos").select("*").order("id", { ascending: true }),
        supabase.from("obra_parcelas").select("*").order("id", { ascending: true }),
        supabase
          .from("shopping_items")
          .select("id, section, item, decision, quote_price, quote_store, comprado_em, valor_pago")
          .eq("decision", "FICA"),
        supabase.from("lighting_items").select("id, comprado_em, valor_pago"),
        supabase
          .from("lighting_item_quotes")
          .select("lighting_item_id, line_total, is_selected")
          .eq("is_selected", true),
      ]);

    if ([resEntradas, resContratos, resParcelas, resItens, resIlum, resIlumCot].some((r) => r.error)) {
      setErro("Não foi possível montar o relatório. Tente novamente em instantes.");
    } else {
      setEntradas((resEntradas.data ?? []) as OrcamentoEntrada[]);
      setContratos((resContratos.data ?? []) as ObraContrato[]);
      setParcelas((resParcelas.data ?? []) as ObraParcela[]);
      setItens((resItens.data ?? []) as ShoppingItem[]);
      setIluminacaoItens((resIlum.data ?? []) as IluminacaoItem[]);
      setIluminacaoCotacoes((resIlumCot.data ?? []) as IluminacaoCotacao[]);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const resumo = useMemo(
    () => resumoOrcamento(entradas, contratos, parcelas, itens, iluminacaoItens, iluminacaoCotacoes),
    [entradas, contratos, parcelas, itens, iluminacaoItens, iluminacaoCotacoes],
  );

  const pagamentos = useMemo(
    () => pagamentosRealizados(contratos, parcelas, itens),
    [contratos, parcelas, itens],
  );

  const aberto = useMemo(() => abertoPorMes(contratos, parcelas, hoje), [contratos, parcelas, hoje]);
  const secoes = useMemo(() => comprometidoPorSecao(itens), [itens]);

  const recebidas = entradas.filter((e) => e.recebido_em);
  const previstas = entradas.filter((e) => !e.recebido_em);

  function baixar(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function compartilharPdf() {
    setGerando(true);
    setAvisoPdf("");
    try {
      const blob = await gerarPdfRelatorio({
        entradas,
        contratos,
        parcelas,
        itens,
        iluminacaoItens,
        iluminacaoCotacoes,
        emitidoPor,
        hoje,
      });
      const nome = nomeArquivoRelatorio(hoje);
      const arquivo = new File([blob], nome, { type: "application/pdf" });

      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({
            files: [arquivo],
            title: "Prestação de contas — Apartamento GB",
          });
          return;
        } catch (erro) {
          // Cancelar a folha de compartilhamento não é erro: não vira download.
          if ((erro as Error)?.name === "AbortError") return;
          setAvisoPdf("Não deu para abrir o compartilhamento. O PDF foi baixado.");
        }
      }

      baixar(blob, nome);
    } catch {
      setAvisoPdf("Não deu para gerar o PDF. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  if (carregando) {
    return <p className="status-message">Montando o relatório...</p>;
  }

  return (
    <main className="rel">
      <div className="rel-acoes">
        <a className="obra-btn obra-btn--mini" href="/">
          ← Voltar ao app
        </a>
        <button
          type="button"
          className="obra-btn obra-btn--primario"
          disabled={gerando}
          onClick={compartilharPdf}
        >
          {gerando
            ? "Gerando PDF..."
            : podeCompartilhar
              ? "Compartilhar PDF"
              : "Baixar PDF"}
        </button>
      </div>

      {avisoPdf && <p className="rel-aviso-pdf">{avisoPdf}</p>}

      {erro && <p className="status-message status-message--error">{erro}</p>}

      <header className="rel-cabecalho">
        <p className="rel-eyebrow">Apartamento GB</p>
        <h1>Prestação de contas</h1>
        <p className="rel-meta">
          Emitido em {dataPorExtenso(hoje)}
          {emitidoPor ? ` por ${emitidoPor}` : ""}
        </p>
      </header>

      <section className="rel-secao">
        <h2>Resumo</h2>
        <table className="rel-tabela rel-tabela--resumo">
          <tbody>
            <tr>
              <td>Entradas já recebidas</td>
              <td>{formatBRL(resumo.entradasRecebidas)}</td>
            </tr>
            <tr>
              <td>Entradas previstas</td>
              <td>{formatBRL(resumo.entradasPrevistas)}</td>
            </tr>
            <tr className="rel-destaque">
              <td>Orçamento total</td>
              <td>{formatBRL(resumo.orcamentoTotal)}</td>
            </tr>
            <tr>
              <td>Já pago</td>
              <td>{formatBRL(resumo.realizado)}</td>
            </tr>
            <tr>
              <td>Ainda comprometido</td>
              <td>{formatBRL(resumo.comprometido)}</td>
            </tr>
            <tr className="rel-destaque">
              <td>Custo do projeto até aqui</td>
              <td>{formatBRL(resumo.totalProjeto)}</td>
            </tr>
            <tr className="rel-destaque">
              <td>Saldo em conta hoje</td>
              <td>{formatBRL(resumo.saldoReal)}</td>
            </tr>
            <tr className="rel-destaque">
              <td>{resumo.projetado < 0 ? "Estouro projetado" : "Sobra projetada"}</td>
              <td>{formatBRL(resumo.projetado)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rel-secao">
        <h2>Entradas</h2>
        {entradas.length === 0 ? (
          <p className="rel-vazio">Nenhuma entrada lançada.</p>
        ) : (
          <table className="rel-tabela">
            <thead>
              <tr>
                <th>De onde vem</th>
                <th>Situação</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((entrada) => {
                const status = statusEntrada(entrada, hoje);
                return (
                  <tr key={entrada.id}>
                    <td>
                      {entrada.descricao}
                      {entrada.origem && <small className="rel-nota">{entrada.origem}</small>}
                    </td>
                    <td>
                      <span className={`rel-marca rel-marca--${status.key}`}>{status.label}</span>
                    </td>
                    <td className="num">{formatBRL(entrada.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  Recebido ({plural(recebidas.length, "entrada", "entradas")})
                </td>
                <td className="num">{formatBRL(resumo.entradasRecebidas)}</td>
              </tr>
              <tr>
                <td colSpan={2}>
                  Previsto ({plural(previstas.length, "entrada", "entradas")})
                </td>
                <td className="num">{formatBRL(resumo.entradasPrevistas)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section className="rel-secao">
        <h2>Pagamentos realizados</h2>
        {pagamentos.length === 0 ? (
          <p className="rel-vazio">Nenhum pagamento registrado.</p>
        ) : (
          <table className="rel-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>A quem</th>
                <th>Referente a</th>
                <th className="num">Pago</th>
              </tr>
            </thead>
            <tbody>
              {pagamentos.map((p) => (
                <tr key={p.chave}>
                  <td className="num">{formatDataCurta(p.data)}</td>
                  <td>{p.aQuem}</td>
                  <td>
                    {p.descricao}
                    {p.forma && <small className="rel-nota">{p.forma}</small>}
                    {Math.abs(p.valorPago - p.valorCombinado) >= 0.01 && (
                      <small className="rel-nota">
                        combinado {formatBRL(p.valorCombinado)}
                      </small>
                    )}
                  </td>
                  <td className="num">{formatBRL(p.valorPago)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total pago</td>
                <td className="num">{formatBRL(resumo.realizado)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section className="rel-secao">
        <h2>Em aberto, mês a mês</h2>
        {aberto.meses.length === 0 && aberto.semData.qtd === 0 ? (
          <p className="rel-vazio">Nenhuma parcela em aberto.</p>
        ) : (
          <table className="rel-tabela">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Parcelas</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {aberto.meses.map((mes) => (
                <tr key={mes.chave}>
                  <td>
                    {mes.rotulo}
                    {mes.vencido && <small className="rel-nota">vencido</small>}
                  </td>
                  <td className="num">{mes.qtd}</td>
                  <td className="num">{formatBRL(mes.valor)}</td>
                </tr>
              ))}
              {aberto.semData.qtd > 0 && (
                <tr>
                  <td>
                    Sem data
                    <small className="rel-nota">aguardando entrega para vencer</small>
                  </td>
                  <td className="num">{aberto.semData.qtd}</td>
                  <td className="num">{formatBRL(aberto.semData.valor)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total em aberto nos contratos</td>
                <td className="num">{formatBRL(aberto.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section className="rel-secao">
        <h2>Compras escolhidas e ainda não pagas</h2>
        <table className="rel-tabela">
          <thead>
            <tr>
              <th>Ambiente</th>
              <th className="num">Itens</th>
              <th className="num">Cotado</th>
            </tr>
          </thead>
          <tbody>
            {secoes.map((secao) => (
              <tr key={secao.secao}>
                <td>
                  {secao.secao}
                  {secao.semPreco > 0 && (
                    <small className="rel-nota">
                      {secao.semPreco} sem cotação, fora do valor ao lado
                    </small>
                  )}
                </td>
                <td className="num">{secao.qtd}</td>
                <td className="num">{formatBRL(secao.valor)}</td>
              </tr>
            ))}
            <tr>
              <td>
                Luminárias do projeto de iluminação
                <small className="rel-nota">lista própria, sem controle de compra no app</small>
              </td>
              <td className="num">{iluminacaoItens.length}</td>
              <td className="num">{formatBRL(resumo.comprometidoIluminacao)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total escolhido e não pago</td>
              <td className="num">
                {formatBRL(resumo.comprometidoCompras + resumo.comprometidoIluminacao)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {resumo.itensSemPreco > 0 && (
        <section className="rel-secao">
          <h2>O que ainda não se sabe</h2>
          <p className="rel-buraco">
            <b>
              {plural(resumo.itensSemPreco, "item ainda sem cotação", "itens ainda sem cotação")}
            </b>{" "}
            — concentrados nos ambientes marcados acima. Eles estão{" "}
            <b>fora de todos os números deste relatório</b>: não valem R$ 0, apenas ainda não
            têm preço. O custo do projeto vai subir quando entrarem.
          </p>
        </section>
      )}

      <footer className="rel-rodape">
        <p>
          Documento gerado pelo app Apartamento GB em {dataPorExtenso(hoje)}. Valores em aberto
          são previsões baseadas nos contratos e cotações registrados até esta data.
        </p>
      </footer>
    </main>
  );
}
