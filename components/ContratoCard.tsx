"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  CHIP_POR_STATUS,
  FORMAS_PAGAMENTO,
  formatBRL,
  formatDataCurta,
  plural,
  resumoContrato,
  statusParcela,
} from "@/lib/obra";
import type { ObraContrato, ObraParcela, UserName } from "@/lib/types";
import ParcelaEditor from "./ParcelaEditor";

const ABERTOS_KEY = "gb-obra-contratos-abertos";

interface Props {
  contrato: ObraContrato;
  parcelas: ObraParcela[];
  visiveis: ObraParcela[];
  currentUser: UserName;
  hoje: string;
  onChanged: () => void;
  onEditarContrato: (contrato: ObraContrato) => void;
}

export default function ContratoCard({
  contrato,
  parcelas,
  visiveis,
  currentUser,
  hoje,
  onChanged,
  onEditarContrato,
}: Props) {
  const [pagandoId, setPagandoId] = useState<number | null>(null);
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [valorPago, setValorPago] = useState("");
  const [forma, setForma] = useState(FORMAS_PAGAMENTO[0]);
  const [comprovante, setComprovante] = useState("");

  const [editandoParcelaId, setEditandoParcelaId] = useState<number | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<number | "contrato" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [maisAbertoId, setMaisAbertoId] = useState<number | null>(null);
  const [abertoManual, setAbertoManual] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const salvo = JSON.parse(window.localStorage.getItem(ABERTOS_KEY) ?? "{}");
      const valor = salvo?.[contrato.id];
      if (typeof valor === "boolean") setAbertoManual(valor);
    } catch {
      // localStorage indisponível — o card abre pelas regras padrão
    }
  }, [contrato.id]);

  const resumo = resumoContrato(contrato, parcelas, hoje);
  const proximoNumero = parcelas.reduce((maior, p) => Math.max(maior, p.numero), 0) + 1;

  // Se a lista chegou filtrada, esconder as parcelas anularia o filtro.
  const filtroAtivo = visiveis.length !== parcelas.length;
  const aberto = abertoManual ?? (filtroAtivo || resumo.temAtraso);

  const proxima = parcelas
    .filter((p) => !p.pago_em)
    .map((p) => statusParcela(p, hoje))
    .filter((s) => s.vencimento)
    .sort((a, b) => (a.vencimento as string).localeCompare(b.vencimento as string))[0];

  const emAberto = resumo.qtdTotal - resumo.qtdPagas;
  const linhaResumo = resumo.temAtraso
    ? `${resumo.qtdPagas} de ${resumo.qtdTotal} pagas · ${formatBRL(resumo.vencido)} vencido`
    : emAberto === 0 && resumo.qtdTotal > 0
      ? `${plural(resumo.qtdTotal, "parcela", "parcelas")} · tudo pago`
      : proxima
        ? `${resumo.qtdPagas} de ${resumo.qtdTotal} pagas · próxima ${formatDataCurta(proxima.vencimento)}`
        : `${resumo.qtdPagas} de ${resumo.qtdTotal} pagas · aguardando entrega`;

  function alternarAberto() {
    const novo = !aberto;
    setAbertoManual(novo);
    try {
      const salvo = JSON.parse(window.localStorage.getItem(ABERTOS_KEY) ?? "{}");
      window.localStorage.setItem(
        ABERTOS_KEY,
        JSON.stringify({ ...salvo, [contrato.id]: novo }),
      );
    } catch {
      // sem localStorage o estado vale só nesta sessão
    }
  }

  function abrirPagamento(parcela: ObraParcela) {
    setPagandoId(parcela.id);
    setDataPagamento(hoje);
    setValorPago(String(parcela.valor));
    setForma(parcela.forma_pagamento ?? FORMAS_PAGAMENTO[0]);
    setComprovante(parcela.comprovante_url ?? "");
    setErro("");
  }

  async function executar(acao: () => PromiseLike<{ error: unknown }>, mensagem: string) {
    setOcupado(true);
    setErro("");
    const { error } = await acao();
    setOcupado(false);
    if (error) {
      setErro(mensagem);
      return false;
    }
    onChanged();
    return true;
  }

  async function confirmarPagamento(parcela: ObraParcela) {
    const numero = Number(valorPago.replace(",", "."));
    if (!dataPagamento) return setErro("Informe a data do pagamento.");
    if (!Number.isFinite(numero) || numero < 0) return setErro("Valor pago inválido.");

    const ok = await executar(
      () =>
        supabase
          .from("obra_parcelas")
          .update({
            pago_em: dataPagamento,
            valor_pago: numero,
            forma_pagamento: forma,
            comprovante_url: comprovante.trim() || null,
            updated_by: currentUser,
          })
          .eq("id", parcela.id),
      "Não deu para registrar o pagamento.",
    );
    if (ok) setPagandoId(null);
  }

  function desfazerPagamento(parcela: ObraParcela) {
    return executar(
      () =>
        supabase
          .from("obra_parcelas")
          .update({
            pago_em: null,
            valor_pago: null,
            forma_pagamento: null,
            updated_by: currentUser,
          })
          .eq("id", parcela.id),
      "Não deu para desfazer.",
    );
  }

  function marcarEntrega(parcela: ObraParcela, data: string | null) {
    return executar(
      () =>
        supabase
          .from("obra_parcelas")
          .update({ marco_entregue_em: data, updated_by: currentUser })
          .eq("id", parcela.id),
      "Não deu para atualizar a entrega.",
    );
  }

  async function excluirParcela(id: number) {
    const ok = await executar(
      () => supabase.from("obra_parcelas").delete().eq("id", id),
      "Não deu para excluir a parcela.",
    );
    if (ok) setConfirmandoExclusao(null);
  }

  async function excluirContrato() {
    const ok = await executar(
      () => supabase.from("obra_contratos").delete().eq("id", contrato.id),
      "Não deu para excluir o contrato.",
    );
    if (ok) setConfirmandoExclusao(null);
  }

  return (
    <article
      className={`obra-contrato${resumo.temAtraso ? " tem-atraso" : ""}${
        contrato.status === "cancelado" ? " is-cancelado" : ""
      }`}
    >
      <button
        type="button"
        className="obra-contrato-topo"
        aria-expanded={aberto}
        aria-controls={`contrato-${contrato.id}-corpo`}
        onClick={alternarAberto}
      >
        <div className="obra-contrato-id">
          <span className="obra-contrato-cat">
            {contrato.categoria}
            {contrato.status !== "ativo" && ` · ${contrato.status === "concluido" ? "Concluído" : "Cancelado"}`}
          </span>
          <h3 className="obra-contrato-nome">
            {contrato.fornecedor}
            <span className={`obra-seta${aberto ? " is-aberta" : ""}`} aria-hidden="true" />
          </h3>
          {contrato.escopo && <p className="obra-contrato-escopo">{contrato.escopo}</p>}
        </div>

        {aberto && contrato.condicoes && (
          <p className="obra-contrato-cond">
            <b>Condições:</b> {contrato.condicoes}
          </p>
        )}

        <div className="obra-barra-linha">
          <div className="obra-barra-texto">
            <span>
              Pago <span className="val">{formatBRL(resumo.pago)}</span> de{" "}
              <span className="val">{formatBRL(contrato.valor_total)}</span>
            </span>
            <span>{resumo.percentual}%</span>
          </div>
          <div
            className="obra-barra"
            role="img"
            aria-label={`${resumo.percentual}% do contrato pago`}
          >
            <i style={{ width: `${resumo.percentual}%` }} />
          </div>
        </div>

        <p className={`obra-contrato-resumo${resumo.temAtraso ? " tem-atraso" : ""}`}>
          {linhaResumo}
        </p>

        {aberto && resumo.qtdTotal > 0 && Math.abs(resumo.diferenca) >= 0.01 && (
          <span className="obra-alerta">
            As parcelas somam {formatBRL(resumo.somaParcelas)} —{" "}
            {resumo.diferenca > 0 ? "faltam" : "passam"} {formatBRL(Math.abs(resumo.diferenca))} para
            fechar com o valor do contrato.
          </span>
        )}
      </button>

      {aberto && (
      <div id={`contrato-${contrato.id}-corpo`}>

      <ul className="obra-parcelas">
        {visiveis.map((parcela) => {
          const status = statusParcela(parcela, hoje);
          return (
            <li className="obra-parcela" key={parcela.id}>
              {editandoParcelaId === parcela.id ? (
                <ParcelaEditor
                  contratoId={contrato.id}
                  parcela={parcela}
                  proximoNumero={parcela.numero}
                  currentUser={currentUser}
                  onDone={() => {
                    setEditandoParcelaId(null);
                    onChanged();
                  }}
                  onCancel={() => setEditandoParcelaId(null)}
                />
              ) : (
                <>
                  <div className="obra-p-desc">
                    <span className="obra-p-num">PARCELA {parcela.numero}</span>
                    <span className="obra-p-titulo">{parcela.descricao}</span>
                    <span className="obra-p-gatilho">
                      {parcela.gatilho === "data" ? (
                        <span className="data">Vencimento {formatDataCurta(parcela.vencimento)}</span>
                      ) : (
                        <span className="marco">
                          {parcela.marco_descricao}
                          {parcela.marco_entregue_em
                            ? ` · entregue ${formatDataCurta(parcela.marco_entregue_em)}, pagar em ${parcela.prazo_dias} dias`
                            : ` · ${parcela.prazo_dias} dias após a entrega`}
                        </span>
                      )}
                    </span>
                  </div>

                  <span className="obra-p-valor">{formatBRL(parcela.valor)}</span>

                  <div className="obra-p-rodape">
                    <span className={`obra-chip ${CHIP_POR_STATUS[status.key]}`}>{status.label}</span>

                    {parcela.pago_em ? (
                      <span className="obra-p-meta">
                        {formatDataCurta(parcela.pago_em)}
                        {parcela.forma_pagamento ? ` · ${parcela.forma_pagamento}` : ""}
                        {parcela.valor_pago !== null && Number(parcela.valor_pago) !== Number(parcela.valor)
                          ? ` · ${formatBRL(parcela.valor_pago)}`
                          : ""}
                      </span>
                    ) : (
                      status.vencimento && (
                        <span className="obra-p-meta">venc. {formatDataCurta(status.vencimento)}</span>
                      )
                    )}

                    {parcela.comprovante_url && (
                      <a
                        className="obra-p-meta obra-p-link"
                        href={parcela.comprovante_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        comprovante
                      </a>
                    )}

                    <div className="obra-p-acoes">
                      {/* Só a ação daquela linha fica à vista. Editar e excluir
                          são raras e viviam ocupando mais altura que os dados. */}
                      {!parcela.pago_em &&
                        (status.key === "aguardando" ? (
                          <button
                            type="button"
                            className="obra-btn obra-btn--mini obra-btn--primario"
                            disabled={ocupado}
                            onClick={() => marcarEntrega(parcela, hoje)}
                          >
                            Marco entregue
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="obra-btn obra-btn--mini obra-btn--primario"
                            onClick={() => abrirPagamento(parcela)}
                          >
                            Marcar pago
                          </button>
                        ))}

                      <button
                        type="button"
                        className="obra-btn obra-btn--mini obra-btn--mais"
                        aria-expanded={maisAbertoId === parcela.id}
                        aria-label={`Mais ações da parcela ${parcela.numero}`}
                        onClick={() =>
                          setMaisAbertoId((atual) => (atual === parcela.id ? null : parcela.id))
                        }
                      >
                        •••
                      </button>
                    </div>

                    {maisAbertoId === parcela.id && (
                      <div className="obra-p-mais">
                        {parcela.pago_em && (
                          <button
                            type="button"
                            className="obra-btn obra-btn--mini"
                            disabled={ocupado}
                            onClick={() => desfazerPagamento(parcela)}
                          >
                            Desfazer pagamento
                          </button>
                        )}

                        {parcela.gatilho === "marco" &&
                          parcela.marco_entregue_em &&
                          !parcela.pago_em && (
                            <button
                              type="button"
                              className="obra-btn obra-btn--mini"
                              disabled={ocupado}
                              onClick={() => marcarEntrega(parcela, null)}
                            >
                              Desfazer entrega
                            </button>
                          )}

                        <button
                          type="button"
                          className="obra-btn obra-btn--mini"
                          onClick={() => {
                            setEditandoParcelaId(parcela.id);
                            setMaisAbertoId(null);
                          }}
                        >
                          Editar
                        </button>

                        {confirmandoExclusao === parcela.id ? (
                          <button
                            type="button"
                            className="obra-btn obra-btn--mini obra-btn--perigo"
                            disabled={ocupado}
                            onClick={() => excluirParcela(parcela.id)}
                          >
                            Confirmar exclusão
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="obra-btn obra-btn--mini"
                            onClick={() => setConfirmandoExclusao(parcela.id)}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {pagandoId === parcela.id && (
                    <div className="obra-pagamento">
                      <div className="obra-campo-linha">
                        <label className="obra-campo">
                          <span>Data do pagamento</span>
                          <input
                            type="date"
                            value={dataPagamento}
                            onChange={(e) => setDataPagamento(e.target.value)}
                          />
                        </label>
                        <label className="obra-campo">
                          <span>Valor pago</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={valorPago}
                            onChange={(e) => setValorPago(e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="obra-campo-linha">
                        <label className="obra-campo">
                          <span>Forma</span>
                          <select value={forma} onChange={(e) => setForma(e.target.value)}>
                            {FORMAS_PAGAMENTO.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="obra-campo">
                          <span>Comprovante (link)</span>
                          <input
                            type="url"
                            value={comprovante}
                            onChange={(e) => setComprovante(e.target.value)}
                            placeholder="https://..."
                          />
                        </label>
                      </div>
                      <div className="obra-editor-acoes">
                        <button type="button" className="obra-btn" onClick={() => setPagandoId(null)}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="obra-btn obra-btn--primario"
                          disabled={ocupado}
                          onClick={() => confirmarPagamento(parcela)}
                        >
                          Confirmar pagamento
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}

        {visiveis.length === 0 && (
          <li className="obra-parcela obra-parcela--vazia">
            Nenhuma parcela cadastrada neste contrato.
          </li>
        )}
      </ul>

      {adicionando && (
        <div className="obra-contrato-rodape">
          <ParcelaEditor
            contratoId={contrato.id}
            parcela={null}
            proximoNumero={proximoNumero}
            currentUser={currentUser}
            onDone={() => {
              setAdicionando(false);
              onChanged();
            }}
            onCancel={() => setAdicionando(false)}
          />
        </div>
      )}

      {erro && <p className="obra-erro obra-erro--card">{erro}</p>}

      <div className="obra-contrato-acoes">
        <button type="button" className="obra-btn obra-btn--mini" onClick={() => setAdicionando(true)}>
          + Parcela
        </button>
        <button
          type="button"
          className="obra-btn obra-btn--mini"
          onClick={() => onEditarContrato(contrato)}
        >
          Editar contrato
        </button>
        {confirmandoExclusao === "contrato" ? (
          <button
            type="button"
            className="obra-btn obra-btn--mini obra-btn--perigo"
            disabled={ocupado}
            onClick={excluirContrato}
          >
            Confirmar: apaga o contrato e as {resumo.qtdTotal} parcelas
          </button>
        ) : (
          <button
            type="button"
            className="obra-btn obra-btn--mini"
            onClick={() => setConfirmandoExclusao("contrato")}
          >
            Excluir contrato
          </button>
        )}
      </div>
      </div>
      )}
    </article>
  );
}
