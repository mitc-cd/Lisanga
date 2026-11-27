import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orgSettings, organizations, users } from "@/db/schema";
import type { Actor } from "@/server/actor";

if (!process.env.DATABASE_URL?.includes("mitc_test")) throw new Error("Les tests d'intégration doivent viser la base mitc_test.");

export async function resetDb() {
  await db.execute(sql`truncate table notifications, task_events, comments, task_labels, labels, task_projects, tasks, sections,
    project_members, projects, team_members, teams, audit_logs, invitations, sessions, accounts, verifications,
    login_challenges, rate_limit_events, setup_tokens, jobs, users, org_settings, organizations restart identity cascade`);
}

export async function createOrg(name = "MiTC test") {
  const [org] = await db.insert(organizations).values({ name }).returning();
  await db.insert(orgSettings).values({ organizationId: org!.id });
  return org!;
}

let n = 0;
export async function makeUser(
  orgId: string,
  opts: { role?: Actor["orgRole"]; external?: boolean; status?: "active" | "invited" | "deactivated"; name?: string; email?: string } = {},
): Promise<Actor> {
  n++;
  const name = opts.name ?? `Personne ${n}`;
  const email = opts.email ?? `p${n}-${Date.now()}@test.mitc`;
  const [u] = await db
    .insert(users)
    .values({
      organizationId: orgId,
      name,
      email,
      orgRole: opts.role ?? "member",
      isExternal: opts.external ?? false,
      status: opts.status ?? "active",
      emailVerified: true,
    })
    .returning();
  return { id: u!.id, organizationId: orgId, orgRole: u!.orgRole, isExternal: u!.isExternal, name, email };
}

export async function setUserStatus(id: string, status: "active" | "invited" | "deactivated") {
  await db.update(users).set({ status }).where(eq(users.id, id));
}

/** Attend une AppError d'un code donné. */
export async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c !== code) throw new Error(`Code attendu ${code}, reçu ${c} (${(e as Error).message})`);
    return e as Error;
  }
  throw new Error(`Une erreur ${code} était attendue, l'appel a réussi.`);
}
