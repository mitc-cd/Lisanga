import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Adresse e-mail invalide."));
export const codeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Le code comporte 6 chiffres."));
