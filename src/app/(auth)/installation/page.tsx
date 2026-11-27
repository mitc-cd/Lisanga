import Link from "next/link";
import { hasAdmin } from "@/server/setup";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Installation" };

export default async function InstallationPage({ searchParams }: PageProps<"/installation">) {
  const sp = await searchParams;
  if (await hasAdmin())
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold">Installation terminée</h1>
        <p className="text-sm text-muted">Un administrateur existe déjà : l&apos;assistant d&apos;installation est désactivé.</p>
        <Link href="/connexion" className="font-medium text-primary-text underline">
          Aller à la page de connexion
        </Link>
      </div>
    );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Installation</h1>
        <p className="mt-1 text-sm text-muted">
          Créez le premier compte administrateur. Vous aurez besoin du jeton d&apos;installation obtenu avec la commande{" "}
          <code className="rounded bg-surface-2 px-1">pnpm setup:admin</code> (ou de la variable <code className="rounded bg-surface-2 px-1">SETUP_TOKEN</code>).
        </p>
      </div>
      <SetupForm initialToken={typeof sp.jeton === "string" ? sp.jeton : ""} />
    </div>
  );
}
