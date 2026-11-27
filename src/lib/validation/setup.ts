import { z } from "zod";

export const setupSchema = z.object({
  token: z.string().trim().min(16, "Jeton d'installation requis.").max(200),
  organizationName: z.string().trim().min(2, "Nom trop court.").max(100),
  name: z.string().trim().min(2, "Indiquez votre nom.").max(100),
  email: z.string().trim().toLowerCase().pipe(z.email("Adresse e-mail invalide.")),
});
export type SetupInput = z.infer<typeof setupSchema>;
