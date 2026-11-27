/**
 * Données de démonstration FICTIVES. Refuse de s'exécuter sur une base de production.
 * Usage : pnpm db:seed            (ajoute les données si absentes)
 *         pnpm db:seed --reset    (vide d'abord toutes les tables — développement uniquement)
 */
import "./env";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { orgSettings, organizations, users } from "@/db/schema";
import { addProjectMember, createProject } from "@/server/projects";
import { createTask, updateTask } from "@/server/tasks";
import { addComment } from "@/server/comments";
import { addDaysIso, todayIso } from "@/lib/dates";
import { mentionToken } from "@/lib/mentions";
import type { Actor } from "@/server/actor";

function assertNotProduction() {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const local = ["localhost", "127.0.0.1", "::1", "postgres"].includes(host);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production")
    throw new Error("Refusé : environnement de production.");
  if (!local && process.env.ALLOW_REMOTE_SEED !== "1")
    throw new Error(`Refusé : base distante (${host}). Pour une base de preview, définissez ALLOW_REMOTE_SEED=1 (jamais en production).`);
}

const DEMO = [
  { key: "admin", name: "Aline Mbuyi (admin démo)", email: "admin@demo.mitc.test", orgRole: "admin" as const },
  { key: "chef", name: "Patrick Kabongo", email: "chef.projet@demo.mitc.test", orgRole: "member" as const },
  { key: "collab", name: "Grâce Ilunga", email: "collaboratrice@demo.mitc.test", orgRole: "member" as const },
  { key: "lecteur", name: "Joël Tshibanda", email: "lecteur@demo.mitc.test", orgRole: "viewer" as const },
];

async function main() {
  assertNotProduction();
  if (process.argv.includes("--reset")) {
    await db.execute(sql`
      truncate table notifications, task_events, comments, task_labels, labels, task_projects, tasks, sections,
        project_members, projects, team_members, teams, audit_logs, invitations, sessions, accounts, verifications,
        login_challenges, rate_limit_events, setup_tokens, jobs, users, org_settings, organizations restart identity cascade`);
    console.log("Base vidée.");
  }
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO[0]!.email));
  if (existing) {
    console.log("Données de démonstration déjà présentes (utilisez --reset pour repartir de zéro).");
    return;
  }
  let [org] = await db.select().from(organizations).limit(1);
  if (!org) {
    [org] = await db.insert(organizations).values({ name: "MiTC (démo)" }).returning();
    await db.insert(orgSettings).values({ organizationId: org!.id });
  }
  const actors: Record<string, Actor> = {};
  for (const d of DEMO) {
    const [u] = await db
      .insert(users)
      .values({ organizationId: org!.id, name: d.name, email: d.email, orgRole: d.orgRole, status: "active", emailVerified: true })
      .returning();
    actors[d.key] = { id: u!.id, organizationId: org!.id, orgRole: d.orgRole, isExternal: false, name: d.name, email: d.email };
  }
  const { chef, collab, lecteur, admin } = actors as Record<string, Actor>;
  const today = todayIso();

  // Projet visible par l'organisation
  const pub = await createProject(chef!, { name: "Refonte de l'intranet", description: "Nouvelle page d'accueil, annuaire et actualités.", visibility: "organization" });
  await addProjectMember(chef!, pub.id, collab!.id, "editor");
  await addProjectMember(chef!, pub.id, lecteur!.id, "viewer");
  const t1 = await createTask(chef!, { projectId: pub.id, title: "Recueillir les besoins des directions", assigneeId: collab!.id, dueDate: addDaysIso(today, -2) });
  await updateTask(chef!, t1.id, t1.version, { priority: "high", description: "Entretiens avec **5 directions**.\n\n- RH\n- Finances\n- DSI" });
  const t2 = await createTask(chef!, { projectId: pub.id, title: "Maquettes de la page d'accueil", assigneeId: collab!.id, dueDate: today });
  await createTask(chef!, { projectId: pub.id, title: "Choisir l'outil d'annuaire", assigneeId: chef!.id, dueDate: addDaysIso(today, 3) });
  await createTask(chef!, { projectId: pub.id, title: "Plan de communication interne", dueDate: addDaysIso(today, 20) });
  await createTask(chef!, { projectId: pub.id, title: "Former les contributeurs", assigneeId: collab!.id });
  await createTask(chef!, { projectId: pub.id, parentTaskId: t2.id, title: "Version mobile", assigneeId: collab!.id });
  await addComment(chef!, t2.id, `Merci ${mentionToken(collab!.name, collab!.id)}, peux-tu partager une première version jeudi ?`);

  // Projet privé : la collaboratrice et le lecteur n'y ont PAS accès
  const priv = await createProject(admin!, { name: "Réorganisation RH (confidentiel)", description: "Projet privé de démonstration.", visibility: "private" });
  await addProjectMember(admin!, priv.id, chef!.id, "editor");
  const p1 = await createTask(admin!, { projectId: priv.id, title: "Préparer l'organigramme cible", assigneeId: chef!.id, dueDate: addDaysIso(today, 5) });
  await createTask(admin!, { projectId: priv.id, title: "Note confidentielle à la direction", assigneeId: admin!.id, dueDate: addDaysIso(today, 1) });
  await addComment(admin!, p1.id, `${mentionToken(chef!.name, chef!.id)} premier jet attendu pour vendredi.`);

  console.log("\nDonnées de démonstration créées :");
  for (const d of DEMO) console.log(`  ${d.email.padEnd(34)} ${d.orgRole}`);
  console.log("\nConnexion : saisissez l'une de ces adresses sur /connexion ; le code arrive dans Mailpit (http://localhost:18025).");
  console.log("Collaboratrice et lecteur n'ont pas accès au projet privé.\n");
}

main()
  .catch((e) => {
    console.error("Erreur :", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
