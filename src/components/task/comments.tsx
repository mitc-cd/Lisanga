"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatInstant, formatRelative } from "@/lib/dates";
import { mentionToken } from "@/lib/mentions";
import type { TaskDetail, UserRef } from "@/server/tasks";
import { addCommentAction, deleteCommentAction } from "@/app/actions/tasks";
import { boardKey, taskKey } from "@/components/project/use-board";
import { useActor } from "@/components/shell/providers";
import { RichText } from "./chips";

/** Remplace les « @Nom » choisis dans la liste par le jeton de mention stocké. */
function encodeMentions(text: string, chosen: Map<string, string>) {
  let out = text;
  const names = [...chosen.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) out = out.split(`@${name}`).join(mentionToken(name, chosen.get(name)!));
  return out;
}

export function CommentsSection({ task }: { task: TaskDetail }) {
  const qc = useQueryClient();
  const actor = useActor();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const chosen = useRef(new Map<string, string>());
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();

  const candidates: UserRef[] = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return task.mentionable.filter((u) => u.id !== actor.id && u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, task.mentionable, actor.id]);

  const detectMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\p{L}\p{N}._' -]{0,30})$/u.exec(before);
    if (m && !m[2]!.includes("  ")) {
      setMentionQuery(m[2]!);
      setActive(0);
    } else setMentionQuery(null);
  };

  const pick = (u: UserRef) => {
    const el = ref.current;
    if (!el || mentionQuery === null) return;
    const caret = el.selectionStart;
    const start = caret - mentionQuery.length - 1;
    const next = text.slice(0, start) + `@${u.name} ` + text.slice(caret);
    chosen.current.set(u.name, u.id);
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = start + u.name.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await addCommentAction(task.id, encodeMentions(body, chosen.current));
    setSending(false);
    if (!r.ok) return toast.error(r.error);
    setText("");
    chosen.current.clear();
    void qc.invalidateQueries({ queryKey: taskKey(task.id) });
    void qc.invalidateQueries({ queryKey: boardKey(task.project.id) });
  };

  const listOpen = mentionQuery !== null && candidates.length > 0;

  return (
    <section aria-labelledby="comments-title">
      <h3 id="comments-title" className="mb-2 text-sm font-semibold">
        Commentaires {task.comments.length > 0 && <span className="font-normal text-muted">({task.comments.length})</span>}
      </h3>
      <ul className="space-y-3">
        {task.comments.map((c) => (
          <li key={c.id} className="group rounded-lg bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-xs">
              <Avatar name={c.author?.name ?? "?"} id={c.author?.id} size={20} />
              <span className="font-semibold">
                {c.author?.name ?? "Compte supprimé"}
                {c.author?.deactivated && <span className="font-normal text-muted"> (désactivé)</span>}
              </span>
              <time dateTime={c.createdAt} title={formatInstant(c.createdAt)} className="text-muted">
                {formatRelative(c.createdAt)}
              </time>
              <span className="flex-1" />
              {c.mine && task.canEdit && (
                <button
                  className="rounded p-1 text-muted opacity-0 hover:bg-surface-hover focus:opacity-100 group-hover:opacity-100"
                  aria-label="Supprimer mon commentaire"
                  onClick={async () => {
                    const r = await deleteCommentAction(c.id);
                    if (!r.ok) return toast.error(r.error);
                    void qc.invalidateQueries({ queryKey: taskKey(task.id) });
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <RichText text={c.body} className="mt-1.5" />
          </li>
        ))}
      </ul>
      {task.canEdit ? (
        <div className="relative mt-3">
          <label htmlFor="comment-box" className="sr-only">
            Écrire un commentaire. Tapez @ pour mentionner une personne.
          </label>
          <textarea
            id="comment-box"
            ref={ref}
            value={text}
            rows={2}
            maxLength={10000}
            placeholder="Écrire un commentaire… (@ pour mentionner)"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={listOpen ? `${listId}-${active}` : undefined}
            onChange={(e) => {
              setText(e.target.value);
              detectMention(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={(e) => {
              if (listOpen) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  return setActive((a) => (a + 1) % candidates.length);
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  return setActive((a) => (a - 1 + candidates.length) % candidates.length);
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  return pick(candidates[active]!);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  return setMentionQuery(null);
                }
              }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            className="field-sizing-content min-h-16 w-full rounded-lg border border-border-strong bg-surface p-3 text-sm"
          />
          {listOpen && (
            <ul id={listId} role="listbox" aria-label="Personnes à mentionner" className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-lg border border-border bg-surface p-1 shadow-pop">
              {candidates.map((u, i) => (
                <li
                  key={u.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(u);
                  }}
                  className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm", i === active && "bg-primary-soft")}
                >
                  <Avatar name={u.name} id={u.id} size={20} />
                  {u.name}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Ctrl/⌘ + Entrée pour publier</span>
            <Button size="sm" onClick={() => void submit()} disabled={!text.trim() || sending}>
              {sending ? "Envoi…" : "Commenter"}
            </Button>
          </div>
        </div>
      ) : (
        task.comments.length === 0 && <p className="text-sm text-muted">Aucun commentaire.</p>
      )}
    </section>
  );
}
