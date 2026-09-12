"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatBRL, formatBRLCompacto, hojeISO, plural } from "@/lib/obra";
import {
  CHIP_POR_ENTRADA,
  coberturaProximos30,
  desvioCompras,
  resumoOrcamento,
  statusEntrada,
} from "@/lib/orcamento";
import type {
  IluminacaoCotacao,
  IluminacaoItem,
  ObraContrato,
  ObraParcela,
  OrcamentoEntrada,
  ShoppingItem,
  UserName,
} from "@/lib/types";
import EntradaEditor from "./EntradaEditor";

interface Props {
  currentUser: UserName;
}

export default function OrcamentoApp({ currentUser }: Props) {
  const [entradas, setEntradas] = useState<OrcamentoEntrada[]>([]);
  const [contratos, setContratos] = useState<ObraContrato[]>([]);
  const [parcelas, setParcelas] = useState<ObraParcela[]>([]);
  const [itens, setItens] = useState<ShoppingItem[]>([]);
  const [iluminacaoItens, setIluminacaoItens] = useState<IluminacaoItem[]>([]);
  const [iluminacaoCotacoes, setIluminacaoCotacoes] = useState<IluminacaoCotacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [entradaEditando, setEntradaEditando] = useState<OrcamentoEntrada | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<number | null>(null);
  const [hoje, setHoje] = useState(hojeISO());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHoje((atual) => {
        const agora = hojeISO();
        return agora === atual ? atual : agora;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const carregar = useCallback(async () => {
    setErroCarga("");
    const [resEntradas, resContratos, resParcelas, resItens, resIlum, resIlumCot] =
      await Promise.all([
        supabase.from("orcamento_entradas").select("*").order("id", { ascending: true }),
        supabase.from("obra_contratos").select("*").order("id", { ascending: true }),
        supabase.from("obra_parcelas").select("*").order("id", { ascending: true }),
        supabase
          .from("shopping_items")
          .select("id, decision, quote_price, comprado_em, valor_pago")
          .eq("decision", "FICA"),
        supabase.from("lighting_items").select("id, comprado_em, valor_pago"),
        supabase
          .from("lighting_item_quotes")
          .select("lighting_item_id, line_total, is_selected")
          .eq("is_selected", true),
      ]);

    const falhou = [resEntradas, resContratos, resParcelas, resItens, resIlum, resIlumCot].some(
      (r) => r.error,
    );
    if (falhou) {
      setErroCarga("Não foi possível carregar o orçamento. Tente novamente em instantes.");
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

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recarregarEmBreve = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => carregar(), 250);
    };

    const canal = supabase
      .channel("orcamento-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "orcamento_entradas" }, recarregarEmBreve)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_parcelas" }, recarregarEmBreve)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items" }, recarregarEmBreve)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  const resumo = useMemo(
    () =>
      resumoOrcamento(entradas, contratos, parcelas, itens, iluminacaoItens, iluminacaoCotacoes),
    [entradas, contratos, parcelas, itens, iluminacaoItens, iluminacaoCotacoes],
  );

  const cobertura = useMemo(
    () => coberturaProximos30(contratos, parcelas, resumo.saldoReal, hoje),
    [contratos, parcelas, resumo.saldoReal, hoje],
  );

  const desvio = useMemo(() => desvioCompras(itens), [itens]);

  async function excluirEntrada(id: number) {
    const { error } = await supabase.from("orcamento_entradas").delete().eq("id", id);
    if (error) {
      setErroCarga("Não deu para excluir a entrada.");
      return;
    }
    setConfirmandoExclusao(null);
    carregar();
  }

  if (carregando) {
    return <p className="status-message">Carregando o orçamento...</p>;
  }

  return (
    <>
      {resumo.temEntradas ? (
        <section className="obra-resumo" aria-label="Resumo do orçamento">
          <div className="obra-tile">
            <span className="obra-tile-label">Orçamento</span>
            <span className="obra-tile-value">{formatBRLCompacto(resumo.orcamentoTotal)}</span>
            <span className="obra-tile-sub">
              {resumo.entradasPrevistas > 0
                ? `${formatBRLCompacto(resumo.entradasPrevistas)} ainda por entrar`
                : "tudo já em conta"}
            </span>
          </div>
          <div className="obra-tile">
            <span className="obra-tile-label">Realizado</span>
            <span className="obra-tile-value">{formatBRLCompacto(resumo.realizado)}</span>
            <span className="obra-tile-sub">já saiu da conta</span>
          </div>
          <div className={`obra-tile${resumo.saldoReal < 0 ? " obra-tile--vencido" : " obra-tile--pago"}`}>
            <span className="obra-tile-label">Saldo real</span>
            <span className="obra-tile-value">{formatBRLCompacto(resumo.saldoReal)}</span>
            <span className="obra-tile-sub">
              {formatBRLCompacto(resumo.entradasRecebidas)} recebido − realizado
            </span>
          </div>
          <div className={`obra-tile${resumo.projetado < 0 ? " obra-tile--vencido" : " obra-tile--pago"}`}>
            <span className="obra-tile-label">Projetado</span>
            <span className="obra-tile-value">{formatBRLCompacto(resumo.projetado)}</span>
            <span className="obra-tile-sub">
              {resumo.projetado < 0 ? "estouro no fim" : "sobra no fim"}
            </span>
          </div>
        </section>
      ) : (
        <section className="obra-resumo" aria-label="Custo do projeto">
          <div className="obra-tile">
            <span className="obra-tile-label">Realizado</span>
            <span className="obra-tile-value">{formatBRLCompacto(resumo.realizado)}</span>
            <span className="obra-tile-sub">já saiu da conta</span>
          </div>
          <div className="obra-tile">
            <span className="obra-tile-label">Comprometido</span>
            <span className="obra-tile-value">{formatBRLCompacto(resumo.comprometido)}</span>
            <span className="obra-tile-sub">contratado ou escolhido</span>
          </div>
          <div className="obra-tile">
            <span className="obra-tile-label">Total do projeto</span>
            <span className="obra-tile-value">{formatBRLCompacto(resumo.totalProjeto)}</span>
            <span className="obra-tile-sub">até onde se sabe hoje</span>
          </div>
          <div className="obra-tile">
            <span className="obra-tile-label">Saldo</span>
            <span className="obra-tile-value">—</span>
            <span className="obra-tile-sub">falta cadastrar as entradas</span>
          </div>
        </section>
      )}

      {erroCarga && <p className="status-message status-message--error">{erroCarga}</p>}

      {!resumo.temEntradas && (
        <div className="orc-aviso orc-aviso--neutro">
          <b>Cadastre de onde vem o dinheiro.</b> Sem as entradas o app sabe quanto o
          apartamento custa, mas não tem como dizer se você tem com que pagar.
        </div>
      )}

      {resumo.itensSemPreco > 0 && (
        <div className="orc-aviso orc-aviso--atencao">
          <b>{plural(resumo.itensSemPreco, "item ainda sem cotação", "itens ainda sem cotação")}.</b>{" "}
          Eles ficam de fora de todas as contas acima — não valem R$ 0, só ainda não têm preço.
          O projetado vai piorar quando entrarem.
        </div>
      )}

      {resumo.temEntradas && !cobertura.cobre && cobertura.vencendo > 0 && (
        <div className="orc-aviso orc-aviso--alerta">
          <b>Faltam {formatBRL(cobertura.falta)} para os próximos 30 dias.</b> Vencem{" "}
          {formatBRL(cobertura.vencendo)} em {plural(cobertura.qtdParcelas, "parcela", "parcelas")} e
          o saldo em conta é {formatBRL(resumo.saldoReal)}.
        </div>
      )}

      <section className="orc-bloco" aria-label="Composição do custo">
        <h2 className="obra-bloco-titulo">Onde o dinheiro está</h2>
        <table className="orc-tabela">
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Realizado</th>
              <th>Comprometido</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Obra (contratos)</td>
              <td>{formatBRL(resumo.realizadoObra)}</td>
              <td>{formatBRL(resumo.comprometidoObra)}</td>
            </tr>
            <tr>
              <td>Compras (itens que ficam)</td>
              <td>{formatBRL(resumo.realizadoCompras)}</td>
              <td>{formatBRL(resumo.comprometidoCompras)}</td>
            </tr>
            <tr>
              <td>
                Iluminação
                <small className="orc-nota">sem controle de compra ainda</small>
              </td>
              <td>{formatBRL(resumo.realizadoIluminacao)}</td>
              <td>{formatBRL(resumo.comprometidoIluminacao)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{formatBRL(resumo.realizado)}</td>
              <td>{formatBRL(resumo.comprometido)}</td>
            </tr>
          </tfoot>
        </table>

        {desvio.qtd > 0 && (
          <p className="obra-dica">
            Nas {plural(desvio.qtd, "compra já feita", "compras já feitas")}, o pago ficou{" "}
            {desvio.desvio >= 0 ? "abaixo" : "acima"} do cotado em{" "}
            <b>{formatBRL(Math.abs(desvio.desvio))}</b>.
          </p>
        )}
      </section>

      {formAberto && (
        <EntradaEditor
          entrada={entradaEditando}
          currentUser={currentUser}
          onDone={() => {
            setFormAberto(false);
            setEntradaEditando(null);
            carregar();
          }}
          onCancel={() => {
            setFormAberto(false);
            setEntradaEditando(null);
          }}
        />
      )}

      {!formAberto && (
        <div className="obra-novo-linha">
          <button
            type="button"
            className="obra-btn obra-btn--primario"
            onClick={() => {
              setEntradaEditando(null);
              setFormAberto(true);
            }}
          >
            + Nova entrada
          </button>
        </div>
      )}

      <section className="orc-bloco" aria-label="Entradas de dinheiro">
        <h2 className="obra-bloco-titulo">Entradas</h2>
        {entradas.length === 0 ? (
          <p className="obra-vazio">
            Nenhuma entrada lançada. Comece pelo dinheiro que já está separado para a reforma.
          </p>
        ) : (
          <ul className="orc-entradas">
            {entradas.map((entrada) => {
              const status = statusEntrada(entrada, hoje);
              return (
                <li key={entrada.id} className="orc-entrada">
                  <div className="orc-entrada-desc">
                    <span className="obra-p-titulo">{entrada.descricao}</span>
                    {entrada.origem && <span className="obra-p-gatilho">{entrada.origem}</span>}
                  </div>
                  <span className="obra-p-valor">{formatBRL(entrada.valor)}</span>
                  <div className="obra-p-rodape">
                    <span className={`obra-chip ${CHIP_POR_ENTRADA[status.key]}`}>
                      {status.label}
                    </span>
                    <div className="obra-p-acoes">
                      <button
                        type="button"
                        className="obra-btn obra-btn--mini"
                        onClick={() => {
                          setEntradaEditando(entrada);
                          setFormAberto(true);
                        }}
                      >
                        Editar
                      </button>
                      {confirmandoExclusao === entrada.id ? (
                        <button
                          type="button"
                          className="obra-btn obra-btn--mini obra-btn--perigo"
                          onClick={() => excluirEntrada(entrada.id)}
                        >
                          Confirmar exclusão
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="obra-btn obra-btn--mini"
                          onClick={() => setConfirmandoExclusao(entrada.id)}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
