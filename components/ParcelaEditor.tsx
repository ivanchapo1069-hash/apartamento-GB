"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { hojeISO, somaMeses } from "@/lib/obra";
import type { GatilhoParcela, ObraParcela, UserName } from "@/lib/types";

interface Props {
  contratoId: number;
  parcela: ObraParcela | null;
  proximoNumero: number;
  currentUser: UserName;
  onDone: () => void;
  onCancel: () => void;
}

export default function ParcelaEditor({
  contratoId,
  parcela,
  proximoNumero,
  currentUser,
  onDone,
  onCancel,
}: Props) {
  const [descricao, setDescricao] = useState(parcela?.descricao ?? "");
  const [valor, setValor] = useState(parcela ? String(parcela.valor) : "");
  const [gatilho, setGatilho] = useState<GatilhoParcela>(parcela?.gatilho ?? "data");
  const [vencimento, setVencimento] = useState(
    parcela?.vencimento ?? somaMeses(hojeISO(), 1),
  );
  const [marcoDescricao, setMarcoDescricao] = useState(parcela?.marco_descricao ?? "");
  const [prazoDias, setPrazoDias] = useState(String(parcela?.prazo_dias ?? 5));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    const valorNumero = Number(valor.replace(",", "."));

    if (!descricao.trim()) return setErro("Descreva a parcela.");
    if (!Number.isFinite(valorNumero) || valorNumero < 0) return setErro("Valor inválido.");
    if (gatilho === "data" && !vencimento) return setErro("Informe o vencimento.");
    if (gatilho === "marco" && !marcoDescricao.trim()) {
      return setErro("Diga qual entrega destrava o pagamento.");
    }

    setSalvando(true);
    setErro("");

    const dados = {
      contrato_id: contratoId,
      descricao: descricao.trim(),
      valor: valorNumero,
      gatilho,
      vencimento: gatilho === "data" ? vencimento : null,
      marco_descricao: gatilho === "marco" ? marcoDescricao.trim() : null,
      prazo_dias: gatilho === "marco" ? Math.max(0, Number(prazoDias) || 0) : 0,
      updated_by: currentUser,
    };

    const { error } = parcela
      ? await supabase.from("obra_parcelas").update(dados).eq("id", parcela.id)
      : await supabase.from("obra_parcelas").insert({ ...dados, numero: proximoNumero });

    setSalvando(false);
    if (error) {
      setErro("Não deu para salvar. Tente de novo.");
      return;
    }
    onDone();
  }

  return (
    <form className="obra-editor" onSubmit={salvar}>
      <label className="obra-campo">
        <span>Descrição</span>
        <input
          type="text"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Entrada, 2ª medição, saldo final..."
          autoFocus
        />
      </label>

      <label className="obra-campo">
        <span>Valor</span>
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="8400"
        />
      </label>

      <fieldset className="obra-gatilho">
        <legend>Quando vence</legend>
        <label>
          <input
            type="radio"
            name={`gatilho-${parcela?.id ?? "novo"}`}
            checked={gatilho === "data"}
            onChange={() => setGatilho("data")}
          />
          <span>Em data fixa</span>
        </label>
        <label>
          <input
            type="radio"
            name={`gatilho-${parcela?.id ?? "novo"}`}
            checked={gatilho === "marco"}
            onChange={() => setGatilho("marco")}
          />
          <span>Quando uma entrega acontecer</span>
        </label>
      </fieldset>

      {gatilho === "data" ? (
        <label className="obra-campo">
          <span>Vencimento</span>
          <input
            type="date"
            value={vencimento ?? ""}
            onChange={(e) => setVencimento(e.target.value)}
          />
        </label>
      ) : (
        <>
          <label className="obra-campo">
            <span>Entrega que destrava o pagamento</span>
            <input
              type="text"
              value={marcoDescricao}
              onChange={(e) => setMarcoDescricao(e.target.value)}
              placeholder="Entrega do projeto executivo"
            />
          </label>
          <label className="obra-campo">
            <span>Dias para pagar após a entrega</span>
            <input
              type="number"
              min={0}
              value={prazoDias}
              onChange={(e) => setPrazoDias(e.target.value)}
            />
          </label>
          <p className="obra-dica">
            Enquanto a entrega não for marcada, esta parcela fica como “aguardando entrega” e
            nunca aparece como atrasada.
          </p>
        </>
      )}

      {erro && <p className="obra-erro">{erro}</p>}

      <div className="obra-editor-acoes">
        <button type="button" className="obra-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="obra-btn obra-btn--primario" disabled={salvando}>
          {salvando ? "Salvando..." : parcela ? "Salvar parcela" : "Adicionar parcela"}
        </button>
      </div>
    </form>
  );
}
