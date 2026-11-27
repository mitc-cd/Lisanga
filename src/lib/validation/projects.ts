import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(200, "Nom trop long."),
  description: z.string().max(5000, "Description trop longue.").optional(),
  visibility: z.enum(["organization", "private"]),
  teamId: z.uuid().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export type ProjectInput = z.infer<typeof projectSchema>;

export const projectUpdateSchema = projectSchema.partial();
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export const sectionNameSchema = z.string().trim().min(1, "Nom requis.").max(120, "Nom trop long.");

export const memberSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["owner", "editor", "viewer"]),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Adresse e-mail invalide.")),
  name: z.string().trim().max(100).optional(),
  orgRole: z.enum(["admin", "member", "viewer"]),
  isExternal: z.boolean().default(false),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const teamSchema = z.object({ name: z.string().trim().min(1, "Nom requis.").max(80, "Nom trop long.") });
