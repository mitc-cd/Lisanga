export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  done: "Terminée",
};
export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "Aucune",
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};
export const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low", "none"];
export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export const FIELD_LABELS: Record<string, string> = {
  title: "titre",
  description: "description",
  assigneeId: "responsable",
  priority: "priorité",
  status: "statut",
  startDate: "date de début",
  dueDate: "échéance",
  labels: "étiquettes",
  section: "section",
};
