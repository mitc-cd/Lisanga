# Architecture

## Vue d'ensemble

```
Navigateur ──► Next.js (App Router, Vercel Functions, runtime Node)
                 ├─ Server Components : lecture initiale (via src/server/*)
                 ├─ Server Actions    : mutations (via src/server/*)
                 ├─ Route Handlers    : /api/auth/* (Better Auth), /api/cron, /api/projects/[id]/board…
                 └─ src/server/*      : règles métier + contrôles d'accès (seul accès à la base)
                         │
                         ▼
                 PostgreSQL (Neon en prod, Docker en local) — Drizzle ORM
                 SMTP (configuré dans l'administration) — Nodemailer
                 Microsoft Entra ID (OIDC, facultatif)
```

Aucun composant n'accède à la base directement : tout passe par `src/server/`,
réutilisé par les Server Actions, les Route Handlers et les travaux différés.

## Arborescence

| Chemin | Rôle |
|---|---|
| `src/app/(auth)/` | installation, connexion (e-mail, code, lien) |
| `src/app/(app)/` | application connectée : Mes tâches, Boîte de réception, Projets, Administration, Profil |
| `src/app/api/` | Better Auth, cron, lectures JSON pour le polling |
| `src/server/` | domaine : `auth/`, `permissions.ts`, `projects.ts`, `tasks.ts`, `comments.ts`, `notifications.ts`, `search.ts`, `settings.ts`, `mail/`, `crypto.ts`, `audit.ts`, `jobs.ts` |
| `src/lib/` | code partagé client/serveur : schémas Zod, dates, ordre fractionnaire, palette |
| `src/components/` | composants d'interface (Radix UI personnalisés) |
| `src/db/` | schéma Drizzle et connexion |
| `drizzle/` | migrations SQL versionnées |
| `scripts/` | migration, seed, `setup:admin`, lien de secours |
| `tests/` | Vitest (unitaires, intégration avec base de test) |
| `e2e/` | Playwright |

## Modèle de données (lot 1, préparé pour les lots 2-3)

```
organizations 1─* users ─* sessions / accounts (Better Auth)
organizations 1─1 org_settings (SMTP, Entra chiffrés, connexion, identité)
organizations 1─* teams *─* users (team_members)
organizations 1─* projects 1─* sections
projects *─* users (project_members : owner/editor/viewer)
tasks *─* projects (task_projects : section + sort_key par projet)
tasks.primary_project_id → visibilité ; tasks.parent_task_id → sous-tâches (1 niveau au lot 1)
tasks *─* labels (task_labels)
tasks 1─* comments ; tasks 1─* task_events (journal JSON avant/après)
users 1─* notifications (assigned / mentioned)
jobs (travaux différés, idempotency_key unique) ; audit_logs ; login_challenges ; rate_limit_events ; setup_tokens ; invitations
```

Points d'extension prévus sans refonte :

- `tasks.type` (task, story, bug, tech_task, epic, milestone), `story_points`,
  `sprint_id` (nullable ; la table `sprints` et la clé étrangère viendront au lot 2) ;
- `sections.wip_limit` (lot 2) ;
- `task_projects` permet déjà plusieurs projets par tâche (lot 3) ;
- `task_events` alimente historique (lot 1) puis burndown / vélocité (lot 2).

Verrouillage optimiste : chaque mutation transmet la `version` connue ;
`UPDATE … WHERE id = $1 AND version = $2` ; 0 ligne → conflit, le client recharge
et affiche « Cette tâche a été modifiée entre-temps ».

Suppression logique : `archived_at` (masqué des vues, restaurable),
`deleted_at` (réservé aux suppressions définitives futures ; filtré partout).

Dates : instants en `timestamptz` (UTC), affichés en Africa/Kinshasa ; début et
échéance en `date` (aucun décalage de jour possible).

## Connexion

1. `/connexion` : saisie de l'adresse → message identique dans tous les cas.
   Si l'adresse est admise (compte actif/invité, ou domaine autorisé) : création
   d'un défi (code 6 chiffres + jeton de lien 32 octets, hachés SHA-256 avec le
   secret serveur), invalidation des défis précédents, envoi d'un e-mail unique
   après la réponse.
2. Code : saisi sur `/connexion/code` ; 5 erreurs → défi invalidé.
3. Lien : `/connexion/lien?jeton=…` affiche un bouton ; le POST consomme le défi
   (protège contre la pré-ouverture des liens par les antivirus de messagerie).
4. Session Better Auth (cookie signé, table `sessions`, durée glissante réglable).

Limitation : 5 demandes / 15 min par adresse, 20 / 15 min par IP ; 30 vérifications
/ 15 min par IP.

## Temps réel (lot 1)

Pas de WebSocket. TanStack Query revalide au retour sur l'onglet et interroge le
tableau ouvert toutes les 15 s. Capacité estimée : 50 utilisateurs × 1 requête /
15 s ≈ 3,3 req/s au maximum, sans souci pour Neon et Vercel.

## Dimensionnement

- 50 comptes cible, 300 possibles : index sur toutes les clés de jointure,
  requêtes groupées (pas de N+1 : tâches, étiquettes, sous-tâches et compteurs
  chargés en 3-4 requêtes par vue), pagination de la boîte de réception et de la
  recherche, liste de tâches virtualisée au-delà de 200 lignes visibles.
- Neon : pooler (10 000 connexions client) ; pool `pg` de 5 par instance.
