// Dates are plain "YYYY-MM-DD" strings and times are minutes after midnight,
// both in Helsinki time. The server runs in UTC, so nothing here trusts the
// machine's own time zone.

const TZ = "Europe/Helsinki";

export interface LocalNow {
  date: string;
  minutes: number;
}

export function helsinkiNow(now = new Date()): LocalNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function toUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function addDays(date: string, days: number): string {
  const next = toUtc(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return toUtc(date).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && toUtc(value).toISOString().slice(0, 10) === value;

export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "2026-11-07T10:15" → { date, minutes }, or null if it isn't a real local time. */
export function parseStart(value: string): LocalNow | null {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})$/.exec(value.trim());
  if (!match || !isDate(match[1]!)) return null;
  const hours = Number(match[2]);
  const mins = Number(match[3]);
  if (hours > 23 || mins > 59) return null;
  return { date: match[1]!, minutes: hours * 60 + mins };
}

const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FI_DAYS = ["sunnuntai", "maanantai", "tiistai", "keskiviikko", "torstai", "perjantai", "lauantai"];

export function dayName(date: string, lang: "en" | "fi" = "en"): string {
  return (lang === "fi" ? FI_DAYS : EN_DAYS)[weekday(date)]!;
}

/** "Sat 7.11." in the UI, like Finnish calendars write it. */
export function shortDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${EN_DAYS[weekday(date)]!.slice(0, 3)} ${d}.${m}.`;
}
