// Everything that stands between the internet and the AI bill.

export const LIMITS = {
  messageChars: 600,
  userMessages: 16,
  totalMessages: 60,
  bodyBytes: 200_000,
  perIpWindow: { requests: 24, minutes: 10 },
  perIpDay: 120,
};

const ALLOWED = ["https://magnus.is-a.dev", "http://localhost:5182", "http://127.0.0.1:5182", "http://localhost:4182"];

/** CORS headers for an allowed origin, or null. The page's own host is always allowed. */
export function corsFor(request: Request): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const self = request.headers.get("host");
  if (!ALLOWED.includes(origin) && !(self && origin === `https://${self}`)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

// In memory, per function instance. Not a hard wall (instances come and go),
// but it stops one browser tab from hammering the model. The hard wall is the
// AI Gateway budget on the Vercel project.
const hits = new Map<string, number[]>();

export function allow(ip: string, now = Date.now()): boolean {
  const day = 86_400_000;
  const window = LIMITS.perIpWindow.minutes * 60_000;
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < day);
  const inWindow = recent.filter((t) => now - t < window).length;
  if (inWindow >= LIMITS.perIpWindow.requests || recent.length >= LIMITS.perIpDay) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.delete(hits.keys().next().value!);
  return true;
}

interface IncomingMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: { type: string; text?: string; state?: string; output?: unknown }[];
}

export interface ChatBody {
  messages: IncomingMessage[];
  decisions: Record<string, "confirmed" | "released">;
}

/** Checks the shape and size of what the page sent. Returns the body or a reason. */
export function readBody(raw: unknown): ChatBody | string {
  const body = raw as Partial<ChatBody> | null;
  if (!body || !Array.isArray(body.messages)) return "Expected a list of messages.";
  if (body.messages.length > LIMITS.totalMessages) return "This chat is full. Start a new one.";
  const messages = body.messages.filter((m): m is IncomingMessage => !!m && Array.isArray(m.parts) && (m.role === "user" || m.role === "assistant"));
  const users = messages.filter((m) => m.role === "user");
  if (!users.length) return "Say something first.";
  if (users.length > LIMITS.userMessages) return "This demo chat is full. Start a new chat to keep going.";
  for (const m of users) {
    if (!m.parts.every((p) => p.type === "text" && typeof p.text === "string")) return "Only text messages, please.";
    if (m.parts.reduce((n, p) => n + (p.text?.length ?? 0), 0) > LIMITS.messageChars) return `Keep messages under ${LIMITS.messageChars} characters.`;
  }
  const decisions: ChatBody["decisions"] = {};
  for (const [id, value] of Object.entries(body.decisions ?? {})) {
    if (typeof id === "string" && id.length < 20 && (value === "confirmed" || value === "released")) decisions[id] = value;
  }
  // The greeting is written by the page, not the model; the conversation starts at the first customer message.
  const first = messages.findIndex((m) => m.role === "user");
  return { messages: messages.slice(first), decisions };
}

/** Turns gateway and model errors into something a visitor can act on. */
export function friendly(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const status = (error as { statusCode?: number })?.statusCode;
  if (status === 402 || /insufficient|quota|budget/i.test(text)) return "The receptionist has used up this month's AI budget. Try again next month, or read the code on GitHub.";
  if (status === 429 || /rate limit/i.test(text)) return "Lots of people are chatting right now. Wait a minute and try again.";
  if (/credit card/i.test(text)) return "The AI isn't switched on yet. Magnus is on it.";
  return "The receptionist couldn't answer just now. Try sending that again.";
}
