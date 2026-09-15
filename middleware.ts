import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// /api/quote/fetch-image fica pública de propósito: só extrai a foto de uma
// URL de produto e grava o link da imagem (nunca preço/decisão), e é chamada
// pela rotina diária em segundo plano, que não tem cookie de sessão de navegador.
// /cotacao também é pública de propósito: link somente leitura pra mandar
// pro fornecedor/fabricante de móveis, sem dar acesso ao resto do app
// (decisões, edição, senha de cada morador).
const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/quote/fetch-image", "/cotacao"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const expected = process.env.SESSION_SECRET;
  const session = request.cookies.get("gb_session")?.value;

  if (!expected || session !== expected) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
