"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  CATEGORIAS_OBRA,
  STATUS_CONTRATO,
  formatBRL,
  formatDataCurta,
  gerarParcelas,
  hojeISO,
  somaMeses,
} from "@/lib/obra";
import type { ContratoStatus, ObraContrato, UserName } from "@/lib/types";

interface Props {
  contrato: ObraContrato | null;
  currentUser: UserName;
  onDone: () => void;
  onCancel: () => void;
}

export default function ContratoForm({ contrato, currentUser, onDone, onCancel }: Props) {
  const editando = Boolean(contrato);

  const [fornecedor, setFornecedor] = useState(contrato?.fornecedor ?? "");
  const [categoria, setCategoria] = useState(contrato?.categoria ?? "");
  const [escopo, setEscopo] = useState(contrato?.escopo ?? "");
  const [valorTotal, setValorTotal] = useState(contrato ? String(contrato.valor_total) : "");
  const [dataContrato, setDataContrato] = useState(contrato?.data_contrato ?? hojeISO());
  const [condicoes, setCondicoes] = useState(contrato?.condicoes ?? "");
  const [contato, setContato] = useState(contrato?.contato ?? "");
  const [status, setStatus] = useState<ContratoStatus>(contrato?.status ?? "ativo");

  const [gerar, setGerar] = useState(!editando);
  const [entradaPercentual, setEntradaPercentual] = useState("30");
  const [entradaVencimento, setEntradaVencimento] = useState(hojeISO());
  const [quantidade, setQuantidade] = useState("6");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(somaMeses(hojeISO(), 1));

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const valorNumero = Number(valorTotal.replace(",", "."));

  const previa = useMemo(() => {
    if (!gerar || !Number.isFinite(valorNumero) || valorNumero <= 0) return [];
    return gerarParcelas({
      valorTotal: valorNumero,
      entradaPercentual: Number(entradaPercentual) || 0,
      entradaVencimento,
      quantidade: Number(quantidade) || 0,
      primeiroVencimento,
    });
  }, [gerar, valorNumero, entradaPercentual, entradaVencimento, quantidade, primeiroVencimento]);

  const somaPrevia = previa.reduce((total, p) => total + p.valor, 0);

  async function salvar(event: React.FormEvent) {
    event.preventDefault();

    if (!fornecedor.trim()) return setErro("Diga quem é o contratado.");
    if (!Number.isFinite(valorNumero) || valorNumero < 0) return setErro("Valor do contrato inválido.");

    setSalvando(true);
    setErro("");

    const dados = {
      fornecedor: fornecedor.trim(),
      categoria: categoria.trim() || "Outros",
      escopo: escopo.trim() || null,
      valor_total: valorNumero,
      data_contrato: dataContrato || null,
      condicoes: condicoes.trim() || null,
      contato: contato.trim() || null,
      status,
      updated_by: currentUser,
    };

    if (contrato) {
      const { error } = await supabase.from("obra_contratos").update(dados).eq("id", contrato.id);
      setSalvando(false);
      if (error) return setErro("Não deu para salvar o contrato.");
      onDone();
      return;
    }

    const { data, error } = await supabase
      .from("obra_contratos")
      .insert(dados)
      .select("id")
      .single();

    if (error || !data) {
      setSalvando(false);
      return setErro("Não deu para criar o contrato.");
    }

    if (previa.length) {
      const { error: erroParcelas } = await supabase.from("obra_parcelas").insert(
        previa.map((p) => ({
          contrato_id: data.id,
          numero: p.numero,
          descricao: p.descricao,
          valor: p.valor,
          gatilho: p.gatilho,
          vencimento: p.vencimento,
          marco_descricao: p.marco_descricao,
          prazo_dias: p.prazo_dias,
          updated_by: currentUser,
        })),
      );
      if (erroParcelas) {
        setSalvando(false);
        return setErro("O contrato foi criado, mas as parcelas falharam. Adicione pelo card.");
      }
    }

    setSalvando(false);
    onDone();
  }

  return (
    <form className="obra-form" onSubmit={salvar}>
      <h3 className="obra-form-titulo">{editando ? "Editar contrato" : "Novo contrato"}</h3>

      <label className="obra-campo">
        <span>Contratado</span>
        <input
          type="text"
          value={fornecedor}
          onChange={(e) => setFornecedor(e.target.value)}
          placeholder="Studio Marina Assunção"
          autoFocus
        />
      </label>

      <label className="obra-campo">
        <span>Categoria</span>
        <input
          type="text"
          list="obra-categorias"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          placeholder="Projeto de interiores"
        />
        <datalist id="obra-categorias">
          {CATEGORIAS_OBRA.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="obra-campo">
        <span>Escopo</span>
        <textarea
          rows={2}
          value={escopo}
          onChange={(e) => setEscopo(e.target.value)}
          placeholder="O que está contratado, em uma linha"
        />
      </label>

      <div className="obra-campo-linha">
        <label className="obra-campo">
          <span>Valor total</span>
          <input
            type="text"
            inputMode="decimal"
            value={valorTotal}
            onChange={(e) => setValorTotal(e.target.value)}
            placeholder="28000"
          />
        </label>
        <label className="obra-campo">
          <span>Data do contrato</span>
          <input
            type="date"
            value={dataContrato ?? ""}
            onChange={(e) => setDataContrato(e.target.value)}
          />
        </label>
      </div>

      <label className="obra-campo">
        <span>Condições de pagamento</span>
        <input
          type="text"
          value={condicoes}
          onChange={(e) => setCondicoes(e.target.value)}
          placeholder="30% na assinatura · 30% no executivo · 40% no detalhamento"
        />
      </label>

      <label className="obra-campo">
        <span>Contato</span>
        <input
          type="text"
          value={contato}
          onChange={(e) => setContato(e.target.value)}
          placeholder="Telefone ou e-mail de cobrança"
        />
      </label>

      {editando && (
        <label className="obra-campo">
          <span>Situação</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ContratoStatus)}>
            {STATUS_CONTRATO.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {!editando && (
        <div className="obra-parcelamento">
          <label className="obra-check">
            <input type="checkbox" checked={gerar} onChange={(e) => setGerar(e.target.checked)} />
            <span>Gerar parcelas agora (entrada + mensais iguais)</span>
          </label>

          {gerar && (
            <>
              <div className="obra-campo-linha">
                <label className="obra-campo">
                  <span>Entrada (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={entradaPercentual}
                    onChange={(e) => setEntradaPercentual(e.target.value)}
                  />
                </label>
                <label className="obra-campo">
                  <span>Vencimento da entrada</span>
                  <input
                    type="date"
                    value={entradaVencimento}
                    onChange={(e) => setEntradaVencimento(e.target.value)}
                  />
                </label>
              </div>

              <div className="obra-campo-linha">
                <label className="obra-campo">
                  <span>Nº de parcelas</span>
                  <input
                    type="number"
                    min={0}
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                  />
                </label>
                <label className="obra-campo">
                  <span>1º vencimento</span>
                  <input
                    type="date"
                    value={primeiroVencimento}
                    onChange={(e) => setPrimeiroVencimento(e.target.value)}
                  />
                </label>
              </div>

              {previa.length > 0 && (
                <div className="obra-previa">
                  <p className="obra-previa-titulo">
                    {previa.length} parcelas · soma {formatBRL(somaPrevia)}
                  </p>
                  <ul>
                    {previa.map((p) => (
                      <li key={p.numero}>
                        <span>{p.descricao}</span>
                        <span className="obra-previa-data">{formatDataCurta(p.vencimento)}</span>
                        <span className="obra-previa-valor">{formatBRL(p.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="obra-dica">
                Parcela que só vence quando a arquiteta entrega alguma coisa não se gera aqui —
                adicione pelo card do contrato escolhendo “quando uma entrega acontecer”.
              </p>
            </>
          )}
        </div>
      )}

      {erro && <p className="obra-erro">{erro}</p>}

      <div className="obra-editor-acoes">
        <button type="button" className="obra-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="obra-btn obra-btn--primario" disabled={salvando}>
          {salvando ? "Salvando..." : editando ? "Salvar contrato" : "Criar contrato"}
        </button>
      </div>
    </form>
  );
}
