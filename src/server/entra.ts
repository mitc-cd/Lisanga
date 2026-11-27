import "server-only";
import { decryptSecret } from "./crypto";
import type { SettingsRow } from "./settings";

/**
 * Teste la configuration Entra ID sans utilisateur :
 * 1) le tenant existe (document de découverte OpenID) ;
 * 2) l'identifiant d'application et le secret sont acceptés (jeton client_credentials).
 */
export async function testEntraConnection(s: SettingsRow): Promise<{ ok: boolean; message: string }> {
  if (!s.entraTenantId || !s.entraClientId || !s.entraSecretEnc)
    return { ok: false, message: "Renseignez et enregistrez le tenant, l'identifiant d'application et le secret avant de tester." };
  const base = `https://login.microsoftonline.com/${encodeURIComponent(s.entraTenantId)}`;
  try {
    const disc = await fetch(`${base}/v2.0/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
    if (!disc.ok) return { ok: false, message: "Tenant introuvable : vérifiez l'identifiant du tenant (Directory ID)." };
    const res = await fetch(`${base}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: s.entraClientId,
        client_secret: decryptSecret(s.entraSecretEnc),
        scope: "https://graph.microsoft.com/.default",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, message: "Connexion réussie : le tenant, l'application et le secret sont valides." };
    const body = (await res.json().catch(() => ({}))) as { error?: string; error_codes?: number[] };
    const codes = body.error_codes ?? [];
    if (codes.includes(7000215)) return { ok: false, message: "Secret client refusé : vérifiez la valeur du secret (et non son identifiant)." };
    if (codes.includes(7000222)) return { ok: false, message: "Secret client expiré : créez-en un nouveau dans Entra ID." };
    if (codes.includes(700016)) return { ok: false, message: "Application introuvable dans ce tenant : vérifiez l'identifiant d'application (client)." };
    return { ok: false, message: `Microsoft a refusé la connexion (${body.error ?? res.status}).` };
  } catch {
    return { ok: false, message: "Impossible de joindre Microsoft (réseau ou délai dépassé)." };
  }
}
