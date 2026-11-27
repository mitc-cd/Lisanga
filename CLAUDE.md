# MiTC Projets — consignes pour les sessions de développement

@AGENTS.md

Application interne de gestion de projets (inspirée d'Asana, interface originale
aux couleurs MiTC). Interface en français. Lire `docs/AVANCEMENT.md` en premier :
il dit où en est le travail et quelle est la prochaine étape.

## Documents de référence
- `docs/ARCHITECTURE.md` — architecture, modèle de données
- `docs/PERMISSIONS.md` — matrice de permissions (source de vérité des tests)
- `docs/DECISIONS.md` — décisions datées ; en ajouter une pour tout choix important
- `docs/ROADMAP.md` — lots 1 à 5 ; `docs/COUVERTURE.md` — matrice de couverture

## Stack
Next.js 16 (App Router, `cacheComponents` désactivé), React 19, TypeScript strict,
Tailwind 4, Radix UI, dnd-kit, TanStack Query, Drizzle + PostgreSQL (Neon en prod),
Better Auth (+ plugin maison de connexion par e-mail), Nodemailer, Zod 4,
Vitest, Playwright. Gestionnaire : pnpm.

## Organisation du code
- `src/server/**` : règles métier ET contrôles d'accès. Seul endroit qui touche la base.
  Chaque fonction publique reçoit un `Actor` (issu de la session), jamais un id venu du client
  sans revérification.
- `src/app/**/actions.ts` : Server Actions minces → valident (Zod) puis appellent `src/server`.
- `src/lib/**` : code partagé client/serveur (schémas Zod, dates, libellés, palette).
- `src/components/**` : interface. Aucun import de `@/db` ou `@/server` dans un composant client.
- Résultat des actions : `{ ok: true, data } | { ok: false, error: "message en français", code? }`.

## Principes d'expérience (prioritaires)
- La simplicité prime : en cas de doute, fonction au backlog plutôt qu'interface chargée.
- Créer une tâche en < 5 s (Entrée dans une liste, bouton « + » visible) ; seul le titre est requis.
- Édition sur place ; panneau latéral de détail (ne quitte pas la vue) ; pas de formulaire modal.
- Ctrl/Cmd+K palette ; « ? » liste des raccourcis.
- Interface optimiste + annulation propre et message clair en cas d'échec.
- Toast « Annuler » pour les actions réversibles ; confirmation seulement pour suppression
  définitive et changement de droits.
- Écrans vides explicatifs avec l'action directe. ≤ 3 niveaux : Organisation → Projet → Tâche.
- Messages d'erreur en français, sans jargon. Pas de bouton factice : ce qui n'est pas prêt
  n'apparaît pas.
- Orange `#F5A623` jamais en couleur de texte sur fond clair.

## Règles transversales
- Autorisation côté serveur pour chaque lecture/écriture, y compris recherche, notifications,
  travaux différés. Inaccessible = introuvable (même réponse).
- Organisation, projet, utilisateur déduits de la session et de la base.
- Contraintes d'intégrité en base ; transactions pour les opérations multi-lignes.
- Verrouillage optimiste (`version`) ; ordre par `sort_key` fractionnaire (collation "C").
- Toute modification de tâche écrit un `task_events` (avant/après) dans la même transaction.
- Instants en UTC (`timestamptz`), affichage Africa/Kinshasa ; échéances en `date`.
- Secrets (SMTP, Entra) chiffrés AES-256-GCM, jamais renvoyés au navigateur ni journalisés.

## Commandes
```bash
docker compose up -d          # Postgres (54329) + Mailpit (SMTP 11025, web http://localhost:18025)
pnpm dev                      # http://localhost:3000
pnpm db:migrate               # appliquer les migrations (dev)
pnpm db:generate --name=xxx   # générer une migration après modification de src/db/schema.ts
pnpm db:seed                  # données de démonstration (refuse la production)
pnpm setup:admin              # jeton d'installation du premier administrateur
pnpm login-link <email>       # lien de connexion de secours (admin, SMTP en panne)
pnpm lint && pnpm typecheck
pnpm test                     # Vitest (base mitc_test)
pnpm test:e2e                 # Playwright (build + serveur sur :3100, base mitc_test, Mailpit)
pnpm build
```

## Conventions
- Fichiers en kebab-case, composants React en PascalCase, textes d'interface en français.
- Pas de `any` sans commentaire ; Zod pour toute entrée serveur.
- Commits : un par parcours vertical vérifié, message en français, impératif.
- Mettre à jour `docs/AVANCEMENT.md` et `docs/COUVERTURE.md` à la fin de chaque parcours.
