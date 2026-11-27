import { TZDate } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export const APP_TZ = "Africa/Kinshasa";

/** Date calendaire du jour (YYYY-MM-DD) dans le fuseau de l'application. */
export function todayIso(now: Date = new Date()): string {
  return format(new TZDate(now, APP_TZ), "yyyy-MM-dd");
}

/** Une échéance (type date) est manipulée comme une chaîne YYYY-MM-DD, sans fuseau. */
function calendar(d: string): Date {
  return parseISO(d); // minuit local, utilisé seulement pour des écarts en jours
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";
export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: "En retard",
  today: "Aujourd'hui",
  week: "Cette semaine",
  later: "Plus tard",
  none: "Sans date",
};
export const DUE_BUCKET_ORDER: DueBucket[] = ["overdue", "today", "week", "later", "none"];

/** Regroupement de « Mes tâches ». La semaine va du lundi au dimanche. */
export function dueBucket(due: string | null, today: string = todayIso()): DueBucket {
  if (!due) return "none";
  const diff = differenceInCalendarDays(calendar(due), calendar(today));
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  const dow = calendar(today).getDay(); // 0 = dimanche
  const daysToSunday = dow === 0 ? 0 : 7 - dow;
  return diff <= daysToSunday ? "week" : "later";
}

/** « 27 nov. », « hier », « demain »… pour une échéance. */
export function formatDue(due: string, today: string = todayIso()): string {
  const diff = differenceInCalendarDays(calendar(due), calendar(today));
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  const d = calendar(due);
  const sameYear = d.getFullYear() === calendar(today).getFullYear();
  return format(d, sameYear ? "d MMM" : "d MMM yyyy", { locale: fr });
}

export function formatDateLong(due: string): string {
  return format(calendar(due), "EEEE d MMMM yyyy", { locale: fr });
}

/** Instant (UTC) affiché dans le fuseau de l'application. */
export function formatInstant(iso: string | Date, pattern = "d MMM yyyy 'à' HH:mm"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return format(new TZDate(d, APP_TZ), pattern, { locale: fr });
}

export function formatRelative(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Date.now() - d.getTime() < 60_000) return "à l'instant";
  return "il y a " + formatDistanceToNowStrict(d, { locale: fr });
}

export function addDaysIso(day: string, n: number): string {
  return format(addDays(calendar(day), n), "yyyy-MM-dd");
}
