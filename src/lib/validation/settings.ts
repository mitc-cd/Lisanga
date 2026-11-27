import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #RRGGBB.");
const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Nom de domaine invalide (ex. : mitc.cd).");

export const loginSettingsSchema = z.object({
  emailLoginEnabled: z.boolean(),
  codeTtlMinutes: z.coerce.number().int().min(5, "Minimum 5 minutes.").max(30, "Maximum 30 minutes."),
  sessionDays: z.coerce.number().int().min(1, "Minimum 1 jour.").max(90, "Maximum 90 jours."),
  autoAdmitDomains: z.array(domain).max(20),
});
export type LoginSettingsInput = z.infer<typeof loginSettingsSchema>;

export const brandingSchema = z.object({
  appName: z.string().trim().min(2, "Nom trop court.").max(60, "Nom trop long."),
  primaryColor: hex,
  secondaryColor: hex,
  accentColor: hex,
});
export type BrandingInput = z.infer<typeof brandingSchema>;

export const smtpSchema = z.object({
  host: z.string().trim().min(1, "Hôte requis.").max(255),
  port: z.coerce.number().int().min(1).max(65535),
  security: z.enum(["none", "starttls", "tls"]),
  user: z.string().trim().max(255),
  /** Vide = conserver le mot de passe déjà enregistré. */
  newPassword: z.string().max(500).optional(),
  fromEmail: z.string().trim().toLowerCase().pipe(z.email("Adresse d'expéditeur invalide.")),
  fromName: z.string().trim().max(100),
  replyTo: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("Adresse de réponse invalide."))]),
  testRecipient: z.string().trim().toLowerCase().pipe(z.email("Adresse du destinataire de test invalide.")),
});
export type SmtpInput = z.infer<typeof smtpSchema>;

export const entraSchema = z.object({
  tenantId: z.union([z.literal(""), z.uuid("Identifiant de tenant attendu au format GUID.")]),
  clientId: z.union([z.literal(""), z.uuid("Identifiant d'application attendu au format GUID.")]),
  newSecret: z.string().max(500).optional(),
  enabled: z.boolean(),
});
export type EntraInput = z.infer<typeof entraSchema>;

export type PublicSettings = {
  appName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoPath: string;
  emailLoginEnabled: boolean;
  entraEnabled: boolean;
  installed: boolean;
};

export type AdminSettingsView = {
  version: number;
  appName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  emailLoginEnabled: boolean;
  codeTtlMinutes: number;
  sessionDays: number;
  autoAdmitDomains: string[];
  smtp: {
    host: string;
    port: number;
    security: "none" | "starttls" | "tls";
    user: string;
    passwordSet: boolean;
    fromEmail: string;
    fromName: string;
    replyTo: string;
    status: "unconfigured" | "ok" | "failing";
    lastError: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
  };
  entra: {
    tenantId: string;
    clientId: string;
    secretSet: boolean;
    enabled: boolean;
    lastTestAt: string | null;
    lastTestOk: boolean | null;
  };
};
