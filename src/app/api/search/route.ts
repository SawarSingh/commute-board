import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchPlaces, usingMockProvider } from "@/lib/traffic";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ suggestions: [], mock: usingMockProvider() });
  }

  try {
    const suggestions = await searchPlaces(query);
    return NextResponse.json({ suggestions, mock: usingMockProvider() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
