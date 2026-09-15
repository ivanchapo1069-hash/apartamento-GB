"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SECTION_ORDER } from "@/lib/sections";
import type { UserName } from "@/lib/types";

interface Props {
  currentUser: UserName;
  onDone: () => void;
  onCancel: () => void;
}

export default function ItemEditor({ currentUser, onDone, onCancel }: Props) {
  const [section, setSection] = useState("");
  const [item, setItem] = useState("");
  const [specification, setSpecification] = useState("");
  const [styleReference, setStyleReference] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    if (!section.trim()) return setErro("Diga em qual ambiente o item fica.");
    if (!item.trim()) return setErro("Diga o nome do item.");

    setSalvando(true);
    setErro("");

    const { error } = await supabase.from("shopping_items").insert({
      section: section.trim(),
      item: item.trim(),
      specification: specification.trim() || null,
      style_reference: styleReference.trim() || null,
      decision: null,
      updated_by: currentUser,
    });

    setSalvando(false);
    if (error) {
      setErro("Não deu para salvar o item.");
      return;
    }
    onDone();
  }

  return (
    <form className="obra-form" onSubmit={salvar}>
      <h3 className="obra-form-titulo">Novo item</h3>

      <label className="obra-campo">
        <span>Ambiente</span>
        <input
          type="text"
          list="item-secoes"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          placeholder="Cozinha, Sacada gourmet..."
          autoFocus
        />
        <datalist id="item-secoes">
          {SECTION_ORDER.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>

      <label className="obra-campo">
        <span>Item</span>
        <input
          type="text"
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="Papel de parede"
        />
      </label>

      <div className="obra-campo-linha">
        <label className="obra-campo">
          <span>Especificação (opcional)</span>
          <input
            type="text"
            value={specification}
            onChange={(e) => setSpecification(e.target.value)}
            placeholder="Textura, cor, medida..."
          />
        </label>
        <label className="obra-campo">
          <span>Referência de estilo (opcional)</span>
          <input
            type="text"
            value={styleReference}
            onChange={(e) => setStyleReference(e.target.value)}
            placeholder="Link ou nota de inspiração"
          />
        </label>
      </div>

      {erro && <p className="obra-erro">{erro}</p>}

      <div className="obra-editor-acoes">
        <button type="button" className="obra-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="obra-btn obra-btn--primario" disabled={salvando}>
          {salvando ? "Salvando..." : "Adicionar item"}
        </button>
      </div>
    </form>
  );
}
