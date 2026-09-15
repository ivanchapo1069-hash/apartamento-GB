import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { UserName } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password.trim() : "";

  const sessionSecret = process.env.SESSION_SECRET;
  const senhas: Record<UserName, string | undefined> = {
    Ivan: process.env.IVAN_PASSWORD,
    Giovana: process.env.GIOVANA_PASSWORD,
  };

  if (!sessionSecret || !senhas.Ivan || !senhas.Giovana) {
    return NextResponse.json(
      { ok: false, error: "Configuração ausente no servidor." },
      { status: 500 },
    );
  }

  const usuario = (Object.entries(senhas) as [UserName, string][]).find(
    ([, senha]) => password.length > 0 && senha === password,
  )?.[0];

  if (!usuario) {
    return NextResponse.json({ ok: false, error: "Senha incorreta." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("gb_session", sessionSecret, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  // Legível pelo cliente de propósito: só identifica quem está usando o app
  // (atribuição de "última alteração"), não é usada pelo middleware para
  // liberar acesso — quem faz isso é o gb_session, httpOnly.
  response.cookies.set("gb_user", usuario, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}
