/** Format de stockage d'une mention : @[Nom affiché](uuid). */
export const MENTION_RE = /@\[([^\]\n]{1,100})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export function extractMentionIds(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) ids.add(m[2]!.toLowerCase());
  return [...ids];
}

export function mentionToken(name: string, id: string) {
  return `@[${name.replace(/[\[\]\n]/g, "")}](${id})`;
}
