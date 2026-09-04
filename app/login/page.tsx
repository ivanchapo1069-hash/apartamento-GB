"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!code) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok) {
        router.replace("/");
        router.refresh();
      } else {
        setError(data.error || "Código incorreto.");
      }
    } catch {
      setError("Erro ao conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-card">
        <div className="login-emoji">🏠</div>
        <h1>Compras</h1>
        <p className="login-subtitle">Apartamento GB</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="code">Código da família</label>
          <input
            id="code"
            name="code"
            type="password"
            autoFocus
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Digite o código"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading || !code}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
