# Matrice de couverture

Statuts : ✅ livré et vérifié · 🟡 livré, vérification partielle · ⛔ bloqué (accès externe) · — backlog.
Preuves : `V:` test Vitest (`tests/…`), `E:` test Playwright (`e2e/…`), `M:` vérification manuelle / capture.

## Lot 1

| Fonctionnalité | Lot | Statut | Critère d'acceptation | Preuve |
|---|---|---|---|---|
| Assistant d'installation (jeton à usage unique, désactivé ensuite) | 1 | ✅ | 1er admin créé ; `/installation` inutilisable dès qu'un admin existe ; installations concurrentes → 1 admin | E: parcours 1-2 ; V: auth.test « assistant d'installation » |
| Configuration SMTP testée avant activation | 1 | ✅ | Test via Mailpit ; échec traduit en français ; config active non écrasée | E: parcours 1-2 ; V: settings.test « SMTP » |
| Secrets chiffrés AES-256-GCM, jamais renvoyés ni journalisés | 1 | ✅ | Valeur en base `v1:…`, absente des vues admin/publiques et de l'audit | V: settings.test ; V: rules.test « chiffrement » |
| Alerte admin si le SMTP actif échoue | 1 | ✅ | Statut « en échec » + bandeau | V: settings.test |
| Invitation d'un membre (e-mail) | 1 | ✅ | E-mail reçu ; compte « invité » ; actif à la 1re connexion ; expire à 14 j | E: parcours 3 ; V: auth.test « invitations » |
| Connexion par e-mail (lien + code, un seul e-mail) | 1 | ✅ | 10 min, usage unique, hachés, 5 essais, limitation adresse/IP, même message connu/inconnu | E: parcours 4-6, 9-10 ; V: auth.test (26 tests) |
| Lien non consommé à l'ouverture (antivirus de messagerie) | 1 | ✅ | GET affiche un bouton ; seul le POST connecte | E: helpers `loginWithLink` |
| Domaines admis automatiquement | 1 | ✅ | Compte membre créé à la connexion | V: auth.test |
| Microsoft Entra ID | 1 | ⛔ | Bouton masqué tant que non configuré + testé ; tenant imposé | V: settings.test (enregistrer/tester/activer). **Non testé avec un vrai tenant** |
| Sessions : durée réglable, déconnexion partout, révocation à la désactivation | 1 | ✅ | Sessions supprimées immédiatement | V: auth.test « désactivation » ; M: /profil |
| Paramètres d'administration réservés aux admins | 1 | ✅ | Membre/lecteur : refus lecture et écriture ; page 404 | V: settings.test ; E: projet privé (fin) |
| Journal d'audit des paramètres et droits | 1 | ✅ | Qui, quand, champs, sans secret | V: settings.test ; M: /admin/journal |
| Équipes et membres d'équipe | 1 | 🟡 | Créer, renommer, archiver, ajouter/retirer | M: /admin/equipes (pas de test automatisé) |
| Projets org./privés, création, archivage/restauration | 1 | ✅ | Visibilité respectée ; archivé = lecture seule | E: parcours 4-6 ; V: permissions.test |
| Membres de projet, rôles, rejoindre, dernier responsable protégé | 1 | ✅ | Matrice PERMISSIONS.md | V: permissions.test (43 tests) |
| Sections ordonnées (créer, renommer, réordonner, supprimer) | 1 | ✅ | Suppression → tâches dans la 1re section | V: tasks.test ; M: menu de section |
| Vues Liste et Tableau synchronisées | 1 | ✅ | Même source de données ; persisté après rechargement | E: parcours 7-8 |
| Création de tâche < 5 s (Entrée, « + » visible, titre seul) | 1 | ✅ | Ajout rapide, touche N, palette | E: parcours 4-6 ; V: tasks.test |
| Tâches : titre, description riche simple, responsable, priorité, statut, début, échéance, étiquettes | 1 | ✅ | Édition sur place dans le panneau latéral | E: parcours 4-6 ; M: captures |
| Sous-tâches (1 niveau) | 1 | ✅ | Petit-enfant refusé | V: tasks.test |
| Lien direct partageable, sans contournement des droits | 1 | ✅ | Inaccessible = 404 identique à inexistant | E: projet privé ; V: permissions.test |
| Mes tâches (en retard / aujourd'hui / semaine / plus tard / sans date), filtres, tri | 1 | ✅ | Groupes en Africa/Kinshasa | E: parcours 7-8 ; V: rules.test (dates) |
| Recherche globale limitée aux droits | 1 | ✅ | Projets privés absents | E: projet privé ; V: permissions.test |
| Glisser-déposer + clavier, concurrence | 1 | ✅ | Souris, Alt+flèches, Espace ; ordre fractionnaire ; conflit de version refusé | E: parcours 7-8 ; V: tasks.test |
| Commentaires, mentions, historique | 1 | ✅ | Mention d'une personne sans accès ignorée | E: parcours 9-10 ; V: permissions.test |
| Boîte de réception (lu/non lu, lien) | 1 | ✅ | Notification seulement si le destinataire a accès ; masquée si accès perdu | E: parcours 9-10 ; V: permissions.test |
| Palette Ctrl/Cmd+K, aide « ? » | 1 | 🟡 | Naviguer, rechercher, créer | E: recherche via palette ; M: reste |
| Interface optimiste + annulation (toast « Annuler ») | 1 | 🟡 | Échec → rechargement + message | M (pas de test d'échec réseau automatisé) |
| Performance : 500 tâches < 1 s | 1 | ✅ | Affichage 494 ms, interactif 761 ms (build prod, poste local) | E: performance.spec ; V: tasks.test « volume » (21 ms serveur) |
| Responsive et mode sombre, contrastes AA | 1 | 🟡 | Captures 1440 px / 390 px / sombre ; contrastes calculés | M: captures ; V: rules.test « couleurs ». Pas d'audit lecteur d'écran complet |
| Travaux différés idempotents (cron) | 1 | ✅ | Clé unique, reprise avec délai | V: jobs.test |
| Seed de démonstration (refus en production) | 1 | ✅ | Refuse une base distante | M: `pnpm db:seed` |

## Lots suivants

Voir `ROADMAP.md`. Préparations de schéma déjà en place : `tasks.type`, `story_points`,
`sprint_id`, `sections.wip_limit`, `task_projects` (plusieurs projets), `task_events`.
