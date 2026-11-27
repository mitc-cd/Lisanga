import { redirect } from "next/navigation";
import { CodeForm } from "./code-form";

export const metadata = { title: "Code de connexion" };

export default async function CodePage({ searchParams }: PageProps<"/connexion/code">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  if (!email) redirect("/connexion");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Vérifiez vos e-mails</h1>
        <p className="mt-1 text-sm text-muted">
          Si l&apos;adresse <strong className="text-fg">{email}</strong> est autorisée, vous allez recevoir un e-mail contenant un lien de connexion et un
          code à 6 chiffres. Cliquez sur le lien, ou saisissez le code ci-dessous.
        </p>
      </div>
      <CodeForm email={email} />
    </div>
  );
}
