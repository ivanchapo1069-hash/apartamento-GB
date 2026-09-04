import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  const expectedCode = process.env.APP_ACCESS_CODE;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!expectedCode || !sessionSecret) {
    return NextResponse.json(
      { ok: false, error: "Configuração ausente no servidor." },
      { status: 500 },
    );
  }

  if (!code || code !== expectedCode) {
    return NextResponse.json(
      { ok: false, error: "Código incorreto." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("gb_session", sessionSecret, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}
