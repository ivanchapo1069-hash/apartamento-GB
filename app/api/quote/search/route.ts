import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

interface QuoteSearchResult {
  price: number;
  store: string | null;
  productUrl: string | null;
  imageUrl: string | null;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    const match = candidate.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function parseQuoteResponse(raw: unknown): QuoteSearchResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const price = typeof data.price === "number" ? data.price : Number(data.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price: Math.round(price * 100) / 100,
    store: typeof data.store === "string" && data.store.trim() ? data.store.trim() : null,
    productUrl: safeHttpUrl(data.product_url),
    imageUrl: safeHttpUrl(data.image_url),
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Busca automática não configurada — falta GEMINI_API_KEY na Vercel.",
      },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const item = typeof body?.item === "string" ? body.item.trim() : "";
  const specification = typeof body?.specification === "string" ? body.specification.trim() : "";
  const section = typeof body?.section === "string" ? body.section.trim() : "";

  if (!item) {
    return NextResponse.json({ ok: false, error: "Item não informado." }, { status: 400 });
  }

  const model = process.env.GEMINI_QUOTE_MODEL || "gemini-3.6-flash";
  const prompt = [
    "Você é um assistente de compras que busca preços reais e atuais no Brasil.",
    "",
    `Produto: ${item}`,
    specification ? `Especificação: ${specification}` : null,
    section ? `Ambiente: ${section}` : null,
    "",
    "Busque na web o MELHOR PREÇO ATUAL para esse produto específico, à venda no Brasil,",
    "em lojas conhecidas e confiáveis (Amazon.com.br, Mercado Livre, Magazine Luiza,",
    "Leroy Merlin, Casas Bahia, Ponto, Fast Shop, C&C, etc). Prefira o menor preço entre",
    "resultados que batem com a especificação pedida — não escolha um produto diferente",
    "só porque é mais barato.",
    "",
    "Responda ESTRITAMENTE em JSON, sem nenhum texto antes ou depois, neste formato exato:",
    '{"price": <número em reais, só o valor, sem "R$" e sem separador de milhar>, "store": "<nome da loja>", "product_url": "<url direta do produto>", "image_url": "<url de uma imagem do produto, ou null>"}',
    "",
    'Se não encontrar um preço confiável para esse produto específico, responda: {"price": null}',
  ]
    .filter(Boolean)
    .join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1 },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[cotacao] Gemini respondeu com erro", response.status, detail.slice(0, 500));
      return NextResponse.json(
        { ok: false, error: "O serviço de busca de preços falhou. Tente novamente." },
        { status: 502 },
      );
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    const parsedRaw = extractJson(text);
    const result = parseQuoteResponse(parsedRaw);

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Não encontramos um preço confiável para este item." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error("[cotacao] falha na busca", aborted ? "timeout" : error);
    return NextResponse.json(
      {
        ok: false,
        error: aborted
          ? "A busca demorou demais e foi cancelada. Tente novamente."
          : "Erro ao buscar o preço. Tente novamente.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
