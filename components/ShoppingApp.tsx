"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { sortSections } from "@/lib/sections";
import type { Decision, FilterKey, SaveStatus, ShoppingItem, UserName } from "@/lib/types";
import ItemCard from "./ItemCard";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendentes", label: "Pendentes" },
  { key: "fica", label: "Fica" },
  { key: "sai", label: "Sai" },
  { key: "trocar", label: "Trocar" },
];

const USER_STORAGE_KEY = "gb-current-user";

export default function ShoppingApp() {
  const [userLoaded, setUserLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserName | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState<Record<number, SaveStatus>>({});

  const editingNoteIds = useRef<Set<number>>(new Set());
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPatches = useRef<Map<number, Partial<ShoppingItem>>>(new Map());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(USER_STORAGE_KEY);
      if (saved === "Ivan" || saved === "Giovana") {
        setCurrentUser(saved);
      }
    } catch {
      // localStorage indisponível — segue sem usuário memorizado
    }
    setUserLoaded(true);
  }, []);

  function chooseUser(user: UserName) {
    setCurrentUser(user);
    try {
      window.localStorage.setItem(USER_STORAGE_KEY, user);
    } catch {
      // ignora falha de armazenamento
    }
  }

  function switchUser() {
    setCurrentUser(null);
    try {
      window.localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // ignora falha de armazenamento
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      const { data, error } = await supabase
        .from("shopping_items")
        .select("*")
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

  useEffect(() => {
    const channel = supabase
      .channel("shopping-items-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_items" },
        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            const incoming = payload.new as ShoppingItem;
            setItems((prev) => {
              const exists = prev.some((it) => it.id === incoming.id);
              if (!exists) {
                return [...prev, incoming].sort((a, b) => a.id - b.id);
              }
              return prev.map((it) => {
                if (it.id !== incoming.id) return it;
                if (editingNoteIds.current.has(it.id)) {
                  return { ...incoming, note: it.note };
                }
                return incoming;
              });
            });
          } else if (payload.eventType === "DELETE") {
            const removedId = (payload.old as Partial<ShoppingItem>).id;
            if (typeof removedId === "number") {
              setItems((prev) => prev.filter((it) => it.id !== removedId));
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const persist = useCallback(async (id: number) => {
    const patch = pendingPatches.current.get(id);
    if (!patch) return;
    pendingPatches.current.delete(id);
    setSaveStatus((prev) => ({ ...prev, [id]: "saving" }));
    const { error } = await supabase.from("shopping_items").update(patch).eq("id", id);
    if (error) {
      pendingPatches.current.set(id, patch);
      setSaveStatus((prev) => ({ ...prev, [id]: "error" }));
      return;
    }
    setSaveStatus((prev) => ({ ...prev, [id]: "saved" }));
    window.setTimeout(() => {
      setSaveStatus((prev) => {
        if (prev[id] !== "saved") return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 1500);
  }, []);

  const scheduleSave = useCallback(
    (id: number, patch: Partial<ShoppingItem>) => {
      const existing = pendingPatches.current.get(id) ?? {};
      pendingPatches.current.set(id, { ...existing, ...patch });
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      const newTimer = setTimeout(() => {
        timers.current.delete(id);
        persist(id);
      }, 650);
      timers.current.set(id, newTimer);
    },
    [persist],
  );

  function handleDecision(id: number, decision: Decision) {
    if (!currentUser) return;
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, decision, updated_by: currentUser, updated_at: now } : it,
      ),
    );
    scheduleSave(id, { decision, updated_by: currentUser, updated_at: now });
  }

  function handleNoteChange(id: number, note: string) {
    if (!currentUser) return;
    editingNoteIds.current.add(id);
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, note, updated_by: currentUser, updated_at: now } : it,
      ),
    );
    scheduleSave(id, { note, updated_by: currentUser, updated_at: now });
  }

  function handleNoteBlur(id: number) {
    editingNoteIds.current.delete(id);
  }

  function handleRetry(id: number) {
    if (pendingPatches.current.has(id)) {
      persist(id);
      return;
    }
    const item = items.find((it) => it.id === id);
    if (!item) return;
    scheduleSave(id, {
      decision: item.decision,
      note: item.note,
      updated_by: item.updated_by,
      updated_at: item.updated_at,
    });
  }

  const counters = useMemo(() => {
    const result = { fica: 0, sai: 0, trocar: 0, pendentes: 0 };
    for (const item of items) {
      if (item.decision === "FICA") result.fica += 1;
      else if (item.decision === "SAI") result.sai += 1;
      else if (item.decision === "TROCAR") result.trocar += 1;
      else result.pendentes += 1;
    }
    return result;
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter =
        filter === "todos" ||
        (filter === "pendentes" && item.decision === null) ||
        (filter === "fica" && item.decision === "FICA") ||
        (filter === "sai" && item.decision === "SAI") ||
        (filter === "trocar" && item.decision === "TROCAR");
      if (!matchesFilter) return false;
      if (!term) return true;
      const haystack = `${item.item} ${item.specification ?? ""} ${item.section}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [items, filter, search]);

  const groupedSections = useMemo(() => {
    const bySection = new Map<string, ShoppingItem[]>();
    for (const item of filteredItems) {
      const list = bySection.get(item.section) ?? [];
      list.push(item);
      bySection.set(item.section, list);
    }
    return sortSections([...bySection.keys()]).map((section) => ({
      section,
      items: bySection.get(section) ?? [],
    }));
  }, [filteredItems]);

  if (!userLoaded) {
    return <div className="app-loading">Carregando...</div>;
  }

  if (!currentUser) {
    return (
      <main className="user-picker">
        <div className="user-picker-card">
          <div className="user-picker-emoji">🏠</div>
          <h1>Compras</h1>
          <p className="user-picker-subtitle">Apartamento GB</p>
          <p className="user-picker-question">Quem está usando?</p>
          <div className="user-picker-buttons">
            <button type="button" onClick={() => chooseUser("Ivan")}>
              Ivan
            </button>
            <button type="button" onClick={() => chooseUser("Giovana")}>
              Giovana
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-eyebrow">COMPRAS</p>
          <h1>Apartamento GB</h1>
        </div>
        <button type="button" className="switch-user-btn" onClick={switchUser}>
          {currentUser} · trocar
        </button>
      </header>

      <section className="counters-row" aria-label="Resumo">
        <div className="counter counter--fica">
          <span className="counter-value">{counters.fica}</span>
          <span className="counter-label">Fica</span>
        </div>
        <div className="counter counter--sai">
          <span className="counter-value">{counters.sai}</span>
          <span className="counter-label">Sai</span>
        </div>
        <div className="counter counter--trocar">
          <span className="counter-value">{counters.trocar}</span>
          <span className="counter-label">Trocar</span>
        </div>
        <div className="counter counter--pendentes">
          <span className="counter-value">{counters.pendentes}</span>
          <span className="counter-label">Pendentes</span>
        </div>
      </section>

      <section className="filters-row">
        <div className="filter-chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? "chip chip-active" : "chip"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          type="search"
          placeholder="Buscar item..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </section>

      {loading && <p className="status-message">Carregando itens...</p>}
      {loadError && <p className="status-message status-message--error">{loadError}</p>}
      {!loading && !loadError && filteredItems.length === 0 && (
        <p className="status-message">Nenhum item encontrado.</p>
      )}

      <div className="sections-list">
        {groupedSections.map(({ section, items: sectionItems }) => (
          <section key={section} className="section-block">
            <h2 className="section-title">{section}</h2>
            <div className="section-items">
              {sectionItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  saveStatus={saveStatus[item.id] ?? "idle"}
                  onDecision={handleDecision}
                  onNoteChange={handleNoteChange}
                  onNoteBlur={handleNoteBlur}
                  onRetry={handleRetry}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
