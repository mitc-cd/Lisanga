import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { AdminTabs } from "./admin-tabs";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const actor = await requireActor();
  if (actor.orgRole !== "admin") notFound();
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold">Administration</h1>
      <AdminTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
