import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { createSession, findUserByEmail } from "@/lib/repo";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/tokens";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const user = email.length > 0 ? findUserByEmail(email) : null;
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }

  const token = createSession(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
