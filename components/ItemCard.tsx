"use client";

import { useState } from "react";
import type { Decision, SaveStatus, ShoppingItem } from "@/lib/types";
import { formatRelativeTime } from "@/lib/time";

interface ItemCardProps {
  item: ShoppingItem;
  saveStatus: SaveStatus;
  onDecision: (id: number, decision: Decision) => void;
  onNoteChange: (id: number, note: string) => void;
  onNoteBlur: (id: number) => void;
  onRetry: (id: number) => void;
  onEdit: (item: ShoppingItem) => void;
  onDelete: (id: number) => Promise<boolean>;
}

export default function ItemCard({
  item,
  saveStatus,
  onDecision,
  onNoteChange,
  onNoteBlur,
  onRetry,
  onEdit,
  onDelete,
}: ItemCardProps) {
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const decisionClass = item.decision ? item.decision.toLowerCase() : "pendente";

  async function excluir() {
    setExcluindo(true);
    const ok = await onDelete(item.id);
    // Se deu certo o card some; só volta ao normal quando falhou.
    if (!ok) {
      setExcluindo(false);
      setConfirmando(false);
    }
  }

  // Item já pago entra no realizado do orçamento: apagar muda o saldo.
  const avisoExclusao = item.comprado_em
    ? "Este item já foi comprado — excluir tira o valor pago do orçamento."
    : item.quote_price !== null && item.quote_price !== undefined
      ? "A cotação deste item também será apagada."
      : "";

  function toggle(decision: Exclude<Decision, null>) {
    onDecision(item.id, item.decision === decision ? null : decision);
  }

  return (
    <article className={`item-card item-card--${decisionClass}`}>
      <div className="item-card-head">
        <h3>{item.item}</h3>
        {item.specification && <p className="item-spec">{item.specification}</p>}
      </div>

      <div className="decision-buttons">
        <button
          type="button"
          className={
            item.decision === "FICA" ? "decision-btn decision-btn--fica is-active" : "decision-btn decision-btn--fica"
          }
          onClick={() => toggle("FICA")}
        >
          FICA
        </button>
        <button
          type="button"
          className={
            item.decision === "SAI" ? "decision-btn decision-btn--sai is-active" : "decision-btn decision-btn--sai"
          }
          onClick={() => toggle("SAI")}
        >
          SAI
        </button>
        <button
          type="button"
          className={
            item.decision === "TROCAR"
              ? "decision-btn decision-btn--trocar is-active"
              : "decision-btn decision-btn--trocar"
          }
          onClick={() => toggle("TROCAR")}
        >
          TROCAR
        </button>
      </div>

      <textarea
        className="item-note"
        placeholder="Observação..."
        rows={2}
        value={item.note ?? ""}
        onChange={(event) => onNoteChange(item.id, event.target.value)}
        onBlur={() => onNoteBlur(item.id)}
      />

      <div className="item-footer">
        <span className="item-updated">
          {item.updated_by
            ? `Última alteração: ${item.updated_by} · ${formatRelativeTime(item.updated_at)}`
            : "Sem alterações ainda"}
        </span>
        <span className="save-status">
          {saveStatus === "saving" && <span className="save-status--saving">Salvando...</span>}
          {saveStatus === "saved" && <span className="save-status--saved">Salvo ✓</span>}
          {saveStatus === "error" && (
            <button type="button" className="save-status--error" onClick={() => onRetry(item.id)}>
              Erro ao salvar — tentar novamente
            </button>
          )}
        </span>
      </div>

      <div className="item-acoes">
        {confirmando ? (
          <>
            {avisoExclusao && <p className="item-acoes-aviso">{avisoExclusao}</p>}
            <button
              type="button"
              className="obra-btn obra-btn--mini"
              disabled={excluindo}
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="obra-btn obra-btn--mini obra-btn--perigo"
              disabled={excluindo}
              onClick={excluir}
            >
              {excluindo ? "Excluindo..." : "Confirmar exclusão"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="obra-btn obra-btn--mini" onClick={() => onEdit(item)}>
              Editar
            </button>
            <button
              type="button"
              className="obra-btn obra-btn--mini"
              onClick={() => setConfirmando(true)}
            >
              Excluir
            </button>
          </>
        )}
      </div>
    </article>
  );
}
