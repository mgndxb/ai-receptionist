// POST /api/visit: the portfolio at magnus.is-a.dev tells Magnus's phone that
// someone opened it or downloaded the CV. One push through ntfy.sh to a
// private topic (NTFY_TOPIC), with the rough place from Vercel's geo headers.
// Nothing is stored, and the page never waits for this: it always gets a 204.

import { corsFor } from "../server/guard.js";
import { allowPing, deviceFrom, isBot, notificationFor, placeFrom, readPing } from "../server/visit.js";

export function OPTIONS(request: Request) {
  const cors = corsFor(request);
  return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} });
}

export async function POST(request: Request) {
  const cors = corsFor(request);
  if (!cors) return new Response(null, { status: 403 });

  const topic = process.env.NTFY_TOPIC;
  const userAgent = request.headers.get("user-agent") ?? "";
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const ping = readPing(await request.text());

  if (topic && ping && !isBot(userAgent) && allowPing(ip)) {
    const note = notificationFor(ping, placeFrom(request.headers), deviceFrom(userAgent));
    await fetch("https://ntfy.sh/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, ...note }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {});
  }
  return new Response(null, { status: 204, headers: cors });
}
