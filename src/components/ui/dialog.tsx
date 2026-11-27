"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideTitle,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  hideTitle?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-border bg-surface p-5 shadow-pop focus:outline-none",
            className,
          )}
          aria-describedby={description ? undefined : undefined}
        >
          <D.Title className={cn("text-lg font-semibold", hideTitle && "sr-only")}>{title}</D.Title>
          {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          <div className={cn(!hideTitle && "mt-4")}>{children}</div>
          <D.Close className="absolute right-3 top-3 rounded-md p-1 text-muted hover:bg-surface-hover" aria-label="Fermer">
            <X size={18} />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Confirmation (réservée aux suppressions définitives et changements de droits). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <button className="h-10 rounded-lg border border-border-strong px-4 text-sm hover:bg-surface-hover" onClick={() => onOpenChange(false)}>
          Annuler
        </button>
        <button
          autoFocus
          className={cn("h-10 rounded-lg px-4 text-sm font-medium", danger ? "bg-danger text-danger-fg" : "bg-primary text-primary-fg")}
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
