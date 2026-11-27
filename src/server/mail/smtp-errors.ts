/** Traduit une erreur Nodemailer / réseau en message français compréhensible. */
export function translateSmtpError(err: unknown): string {
  const e = err as {
    code?: string;
    originalCode?: string;
    responseCode?: number;
    message?: string;
    cause?: { code?: string; message?: string };
    errors?: { code?: string; message?: string }[]; // AggregateError (IPv4 + IPv6)
  };
  const hay = [e?.code, e?.originalCode, e?.message, e?.cause?.code, e?.cause?.message, ...(e?.errors ?? []).flatMap((x) => [x.code, x.message])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const rc = e?.responseCode;
  if (e?.code === "EAUTH" || rc === 535 || rc === 534 || hay.includes("invalid login") || hay.includes("authentication"))
    return "Authentification refusée par le serveur SMTP : vérifiez l'identifiant et le mot de passe.";
  if (hay.includes("enotfound") || hay.includes("eai_again") || hay.includes("getaddrinfo") || e?.code === "EDNS")
    return "Hôte SMTP introuvable : vérifiez le nom du serveur.";
  if (hay.includes("econnrefused")) return "Connexion refusée : le serveur ne répond pas sur ce port (port fermé ou bloqué).";
  if (hay.includes("etimedout") || hay.includes("timeout") || hay.includes("ehostunreach") || hay.includes("enetunreach"))
    return "Délai dépassé : le serveur SMTP est injoignable (pare-feu ou port bloqué).";
  if (hay.includes("wrong version number") || hay.includes("ssl") || hay.includes("tls") || hay.includes("certificate") || e?.code === "ETLS")
    return "Échec du chiffrement : le mode de chiffrement ne correspond pas au port (STARTTLS sur 587, SSL/TLS sur 465) ou le certificat est invalide.";
  if (rc === 550 || rc === 553 || rc === 554 || e?.code === "EENVELOPE")
    return "Adresse refusée par le serveur : vérifiez l'adresse d'expéditeur (elle doit être autorisée pour ce compte SMTP).";
  if (hay.includes("econnreset")) return "La connexion a été interrompue par le serveur SMTP.";
  return "L'envoi a échoué. Vérifiez les paramètres SMTP et réessayez.";
}
