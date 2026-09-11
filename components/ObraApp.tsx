"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  FILTROS_OBRA,
  agendaPagamentos,
  formatBRL,
  formatBRLCompacto,
  formatDataCurta,
  hojeISO,
  parcelaPassaNoFiltro,
  plural,
  resumoGeral,
} from "@/lib/obra";
import type { ObraFiltro } from "@/lib/obra";
import type { ObraContrato, ObraParcela, UserName } from "@/lib/types";
import ContratoCard from "./ContratoCard";
import ContratoForm from "./ContratoForm";

interface Props {
  currentUser: UserName;
}

export default function ObraApp({ currentUser }: Props) {
  const [contratos, setContratos] = useState<ObraContrato[]>([]);
  const [parcelas, setParcelas] = useState<ObraParcela[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState("");
  const [filtro, setFiltro] = useState<ObraFiltro>("todos");
  const [formAberto, setFormAberto] = useState(false);
  const [contratoEditando, setContratoEditando] = useState<ObraContrato | null>(null);
  const [hoje, setHoje] = useState(hojeISO());

  // O app pode ficar aberto no celular a noite inteira; sem isto, um "vence hoje"
  // continuaria dizendo "hoje" no dia seguinte.
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
    const [resContratos, resParcelas] = await Promise.all([
      supabase.from("obra_contratos").select("*").order("id", { ascending: true }),
      supabase
        .from("obra_parcelas")
        .select("*")
        .order("contrato_id", { ascending: true })
        .order("numero", { ascending: true }),
    ]);

    if (resContratos.error || resParcelas.error) {
      setErroCarga("Não foi possível carregar a obra. Tente novamente em instantes.");
    } else {
      setContratos((resContratos.data ?? []) as ObraContrato[]);
      setParcelas((resParcelas.data ?? []) as ObraParcela[]);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Ivan e Giovana costumam abrir o app juntos. Os dados são poucos, então
  // recarregar tudo é mais simples e mais confiável do que mesclar payloads.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recarregarEmBreve = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => carregar(), 250);
    };

    const canal = supabase
      .channel("obra-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_contratos" }, recarregarEmBreve)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_parcelas" }, recarregarEmBreve)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  const resumo = useMemo(() => resumoGeral(contratos, parcelas, hoje), [contratos, parcelas, hoje]);

  const agenda = useMemo(
    () => agendaPagamentos(contratos, parcelas, 30, hoje),
    [contratos, parcelas, hoje],
  );

  const totalAgenda = agenda.reduce((total, item) => total + Number(item.parcela.valor ?? 0), 0);

  const contagens = useMemo(() => {
    const mapa = {} as Record<ObraFiltro, number>;
    for (const { key } of FILTROS_OBRA) {
      mapa[key] = parcelas.filter((p) => parcelaPassaNoFiltro(p, key, hoje)).length;
    }
    return mapa;
  }, [parcelas, hoje]);

  const porContrato = useMemo(() => {
    const mapa = new Map<number, ObraParcela[]>();
    for (const parcela of parcelas) {
      const lista = mapa.get(parcela.contrato_id) ?? [];
      lista.push(parcela);
      mapa.set(parcela.contrato_id, lista);
    }
    return mapa;
  }, [parcelas]);

  function abrirNovo() {
    setContratoEditando(null);
    setFormAberto(true);
  }

  function editarContrato(contrato: ObraContrato) {
    setContratoEditando(contrato);
    setFormAberto(true);
  }

  function fecharForm() {
    setFormAberto(false);
    setContratoEditando(null);
  }

  if (carregando) {
    return <p className="status-message">Carregando a obra...</p>;
  }

  const visiveisPorContrato = contratos.map((contrato) => {
    const todas = porContrato.get(contrato.id) ?? [];
    return {
      contrato,
      todas,
      visiveis: todas.filter((p) => parcelaPassaNoFiltro(p, filtro, hoje)),
    };
  });

  const comParcelasVisiveis =
    filtro === "todos"
      ? visiveisPorContrato
      : visiveisPorContrato.filter((item) => item.visiveis.length > 0);

  return (
    <>
      <section className="obra-resumo" aria-label="Resumo financeiro da obra">
        <div className="obra-tile">
          <span className="obra-tile-label">Contratado</span>
          <span className="obra-tile-value">{formatBRLCompacto(resumo.contratado)}</span>
          <span className="obra-tile-sub">{plural(resumo.qtdContratos, "contrato", "contratos")}</span>
        </div>
        <div className="obra-tile obra-tile--pago">
          <span className="obra-tile-label">Já pago</span>
          <span className="obra-tile-value">{formatBRLCompacto(resumo.pago)}</span>
          <span className="obra-tile-sub">{resumo.percentualPago}% do total</span>
        </div>
        <div className="obra-tile">
          <span className="obra-tile-label">A pagar</span>
          <span className="obra-tile-value">{formatBRLCompacto(resumo.aberto)}</span>
          <span className="obra-tile-sub">
            {plural(resumo.qtdAbertas, "parcela em aberto", "parcelas em aberto")}
          </span>
        </div>
        <div className={`obra-tile obra-tile--vencido${resumo.vencido === 0 ? " is-zero" : ""}`}>
          <span className="obra-tile-label">Vencido</span>
          <span className="obra-tile-value">{formatBRLCompacto(resumo.vencido)}</span>
          <span className="obra-tile-sub">
            {resumo.qtdVencidas === 0
              ? "nada em atraso"
              : plural(resumo.qtdVencidas, "parcela vencida", "parcelas vencidas")}
          </span>
        </div>
      </section>

      {erroCarga && <p className="status-message status-message--error">{erroCarga}</p>}

      <nav className="obra-filtros" aria-label="Filtrar parcelas">
        {FILTROS_OBRA.map((f) => (
          <button
            key={f.key}
            type="button"
            className="obra-filtro"
            aria-pressed={filtro === f.key}
            onClick={() => setFiltro(f.key)}
          >
            {f.label}
            <span className="cnt">{contagens[f.key] ?? 0}</span>
          </button>
        ))}
      </nav>

      {agenda.length > 0 && (
        <section className="obra-agenda-bloco" aria-label="Próximos pagamentos">
          <h2 className="obra-bloco-titulo">Próximos 30 dias</h2>
          <ul className="obra-agenda">
            {agenda.map(({ parcela, contrato, status }) => (
              <li key={parcela.id} className={status.key === "atrasado" ? "atrasado" : ""}>
                <span className="obra-ag-data">{formatDataCurta(status.vencimento)}</span>
                <span className="obra-ag-quem">
                  {contrato.fornecedor}
                  <small>
                    {parcela.descricao}
                    {status.key === "atrasado" ? ` · ${status.label.toLowerCase()}` : ""}
                  </small>
                </span>
                <span className="obra-ag-valor">{formatBRL(parcela.valor)}</span>
              </li>
            ))}
          </ul>
          <div className="obra-agenda-total">
            <span>Total do período</span>
            <span>{formatBRL(totalAgenda)}</span>
          </div>
        </section>
      )}

      {formAberto && (
        <ContratoForm
          contrato={contratoEditando}
          currentUser={currentUser}
          onDone={() => {
            fecharForm();
            carregar();
          }}
          onCancel={fecharForm}
        />
      )}

      {!formAberto && (
        <div className="obra-novo-linha">
          <button type="button" className="obra-btn obra-btn--primario" onClick={abrirNovo}>
            + Novo contrato
          </button>
        </div>
      )}

      <section className="obra-lista" aria-label="Contratos da obra">
        {contratos.length === 0 ? (
          <div className="obra-vazio">
            <p>
              Nenhum contrato ainda. Comece pelo da arquiteta: valor total, condições de pagamento e
              as parcelas.
            </p>
            <p className="obra-dica">
              Parcela que depende de entrega (“30% na entrega do executivo”) você cadastra como
              marco — ela só passa a vencer depois que a entrega acontecer.
            </p>
          </div>
        ) : comParcelasVisiveis.length === 0 ? (
          <p className="obra-vazio">Nenhuma parcela neste filtro.</p>
        ) : (
          comParcelasVisiveis.map(({ contrato, todas, visiveis }) => (
            <ContratoCard
              key={contrato.id}
              contrato={contrato}
              parcelas={todas}
              visiveis={visiveis}
              currentUser={currentUser}
              hoje={hoje}
              onChanged={carregar}
              onEditarContrato={editarContrato}
            />
          ))
        )}
      </section>
    </>
  );
}
