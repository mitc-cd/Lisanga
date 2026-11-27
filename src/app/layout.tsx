import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { getPublicSettings } from "@/server/settings";
import { readableOn } from "@/lib/colors";
import "./globals.css";

// Police téléchargée au build et servie par l'application (aucun appel à Google côté navigateur).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const s = await getPublicSettings().catch(() => null);
  const name = s?.appName ?? "MiTC Projets";
  return { title: { default: name, template: `%s · ${name}` }, description: "Gestion de projets interne MiTC", robots: { index: false } };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1320" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const s = await getPublicSettings().catch(() => null);
  const primary = s?.primaryColor && s.primaryColor.toLowerCase() !== "#0b3d91" ? s.primaryColor : null;
  const style = primary ? ({ "--brand-override": primary, "--primary-fg": readableOn(primary) } as React.CSSProperties) : undefined;
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`} style={style}>
      <body className="min-h-full font-sans">
        <a href="#contenu" className="skip-link">
          Aller au contenu
        </a>
        {children}
        <Toaster position="bottom-center" richColors closeButton toastOptions={{ duration: 5000 }} />
      </body>
    </html>
  );
}
