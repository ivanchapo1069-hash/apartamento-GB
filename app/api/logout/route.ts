import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("gb_session", "", { path: "/", maxAge: 0 });
  return response;
}
