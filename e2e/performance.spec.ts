import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { generateNKeysBetween } from "fractional-indexing";
import { Pool } from "pg";
import { loginWithCode } from "./helpers";

/** Vue Liste de 500 tâches : affichage complet en moins d'une seconde (build de production, poste local). */
test("vue Liste : 500 tâches affichées en moins d'une seconde", async ({ page }) => {
  const env = config({ path: ".env.test", quiet: true }).parsed ?? {};
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  await pool.query("delete from rate_limit_events");
  // Données autonomes : organisation, SMTP de test (Mailpit) et utilisateur dédié
  let { rows: [org] } = await pool.query("select id from organizations limit 1");
  if (!org) {
    ({ rows: [org] } = await pool.query("insert into organizations (name) values ('MiTC perf') returning id"));
    await pool.query("insert into org_settings (organization_id) values ($1)", [org.id]);
  }
  await pool.query(
    "update org_settings set smtp_host = 'localhost', smtp_port = 11025, smtp_security = 'none', smtp_from_email = 'perf@mitc.test', smtp_status = 'ok' where organization_id = $1 and smtp_host is null",
    [org.id],
  );
  const email = `perf-${Date.now()}@e2e.mitc.test`;
  const { rows: [admin] } = await pool.query(
    "insert into users (organization_id, name, email, org_role, status, email_verified) values ($1, 'Perf', $2, 'admin', 'active', true) returning id, email, organization_id",
    [org.id, email],
  );
  const { rows: [project] } = await pool.query(
    "insert into projects (organization_id, name, visibility, created_by) values ($1, 'Volume 500', 'private', $2) returning id",
    [admin.organization_id, admin.id],
  );
  await pool.query("insert into project_members (project_id, user_id, role) values ($1, $2, 'owner')", [project.id, admin.id]);
  const { rows: [section] } = await pool.query("insert into sections (project_id, name, sort_key) values ($1, 'À faire', 'a0') returning id", [project.id]);
  const keys = generateNKeysBetween(null, null, 500);
  for (let i = 0; i < 500; i += 100) {
    const values = keys.slice(i, i + 100).map((_, j) => `($1, $2, 'Tâche volume ${i + j}', $3, current_date + ${(i + j) % 30})`).join(",");
    const { rows } = await pool.query(
      `insert into tasks (organization_id, primary_project_id, title, assignee_id, due_date) values ${values} returning id`,
      [admin.organization_id, project.id, admin.id],
    );
    for (let j = 0; j < rows.length; j++)
      await pool.query("insert into task_projects (task_id, project_id, section_id, sort_key) values ($1, $2, $3, $4)", [rows[j].id, project.id, section.id, keys[i + j]]);
  }
  await pool.end();

  await loginWithCode(page, admin.email);
  await page.goto(`/projets/${project.id}`); // préchauffage (compilation à la demande, caches)
  const start = Date.now();
  await page.goto(`/projets/${project.id}`);
  await expect(page.getByRole("listitem", { name: "Tâche volume 0" })).toBeVisible();
  await expect(page.getByLabel("500 tâches")).toBeVisible();
  const displayed = Date.now() - start;
  // Interaction réelle (hydratation terminée) : ouvrir la première tâche
  await page.getByRole("listitem", { name: "Tâche volume 0" }).click();
  await expect(page).toHaveURL(/tache=/);
  const interactive = Date.now() - start;
  const t = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), rows: document.querySelectorAll("[data-task-row]").length };
  });
  // La dernière tâche est atteignable par défilement
  await page.keyboard.press("Escape");
  await page.locator("main div.overflow-auto").last().evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByRole("listitem", { name: "Tâche volume 499" })).toBeVisible();
  console.info(`[performance] 500 tâches : affichée en ${displayed} ms, interactive en ${interactive} ms`, JSON.stringify(t));
  expect(displayed).toBeLessThan(1000);
});
