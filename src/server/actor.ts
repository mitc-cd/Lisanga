import "server-only";

/** Utilisateur authentifié, toujours reconstruit depuis la session et la base. */
export type Actor = {
  id: string;
  organizationId: string;
  orgRole: "admin" | "member" | "viewer";
  isExternal: boolean;
  name: string;
  email: string;
};
