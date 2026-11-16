import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "cb_session";
export const DEVICE_TOKEN_PREFIX = "cbw_";
const SESSION_DAYS = 30;

export const sessionMaxAgeSeconds = SESSION_DAYS * 24 * 60 * 60;

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function newDeviceToken(): string {
  return `${DEVICE_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  };
}
