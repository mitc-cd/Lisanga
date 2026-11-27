import { BrandLogo } from "@/components/ui/brand-logo";
import { getPublicSettings } from "@/server/settings";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const s = await getPublicSettings();
  return (
    <main id="contenu" className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <BrandLogo src={s.logoPath} height={44} appName={s.appName} />
          <p className="text-sm font-medium text-muted">{s.appName}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">{children}</div>
      </div>
    </main>
  );
}
