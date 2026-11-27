"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin/parametres", label: "Paramètres" },
  { href: "/admin/membres", label: "Membres" },
  { href: "/admin/equipes", label: "Équipes" },
  { href: "/admin/projets", label: "Projets" },
  { href: "/admin/journal", label: "Journal d'audit" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections d'administration" className="mt-4 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              active ? "border-primary font-semibold text-primary-text" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
