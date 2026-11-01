// POST /api/chat: one turn of the receptionist, streamed back to the page.
// Runs as a Vercel Function. The model is reached through Vercel AI Gateway,
// which authenticates with the project's OIDC token, so there is no API key
// anywhere in this code or its settings.

import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";

import { instructionsFor, makeTools, MODEL } from "../server/agent.js";
import { allow, corsFor, friendly, LIMITS, readBody } from "../server/guard.js";
import { holdsFrom } from "../src/studio/calendar.js";

const reply = (status: number, text: string, headers: Record<string, string> = {}) =>
  new Response(text, { status, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });

const holdId = () => `H-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export function OPTIONS(request: Request) {
  const cors = corsFor(request);
  return cors ? new Response(null, { status: 204, headers: cors }) : reply(403, "Not allowed from this site.");
}

export async function POST(request: Request) {
  const cors = corsFor(request);
  if (!cors) return reply(403, "Not allowed from this site.");

  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(ip)) return reply(429, "That's a lot of messages. Take a short break and try again in a few minutes.", cors);

  const raw = await request.text();
  if (raw.length > LIMITS.bodyBytes) return reply(413, "This chat is too long. Start a new one.", cors);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return reply(400, "That wasn't a chat message.", cors);
  }
  const body = readBody(parsed);
  if (typeof body === "string") return reply(400, body, cors);

  const now = new Date();
  const holds = holdsFrom(body.messages, body.decisions, now);
  const confirmed = new Set(Object.keys(body.decisions).filter((id) => body.decisions[id] === "confirmed"));

  const result = streamText({
    model: MODEL,
    instructions: instructionsFor(now, holds, confirmed),
    messages: await convertToModelMessages(body.messages as UIMessage[]),
    tools: makeTools(now, holds, confirmed, holdId),
    stopWhen: isStepCount(6),
    maxOutputTokens: 600,
    providerOptions: { gateway: { tags: ["ai-receptionist"] } },
  });

  return createUIMessageStreamResponse({
    headers: cors,
    stream: toUIMessageStream({ stream: result.stream, onError: friendly }),
  });
}
