import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getSessionUser } from "@/lib/auth";
import { getRouteById } from "@/lib/repo";
import { usingMockProvider } from "@/lib/traffic";
import { SettingsForm } from "@/app/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function EditRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const route = getRouteById(user.id, Number(id));
  if (!route) notFound();

  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link href={`/routes/${route.id}`} className="text-xs text-zinc-500 hover:text-zinc-200">
          ← Back to {route.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Edit route</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Changing the start or destination resets this route&apos;s history.
        </p>
        <SettingsForm route={route} mode="edit" mock={usingMockProvider()} />
      </main>
    </>
  );
}
