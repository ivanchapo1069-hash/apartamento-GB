"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ShoppingItem, UserName } from "@/lib/types";

interface Props {
  item: ShoppingItem | null;
  secoes: string[];
  secaoInicial?: string;
  currentUser: UserName;
  onDone: (salvo: ShoppingItem) => void;
  onCancel: () => void;
}

export default function ItemForm({
  item,
  secoes,
  secaoInicial,
  currentUser,
  onDone,
  onCancel,
}: Props) {
  const editando = Boolean(item);

  const [nome, setNome] = useState(item?.item ?? "");
  const [secao, setSecao] = useState(item?.section ?? secaoInicial ?? "");
  const [especificacao, setEspecificacao] = useState(item?.specification ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(event: React.FormEvent) {
    event.preventDefault();

    if (!nome.trim()) return setErro("Diga qual é o item.");
    if (!secao.trim()) return setErro("Escolha o ambiente do item.");

    setSalvando(true);
    setErro("");

    const dados = {
      item: nome.trim(),
      section: secao.trim(),
      specification: especificacao.trim() || null,
      updated_by: currentUser,
      updated_at: new Date().toISOString(),
    };

    const consulta = item
      ? supabase.from("shopping_items").update(dados).eq("id", item.id)
      : supabase.from("shopping_items").insert(dados);
    const { data, error } = await consulta.select("*").single();

    setSalvando(false);
    if (error || !data) {
      return setErro(editando ? "Não deu para salvar o item." : "Não deu para criar o item.");
    }
    onDone(data as ShoppingItem);
  }

  return (
    <form className="obra-form item-form" onSubmit={salvar}>
      <h3 className="obra-form-titulo">{editando ? "Editar item" : "Novo item"}</h3>

      <label className="obra-campo">
        <span>Item</span>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Cooktop"
          autoFocus
        />
      </label>

      <label className="obra-campo">
        <span>Ambiente</span>
        <input
          type="text"
          list="item-secoes"
          value={secao}
          onChange={(e) => setSecao(e.target.value)}
          placeholder="Cozinha"
        />
        <datalist id="item-secoes">
          {secoes.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>

      <label className="obra-campo">
        <span>Especificação</span>
        <textarea
          rows={2}
          value={especificacao}
          onChange={(e) => setEspecificacao(e.target.value)}
          placeholder="Marca, modelo, medida — opcional"
        />
      </label>

      {!editando && (
        <p className="obra-dica">O item entra como pendente. Decida FICA, SAI ou TROCAR no card.</p>
      )}

      {erro && <p className="obra-erro">{erro}</p>}

      <div className="obra-editor-acoes">
        <button type="button" className="obra-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="obra-btn obra-btn--primario" disabled={salvando}>
          {salvando ? "Salvando..." : editando ? "Salvar item" : "Adicionar item"}
        </button>
      </div>
    </form>
  );
}
