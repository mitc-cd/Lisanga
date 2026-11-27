"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { verifyLinkAction } from "../actions";

export function LinkConfirm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(token ? null : "Lien incomplet. Copiez le lien entier depuis l'e-mail, ou utilisez le code.");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Cliquez sur le bouton pour terminer la connexion sur cet appareil.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button
        className="w-full"
        autoFocus
        disabled={pending || !token}
        onClick={() =>
          start(async () => {
            const r = await verifyLinkAction(token);
            if (!r.ok) return setError(r.error);
            router.replace("/mes-taches");
            router.refresh();
          })
        }
      >
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/connexion" className="text-primary-text underline-offset-4 hover:underline">
          Demander un nouveau lien
        </Link>
      </p>
    </div>
  );
}
