/** Lecture JSON côté client ; lève une Error dont le message est affichable (français). */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    // Hors composant (pas de routeur disponible) : rechargement complet vers la connexion.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/connexion";
    throw new Error("Session expirée : reconnectez-vous.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.error ?? "Impossible de charger les données. Vérifiez votre connexion.");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body as T;
}
