import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function Spinner({ className, label = "Chargement…" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-muted", className)}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">{children}</kbd>;
}

export function Badge({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", className)} style={style}>
      {children}
    </span>
  );
}

const AVATAR_BG = ["#0B3D91", "#255F96", "#1E7B34", "#7B3FA0", "#9A3412", "#0F766E", "#5B4636", "#334155"];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}

export function Avatar({ name, id, size = 24, className }: { name: string; id?: string; size?: number; className?: string }) {
  const seed = (id ?? name).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42), background: AVATAR_BG[seed % AVATAR_BG.length] }}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      {icon && <div className="rounded-full bg-primary-soft p-3 text-primary-text">{icon}</div>}
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)}>{children}</div>;
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "danger" | "warning" | "success"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-info-soft border-sky/40",
    danger: "bg-danger-soft border-danger/40 text-fg",
    warning: "bg-accent-soft border-accent text-fg",
    success: "bg-success-soft border-success/40",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-sm", tones[tone], className)}>
      {children}
    </div>
  );
}
