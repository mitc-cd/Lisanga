/** IP client : premier élément de x-forwarded-for (fourni par Vercel), sinon x-real-ip. */
export function clientIp(headers: Headers | null | undefined): string | null {
  if (!headers) return null;
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || null;
  return headers.get("x-real-ip");
}
