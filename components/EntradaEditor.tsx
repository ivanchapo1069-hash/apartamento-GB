"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { hojeISO } from "@/lib/obra";
import { ORIGENS_ENTRADA } from "@/lib/orcamento";
import type { OrcamentoEntrada, UserName } from "@/lib/types";

interface Props {
  entrada: OrcamentoEntrada | null;
  currentUser: UserName;
  onDone: () => void;
  onCancel: () => void;
}

export default function EntradaEditor({ entrada, currentUser, onDone, onCancel }: Props) {
  const [descricao, setDescricao] = useState(entrada?.descricao ?? "");
  const [valor, setValor] = useState(entrada ? String(entrada.valor) : "");
  const [origem, setOrigem] = useState(entrada?.origem ?? "");
  const [dataPrevista, setDataPrevista] = useState(entrada?.data_prevista ?? hojeISO());
  const [jaRecebido, setJaRecebido] = useState(Boolean(entrada?.recebido_em));
  const [recebidoEm, setRecebidoEm] = useState(entrada?.recebido_em ?? hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    const valorNumero = Number(valor.replace(",", "."));

    if (!descricao.trim()) return setErro("Diga de onde vem o dinheiro.");
    if (!Number.isFinite(valorNumero) || valorNumero < 0) return setErro("Valor inválido.");
    if (jaRecebido && !recebidoEm) return setErro("Informe quando o dinheiro caiu na conta.");

    setSalvando(true);
    setErro("");

    const dados = {
      descricao: descricao.trim(),
      valor: valorNumero,
      origem: origem.trim() || null,
      data_prevista: dataPrevista || null,
      recebido_em: jaRecebido ? recebidoEm : null,
      updated_by: currentUser,
    };

    const { error } = entrada
      ? await supabase.from("orcamento_entradas").update(dados).eq("id", entrada.id)
      : await supabase.from("orcamento_entradas").insert(dados);

    setSalvando(false);
    if (error) {
      setErro("Não deu para salvar a entrada.");
      return;
    }
    onDone();
  }

  return (
    <form className="obra-form" onSubmit={salvar}>
      <h3 className="obra-form-titulo">{entrada ? "Editar entrada" : "Nova entrada"}</h3>

      <label className="obra-campo">
        <span>De onde vem</span>
        <input
          type="text"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Venda do carro, 13º, poupança..."
          autoFocus
        />
      </label>

      <div className="obra-campo-linha">
        <label className="obra-campo">
          <span>Valor</span>
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="50000"
          />
        </label>
        <label className="obra-campo">
          <span>Origem</span>
          <input
            type="text"
            list="orcamento-origens"
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            placeholder="Poupança"
          />
          <datalist id="orcamento-origens">
            {ORIGENS_ENTRADA.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="obra-campo">
        <span>Previsto para</span>
        <input
          type="date"
          value={dataPrevista ?? ""}
          onChange={(e) => setDataPrevista(e.target.value)}
        />
      </label>

      <label className="obra-check">
        <input
          type="checkbox"
          checked={jaRecebido}
          onChange={(e) => setJaRecebido(e.target.checked)}
        />
        <span>Já caiu na conta</span>
      </label>

      {jaRecebido ? (
        <label className="obra-campo">
          <span>Recebido em</span>
          <input
            type="date"
            value={recebidoEm}
            onChange={(e) => setRecebidoEm(e.target.value)}
          />
        </label>
      ) : (
        <p className="obra-dica">
          Entrada prevista conta no orçamento total e na projeção, mas fica de fora do saldo
          real — o saldo só considera dinheiro que já existe na conta.
        </p>
      )}

      {erro && <p className="obra-erro">{erro}</p>}

      <div className="obra-editor-acoes">
        <button type="button" className="obra-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="obra-btn obra-btn--primario" disabled={salvando}>
          {salvando ? "Salvando..." : entrada ? "Salvar entrada" : "Adicionar entrada"}
        </button>
      </div>
    </form>
  );
}
