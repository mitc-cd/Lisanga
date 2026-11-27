"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";

export type ClientActor = { id: string; name: string; email: string; orgRole: "admin" | "member" | "viewer" };
const ActorContext = createContext<ClientActor | null>(null);

export function useActor(): ClientActor {
  const a = useContext(ActorContext);
  if (!a) throw new Error("useActor hors du contexte");
  return a;
}

export function Providers({ actor, children }: { actor: ClientActor; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: true, staleTime: 5_000, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <ActorContext value={actor}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ActorContext>
  );
}
