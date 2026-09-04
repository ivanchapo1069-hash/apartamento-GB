"use client";

import type { Decision, SaveStatus, ShoppingItem } from "@/lib/types";
import { formatRelativeTime } from "@/lib/time";

interface ItemCardProps {
  item: ShoppingItem;
  saveStatus: SaveStatus;
  onDecision: (id: number, decision: Decision) => void;
  onNoteChange: (id: number, note: string) => void;
  onNoteBlur: (id: number) => void;
  onRetry: (id: number) => void;
}

export default function ItemCard({
  item,
  saveStatus,
  onDecision,
  onNoteChange,
  onNoteBlur,
  onRetry,
}: ItemCardProps) {
  const decisionClass = item.decision ? item.decision.toLowerCase() : "pendente";

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
    </article>
  );
}
