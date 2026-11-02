// Turns a portfolio visit into a short notification on Magnus's phone.
// Nothing is stored: the notification is the only record.

export interface Ping {
  kind: "visit" | "cv";
  /** The page that was opened, or the CV file that was downloaded. */
  path: string;
  /** The site that linked here, as a bare host, or "" for a direct visit. */
  ref: string;
}

/** Checks what the page sent. Returns null for anything that isn't a ping. */
export function readPing(raw: string): Ping | null {
  if (raw.length > 1_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const body = parsed as Partial<Record<keyof Ping, unknown>> | null;
  if (!body || (body.kind !== "visit" && body.kind !== "cv")) return null;
  const path = typeof body.path === "string" && /^\/[\w./-]{0,120}$/.test(body.path) ? body.path : "/";
  const ref = typeof body.ref === "string" && /^[a-z0-9.-]{1,100}$/i.test(body.ref) ? body.ref.toLowerCase() : "";
  return { kind: body.kind, path, ref };
}

const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|curl|wget|python|go-http/i;

export const isBot = (userAgent: string) => !userAgent || BOTS.test(userAgent);

export const deviceFrom = (userAgent: string) =>
  /iPad|Tablet/i.test(userAgent) ? "tablet" : /Mobi|Android|iPhone/i.test(userAgent) ? "phone" : "computer";

const regions = new Intl.DisplayNames(["en"], { type: "region" });

/** "Espoo, Finland" from Vercel's geo headers. The city comes URL-encoded. */
export function placeFrom(headers: Headers): string {
  let city = headers.get("x-vercel-ip-city") ?? "";
  try {
    city = decodeURIComponent(city);
  } catch {
    // Keep it as it came.
  }
  const code = (headers.get("x-vercel-ip-country") ?? "").toUpperCase();
  let country = code;
  try {
    if (code) country = regions.of(code) ?? code;
  } catch {
    // Not a region code; keep it as it came.
  }
  return [city, country].filter(Boolean).join(", ") || "an unknown place";
}

/** The ntfy message. The title is what shows on the lock screen. */
export function notificationFor(ping: Ping, place: string, device: string) {
  const cv = ping.kind === "cv";
  return {
    title: cv ? `CV downloaded from ${place}` : `Portfolio visit from ${place}`,
    message: [
      `Came from: ${ping.ref || "a direct link, an email or an app"}`,
      `Device: ${device}`,
      `${cv ? "File" : "Page"}: ${ping.path}`,
    ].join("\n"),
    tags: [cv ? "page_facing_up" : "eyes"],
    priority: cv ? 4 : 3,
    click: `https://magnus.is-a.dev${cv ? "/" : ping.path}`,
  };
}

// In memory, per function instance, like the chat's limiter: enough to stop
// one browser from flooding the phone.
const sent = new Map<string, number[]>();

export function allowPing(ip: string, now = Date.now()): boolean {
  const hour = 3_600_000;
  const recent = (sent.get(ip) ?? []).filter((t) => now - t < hour);
  if (recent.length >= 6) {
    sent.set(ip, recent);
    return false;
  }
  recent.push(now);
  sent.set(ip, recent);
  if (sent.size > 1_000) sent.delete(sent.keys().next().value!);
  return true;
}
