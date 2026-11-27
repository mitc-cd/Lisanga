import { LinkConfirm } from "./link-confirm";

export const metadata = { title: "Connexion" };

/**
 * Le lien de l'e-mail mène ici. Rien n'est consommé à l'ouverture (les antivirus de
 * messagerie ouvrent parfois les liens) : seul le clic sur le bouton connecte.
 */
export default async function LinkPage({ searchParams }: PageProps<"/connexion/lien">) {
  const sp = await searchParams;
  const token = typeof sp.jeton === "string" ? sp.jeton : "";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Confirmer la connexion</h1>
      <LinkConfirm token={token} />
    </div>
  );
}
