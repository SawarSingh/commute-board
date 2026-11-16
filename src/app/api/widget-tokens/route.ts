import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createDeviceToken, deleteDeviceToken, listDeviceTokens } from "@/lib/repo";

export const dynamic = "force-dynamic";

const MAX_TOKENS = 10;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ tokens: listDeviceTokens(user.id) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (label.length > 60) {
    return NextResponse.json({ error: "Label must be 60 characters or fewer" }, { status: 400 });
  }
  if (listDeviceTokens(user.id).length >= MAX_TOKENS) {
    return NextResponse.json(
      { error: `Revoke a token before creating more than ${MAX_TOKENS}` },
      { status: 400 },
    );
  }

  const created = createDeviceToken(user.id, label || "iPhone widget");
  return NextResponse.json(
    {
      token: created.token,
      tokenId: created.id,
      label: created.label,
      createdAt: created.createdAt,
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Missing token id" }, { status: 400 });
  }
  const deleted = deleteDeviceToken(user.id, id);
  if (!deleted) return NextResponse.json({ error: "Token not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
