"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { requestLoginAction, verifyCodeAction } from "../actions";

export function CodeForm({ email }: { email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [resending, startResend] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code") ?? "");
        setError(null);
        start(async () => {
          const r = await verifyCodeAction(email, code);
          if (!r.ok) return setError(r.error);
          router.replace("/mes-taches");
          router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="code">Code à 6 chiffres</Label>
        <Input
          id="code"
          name="code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          className="h-12 text-center font-mono text-2xl tracking-[0.4em]"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "code-error" : undefined}
        />
      </div>
      {error && (
        <div id="code-error">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Vérification…" : "Se connecter"}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Link href="/connexion" className="text-primary-text underline-offset-4 hover:underline">
          Changer d&apos;adresse
        </Link>
        <button
          type="button"
          className="text-primary-text underline-offset-4 hover:underline disabled:opacity-50"
          disabled={resending}
          onClick={() =>
            startResend(async () => {
              const r = await requestLoginAction(email);
              if (!r.ok) setError(r.error);
              else toast.success("Si l'adresse est autorisée, un nouvel e-mail a été envoyé. L'ancien code n'est plus valable.");
            })
          }
        >
          Renvoyer un code
        </button>
      </div>
    </form>
  );
}
