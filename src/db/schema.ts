/**
 * Schéma de données MiTC Projets.
 *
 * Conventions :
 * - identifiants UUID, horodatages `timestamptz` (UTC), échéances en `date` ;
 * - `organization_id` sur les entités métier (multi-organisation possible plus tard) ;
 * - `version` sur les entités modifiables (verrouillage optimiste) ;
 * - suppression logique (`archived_at` / `deleted_at`) pour projets et tâches ;
 * - ordre par indexation fractionnaire (`sort_key`, comparée en collation "C").
 *
 * Les tables users / sessions / accounts / verifications sont aussi utilisées
 * par Better Auth (noms de champs imposés par la bibliothèque).
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();
const version = () => integer("version").notNull().default(1);

// ---------------------------------------------------------------------------
// Énumérations
// ---------------------------------------------------------------------------
export const orgRole = pgEnum("org_role", ["admin", "member", "viewer"]);
export const userStatus = pgEnum("user_status", ["invited", "active", "deactivated"]);
export const projectRole = pgEnum("project_role", ["owner", "editor", "viewer"]);
export const projectVisibility = pgEnum("project_visibility", ["organization", "private"]);
export const taskType = pgEnum("task_type", ["task", "story", "bug", "tech_task", "epic", "milestone"]);
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "blocked", "done"]);
export const taskPriority = pgEnum("task_priority", ["none", "low", "medium", "high", "urgent"]);
export const notificationType = pgEnum("notification_type", ["assigned", "mentioned"]);
export const jobStatus = pgEnum("job_status", ["pending", "running", "done", "failed"]);

// ---------------------------------------------------------------------------
// Organisation, utilisateurs, authentification
// ---------------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull().default(""),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    orgRole: orgRole("org_role").notNull().default("member"),
    status: userStatus("status").notNull().default("invited"),
    isExternal: boolean("is_external").notNull().default(false),
    lastLoginAt: ts("last_login_at"),
    deactivatedAt: ts("deactivated_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    index("users_org_idx").on(t.organizationId),
    check("users_email_lower_ck", sql`${t.email} = lower(${t.email})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.token), index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("accounts_provider_account_uq").on(t.providerId, t.accountId),
    index("accounts_user_idx").on(t.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** Défi de connexion par e-mail : un lien ET un code, hachés, usage unique. */
export const loginChallenges = pgTable(
  "login_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    linkTokenHash: text("link_token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: ts("consumed_at"),
    invalidatedAt: ts("invalidated_at"),
    requestIp: text("request_ip"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("login_challenges_link_uq").on(t.linkTokenHash),
    index("login_challenges_email_idx").on(t.email, t.createdAt),
  ],
);

/** Compteur d'événements pour la limitation de débit (par adresse, par IP). */
export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("rate_limit_events_key_idx").on(t.key, t.createdAt)],
);

/** Jetons d'installation (premier administrateur), stockés hachés. */
export const setupTokens = pgTable("setup_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    orgRole: orgRole("org_role").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_user_idx").on(t.userId)],
);

/** Paramètres d'administration (une ligne par organisation). Secrets chiffrés AES-256-GCM. */
export const orgSettings = pgTable("org_settings", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id),
  appName: text("app_name").notNull().default("MiTC Projets"),
  primaryColor: text("primary_color").notNull().default("#0B3D91"),
  secondaryColor: text("secondary_color").notNull().default("#589CDB"),
  accentColor: text("accent_color").notNull().default("#F5A623"),
  logoPath: text("logo_path").notNull().default("/brand/mitc-logo.png"),
  emailLoginEnabled: boolean("email_login_enabled").notNull().default(true),
  codeTtlMinutes: integer("code_ttl_minutes").notNull().default(10),
  sessionDays: integer("session_days").notNull().default(30),
  autoAdmitDomains: text("auto_admit_domains").array().notNull().default(sql`'{}'::text[]`),
  // SMTP actif (dernière configuration testée avec succès)
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpSecurity: text("smtp_security"), // none | starttls | tls
  smtpUser: text("smtp_user"),
  smtpPasswordEnc: text("smtp_password_enc"),
  smtpFromEmail: text("smtp_from_email"),
  smtpFromName: text("smtp_from_name"),
  smtpReplyTo: text("smtp_reply_to"),
  smtpStatus: text("smtp_status").notNull().default("unconfigured"), // unconfigured | ok | failing
  smtpLastError: text("smtp_last_error"),
  smtpLastSuccessAt: ts("smtp_last_success_at"),
  smtpLastFailureAt: ts("smtp_last_failure_at"),
  // Microsoft Entra ID
  entraTenantId: text("entra_tenant_id"),
  entraClientId: text("entra_client_id"),
  entraSecretEnc: text("entra_secret_enc"),
  entraEnabled: boolean("entra_enabled").notNull().default(false),
  entraLastTestAt: ts("entra_last_test_at"),
  entraLastTestOk: boolean("entra_last_test_ok"),
  updatedAt: updatedAt(),
  version: version(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_org_idx").on(t.organizationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Équipes et projets
// ---------------------------------------------------------------------------
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    createdAt: createdAt(),
    archivedAt: ts("archived_at"),
    version: version(),
  },
  (t) => [uniqueIndex("teams_org_name_uq").on(t.organizationId, sql`lower(${t.name})`)],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    visibility: projectVisibility("visibility").notNull().default("organization"),
    color: text("color").notNull().default("#0B3D91"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    deletedAt: ts("deleted_at"),
    version: version(),
  },
  (t) => [
    index("projects_org_idx").on(t.organizationId),
    index("projects_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    check("projects_name_ck", sql`length(trim(${t.name})) between 1 and 200`),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull().default("editor"),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("project_members_user_idx").on(t.userId)],
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortKey: text("sort_key").notNull(),
    // Lot 2 : limite WIP (nullable, masquée au lot 1)
    wipLimit: integer("wip_limit"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    version: version(),
  },
  (t) => [
    index("sections_project_idx").on(t.projectId, t.sortKey),
    check("sections_name_ck", sql`length(trim(${t.name})) between 1 and 120`),
  ],
);

// ---------------------------------------------------------------------------
// Tâches
// ---------------------------------------------------------------------------
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** Projet principal : détermine la visibilité de la tâche. */
    primaryProjectId: uuid("primary_project_id")
      .notNull()
      .references(() => projects.id),
    parentTaskId: uuid("parent_task_id").references((): any => tasks.id, { onDelete: "cascade" }), // eslint-disable-line @typescript-eslint/no-explicit-any
    type: taskType("type").notNull().default("task"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    priority: taskPriority("priority").notNull().default("none"),
    status: taskStatus("status").notNull().default("todo"),
    startDate: date("start_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    completedAt: ts("completed_at"),
    /** Ordre des sous-tâches dans leur parent. */
    subtaskSortKey: text("subtask_sort_key"),
    // Lot 2 (nullables, masqués au lot 1)
    storyPoints: numeric("story_points", { precision: 6, scale: 1 }),
    sprintId: uuid("sprint_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: ts("archived_at"),
    deletedAt: ts("deleted_at"),
    version: version(),
  },
  (t) => [
    index("tasks_primary_project_idx").on(t.primaryProjectId),
    index("tasks_assignee_idx").on(t.assigneeId, t.dueDate),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
    check("tasks_title_ck", sql`length(trim(${t.title})) between 1 and 500`),
    check("tasks_dates_ck", sql`${t.startDate} is null or ${t.dueDate} is null or ${t.startDate} <= ${t.dueDate}`),
    check("tasks_not_own_parent_ck", sql`${t.parentTaskId} is null or ${t.parentTaskId} <> ${t.id}`),
  ],
);

/** Association tâche ↔ projet (plusieurs-à-plusieurs). Section et ordre sont propres au projet. */
export const taskProjects = pgTable(
  "task_projects",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    sortKey: text("sort_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.projectId] }),
    index("task_projects_section_idx").on(t.projectId, t.sectionId, t.sortKey),
  ],
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    color: text("color").notNull().default("#589CDB"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("labels_org_name_uq").on(t.organizationId, sql`lower(${t.name})`),
    check("labels_name_ck", sql`length(trim(${t.name})) between 1 and 50`),
  ],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] }), index("task_labels_label_idx").on(t.labelId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    mentionedUserIds: uuid("mentioned_user_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
    version: version(),
  },
  (t) => [
    index("comments_task_idx").on(t.taskId, t.createdAt),
    check("comments_body_ck", sql`length(trim(${t.body})) between 1 and 10000`),
  ],
);

export type TaskEventChanges = Record<string, { from: unknown; to: unknown }>;

/** Journal d'événements structuré (source de l'historique, du burndown et de la vélocité). */
export const taskEvents = pgTable(
  "task_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    changes: jsonb("changes").$type<TaskEventChanges>().notNull().default({}),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("task_events_task_idx").on(t.taskId, t.createdAt),
    index("task_events_project_idx").on(t.projectId, t.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: notificationType("type").notNull(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_recipient_idx").on(t.recipientId, t.createdAt)],
);

/** Travaux différés : idempotents (clé unique), repris par le cron. */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text("idempotency_key").notNull(),
    status: jobStatus("status").notNull().default("pending"),
    runAt: ts("run_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedAt: ts("locked_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    finishedAt: ts("finished_at"),
  },
  (t) => [uniqueIndex("jobs_idempotency_uq").on(t.idempotencyKey), index("jobs_due_idx").on(t.status, t.runAt)],
);
