// Reads what the agent did out of the chat history: every tool call is a part
// of an assistant message, so the desk panels are just views over `messages`.

import type { UIMessage } from "ai";

import type { FindResult, Hold, TimeOption } from "./studio/calendar";
import { clock, shortDay } from "./studio/time";

export interface ToolPart {
  type: string;
  toolCallId: string;
  state: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> & { ok?: boolean; reason?: string };
  errorText?: string;
}

export const isToolPart = (part: UIMessage["parts"][number]): part is UIMessage["parts"][number] & ToolPart => part.type.startsWith("tool-");

export interface TraceItem {
  id: string;
  tool: string;
  status: "running" | "done" | "refused" | "error";
  input: string;
  result: string;
}

function describeInput(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("  ");
}

function describeResult(tool: string, output: NonNullable<ToolPart["output"]>): string {
  if (output.ok === false) return output.reason ?? "Refused";
  if (tool === "get_services") return `${(output.services as unknown[]).length} treatments, prices from the menu`;
  if (tool === "find_times") {
    const found = output as Extract<FindResult, { ok: true }>;
    return found.options.length ? `${found.options.length} free times, ${shortDay(found.from)} to ${shortDay(found.to)}` : `No free times ${shortDay(found.from)} to ${shortDay(found.to)}`;
  }
  if (tool === "hold_time") {
    const hold = output.hold as Hold;
    return `Held ${hold.service}, ${shortDay(hold.date)} ${clock(hold.start)} with ${hold.stylist}, ${hold.euros} €`;
  }
  if (tool === "release_hold") return `Released ${output.released as string}`;
  if (tool === "hand_off") return `Passed to ${output.to as string}`;
  return "Done";
}

export function traceFrom(messages: UIMessage[]): TraceItem[] {
  const items: TraceItem[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolPart(part)) continue;
      const tool = part.type.slice(5);
      const base = { id: part.toolCallId, tool, input: describeInput(part.input) };
      if (part.state === "output-available" && part.output) {
        items.push({ ...base, status: part.output.ok === false ? "refused" : "done", result: describeResult(tool, part.output) });
      } else if (part.state === "output-error") {
        items.push({ ...base, status: "error", result: part.errorText ?? "The tool failed" });
      } else {
        items.push({ ...base, status: "running", result: "Working…" });
      }
    }
  }
  return items.reverse();
}

/** The times the agent most recently found, so the calendar can show them. */
export function latestOptions(messages: UIMessage[]): { minutes: number; options: TimeOption[] } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i]!.parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j]!;
      if (isToolPart(part) && part.type === "tool-find_times" && part.state === "output-available" && part.output?.ok) {
        const found = part.output as Extract<FindResult, { ok: true }>;
        return { minutes: found.minutes, options: found.options };
      }
    }
  }
  return { minutes: 0, options: [] };
}

export interface Handoff {
  ticket: string;
  topic: string;
  summary: string;
  to: string;
}

export function handoffsFrom(messages: UIMessage[]): Handoff[] {
  return messages
    .flatMap((m) => m.parts)
    .filter((p) => isToolPart(p) && p.type === "tool-hand_off" && p.state === "output-available" && p.output?.ok)
    .map((p) => (p as ToolPart).output as unknown as Handoff)
    .reverse();
}
