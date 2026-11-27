"use client";
import { formatDue, formatInstant, formatRelative } from "@/lib/dates";
import { PRIORITY_LABELS, STATUS_LABELS, type TaskPriority, type TaskStatus } from "@/lib/labels";
import type { EventView, TaskDetail } from "@/server/tasks";

function describe(e: EventView, task: TaskDetail): string[] {
  const name = (id: unknown) => (typeof id === "string" ? task.userNames[id] ?? task.assignable.find((a) => a.id === id)?.name ?? "une personne" : "personne");
  const date = (d: unknown) => (typeof d === "string" ? formatDue(d) : "aucune");
  switch (e.type) {
    case "task.created":
      return [e.meta.parentTaskId ? "a créé cette sous-tâche" : "a créé la tâche"];
    case "subtask.added":
      return [`a ajouté la sous-tâche « ${String(e.meta.title ?? "")} »`];
    case "task.archived":
      return ["a archivé la tâche"];
    case "task.restored":
      return ["a restauré la tâche"];
    case "task.moved": {
      const s = e.changes.section;
      if (!s) return [];
      return [`a déplacé la tâche de « ${task.sectionNames[String(s.from)] ?? "?"} » vers « ${task.sectionNames[String(s.to)] ?? "?"} »`];
    }
    case "task.updated": {
      const out: string[] = [];
      for (const [field, c] of Object.entries(e.changes)) {
        if (field === "status") out.push(`a changé le statut : ${STATUS_LABELS[c.from as TaskStatus]} → ${STATUS_LABELS[c.to as TaskStatus]}`);
        else if (field === "assigneeId") {
          const reason = e.meta.reason === "member_removed" ? " (retiré du projet)" : e.meta.reason === "role_viewer" ? " (passé lecteur)" : "";
          out.push(c.to ? `a assigné la tâche à ${name(c.to)}` : `a retiré le responsable ${name(c.from)}${reason}`);
        } else if (field === "dueDate") out.push(`a changé l'échéance : ${date(c.from)} → ${date(c.to)}`);
        else if (field === "startDate") out.push(`a changé la date de début : ${date(c.from)} → ${date(c.to)}`);
        else if (field === "priority") out.push(`a changé la priorité : ${PRIORITY_LABELS[c.from as TaskPriority]} → ${PRIORITY_LABELS[c.to as TaskPriority]}`);
        else if (field === "title") out.push(`a renommé la tâche (« ${String(c.from)} »)`);
        else if (field === "description") out.push("a modifié la description");
        else if (field === "labels") out.push("a modifié les étiquettes");
      }
      return out;
    }
    default:
      return [];
  }
}

export function ActivityList({ task }: { task: TaskDetail }) {
  const lines = task.events.flatMap((e) => describe(e, task).map((text, i) => ({ key: `${e.id}-${i}`, text, e })));
  if (!lines.length) return <p className="text-sm text-muted">Aucune activité.</p>;
  return (
    <ol className="space-y-1.5 text-xs">
      {lines.map(({ key, text, e }) => (
        <li key={key} className="flex gap-1.5 text-muted">
          <span>
            <span className="font-medium text-fg">{e.actor?.name ?? "Système"}</span> {text}
          </span>
          <time dateTime={e.createdAt} title={formatInstant(e.createdAt)} className="ml-auto shrink-0">
            {formatRelative(e.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
