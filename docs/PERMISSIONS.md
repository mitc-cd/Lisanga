# Matrice de permissions

Toutes les vérifications sont faites côté serveur (`src/server/permissions.ts`),
à partir de la session et de la base — jamais d'un identifiant fourni par le
navigateur. Un élément inaccessible renvoie la même réponse qu'un élément
inexistant (« introuvable »).

## Rôles

| Niveau | Rôle | Libellé |
|---|---|---|
| Organisation | `admin` | Administrateur |
| Organisation | `member` | Membre |
| Organisation | `viewer` | Lecteur |
| Projet | `owner` | Responsable |
| Projet | `editor` | Contributeur |
| Projet | `viewer` | Lecteur |

Un **invité externe** (`is_external`) n'a accès qu'aux projets dont il est
explicitement membre ; il ne voit pas les projets « visibles par l'organisation ».

Un **lecteur d'organisation** ne peut avoir que le rôle « lecteur » dans un projet.

## Accès à un projet

Rôle effectif dans un projet :

1. membre du projet → son rôle de projet (plafonné à « lecteur » pour un lecteur d'organisation) ;
2. sinon, projet **visible par l'organisation** et utilisateur interne actif → « lecteur » ;
3. sinon → aucun accès (le projet « n'existe pas » pour lui).

| Action | Lecteur | Contributeur | Responsable | Admin org. non membre |
|---|---|---|---|---|
| Voir projet, tâches, commentaires, historique | ✅ | ✅ | ✅ | ✅ si visible org. ; ❌ si privé |
| Créer / modifier / déplacer / archiver une tâche | ❌ | ✅ | ✅ | ❌ |
| Commenter, mentionner | ❌ | ✅ | ✅ | ❌ |
| Gérer les sections | ❌ | ✅ | ✅ | ❌ |
| Renommer, changer la visibilité, archiver / restaurer le projet | ❌ | ❌ | ✅ | ✅ |
| Gérer les membres du projet | ❌ | ❌ | ✅ | ✅ (sans lire le contenu d'un projet privé) |
| Rejoindre un projet visible par l'organisation | membre d'org. : ✅ (comme contributeur) ; lecteur d'org. : ✅ (comme lecteur) ; externe : ❌ |

| Action organisation | Admin | Membre | Lecteur |
|---|---|---|---|
| Créer un projet (en devient responsable) | ✅ | ✅ | ❌ |
| Inviter, changer un rôle, désactiver un compte | ✅ | ❌ | ❌ |
| Gérer les équipes | ✅ | ❌ | ❌ |
| Lire / modifier les paramètres d'administration | ✅ | ❌ | ❌ |
| Consulter le journal d'audit | ✅ | ❌ | ❌ |

## Règles particulières

- **Assignation** : le responsable d'une tâche doit être membre du projet
  principal avec le rôle contributeur ou responsable. Assigner un non-membre est
  refusé (le sélecteur ne propose que les membres éligibles).
- **Mentions** : on ne peut mentionner qu'une personne qui peut lire la tâche.
  Une notification n'est créée que si le destinataire a accès à l'élément au
  moment de la création ; la boîte de réception refiltre à la lecture (un accès
  perdu masque les notifications correspondantes).
- **Retrait d'un projet** : perte d'accès immédiate (sauf lecture si le projet
  est visible par l'organisation) ; ses tâches dans ce projet sont désassignées.
  Le dernier responsable d'un projet ne peut pas être retiré ni rétrogradé.
- **Désactivation d'un compte** : toutes ses sessions sont supprimées
  immédiatement ; il ne peut plus se connecter (aucun des deux modes) ; il reste
  affiché comme auteur / responsable « (désactivé) » ; réactivation possible par
  un administrateur. Le dernier administrateur actif ne peut pas être désactivé
  ni rétrogradé.
- **Recherche, Mes tâches, boîte de réception, liens directs** : même filtre
  d'accès que la lecture d'un projet.
- **Archivage** : une tâche ou un projet archivé reste lisible par les mêmes
  personnes (filtre « Archivés ») et restaurable par un contributeur (tâche) ou
  un responsable (projet).
