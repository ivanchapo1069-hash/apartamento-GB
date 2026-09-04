"use client";

import { useEffect, useState } from "react";
import type { QuotePatch, SaveStatus, ShoppingItem } from "@/lib/types";
import SuggestionsList from "./SuggestionsList";

interface QuoteSearchResponse {
  ok: boolean;
  price?: number;
  store?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  error?: string;
}

interface QuoteCardProps {
  item: ShoppingItem;
  saveStatus: SaveStatus;
  onQuoteChange: (id: number, patch: Partial<QuotePatch>) => void;
  onSpecificationChange: (id: number, specification: string) => void;
  onRetry: (id: number) => void;
}

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function toPriceInput(value: number | null): string {
  if (value === null || value === undefined) return "";
  return value.toFixed(2).replace(".", ",");
}

function parsePrice(value: string): number | null {
  const cleaned = value.replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : (() => {
        const parts = cleaned.split(".");
        if (parts.length <= 1) return cleaned;
        const decimals = parts.at(-1) ?? "";
        return decimals.length <= 2
          ? `${parts.slice(0, -1).join("")}.${decimals}`
          : parts.join("");
      })();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function QuoteCard({
  item,
  saveStatus,
  onQuoteChange,
  onSpecificationChange,
  onRetry,
}: QuoteCardProps) {
  const [priceDraft, setPriceDraft] = useState(toPriceInput(item.quote_price));
  const [specDraft, setSpecDraft] = useState(item.specification ?? "");
  const [imageFailed, setImageFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    setPriceDraft(toPriceInput(item.quote_price));
  }, [item.quote_price]);

  useEffect(() => {
    setSpecDraft(item.specification ?? "");
  }, [item.specification]);

  useEffect(() => {
    setImageFailed(false);
  }, [item.quote_image_url]);

  function commitPrice() {
    const price = parsePrice(priceDraft);
    setPriceDraft(toPriceInput(price));
    onQuoteChange(item.id, { quote_price: price });
  }

  async function handleAutoSearch() {
    setSearching(true);
    setSearchError("");
    try {
      const response = await fetch("/api/quote/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: item.item,
          specification: item.specification ?? "",
          section: item.section,
        }),
      });
      const data: QuoteSearchResponse = await response.json();
      if (!response.ok || !data.ok || typeof data.price !== "number") {
        setSearchError(data.error || "Não encontramos um preço confiável.");
        return;
      }
      onQuoteChange(item.id, {
        quote_price: data.price,
        quote_store: data.store ?? null,
        quote_product_url: data.productUrl ?? null,
        quote_image_url: data.imageUrl ?? null,
      });
    } catch {
      setSearchError("Erro ao buscar o preço. Tente novamente.");
    } finally {
      setSearching(false);
    }
  }

  const hasQuote = item.quote_price !== null && item.quote_price !== undefined;
  const imageUrl = safeHttpUrl(item.quote_image_url);
  const productUrl = safeHttpUrl(item.quote_product_url);

  return (
    <article className={hasQuote ? "quote-card is-quoted" : "quote-card"}>
      <div className="quote-card-main">
        <div className="quote-image-wrap">
          {imageUrl && !imageFailed ? (
            <img
              className="quote-image"
              src={imageUrl}
              alt={`Produto cotado para ${item.item}`}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="quote-image-placeholder" aria-label="Cotação sem foto">
              <span>Sem foto</span>
            </div>
          )}
        </div>

        <div className="quote-card-info">
          <p className="quote-section">{item.section}</p>
          <h3>{item.item}</h3>
          {item.specification && <p className="quote-spec">{item.specification}</p>}
          {!item.specification && item.style_reference && (
            <p className="quote-style-reference">Referência do projeto: {item.style_reference}</p>
          )}
          <details className="spec-editor">
            <summary>{item.specification ? "Editar marca/modelo do projeto" : "Definir marca/modelo do projeto"}</summary>
            <label className="spec-editor-field">
              <span>Marca / modelo</span>
              <input
                type="text"
                placeholder="Ex.: Tramontina 94869220"
                value={specDraft}
                onChange={(event) => setSpecDraft(event.target.value)}
                onBlur={() => onSpecificationChange(item.id, specDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
          </details>
          <p className={hasQuote ? "quote-price" : "quote-price is-empty"}>
            {hasQuote ? currency.format(item.quote_price ?? 0) : "Preço pendente"}
          </p>
          {item.quote_store && <p className="quote-store">{item.quote_store}</p>}
          {productUrl && (
            <a className="quote-product-link" href={productUrl} target="_blank" rel="noreferrer">
              Ver produto
            </a>
          )}
          <button
            type="button"
            className="quote-auto-search-btn"
            onClick={handleAutoSearch}
            disabled={searching}
          >
            {searching ? "Buscando..." : hasQuote ? "Buscar novamente" : "Buscar melhor preço"}
          </button>
          {searchError && <p className="quote-search-error">{searchError}</p>}
          <SuggestionsList itemId={item.id} />
        </div>
      </div>

      <details className="quote-editor">
        <summary>{hasQuote ? "Editar cotação" : "Adicionar cotação"}</summary>
        <div className="quote-fields">
          <label>
            <span>Preço</span>
            <div className="price-field">
              <span>R$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={priceDraft}
                onChange={(event) => setPriceDraft(event.target.value)}
                onBlur={commitPrice}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </div>
          </label>
          <label>
            <span>Loja</span>
            <input
              type="text"
              placeholder="Nome da loja"
              value={item.quote_store ?? ""}
              onChange={(event) => onQuoteChange(item.id, { quote_store: event.target.value || null })}
            />
          </label>
          <label>
            <span>Link do produto</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={item.quote_product_url ?? ""}
              onChange={(event) =>
                onQuoteChange(item.id, { quote_product_url: event.target.value || null })
              }
            />
          </label>
          <label>
            <span>Link da foto</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={item.quote_image_url ?? ""}
              onChange={(event) => onQuoteChange(item.id, { quote_image_url: event.target.value || null })}
            />
          </label>
        </div>
      </details>

      <div className="item-footer quote-footer">
        <span className="item-updated">
          {hasQuote && item.quote_checked_at
            ? `Cotação atualizada em ${new Date(item.quote_checked_at).toLocaleDateString("pt-BR")}`
            : "Ainda não cotado"}
        </span>
        <span className="save-status">
          {saveStatus === "saving" && <span className="save-status--saving">Salvando...</span>}
          {saveStatus === "saved" && <span className="save-status--saved">Salvo ✓</span>}
          {saveStatus === "error" && (
            <button type="button" className="save-status--error" onClick={() => onRetry(item.id)}>
              Erro ao salvar - tentar novamente
            </button>
          )}
        </span>
      </div>
    </article>
  );
}
