import { requireActor } from "@/server/auth/session";
import { getPublicSettings, getSettingsRow } from "@/server/settings";
import { listProjects } from "@/server/projects";
import { AppShell } from "@/components/shell/app-shell";
import { Providers } from "@/components/shell/providers";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  const [settings, projects, row] = await Promise.all([
    getPublicSettings(),
    listProjects(actor),
    getSettingsRow(actor.organizationId),
  ]);
  const mine = projects
    .filter((p) => p.isMember)
    .map((p) => ({ id: p.id, name: p.name, color: p.color, visibility: p.visibility, canEdit: p.role === "owner" || p.role === "editor" }));
  return (
    <Providers actor={{ id: actor.id, name: actor.name, email: actor.email, orgRole: actor.orgRole }}>
      <AppShell appName={settings.appName} logoPath={settings.logoPath} projects={mine} smtpFailing={row.smtpStatus === "failing"}>
        {children}
      </AppShell>
    </Providers>
  );
}
