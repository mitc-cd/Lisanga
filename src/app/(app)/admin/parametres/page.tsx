import { requireActor } from "@/server/auth/session";
import { getAdminSettings } from "@/server/settings";
import { appUrl } from "@/server/env";
import { SettingsForms } from "./settings-forms";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage({ searchParams }: PageProps<"/admin/parametres">) {
  const actor = await requireActor();
  const settings = await getAdminSettings(actor);
  const sp = await searchParams;
  return (
    <SettingsForms
      settings={settings}
      redirectUri={`${appUrl()}/api/auth/callback/microsoft`}
      adminEmail={actor.email}
      onboarding={sp.etape === "smtp" && settings.smtp.status === "unconfigured"}
    />
  );
}
