/** Raccourcis clavier documentés (affichés par la touche « ? »). */
export const SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: "Partout",
    items: [
      { keys: ["Ctrl/⌘", "K"], label: "Palette de commandes : naviguer, rechercher, créer" },
      { keys: ["?"], label: "Afficher cette aide" },
      { keys: ["G", "puis M"], label: "Aller à Mes tâches" },
      { keys: ["G", "puis I"], label: "Aller à la boîte de réception" },
      { keys: ["G", "puis P"], label: "Aller aux projets" },
      { keys: ["Échap"], label: "Fermer le panneau ou la fenêtre" },
    ],
  },
  {
    group: "Dans un projet",
    items: [
      { keys: ["N"], label: "Nouvelle tâche (ajout rapide)" },
      { keys: ["L"], label: "Vue Liste" },
      { keys: ["B"], label: "Vue Tableau" },
      { keys: ["↑", "↓"], label: "Passer d'une tâche à l'autre (vue Liste)" },
      { keys: ["Entrée"], label: "Ouvrir la tâche sélectionnée" },
      { keys: ["Alt", "↑ / ↓"], label: "Monter / descendre la tâche sélectionnée" },
      { keys: ["Alt", "← / →"], label: "Déplacer vers la section précédente / suivante" },
      { keys: ["Espace", "puis flèches"], label: "Tableau : saisir une carte au clavier, la déplacer, Espace pour déposer" },
    ],
  },
  {
    group: "Dans une tâche",
    items: [
      { keys: ["Ctrl/⌘", "Entrée"], label: "Publier le commentaire" },
      { keys: ["@"], label: "Mentionner une personne dans un commentaire" },
    ],
  },
];
