/** Règles de permission pures (partagées, testées unitairement). Voir docs/PERMISSIONS.md. */
export type OrgRole = "admin" | "member" | "viewer";
export type ProjectRole = "owner" | "editor" | "viewer";

export function effectiveProjectRole(p: {
  visibility: "organization" | "private";
  memberRole: ProjectRole | null;
  orgRole: OrgRole;
  isExternal: boolean;
}): ProjectRole | null {
  if (p.memberRole) return p.orgRole === "viewer" ? "viewer" : p.memberRole;
  if (p.visibility === "organization" && !p.isExternal) return "viewer";
  return null;
}

/** Rôle de projet maximal autorisé pour un rôle d'organisation. */
export function maxProjectRole(orgRole: OrgRole): ProjectRole {
  return orgRole === "viewer" ? "viewer" : "owner";
}

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Administrateur",
  member: "Membre",
  viewer: "Lecteur",
};
export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  owner: "Responsable",
  editor: "Contributeur",
  viewer: "Lecteur",
};
