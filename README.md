# MiTC Projets

Application interne de gestion de projets de MiTC (Next.js 16, PostgreSQL, Drizzle, Better Auth).
Documentation : `docs/` (architecture, permissions, décisions, feuille de route, couverture, avancement).

## Prérequis

- Node.js 24, pnpm 8+
- Docker (PostgreSQL 16 et Mailpit en local)

## Installation locale

```bash
pnpm install
cp .env.example .env.local
# Renseigner les secrets (chacun : openssl rand -base64 32) :
#   BETTER_AUTH_SECRET, SETTINGS_ENCRYPTION_KEY, CRON_SECRET
docker compose up -d          # Postgres sur le port 54329, Mailpit (SMTP 11025, interface http://localhost:18025)
pnpm db:migrate               # applique les migrations SQL (dossier drizzle/)
pnpm dev                      # http://localhost:3000
```

### Premier démarrage

```bash
pnpm setup:admin              # affiche un jeton à usage unique (24 h) et l'URL /installation?jeton=…
```

L'assistant crée le premier administrateur, ouvre sa session et le conduit à la configuration
SMTP (en local : hôte `localhost`, port `11025`, chiffrement « Aucun »). Il est désactivé dès
qu'un administrateur existe. Alternative : variable `SETUP_TOKEN` (16 caractères minimum).

### Données de démonstration (facultatif)

```bash
pnpm db:seed                  # refuse une base distante ou de production
pnpm db:seed --reset          # vide d'abord toute la base (développement uniquement)
```

Comptes fictifs : `admin@`, `chef.projet@`, `collaboratrice@`, `lecteur@demo.mitc.test`.
Se connecter avec l'adresse ; le code arrive dans Mailpit (http://localhost:18025).

### Secours : SMTP en panne

```bash
pnpm login-link admin@mitc.cd   # lien + code de connexion pour un administrateur actif, sans e-mail
```

## Tests

```bash
pnpm lint
pnpm typecheck
pnpm test                     # Vitest (base mitc_test, créée par docker compose) — nécessite Mailpit
pnpm test:e2e                 # Playwright : build de production + serveur sur :3100, base mitc_test, Mailpit
PW_DEV=1 pnpm test:e2e        # variante rapide sur serveur de dev (arrêter `pnpm dev` avant)
pnpm build
```

Premier lancement de Playwright : `pnpm exec playwright install chromium`.

## Migrations

```bash
# après modification de src/db/schema.ts
pnpm db:generate --name=description_courte
pnpm db:migrate
```

## Déploiement Vercel (préparé, non encore vérifié)

1. Créer les bases Neon (dev, preview, production) via l'intégration Vercel.
2. Variables d'environnement Vercel (par environnement) :
   - `DATABASE_URL` : URL **poolée** Neon ; `DATABASE_URL_UNPOOLED` : URL directe (migrations)
   - `APP_URL` : URL publique (ex. `https://projets.mitc.cd`)
   - `BETTER_AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `CRON_SECRET` (valeurs distinctes par environnement)
   - `SETUP_TOKEN` (facultatif, pour l'installation ; à supprimer ensuite)
3. Commande de build : `pnpm vercel-build` (applique les migrations puis construit).
   ⚠️ En production, n'appliquer les migrations qu'après validation.
4. Le cron `/api/cron` (toutes les 15 min, `vercel.json`) nécessite le plan Pro.
5. Microsoft Entra ID : déclarer la redirection `https://<domaine>/api/auth/callback/microsoft`,
   puis Administration → Paramètres : enregistrer, tester, activer.

**Ne jamais perdre `SETTINGS_ENCRYPTION_KEY`** : sans elle, les secrets SMTP et Entra stockés
sont illisibles (il faudra les ressaisir).
