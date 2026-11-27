# Décisions techniques

Format : date — décision — justification. Les valeurs par défaut appliquées
faute d'information sont marquées **[défaut]**.

## 2026-11-27 — Cadrage initial

- **[défaut] Couleur primaire `#0B3D91`**, secondaires `#589CDB` (bleu clair) et
  `#F5A623` (orange). Contrastes mesurés sur blanc : `#0B3D91` ≈ 10,9:1 (texte OK),
  `#589CDB` ≈ 2,9:1 (décor, bordures, icônes ≥ 24 px seulement, jamais de texte),
  `#F5A623` ≈ 1,9:1 (jamais de texte ni d'icône seule sur blanc ; utilisé comme
  fond avec texte `#1F2937`, ≈ 9:1). En mode sombre, le texte « primaire » passe
  à `#8DB6F0`.
- **[défaut] Police Inter** via `next/font/google` : la police est téléchargée au
  build et servie par l'application (aucune requête vers Google côté navigateur).
- **[défaut] Plan Vercel Pro** : cron jusqu'à la minute, durée de fonction
  suffisante. Rien dans le lot 1 n'exige Pro, mais les rappels (lot 3) en dépendront.
- **[défaut] Entra ID « à créer »** : l'application est prête, le bouton reste
  masqué tant qu'un administrateur ne l'a pas configuré et testé.
- **[défaut] Domaines admis automatiquement : aucun** (accès sur invitation).
- **Logo** téléchargé une fois dans `public/brand/mitc-logo.png` (fond transparent,
  bleu foncé). En mode sombre il est affiché dans une pastille claire, car le bleu
  foncé du « M » est illisible sur fond sombre.

## 2026-11-27 — Stack

- **Next.js 16.4 (App Router), React 19.3, TypeScript strict, Tailwind 4.**
  `cacheComponents` désactivé : application entièrement authentifiée, données
  filtrées par permission ; on évite tout cache partagé entre utilisateurs. Toutes
  les pages sont rendues dynamiquement.
- **PostgreSQL + Drizzle ORM (pilote `pg`)**, migrations SQL versionnées dans
  `drizzle/`. En production : Neon, `DATABASE_URL` = URL **poolée** (PgBouncer,
  mode transaction) ; `DATABASE_URL_UNPOOLED` pour les migrations. Le pool `pg`
  est petit (`max` 5) et rattaché au cycle de vie de la fonction par
  `attachDatabasePool` (Vercel Fluid compute). Pas de requêtes préparées nommées
  (compatibles PgBouncer).
- **Better Auth 1.7** pour les sessions (cookie signé, sessions en base, expiration
  glissante), le fournisseur Microsoft Entra ID (PKCE, contrôle de l'émetteur =
  tenant) et la liaison de comptes. La connexion par e-mail (lien + code dans **un
  seul** e-mail, défi unique) est un **plugin Better Auth maison** (`src/server/auth/`)
  car les plugins `magic-link` et `email-otp` envoient deux e-mails distincts avec
  deux secrets indépendants, et le lien GET serait consommé par les scanners de
  liens (Outlook Safe Links). Notre lien ouvre une page de confirmation ; seul le
  clic (POST) consomme le défi.
- **Configuration d'authentification dynamique** : durée de session et Entra ID
  viennent de la base. L'instance Better Auth est reconstruite quand la `version`
  des paramètres change (vérifiée au plus toutes les 15 s par instance serveur).
- **TanStack Query** côté client pour l'interface optimiste (annulation propre),
  la revalidation au retour sur l'onglet et le polling léger du tableau (15 s).
  Les mutations passent par des Server Actions.
- **Ordre** : `fractional-indexing`, colonnes `sort_key` en collation `"C"`.
  Le serveur calcule la clé à partir du voisin réel en base (pas de la vue client).
- **Recherche** : `ILIKE` + index trigrammes (`pg_trgm`) sur titres de tâches et noms
  de projets. Suffisant jusqu'à ~300 comptes et quelques centaines de milliers de
  tâches.
- **Texte riche simple** : Markdown restreint (gras, italique, listes, liens),
  rendu par `react-markdown` sans HTML brut (pas d'injection possible).
- **E-mails** : Nodemailer (SMTP standard). En développement, si aucun SMTP n'est
  actif, envoi vers Mailpit (`DEV_MAIL_CAPTURE_URL`) — ignoré en production.
  Aucune connexion de test « magique » : Playwright lit le code dans Mailpit.
- **Envoi asynchrone** : les e-mails de connexion sont envoyés après la réponse
  (`after()`), pour un temps de réponse identique que l'adresse soit connue ou non.
- **Travaux différés** : table `jobs` (clé d'idempotence unique) + route
  `/api/cron` protégée par `CRON_SECRET`, appelée par Vercel Cron. Au lot 1 : purge
  des défis de connexion et compteurs expirés.

## 2026-11-27 — Règles produit

- **Statut et sections sont indépendants** (comme Asana) : les sections sont les
  colonnes du tableau, le statut (à faire / en cours / bloquée / terminée) est un
  champ de la tâche. Un nouveau projet reçoit trois sections « À faire »,
  « En cours », « Terminé ».
- **Administrateur et projets privés** : il gère les adhésions (liste des projets
  privés, nom et membres) mais ne lit pas le contenu sans être membre.
- **Retrait d'un projet** : les tâches assignées à la personne dans ce projet sont
  désassignées (événement journalisé), car « assigner implique d'être membre ».
- **Entra ID** : seuls les comptes du tenant configuré sont acceptés (contrôle de
  l'émetteur). L'adresse e-mail est `email`, sinon `preferred_username` ; elle est
  considérée vérifiée car gérée par l'administrateur du tenant MiTC.
- **Invitation** : crée le compte au statut « invité » (assignable dès l'invitation
  si ajouté à un projet). Valable 14 jours ; le compte devient actif à la
  première connexion.

## 2026-11-27 — Décisions prises pendant l'implémentation

- **Rendu dynamique forcé** (`export const dynamic = "force-dynamic"` dans le layout racine) :
  au build, `/connexion` avait été pré-rendue statiquement (base vide → redirection), ce qui
  cassait la page en production.
- **Sous-requêtes corrélées** : toujours via `outer("table", "colonne")` (`src/db/sql.ts`).
  Drizzle n'écrit pas le nom de table dans une requête mono-table : `${users.id}` dans une
  sous-requête désignait la table interne (compteurs faux). Bug trouvé et corrigé, à respecter.
- **Vue Liste virtualisée** (`@tanstack/react-virtual`) : sans elle, 500 tâches mettaient
  2,6 s à devenir utilisables (hydratation de ~12 000 éléments). Mesuré ensuite : affichage
  494 ms, interaction 761 ms. **Tableau** : 50 cartes par colonne puis « Afficher plus ».
- **Contraste mode sombre** : primaire `#3d6bb8` (5,3:1 avec texte blanc) ; bouton « danger »
  en texte foncé (`--danger-fg`).
- **Limitation de débit** stockée en base (table `rate_limit_events`) : fonctionne entre
  instances serverless, purgée par le cron.
- **Cron Vercel toutes les 15 min** (`vercel.json`) : nécessite le plan Pro (Hobby : 1/jour).
