import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const maxDuration = 15;

function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"].includes(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

function safePublicUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isPrivateHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  // Endpoint interno: chamado pela rotina diária em segundo plano (sem cookie
  // de navegador), então a autenticação aqui é um token, não a sessão normal.
  // Reaproveita o SESSION_SECRET já configurado — não precisa de env var nova.
  const token = request.nextUrl.searchParams.get("token");
  const expectedToken = process.env.SESSION_SECRET;
  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const itemId = Number(request.nextUrl.searchParams.get("itemId"));
  const productUrl = safePublicUrl(request.nextUrl.searchParams.get("url"));

  if (!Number.isInteger(itemId) || itemId <= 0 || !productUrl) {
    return NextResponse.json({ ok: false, error: "Parâmetros inválidos." }, { status: 400 });
  }

  try {
    const response = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `A página do produto respondeu ${response.status}.` },
        { status: 502 },
      );
    }

    const html = await response.text();
    const imageUrl = safePublicUrl(extractOgImage(html));

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: "Não achei uma imagem na página do produto." },
        { status: 404 },
      );
    }

    const { error } = await supabase
      .from("shopping_items")
      .update({ quote_image_url: imageUrl })
      .eq("id", itemId);

    if (error) {
      return NextResponse.json({ ok: false, error: "Falha ao salvar a imagem." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, imageUrl });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("[cotacao-imagem] falha", timedOut ? "timeout" : error);
    return NextResponse.json(
      {
        ok: false,
        error: timedOut
          ? "A página do produto demorou demais para responder."
          : "Erro ao buscar a imagem do produto.",
      },
      { status: 502 },
    );
  }
}
