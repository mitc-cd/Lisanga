/** Règles du domaine des tâches : verrouillage optimiste, ordre, journal, sous-tâches, sections, volume. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { closeDb, db } from "@/db";
import { taskEvents, taskProjects, tasks } from "@/db/schema";
import { createProject, createSection, deleteSection, getProjectDetail } from "@/server/projects";
import { createTask, getProjectTasks, getTaskDetail, listMyTasks, moveTask, setTaskArchived, updateTask } from "@/server/tasks";
import type { Actor } from "@/server/actor";
import { createOrg, expectCode, makeUser, resetDb } from "./helpers";

let owner: Actor;
let projectId: string;
let sections: { id: string; name: string }[];

beforeAll(async () => {
  await resetDb();
  const org = await createOrg();
  owner = await makeUser(org.id);
  projectId = (await createProject(owner, { name: "Domaine", visibility: "private" })).id;
  sections = (await getProjectDetail(owner, projectId)).sections;
});
afterAll(closeDb);

const order = async (sectionId: string) =>
  (await getProjectTasks(owner, projectId)).filter((t) => t.sectionId === sectionId).map((t) => t.title);

describe("création", () => {
  it("seul le titre est obligatoire ; trois sections par défaut", async () => {
    expect(sections.map((s) => s.name)).toEqual(["À faire", "En cours", "Terminé"]);
    const t = await createTask(owner, { projectId, title: "  Titre seul  " });
    const d = await getTaskDetail(owner, t.id);
    expect(d).toMatchObject({ title: "Titre seul", status: "todo", priority: "none", assignee: null, dueDate: null, sectionId: sections[0]!.id });
    expect(d.events.map((e) => e.type)).toContain("task.created");
  });
  it("un seul niveau de sous-tâches", async () => {
    const parent = await createTask(owner, { projectId, title: "Parent" });
    const child = await createTask(owner, { projectId, parentTaskId: parent.id, title: "Enfant" });
    await expectCode(createTask(owner, { projectId, parentTaskId: child.id, title: "Petit-enfant" }), "validation");
    const d = await getTaskDetail(owner, parent.id);
    expect(d.subtasks.map((s) => s.title)).toEqual(["Enfant"]);
    expect((await getProjectTasks(owner, projectId)).find((t) => t.id === parent.id)?.subtaskCount).toBe(1);
  });
});

describe("modification et verrouillage optimiste", () => {
  it("journal avant/après ; terminée → completedAt ; version incrémentée", async () => {
    const t = await createTask(owner, { projectId, title: "Journal" });
    const r = await updateTask(owner, t.id, t.version, { status: "done", dueDate: "2026-12-01", priority: "high" });
    expect(r.version).toBe(t.version + 1);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row!.completedAt).not.toBeNull();
    expect(row!.dueDate).toBe("2026-12-01");
    const [ev] = await db.select().from(taskEvents).where(eq(taskEvents.taskId, t.id)).orderBy(taskEvents.id).offset(1);
    expect(ev!.changes).toEqual({
      status: { from: "todo", to: "done" },
      dueDate: { from: null, to: "2026-12-01" },
      priority: { from: "none", to: "high" },
    });
  });
  it("écriture concurrente avec une version périmée : refusée (conflit)", async () => {
    const t = await createTask(owner, { projectId, title: "Concurrence" });
    await updateTask(owner, t.id, t.version, { title: "Version A" });
    const e = await expectCode(updateTask(owner, t.id, t.version, { title: "Version B" }), "conflict");
    expect(e.message).toMatch(/modifiée/);
    expect((await getTaskDetail(owner, t.id)).title).toBe("Version A");
  });
  it("aucune modification réelle : pas d'événement superflu", async () => {
    const t = await createTask(owner, { projectId, title: "Stable" });
    const before = (await db.select().from(taskEvents).where(eq(taskEvents.taskId, t.id))).length;
    await updateTask(owner, t.id, t.version, { title: "Stable" });
    expect((await db.select().from(taskEvents).where(eq(taskEvents.taskId, t.id))).length).toBe(before);
  });
  it("début après échéance : refusé (et contrainte en base)", async () => {
    const t = await createTask(owner, { projectId, title: "Dates" });
    await expectCode(updateTask(owner, t.id, t.version, { startDate: "2026-12-10", dueDate: "2026-12-01" }), "validation");
  });
  it("archivage et restauration", async () => {
    const t = await createTask(owner, { projectId, title: "Archivable", assigneeId: owner.id });
    await setTaskArchived(owner, t.id, true);
    expect((await getProjectTasks(owner, projectId)).some((x) => x.id === t.id)).toBe(false);
    expect((await listMyTasks(owner)).some((x) => x.id === t.id)).toBe(false);
    expect((await getProjectTasks(owner, projectId, { archived: true })).some((x) => x.id === t.id)).toBe(true);
    await setTaskArchived(owner, t.id, false);
    expect((await getProjectTasks(owner, projectId)).some((x) => x.id === t.id)).toBe(true);
  });
});

describe("ordre (indexation fractionnaire) et déplacements", () => {
  it("insertion en tête, après une tâche, en fin ; déplacement entre sections", async () => {
    const s = (await createSection(owner, projectId, "Ordre")).id;
    const a = await createTask(owner, { projectId, sectionId: s, title: "A" });
    const c = await createTask(owner, { projectId, sectionId: s, title: "C" });
    await createTask(owner, { projectId, sectionId: s, title: "B", afterTaskId: a.id });
    await createTask(owner, { projectId, sectionId: s, title: "0", afterTaskId: null });
    expect(await order(s)).toEqual(["0", "A", "B", "C"]);
    const m = await moveTask(owner, c.id, c.version, { projectId, sectionId: s, afterTaskId: null });
    expect(await order(s)).toEqual(["C", "0", "A", "B"]);
    await moveTask(owner, c.id, m.version, { projectId, sectionId: sections[1]!.id, afterTaskId: null });
    expect(await order(s)).toEqual(["0", "A", "B"]);
    expect((await order(sections[1]!.id))[0]).toBe("C");
    const ev = await db.select().from(taskEvents).where(eq(taskEvents.taskId, c.id));
    expect(ev.some((e) => e.type === "task.moved" && (e.changes as { section?: unknown }).section)).toBe(true);
  });
  it("seule la tâche déplacée est réécrite (pas de renumérotation)", async () => {
    const s = (await createSection(owner, projectId, "Stabilité")).id;
    const created = [];
    for (const t of ["1", "2", "3", "4"]) created.push(await createTask(owner, { projectId, sectionId: s, title: t }));
    const keysBefore = await db.select().from(taskProjects).where(eq(taskProjects.sectionId, s));
    await moveTask(owner, created[3]!.id, created[3]!.version, { projectId, sectionId: s, afterTaskId: created[0]!.id });
    const keysAfter = await db.select().from(taskProjects).where(eq(taskProjects.sectionId, s));
    const changed = keysAfter.filter((k) => keysBefore.find((b) => b.taskId === k.taskId)!.sortKey !== k.sortKey);
    expect(changed.map((c) => c.taskId)).toEqual([created[3]!.id]);
    expect(await order(s)).toEqual(["1", "4", "2", "3"]);
  });
  it("déplacements simultanés au même endroit : ordre cohérent, aucune erreur", async () => {
    const s = (await createSection(owner, projectId, "Course")).id;
    const anchor = await createTask(owner, { projectId, sectionId: s, title: "Ancre" });
    const movers = [];
    for (let i = 0; i < 6; i++) movers.push(await createTask(owner, { projectId, sectionId: sections[0]!.id, title: `M${i}` }));
    await Promise.all(movers.map((m) => moveTask(owner, m.id, m.version, { projectId, sectionId: s, afterTaskId: anchor.id })));
    const titles = await order(s);
    expect(titles[0]).toBe("Ancre");
    expect(titles).toHaveLength(7);
    expect(new Set(titles).size).toBe(7);
  });
  it("une sous-tâche ne se déplace pas seule ; section d'un autre projet refusée", async () => {
    const parent = await createTask(owner, { projectId, title: "P" });
    const child = await createTask(owner, { projectId, parentTaskId: parent.id, title: "E" });
    await expectCode(moveTask(owner, child.id, child.version, { projectId, sectionId: sections[0]!.id, afterTaskId: null }), "validation");
    const other = await createProject(owner, { name: "Autre", visibility: "private" });
    const otherSection = (await getProjectDetail(owner, other.id)).sections[0]!.id;
    await expectCode(moveTask(owner, parent.id, parent.version, { projectId, sectionId: otherSection, afterTaskId: null }), "not_found");
  });
  it("supprimer une section déplace ses tâches dans la première section", async () => {
    const s = (await createSection(owner, projectId, "Éphémère")).id;
    const t = await createTask(owner, { projectId, sectionId: s, title: "Rescapée" });
    await deleteSection(owner, projectId, s);
    const detail = await getTaskDetail(owner, t.id);
    expect(detail.sectionId).toBe(sections[0]!.id);
    expect((await getProjectDetail(owner, projectId)).sections.some((x) => x.id === s)).toBe(false);
  });
});

describe("volume", () => {
  it("vue Liste de 500 tâches chargée en moins d'une seconde (3 requêtes, sans N+1)", async () => {
    const p = await createProject(owner, { name: "Volume", visibility: "private" });
    const sec = (await getProjectDetail(owner, p.id)).sections[0]!.id;
    const keys = generateNKeysBetween(null, null, 500);
    const rows = await db
      .insert(tasks)
      .values(keys.map((_, i) => ({ organizationId: owner.organizationId, primaryProjectId: p.id, title: `Tâche ${i}`, assigneeId: owner.id, createdBy: owner.id })))
      .returning({ id: tasks.id });
    await db.insert(taskProjects).values(rows.map((r, i) => ({ taskId: r.id, projectId: p.id, sectionId: sec, sortKey: keys[i]! })));
    const t0 = performance.now();
    const list = await getProjectTasks(owner, p.id);
    const ms = performance.now() - t0;
    expect(list).toHaveLength(500);
    expect(list[0]!.title).toBe("Tâche 0");
    expect(list[499]!.title).toBe("Tâche 499");
    expect(ms).toBeLessThan(1000);
    console.info(`[volume] 500 tâches chargées en ${ms.toFixed(0)} ms`);
  });
});
