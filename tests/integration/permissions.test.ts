/**
 * Matrice de permissions (docs/PERMISSIONS.md) : chaque rôle × chaque action sensible,
 * vérifiée contre la vraie base (mitc_test) via les modules serveur.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import type { Actor } from "@/server/actor";
import {
  addProjectMember,
  createProject,
  createSection,
  getProjectDetail,
  getProjectMembersForManagement,
  joinProject,
  listProjects,
  removeProjectMember,
  setProjectArchived,
  updateProject,
} from "@/server/projects";
import { createTask, getProjectTasks, getTaskDetail, listMyTasks, moveTask, resolveTaskLink, setTaskArchived, updateTask } from "@/server/tasks";
import { addComment } from "@/server/comments";
import { listInbox, unreadCount } from "@/server/notifications";
import { search } from "@/server/search";
import { getProjectAccess } from "@/server/permissions";
import { mentionToken } from "@/lib/mentions";
import { createOrg, expectCode, makeUser, resetDb } from "./helpers";

type Who = "admin" | "owner" | "editor" | "viewerMember" | "orgViewer" | "outsider" | "external";
let A: Record<Who, Actor>;
let priv: { id: string };
let pub: { id: string };
let privTask: { id: string; version: number };
let pubTask: { id: string; version: number };
let privSection: string;

beforeAll(async () => {
  await resetDb();
  const org = await createOrg();
  A = {
    admin: await makeUser(org.id, { role: "admin", name: "Admin" }),
    owner: await makeUser(org.id, { name: "Responsable" }),
    editor: await makeUser(org.id, { name: "Contributeur" }),
    viewerMember: await makeUser(org.id, { name: "Lecteur projet" }),
    orgViewer: await makeUser(org.id, { role: "viewer", name: "Lecteur org" }),
    outsider: await makeUser(org.id, { name: "Hors projet" }),
    external: await makeUser(org.id, { external: true, name: "Externe" }),
  };
  priv = await createProject(A.owner, { name: "Privé RH", visibility: "private" });
  pub = await createProject(A.owner, { name: "Public intranet", visibility: "organization" });
  for (const p of [priv, pub]) {
    await addProjectMember(A.owner, p.id, A.editor.id, "editor");
    await addProjectMember(A.owner, p.id, A.viewerMember.id, "viewer");
  }
  await addProjectMember(A.owner, priv.id, A.orgViewer.id, "viewer");
  const t1 = await createTask(A.owner, { projectId: priv.id, title: "Secret salaire", assigneeId: A.editor.id });
  privTask = { id: t1.id, version: t1.version };
  privSection = t1.sectionId!;
  const t2 = await createTask(A.owner, { projectId: pub.id, title: "Maquette accueil", assigneeId: A.editor.id });
  pubTask = { id: t2.id, version: t2.version };
});

afterAll(closeDb);

const READ_PRIVATE: Record<Who, boolean> = {
  admin: false,
  owner: true,
  editor: true,
  viewerMember: true,
  orgViewer: true,
  outsider: false,
  external: false,
};
const READ_PUBLIC: Record<Who, boolean> = {
  admin: true,
  owner: true,
  editor: true,
  viewerMember: true,
  orgViewer: true,
  outsider: true,
  external: false,
};
const EDIT: Record<Who, boolean> = {
  admin: false,
  owner: true,
  editor: true,
  viewerMember: false,
  orgViewer: false,
  outsider: false,
  external: false,
};
const MANAGE: Record<Who, boolean> = {
  admin: true,
  owner: true,
  editor: false,
  viewerMember: false,
  orgViewer: false,
  outsider: false,
  external: false,
};
const WHO = Object.keys(READ_PRIVATE) as Who[];

describe("lecture : projet, tâches, lien direct (inaccessible = introuvable)", () => {
  for (const who of WHO) {
    it(`${who} — projet privé ${READ_PRIVATE[who] ? "lisible" : "invisible"}`, async () => {
      if (READ_PRIVATE[who]) {
        await expect(getProjectDetail(A[who], priv.id)).resolves.toMatchObject({ id: priv.id });
        await expect(getProjectTasks(A[who], priv.id)).resolves.toHaveLength(1);
        await expect(getTaskDetail(A[who], privTask.id)).resolves.toMatchObject({ title: "Secret salaire" });
        await expect(resolveTaskLink(A[who], privTask.id)).resolves.toMatchObject({ projectId: priv.id });
      } else {
        const e1 = await expectCode(getProjectDetail(A[who], priv.id), "not_found");
        const e2 = await expectCode(getProjectDetail(A[who], "00000000-0000-4000-8000-000000000000"), "not_found");
        expect(e1.message).toBe(e2.message);
        const t1 = await expectCode(getTaskDetail(A[who], privTask.id), "not_found");
        const t2 = await expectCode(getTaskDetail(A[who], "00000000-0000-4000-8000-000000000000"), "not_found");
        expect(t1.message).toBe(t2.message);
        await expectCode(getProjectTasks(A[who], priv.id), "not_found");
        await expectCode(resolveTaskLink(A[who], privTask.id), "not_found");
      }
    });
    it(`${who} — projet visible par l'organisation ${READ_PUBLIC[who] ? "lisible" : "invisible"}`, async () => {
      if (READ_PUBLIC[who]) await expect(getTaskDetail(A[who], pubTask.id)).resolves.toBeTruthy();
      else await expectCode(getTaskDetail(A[who], pubTask.id), "not_found");
    });
  }
  it("identifiant mal formé : introuvable", async () => {
    await expectCode(getTaskDetail(A.owner, "pas-un-uuid"), "not_found");
  });
});

describe("écriture : créer, modifier, déplacer, archiver, commenter, sections", () => {
  for (const who of WHO) {
    it(`${who} — ${EDIT[who] ? "autorisé" : "refusé"} sur le projet privé`, async () => {
      const expected = READ_PRIVATE[who] ? "forbidden" : "not_found";
      if (EDIT[who]) {
        const t = await createTask(A[who], { projectId: priv.id, title: `Créée par ${who}` });
        const u = await updateTask(A[who], t.id, t.version, { priority: "high" });
        const m = await moveTask(A[who], t.id, u.version, { projectId: priv.id, sectionId: privSection, afterTaskId: null });
        expect(m.version).toBe(u.version + 1);
        await addComment(A[who], t.id, "Commentaire autorisé");
        await setTaskArchived(A[who], t.id, true);
        await createSection(A[who], priv.id, `Section ${who}`);
      } else {
        await expectCode(createTask(A[who], { projectId: priv.id, title: "Interdit" }), expected);
        await expectCode(updateTask(A[who], privTask.id, 1, { title: "Piraté" }), expected);
        await expectCode(moveTask(A[who], privTask.id, 1, { projectId: priv.id, sectionId: privSection, afterTaskId: null }), expected);
        await expectCode(setTaskArchived(A[who], privTask.id, true), expected);
        await expectCode(addComment(A[who], privTask.id, "Interdit"), expected);
        await expectCode(createSection(A[who], priv.id, "Interdite"), expected);
      }
    });
  }
  it("un non-membre peut lire un projet visible mais pas y écrire", async () => {
    await expectCode(createTask(A.outsider, { projectId: pub.id, title: "Interdit" }), "forbidden");
    await expectCode(addComment(A.outsider, pubTask.id, "Interdit"), "forbidden");
  });
});

describe("gestion du projet : membres, visibilité, archivage", () => {
  for (const who of WHO) {
    it(`${who} — gestion ${MANAGE[who] ? "autorisée" : "refusée"}`, async () => {
      const target = await makeUser(A.owner.organizationId, { name: `Cible ${who}` });
      if (MANAGE[who]) {
        await addProjectMember(A[who], priv.id, target.id, "editor");
        await removeProjectMember(A[who], priv.id, target.id);
      } else {
        await expect(addProjectMember(A[who], priv.id, target.id, "editor")).rejects.toMatchObject({
          code: READ_PRIVATE[who] ? "forbidden" : "not_found",
        });
      }
    });
  }
  it("l'admin non membre gère les adhésions d'un projet privé sans en lire le contenu", async () => {
    const m = await getProjectMembersForManagement(A.admin, priv.id);
    expect(m.members.map((x) => x.name)).toContain("Responsable");
    expect(JSON.stringify(m)).not.toContain("Secret salaire");
    await expectCode(getProjectTasks(A.admin, priv.id), "not_found");
    await expectCode(updateProject(A.admin, priv.id, 1, { name: "Renommé" }), "forbidden");
  });
  it("seul un responsable (ou admin) change la visibilité ; archivage réversible", async () => {
    const p = await createProject(A.owner, { name: "Temp", visibility: "organization" });
    await addProjectMember(A.owner, p.id, A.editor.id, "editor");
    await expectCode(updateProject(A.editor, p.id, 1, { visibility: "private" }), "forbidden");
    const d = await getProjectDetail(A.owner, p.id);
    await updateProject(A.owner, p.id, d.version, { visibility: "private" });
    await expectCode(getProjectDetail(A.outsider, p.id), "not_found");
    await expectCode(setProjectArchived(A.editor, p.id, true), "forbidden");
    await setProjectArchived(A.owner, p.id, true);
    // Projet archivé : lecture seule, même pour un contributeur
    await expectCode(createTask(A.editor, { projectId: p.id, title: "x" }), "forbidden");
    await setProjectArchived(A.owner, p.id, false);
    await createTask(A.editor, { projectId: p.id, title: "x" });
  });
  it("le dernier responsable ne peut être ni retiré ni rétrogradé", async () => {
    const p = await createProject(A.editor, { name: "Seul responsable", visibility: "private" });
    await expectCode(removeProjectMember(A.editor, p.id, A.editor.id), "validation");
    await expectCode(addProjectMember(A.editor, p.id, A.editor.id, "viewer"), "validation");
  });
  it("un lecteur d'organisation ne peut pas créer de projet ni devenir contributeur", async () => {
    await expectCode(createProject(A.orgViewer, { name: "Non", visibility: "private" }), "forbidden");
    await expectCode(addProjectMember(A.owner, pub.id, A.orgViewer.id, "editor"), "validation");
  });
  it("rejoindre un projet visible : membre → contributeur ; externe → refusé ; privé → introuvable", async () => {
    await joinProject(A.outsider, pub.id);
    expect((await getProjectAccess(A.outsider, pub.id)).role).toBe("editor");
    await removeProjectMember(A.outsider, pub.id, A.outsider.id);
    await expectCode(joinProject(A.external, pub.id), "not_found");
    await expectCode(joinProject(A.outsider, priv.id), "not_found");
  });
});

describe("assignation, retrait et désactivation", () => {
  it("assigner implique d'être contributeur ou responsable du projet", async () => {
    const t = await createTask(A.owner, { projectId: pub.id, title: "À assigner" });
    await expectCode(updateTask(A.owner, t.id, t.version, { assigneeId: A.outsider.id }), "validation");
    await expectCode(updateTask(A.owner, t.id, t.version, { assigneeId: A.viewerMember.id }), "validation");
    await expectCode(createTask(A.owner, { projectId: priv.id, title: "x", assigneeId: A.outsider.id }), "validation");
    await updateTask(A.owner, t.id, t.version, { assigneeId: A.editor.id });
  });
  it("une personne retirée du projet privé perd l'accès et ses tâches sont désassignées", async () => {
    const p = await createProject(A.owner, { name: "Retrait", visibility: "private" });
    const u = await makeUser(A.owner.organizationId, { name: "Partant" });
    await addProjectMember(A.owner, p.id, u.id, "editor");
    const t = await createTask(A.owner, { projectId: p.id, title: "Tâche du partant", assigneeId: u.id });
    expect((await listMyTasks(u)).map((x) => x.id)).toContain(t.id);
    await removeProjectMember(A.owner, p.id, u.id);
    await expectCode(getTaskDetail(u, t.id), "not_found");
    expect((await listMyTasks(u)).map((x) => x.id)).not.toContain(t.id);
    const d = await getTaskDetail(A.owner, t.id);
    expect(d.assignee).toBeNull();
    expect(d.events.some((e) => e.meta.reason === "member_removed")).toBe(true);
  });
});

describe("recherche, Mes tâches et boîte de réception filtrées par accès", () => {
  it("la recherche ne renvoie jamais un projet privé ni ses tâches à un non-membre", async () => {
    for (const who of ["outsider", "admin", "external"] as Who[]) {
      const r = await search(A[who], "Secret");
      expect(r.tasks).toHaveLength(0);
      const r2 = await search(A[who], "Privé RH");
      expect(r2.projects).toHaveLength(0);
    }
    expect((await search(A.editor, "Secret")).tasks.map((t) => t.id)).toContain(privTask.id);
    expect((await search(A.external, "Maquette")).tasks).toHaveLength(0);
    expect((await search(A.outsider, "Maquette")).tasks.length).toBeGreaterThan(0);
  });
  it("la recherche échappe les caractères spéciaux", async () => {
    await expect(search(A.owner, "%_%")).resolves.toEqual({ projects: [], tasks: [] });
  });
  it("listProjects ne liste que les projets lisibles", async () => {
    expect((await listProjects(A.outsider)).map((p) => p.id)).not.toContain(priv.id);
    expect((await listProjects(A.admin)).map((p) => p.id)).not.toContain(priv.id);
    expect((await listProjects(A.external)).map((p) => p.id)).not.toContain(pub.id);
  });
  it("mention d'une personne sans accès : ignorée (aucune notification)", async () => {
    const before = await unreadCount(A.outsider);
    const r = await addComment(A.owner, privTask.id, `Voir ${mentionToken("Hors projet", A.outsider.id)} et ${mentionToken("Contributeur", A.editor.id)}`);
    expect(r.notified).toBe(1);
    expect(await unreadCount(A.outsider)).toBe(before);
    const inbox = await listInbox(A.editor);
    expect(inbox.items.some((i) => i.type === "mentioned" && i.task.id === privTask.id)).toBe(true);
  });
  it("assignation notifiée ; notifications masquées si l'accès est perdu", async () => {
    const p = await createProject(A.owner, { name: "Notif", visibility: "private" });
    const u = await makeUser(A.owner.organizationId, { name: "Notifié" });
    await addProjectMember(A.owner, p.id, u.id, "editor");
    await createTask(A.owner, { projectId: p.id, title: "Pour Notifié", assigneeId: u.id });
    expect((await listInbox(u)).items).toHaveLength(1);
    expect(await unreadCount(u)).toBe(1);
    await removeProjectMember(A.owner, p.id, u.id);
    expect((await listInbox(u)).items).toHaveLength(0);
    expect(await unreadCount(u)).toBe(0);
  });
  it("pas de notification pour soi-même", async () => {
    const before = await unreadCount(A.owner);
    await createTask(A.owner, { projectId: pub.id, title: "Pour moi", assigneeId: A.owner.id });
    expect(await unreadCount(A.owner)).toBe(before);
  });
});
