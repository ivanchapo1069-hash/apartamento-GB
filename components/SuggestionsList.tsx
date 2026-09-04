"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ItemSuggestion } from "@/lib/types";

interface SuggestionsListProps {
  itemId: number;
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function SuggestionsList({ itemId }: SuggestionsListProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<ItemSuggestion[]>([]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      setError("");
      const { data, error: fetchError } = await supabase
        .from("shopping_item_suggestions")
        .select("*")
        .eq("shopping_item_id", itemId)
        .order("created_at", { ascending: false })
        .limit(6);
      if (fetchError) {
        setError("Não foi possível carregar as sugestões.");
      } else {
        setSuggestions((data as ItemSuggestion[]) ?? []);
        setLoaded(true);
      }
      setLoading(false);
    }
  }

  return (
    <div className="suggestions-block">
      <button type="button" className="suggestions-toggle" onClick={handleToggle}>
        {open ? "Ocultar produtos parecidos" : "Ver produtos parecidos"}
      </button>
      {open && (
        <div className="suggestions-body">
          {loading && <p className="suggestions-status">Carregando...</p>}
          {error && <p className="suggestions-status suggestions-status--error">{error}</p>}
          {!loading && !error && loaded && suggestions.length === 0 && (
            <p className="suggestions-status">Nenhuma sugestão ainda para este item.</p>
          )}
          {suggestions.length > 0 && (
            <div className="suggestions-list">
              {suggestions.map((suggestion) => {
                const imageUrl = safeHttpUrl(suggestion.image_url);
                const productUrl = safeHttpUrl(suggestion.product_url);
                return (
                  <div key={suggestion.id} className="suggestion-card">
                    <div className="suggestion-image-wrap">
                      {imageUrl ? (
                        <img
                          className="suggestion-image"
                          src={imageUrl}
                          alt={suggestion.label ?? "Sugestão de produto"}
                          loading="lazy"
                        />
                      ) : (
                        <div className="suggestion-image-placeholder">
                          <span>Sem foto</span>
                        </div>
                      )}
                    </div>
                    <div className="suggestion-info">
                      {suggestion.label && <p className="suggestion-label">{suggestion.label}</p>}
                      {suggestion.price !== null && (
                        <p className="suggestion-price">{currency.format(suggestion.price)}</p>
                      )}
                      {suggestion.store && <p className="suggestion-store">{suggestion.store}</p>}
                      {productUrl && (
                        <a
                          className="suggestion-link"
                          href={productUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver produto
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
