# Avancement

_Mis à jour le 2026-11-27._

## État

**Lot 1 : livré et vérifié en local.** Parcours principal complet (installation → SMTP →
invitation → connexion → projet → tâche → Mes tâches → tableau → mention → notification),
plus le reste du lot 1 (voir `COUVERTURE.md`).

Vérifications passées : `pnpm lint`, `pnpm typecheck`, `pnpm test` (108 tests Vitest),
`pnpm test:e2e` (7 scénarios Playwright sur build de production + Mailpit), `pnpm build`.

| Niveau | État |
|---|---|
| Build réussi | ✅ (local) |
| Déployable sur Vercel | 🟡 prêt côté code (`vercel.json`, `vercel-build`, `.env.example`) ; jamais déployé |
| Déploiement vérifié | ❌ aucun accès Vercel / Neon fourni |

## Points bloqués (accès nécessaires)

1. **Vercel + Neon** : projet Vercel, bases Neon dev/preview/prod, variables
   (`DATABASE_URL` poolée, `DATABASE_URL_UNPOOLED`, `APP_URL`, `BETTER_AUTH_SECRET`,
   `SETTINGS_ENCRYPTION_KEY`, `CRON_SECRET`, éventuellement `SETUP_TOKEN`).
2. **SMTP réel de MiTC** (hôte, port, compte) : testé uniquement avec Mailpit.
3. **Microsoft Entra ID** : enregistrement d'application dans le tenant MiTC (redirection
   `https://<domaine>/api/auth/callback/microsoft`), tenant ID, client ID, secret. Code prêt,
   **non testé avec un vrai tenant**.

## Point de vigilance

Performance 500 tâches : l'affichage passe toujours sous 1 s (494 ms et 640 ms selon les
runs), mais le délai avant première interaction a varié de 761 ms à 2,6 s sur le même poste.
À mesurer sur le déploiement réel ; piste : alléger l'hydratation initiale (layout, palette).

## Prochaine étape

1. Obtenir les accès ci-dessus, déployer une preview, rejouer le parcours principal.
2. Pilote (10-20 comptes) puis lot 2 (Scrum/Kanban) — voir `ROADMAP.md`.

## À savoir pour reprendre

- Sous-requêtes corrélées : utiliser `outer()` (`src/db/sql.ts`), voir DECISIONS.md.
- La limitation de débit (5 demandes / 15 min / adresse) bloque vite les essais manuels :
  `docker exec mitc-projets-postgres-1 psql -U mitc -d mitc_dev -c "delete from rate_limit_events"`.
- Un seul `next dev` par dossier : arrêter le serveur de dev avant `PW_DEV=1 pnpm test:e2e`.
