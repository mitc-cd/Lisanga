import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const uuid = z.uuid("Identifiant invalide.");

export const titleSchema = z.string().trim().min(1, "Le titre est obligatoire.").max(500, "Titre trop long (500 caractères max.).");

export const createTaskSchema = z.object({
  projectId: uuid,
  sectionId: uuid.optional(),
  parentTaskId: uuid.optional(),
  title: titleSchema,
  /** Insérer après cette tâche ; null = en tête ; absent = en fin de section. */
  afterTaskId: uuid.nullable().optional(),
  assigneeId: uuid.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  clientId: uuid.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().max(20000, "Description trop longue.").optional(),
    assigneeId: uuid.nullable().optional(),
    priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
    status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
    startDate: isoDate.nullable().optional(),
    dueDate: isoDate.nullable().optional(),
    labelIds: z.array(uuid).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Aucune modification.");
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const moveTaskSchema = z.object({
  projectId: uuid,
  sectionId: uuid,
  afterTaskId: uuid.nullable(),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Le commentaire est vide.").max(10000, "Commentaire trop long."),
});

export const labelSchema = z.object({
  name: z.string().trim().min(1, "Nom requis.").max(50, "Nom trop long."),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
