# Feuille de route

Un lot ne commence que lorsque le précédent est livré et vérifié (sauf préparation
de schéma). Détail des critères dans `COUVERTURE.md`.

## Lot 1 — Gestion des projets et du travail quotidien (en cours)

Ordre des parcours verticaux :

1. Assistant d'installation (premier administrateur)
2. Configuration SMTP avec e-mail de test
3. Invitation d'un membre
4. Connexion par e-mail (lien et code)
5. Création d'un projet
6. Création et assignation d'une tâche
7. Affichage dans « Mes tâches »
8. Déplacement dans le tableau
9. Commentaire avec mention
10. Notification au destinataire autorisé
11. Reste du lot 1 : équipes, archivage/restauration, sous-tâches, étiquettes,
    recherche globale, palette de commandes, raccourcis, Entra ID, sessions,
    journal d'audit des paramètres.

## Lot 2 — Scrum et Kanban

Backlog ordonné, epics / stories / bugs / tâches techniques, story points, suivi du
temps (option par projet), sprints (objectif, dates, planification, démarrage,
clôture avec report), limites WIP, burndown / vélocité / rapport de sprint
calculés depuis `task_events`.

## Lot 3 — Fonctions avancées

Calendrier, chronologie, jalons, dépendances (sans cycle) ; champs personnalisés,
filtres, regroupements, vues enregistrées ; tâche dans plusieurs projets ;
récurrence, modèles, duplication ; pièces jointes privées, abonnés, rappels,
préférences de notification ; formulaires, automatisations (déclencheur →
conditions → actions), approbations ; import / export CSV.

## Lot 4 — Pilotage et intégrations

Portefeuilles par département, objectifs, rapports (avancement, échéances,
risques, blocages, charge), journal d'audit étendu, Microsoft Teams, Odoo Projet.

## Lot 5 — Assistant IA (facultatif)

Comptes rendus, user stories, synthèses de blocages, proposition de sprint ;
fournisseur configurable, interrupteur, quotas, contrôle des droits avant collecte.

## Backlog (idées écartées du lot 1 par simplicité)

- Regroupement du tableau par statut ou par responsable (lot 1 : par section).
- Édition / suppression de commentaires au-delà de l'auteur.
- Préférences de fuseau horaire par utilisateur (lot 1 : Africa/Kinshasa).
- Téléversement du logo depuis l'administration (lot 1 : logo du dépôt + couleurs).
- Temps réel (Pusher / Ably) si le polling s'avère insuffisant.
