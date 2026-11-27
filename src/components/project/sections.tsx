"use client";
import { useSyncedState } from "@/lib/hooks/use-synced-state";
import { useEffect, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import type { SectionView } from "@/server/projects";
import { createSectionAction, deleteSectionAction, renameSectionAction } from "@/app/actions/projects";
import type { BoardApi } from "./use-board";

/** Ajout rapide : Entrée crée la tâche et garde le focus pour la suivante. */
export function QuickAdd({
  onCreate,
  placeholder = "Ajouter une tâche…",
  className,
  autoFocus,
  sectionName,
  inputId,
}: {
  onCreate: (title: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  sectionName?: string;
  inputId?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-2", className)}>
      <Plus size={16} className="shrink-0 text-muted" aria-hidden />
      <input
        ref={ref}
        id={inputId}
        data-quick-add
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            e.preventDefault();
            onCreate(value.trim());
            setValue("");
          } else if (e.key === "Escape") {
            setValue("");
            ref.current?.blur();
          }
        }}
        maxLength={500}
        placeholder={placeholder}
        aria-label={sectionName ? `Ajouter une tâche dans « ${sectionName} » (Entrée pour valider)` : "Ajouter une tâche (Entrée pour valider)"}
        className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted"
      />
    </div>
  );
}

export function SectionHeader({
  section,
  count,
  canEdit,
  projectId,
  board,
  isLast,
  className,
}: {
  section: SectionView;
  count: number;
  canEdit: boolean;
  projectId: string;
  board: BoardApi;
  isLast: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useSyncedState(section.name);
  const save = async () => {
    setEditing(false);
    const n = name.trim();
    if (!n || n === section.name) return setName(section.name);
    board.setData((d) => ({ ...d, project: { ...d.project, sections: d.project.sections.map((s) => (s.id === section.id ? { ...s, name: n } : s)) } }));
    const r = await renameSectionAction(projectId, section.id, n);
    if (!r.ok) toast.error(r.error);
    void board.refresh();
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setName(section.name);
              setEditing(false);
            }
          }}
          aria-label="Nom de la section"
          className="h-8 min-w-0 flex-1 rounded border border-border-strong bg-surface px-2 text-sm font-semibold"
        />
      ) : (
        <h2 className="min-w-0 truncate text-sm font-semibold" onDoubleClick={() => canEdit && setEditing(true)}>
          {section.name}
        </h2>
      )}
      <span className="text-xs text-muted" aria-label={`${count} tâches`}>
        {count}
      </span>
      <span className="flex-1" />
      {canEdit && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="rounded p-1 text-muted hover:bg-surface-hover" aria-label={`Actions de la section « ${section.name} »`}>
            <MoreHorizontal size={16} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" className="z-50 min-w-44 rounded-lg border border-border bg-surface p-1 shadow-pop">
              <DropdownMenu.Item className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover" onSelect={() => setEditing(true)}>
                Renommer
              </DropdownMenu.Item>
              {!isLast && (
                <DropdownMenu.Item
                  className="cursor-pointer rounded px-2 py-1.5 text-sm text-danger outline-none data-[highlighted]:bg-surface-hover"
                  onSelect={() => setConfirm(true)}
                >
                  Supprimer la section
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Supprimer la section ?"
        description={
          count
            ? `La section « ${section.name} » sera supprimée. Ses ${count} tâche(s) seront déplacées dans la première section du projet.`
            : `La section « ${section.name} » sera supprimée.`
        }
        confirmLabel="Supprimer"
        danger
        onConfirm={async () => {
          const r = await deleteSectionAction(projectId, section.id);
          if (!r.ok) toast.error(r.error);
          else toast.success("Section supprimée.");
          void board.refresh();
        }}
      />
    </div>
  );
}

export function AddSection({ projectId, board, className }: { projectId: string; board: BoardApi; className?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className={cn("flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted hover:bg-surface-hover hover:text-fg", className)}>
        <Plus size={16} aria-hidden /> Ajouter une section
      </button>
    );
  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) return setOpen(false);
        setName("");
        setOpen(false);
        const r = await createSectionAction(projectId, n);
        if (!r.ok) toast.error(r.error);
        void board.refresh();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Nom de la section"
        aria-label="Nom de la nouvelle section"
        maxLength={120}
        className="h-9 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm"
      />
    </form>
  );
}
