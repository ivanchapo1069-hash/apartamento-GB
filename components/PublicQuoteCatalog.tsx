"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { sortSections } from "@/lib/sections";
import type { ShoppingItem } from "@/lib/types";

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

// Mesma regra do QuoteCard: fotos coladas manualmente vêm como data URI.
function safeImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-zA-Z0-9+/]+=*$/.test(value)) {
    return value;
  }
  return safeHttpUrl(value);
}

function PublicQuoteCard({ item }: { item: ShoppingItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasQuote = item.quote_price !== null && item.quote_price !== undefined;
  const imageUrl = safeImageUrl(item.quote_image_url);
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
          <p className={hasQuote ? "quote-price" : "quote-price is-empty"}>
            {hasQuote ? currency.format(item.quote_price ?? 0) : "Preço pendente"}
          </p>
          {item.quote_store && <p className="quote-store">{item.quote_store}</p>}
          {productUrl && (
            <a className="quote-product-link" href={productUrl} target="_blank" rel="noreferrer">
              Ver produto
            </a>
          )}
        </div>
      </div>

      <div className="item-footer quote-footer">
        <span className="item-updated">
          {hasQuote && item.quote_checked_at
            ? `Cotação atualizada em ${new Date(item.quote_checked_at).toLocaleDateString("pt-BR")}`
            : "Ainda não cotado"}
        </span>
      </div>
    </article>
  );
}

export default function PublicQuoteCatalog() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      const { data, error } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("decision", "FICA")
        .order("id", { ascending: true });
      if (!active) return;
      if (error) {
        setLoadError("Não foi possível carregar a lista. Tente novamente em instantes.");
      } else if (data) {
        setItems(data as ShoppingItem[]);
      }
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    const quoted = items.filter((item) => item.quote_price !== null && item.quote_price !== undefined);
    return {
      totalItems: items.length,
      quotedItems: quoted.length,
      totalPrice: quoted.reduce((total, item) => total + Number(item.quote_price ?? 0), 0),
    };
  }, [items]);

  const groupedSections = useMemo(() => {
    const bySection = new Map<string, ShoppingItem[]>();
    for (const item of items) {
      const list = bySection.get(item.section) ?? [];
      list.push(item);
      bySection.set(item.section, list);
    }
    return sortSections([...bySection.keys()]).map((section) => ({
      section,
      items: bySection.get(section) ?? [],
    }));
  }, [items]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-eyebrow">COTAÇÃO — SOMENTE LEITURA</p>
          <h1>Apartamento GB</h1>
        </div>
      </header>

      <section className="quote-summary" aria-label="Resumo das cotações">
        <div className="quote-summary-total">
          <span>Total cotado</span>
          <strong>{currency.format(summary.totalPrice)}</strong>
        </div>
        <div className="quote-summary-counts">
          <span>
            <strong>{summary.quotedItems}</strong> cotados
          </span>
          <span>
            <strong>{summary.totalItems - summary.quotedItems}</strong> pendentes
          </span>
        </div>
      </section>

      <p className="quote-list-label public-catalog-label">
        {summary.totalItems} itens que ficaram — página pública, sem edição
      </p>

      {loading && <p className="status-message">Carregando itens...</p>}
      {loadError && <p className="status-message status-message--error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && (
        <p className="status-message">Nenhum item encontrado.</p>
      )}

      <div className="sections-list">
        {groupedSections.map(({ section, items: sectionItems }) => (
          <section key={section} className="section-block">
            <h2 className="section-title">{section}</h2>
            <div className="section-items">
              {sectionItems.map((item) => (
                <PublicQuoteCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
