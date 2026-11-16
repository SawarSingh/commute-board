import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  findUserByDeviceToken,
  findUserByToken,
  touchDeviceToken,
  type SessionUser,
} from "./repo";
import { SESSION_COOKIE, hashToken } from "./tokens";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findUserByToken(hashToken(token));
}

export function getDeviceUser(request: Request): SessionUser | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  const row = findUserByDeviceToken(hashToken(token));
  if (!row) return null;
  touchDeviceToken(row.tokenId);
  return { id: row.id, email: row.email };
}
