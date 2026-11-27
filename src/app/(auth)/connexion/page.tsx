import { redirect } from "next/navigation";
import { getPublicSettings } from "@/server/settings";
import { getActor } from "@/server/auth/session";
import { hasAdmin } from "@/server/setup";
import { Alert } from "@/components/ui/misc";
import { EmailForm, MicrosoftButton } from "./login-forms";

export const metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  microsoft: "La connexion avec Microsoft a échoué ou votre compte n'est pas autorisé. Demandez une invitation à un administrateur.",
};

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  if (!(await hasAdmin())) redirect("/installation");
  if (await getActor()) redirect("/mes-taches");
  const s = await getPublicSettings();
  const sp = await searchParams;
  const err = typeof sp.erreur === "string" || typeof sp.error === "string" ? ERRORS.microsoft : null;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Connexion</h1>
        <p className="mt-1 text-sm text-muted">
          {s.emailLoginEnabled ? "Sans mot de passe : recevez un lien et un code par e-mail." : "Connectez-vous avec votre compte Microsoft MiTC."}
        </p>
      </div>
      {sp.deconnecte && <Alert tone="success">Vous êtes déconnecté de tous vos appareils.</Alert>}
      {err && <Alert tone="danger">{err}</Alert>}
      {s.emailLoginEnabled && <EmailForm defaultEmail={typeof sp.email === "string" ? sp.email : ""} />}
      {s.emailLoginEnabled && s.entraEnabled && (
        <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>
      )}
      {s.entraEnabled && <MicrosoftButton />}
      <p className="text-xs text-muted">L&apos;accès se fait sur invitation. Pas encore de compte ? Contactez un administrateur.</p>
    </div>
  );
}
