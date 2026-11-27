"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DropdownMenu } from "radix-ui";
import { CheckCircle2, FolderKanban, Inbox, Keyboard, LogOut, Menu, Search, Settings, User, X, Lock, TriangleAlert } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/fetch-json";
import { signOutAction } from "@/app/actions/session";
import { CommandPalette } from "./command-palette";
import { SHORTCUTS } from "./shortcuts";
import { useActor } from "./providers";

export type SidebarProject = { id: string; name: string; color: string; visibility: "organization" | "private"; canEdit: boolean };

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function AppShell({
  children,
  appName,
  logoPath,
  projects,
  smtpFailing,
}: {
  children: ReactNode;
  appName: string;
  logoPath: string;
  projects: SidebarProject[];
  smtpFailing: boolean;
}) {
  const actor = useActor();
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const gPressed = useRef<number>(0);

  const { data: unread } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => fetchJson<{ count: number }>("/api/notifications/count"),
    refetchInterval: 30_000,
  });

  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector("[role=dialog]")) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "g") {
        gPressed.current = Date.now();
        return;
      }
      if (Date.now() - gPressed.current < 1200) {
        gPressed.current = 0;
        if (k === "m") router.push("/mes-taches");
        else if (k === "i") router.push("/boite");
        else if (k === "p") router.push("/projets");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const nav = (
    <nav aria-label="Navigation principale" className="flex h-full flex-col gap-1 p-3">
      <div className="mb-3 flex items-center gap-2 px-2 pt-1">
        <BrandLogo src={logoPath} height={26} appName={appName} />
        <span className="truncate text-sm font-semibold">{appName}</span>
      </div>
      <button
        onClick={() => setPaletteOpen(true)}
        className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted hover:bg-surface-hover"
      >
        <Search size={16} aria-hidden />
        <span className="flex-1 text-left">Rechercher…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <NavLink href="/mes-taches" icon={<CheckCircle2 size={18} />} label="Mes tâches" active={pathname.startsWith("/mes-taches")} />
      <NavLink
        href="/boite"
        icon={<Inbox size={18} />}
        label="Boîte de réception"
        active={pathname.startsWith("/boite")}
        badge={unread?.count ? unread.count : undefined}
      />
      <NavLink href="/projets" icon={<FolderKanban size={18} />} label="Projets" active={pathname === "/projets"} />
      <div className="mt-4 px-2 text-xs font-semibold uppercase tracking-wide text-muted">Mes projets</div>
      <ul className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {projects.length === 0 && <li className="px-2 py-1 text-xs text-muted">Aucun projet pour l&apos;instant.</li>}
        {projects.map((p) => {
          const active = pathname.startsWith(`/projets/${p.id}`);
          return (
            <li key={p.id}>
              <Link
                href={`/projets/${p.id}`}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-hover", active && "bg-primary-soft font-medium")}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
                <span className="truncate">{p.name}</span>
                {p.visibility === "private" && <Lock size={12} className="shrink-0 text-muted" aria-label="Projet privé" />}
              </Link>
            </li>
          );
        })}
      </ul>
      {actor.orgRole === "admin" && (
        <NavLink href="/admin/parametres" icon={<Settings size={18} />} label="Administration" active={pathname.startsWith("/admin")} />
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-hover">
          <Avatar name={actor.name} id={actor.id} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{actor.name}</span>
            <span className="block truncate text-xs text-muted">{actor.email}</span>
          </span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content side="top" align="start" className="z-50 min-w-56 rounded-lg border border-border bg-surface p-1 shadow-pop">
            <DropdownMenu.Item className={menuItem} onSelect={() => router.push("/profil")}>
              <User size={16} aria-hidden /> Mon profil et mes sessions
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} onSelect={() => setHelpOpen(true)}>
              <Keyboard size={16} aria-hidden /> Raccourcis clavier
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item className={menuItem} onSelect={() => void signOutAction()}>
              <LogOut size={16} aria-hidden /> Se déconnecter
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </nav>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface-2 md:block">{nav}</aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface-2 shadow-pop">
            <button className="absolute right-2 top-2 rounded-md p-2 text-muted" onClick={() => setDrawerOpen(false)} aria-label="Fermer le menu">
              <X size={18} />
            </button>
            {nav}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b border-border bg-surface px-3 md:hidden">
          <button className="rounded-md p-2" onClick={() => setDrawerOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={20} />
          </button>
          <BrandLogo src={logoPath} height={22} appName={appName} />
          <span className="flex-1" />
          <button className="rounded-md p-2" onClick={() => setPaletteOpen(true)} aria-label="Rechercher">
            <Search size={20} />
          </button>
          <Link href="/boite" className="relative rounded-md p-2" aria-label={`Boîte de réception${unread?.count ? `, ${unread.count} non lues` : ""}`}>
            <Inbox size={20} />
            {!!unread?.count && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" aria-hidden />}
          </Link>
        </header>
        {smtpFailing && actor.orgRole === "admin" && (
          <div role="alert" className="flex items-center gap-2 border-b border-accent bg-accent-soft px-4 py-2 text-sm">
            <TriangleAlert size={16} aria-hidden className="text-accent-text" />
            <span>L&apos;envoi d&apos;e-mails échoue : les codes de connexion et les invitations ne partent plus.</span>
            <Link href="/admin/parametres#smtp" className="font-medium underline">
              Vérifier la configuration SMTP
            </Link>
          </div>
        )}
        <main id="contenu" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} projects={projects} onShowShortcuts={() => setHelpOpen(true)} />
      <Dialog open={helpOpen} onOpenChange={setHelpOpen} title="Raccourcis clavier" className="max-w-2xl">
        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          {SHORTCUTS.map((g) => (
            <section key={g.group}>
              <h3 className="mb-2 text-sm font-semibold text-muted">{g.group}</h3>
              <dl className="space-y-1.5">
                {g.items.map((it) => (
                  <div key={it.label} className="flex items-center justify-between gap-4 text-sm">
                    <dt>{it.label}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {it.keys.map((k) => (k.startsWith("puis") ? <span key={k} className="text-xs text-muted">{k}</span> : <Kbd key={k}>{k}</Kbd>))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

const menuItem = "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover";

function NavLink({ href, icon, label, active, badge }: { href: string; icon: ReactNode; label: string; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-hover", active && "bg-primary-soft font-semibold text-primary-text")}
    >
      <span aria-hidden>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-fg" aria-label={`${badge} non lues`}>
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
