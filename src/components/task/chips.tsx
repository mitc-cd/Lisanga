"use client";
import { Calendar, CheckCircle2, Circle, CircleDashed, CircleSlash, Flag } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/cn";
import { dueBucket, formatDue, todayIso } from "@/lib/dates";
import { PRIORITY_LABELS, STATUS_LABELS, type TaskPriority, type TaskStatus } from "@/lib/labels";
import { MENTION_RE } from "@/lib/mentions";
import { Avatar } from "@/components/ui/misc";
import type { LabelView, UserRef } from "@/server/tasks";

export function DueChip({ due, done, className }: { due: string | null; done?: boolean; className?: string }) {
  if (!due) return null;
  const b = dueBucket(due, todayIso());
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs",
        !done && b === "overdue" ? "font-semibold text-danger" : !done && b === "today" ? "font-semibold text-accent-text" : "text-muted",
        className,
      )}
      title={`Échéance : ${due}`}
    >
      <Calendar size={12} aria-hidden />
      <span className="sr-only">Échéance :</span>
      {formatDue(due)}
      {!done && b === "overdue" && <span className="sr-only">(en retard)</span>}
    </span>
  );
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  none: "",
  low: "bg-surface-2 text-muted border border-border",
  medium: "bg-info-soft text-fg border border-sky/50",
  high: "bg-accent-soft text-accent-text border border-accent/60",
  urgent: "bg-danger-soft text-danger border border-danger/40",
};

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  if (priority === "none") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", PRIORITY_STYLE[priority])}>
      <Flag size={10} aria-hidden />
      <span className="sr-only">Priorité :</span>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function StatusIcon({ status, size = 18 }: { status: TaskStatus; size?: number }) {
  if (status === "done") return <CheckCircle2 size={size} className="text-success" aria-hidden />;
  if (status === "in_progress") return <CircleDashed size={size} className="text-primary-text" aria-hidden />;
  if (status === "blocked") return <CircleSlash size={size} className="text-danger" aria-hidden />;
  return <Circle size={size} className="text-muted" aria-hidden />;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  if (status === "todo") return null;
  const style = status === "done" ? "bg-success-soft text-success" : status === "blocked" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-text";
  return <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", style)}>{STATUS_LABELS[status]}</span>;
}

/** Case « terminée » : bascule terminée ↔ à faire. */
export function DoneToggle({ status, onToggle, disabled, title }: { status: TaskStatus; onToggle: () => void; disabled?: boolean; title: string }) {
  const done = status === "done";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      aria-pressed={done}
      aria-label={done ? `Rouvrir « ${title} »` : `Marquer « ${title} » comme terminée`}
      className="shrink-0 rounded-full p-0.5 hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent"
    >
      <StatusIcon status={status} />
    </button>
  );
}

export function AssigneeChip({ user, size = 22 }: { user: UserRef | null; size?: number }) {
  if (!user) return null;
  return (
    <span className="inline-flex items-center" title={`Responsable : ${user.name}${user.deactivated ? " (désactivé)" : ""}`}>
      <Avatar name={user.name} id={user.id} size={size} className={user.deactivated ? "opacity-50" : undefined} />
      <span className="sr-only">Responsable : {user.name}</span>
    </span>
  );
}

export function LabelChips({ labels, max = 3 }: { labels: LabelView[]; max?: number }) {
  if (!labels.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.slice(0, max).map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-[11px]">
          <span className="h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden />
          {l.name}
        </span>
      ))}
      {labels.length > max && <span className="text-[11px] text-muted">+{labels.length - max}</span>}
    </span>
  );
}

/** Markdown restreint, sans HTML brut ; les mentions sont rendues en @Nom. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const withMentions = text.replace(MENTION_RE, (_m, name) => `**@${name}**`);
  return (
    <div className={cn("prose-task text-sm leading-relaxed break-words", className)}>
      <ReactMarkdown
        allowedElements={["p", "strong", "em", "ul", "ol", "li", "a", "code", "br", "blockquote", "del"]}
        unwrapDisallowed
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> }}
      >
        {withMentions}
      </ReactMarkdown>
    </div>
  );
}
