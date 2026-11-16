import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getSessionUser } from "@/lib/auth";
import { usingMockProvider } from "@/lib/traffic";
import { SettingsForm } from "@/app/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function NewRoutePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-semibold">Add a route</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Give it a name you will recognise, then pick the start and destination.
        </p>
        <SettingsForm route={null} mode="create" mock={usingMockProvider()} />
      </main>
    </>
  );
}
