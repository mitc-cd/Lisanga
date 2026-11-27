import { config } from "dotenv";
import { Pool } from "pg";

/** Remet la base de test à zéro et vide Mailpit avant la campagne E2E. */
export default async function globalSetup() {
  const env = config({ path: ".env.test", quiet: true }).parsed ?? {};
  if (!env.DATABASE_URL?.includes("mitc_test")) throw new Error("La base E2E doit être mitc_test.");
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  await pool.query(`truncate table notifications, task_events, comments, task_labels, labels, task_projects, tasks, sections,
    project_members, projects, team_members, teams, audit_logs, invitations, sessions, accounts, verifications,
    login_challenges, rate_limit_events, setup_tokens, jobs, users, org_settings, organizations restart identity cascade`);
  await pool.end();
  await fetch("http://localhost:18025/api/v1/messages", { method: "DELETE" });
}
