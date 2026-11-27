import Image from "next/image";
import { cn } from "@/lib/cn";

/** Logo MiTC servi localement ; pastille claire en mode sombre (voir globals.css). */
export function BrandLogo({ src = "/brand/mitc-logo.png", height = 28, className, appName }: { src?: string; height?: number; className?: string; appName?: string }) {
  const width = Math.round((719 / 411) * height);
  return (
    <span className={cn("brand-logo-wrap", className)}>
      <Image src={src} alt={appName ? `${appName} — MiTC` : "MiTC"} width={width} height={height} priority style={{ height, width }} />
    </span>
  );
}
