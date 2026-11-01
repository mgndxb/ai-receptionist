// The studio calendar and the booking rules. The AI asks; this code decides.
// Everything here is plain TypeScript shared by the server (tools) and the
// page (the calendar you see), so both always agree on what is free.

import {
  BOOKING_WINDOW_DAYS,
  findService,
  HOLD_MINUTES,
  HOURS,
  LEAD_MINUTES,
  MAX_ACTIVE_HOLDS,
  SERVICES,
  SLOT_STEP,
  STYLISTS,
  type Stylist,
} from "./studio.js";
import { addDays, clock, dayName, daysBetween, helsinkiNow, isDate, parseStart, weekday } from "./time.js";

export interface Block {
  id: string;
  date: string;
  start: number;
  end: number;
  stylist: Stylist;
  label: string;
  kind: "booked" | "lunch" | "held" | "yours";
}

export interface Hold {
  id: string;
  serviceId: string;
  service: string;
  date: string;
  start: number;
  end: number;
  stylist: Stylist;
  euros: number;
  customer: string;
  expiresAt: string;
}

export interface TimeOption {
  start: string;
  day: string;
  time: string;
  stylist: Stylist;
}

export type Refusal = { ok: false; reason: string };

/** A DM should offer a few times, not a timetable. */
const MAX_OPTIONS = 3;

// Small seeded PRNG, so every visitor sees the same believable week.
function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LUNCH: Record<Stylist, number> = { Mia: 780, Leah: 810 };

/** The bookings other (made-up) customers already have on a given day. */
export function bookedOn(date: string): Block[] {
  const hours = HOURS[weekday(date)];
  if (!hours) return [];
  const blocks: Block[] = [];
  for (const stylist of STYLISTS) {
    const rand = seeded(`${date}|${stylist}`);
    const menu = SERVICES.filter((s) => s.stylists.includes(stylist) && s.id !== "pmu-consult");
    const lunch = LUNCH[stylist];
    let t = hours.open;
    while (t < hours.close) {
      if (t >= lunch && t < lunch + 30 && hours.close > lunch + 30) {
        blocks.push({ id: `${date}-${stylist}-lunch`, date, start: lunch, end: lunch + 30, stylist, label: "Lunch", kind: "lunch" });
        t = lunch + 30;
        continue;
      }
      if (rand() < 0.5) {
        t += SLOT_STEP * (1 + Math.floor(rand() * 4));
        continue;
      }
      const service = menu[Math.floor(rand() * menu.length)]!;
      const end = t + service.minutes;
      if (end > hours.close) {
        t += SLOT_STEP;
        continue;
      }
      if (t < lunch && end > lunch) {
        t = lunch;
        continue;
      }
      blocks.push({ id: `${date}-${stylist}-${t}`, date, start: t, end, stylist, label: service.short, kind: "booked" });
      t = end;
    }
  }
  return blocks;
}

export function holdBlocks(holds: Hold[], confirmed: Set<string>): Block[] {
  return holds.map((h) => ({
    id: h.id,
    date: h.date,
    start: h.start,
    end: h.end,
    stylist: h.stylist,
    label: findService(h.serviceId)?.short ?? h.service,
    kind: confirmed.has(h.id) ? "yours" : "held",
  }));
}

function isFree(date: string, start: number, end: number, stylist: Stylist, extra: Block[]): boolean {
  return ![...bookedOn(date), ...extra].some((b) => b.date === date && b.stylist === stylist && b.start < end && start < b.end);
}

/** The next `count` days the studio is open, starting from `from`. */
export function openDays(from: string, count: number): string[] {
  const days: string[] = [];
  for (let date = from; days.length < count; date = addDays(date, 1)) if (HOURS[weekday(date)]) days.push(date);
  return days;
}

export interface FindRequest {
  serviceId: string;
  fromDate: string;
  toDate?: string;
  partOfDay?: "morning" | "afternoon" | "any";
  stylist?: Stylist;
}

export type FindResult =
  | { ok: true; service: string; minutes: number; euros: number; from: string; to: string; options: TimeOption[] }
  | Refusal;

export function findTimes(request: FindRequest, now: Date, extra: Block[] = []): FindResult {
  const service = findService(request.serviceId);
  if (!service) return { ok: false, reason: `Unknown service "${request.serviceId}". Use an id from get_services.` };
  if (!service.bookable) {
    return { ok: false, reason: `${service.name} can't be booked here. Mia books it after a free consultation, so offer the consultation (pmu-consult) instead.` };
  }
  if (!isDate(request.fromDate) || (request.toDate && !isDate(request.toDate))) return { ok: false, reason: "Dates must look like 2026-11-07." };

  const today = helsinkiNow(now);
  const last = addDays(today.date, BOOKING_WINDOW_DAYS);
  const from = request.fromDate < today.date ? today.date : request.fromDate;
  let to = request.toDate ?? addDays(from, 6);
  if (daysBetween(from, to) > 13) to = addDays(from, 13);
  if (to > last) to = last;
  if (from > last) return { ok: false, reason: `Bookings open ${BOOKING_WINDOW_DAYS} days ahead. The last bookable day is ${last}.` };
  if (to < from) return { ok: false, reason: "The end date is before the start date." };

  const stylists = request.stylist ? [request.stylist] : service.stylists;
  if (request.stylist && !service.stylists.includes(request.stylist)) {
    return { ok: false, reason: `${request.stylist} doesn't do ${service.name}. It's done by ${service.stylists.join(" and ")}.` };
  }

  const options: TimeOption[] = [];
  for (let date = from; date <= to && options.length < MAX_OPTIONS; date = addDays(date, 1)) {
    const hours = HOURS[weekday(date)];
    if (!hours) continue;
    let perDay = 0;
    let lastPicked = -Infinity;
    for (let start = hours.open; start + service.minutes <= hours.close && perDay < 2 && options.length < MAX_OPTIONS; start += SLOT_STEP) {
      if (date === today.date && start < today.minutes + LEAD_MINUTES) continue;
      if (request.partOfDay === "morning" && start >= 720) continue;
      if (request.partOfDay === "afternoon" && start < 720) continue;
      if (start - lastPicked < 90) continue;
      const stylist = stylists.find((s) => isFree(date, start, start + service.minutes, s, extra));
      if (!stylist) continue;
      options.push({ start: `${date}T${clock(start)}`, day: dayName(date), time: clock(start), stylist });
      lastPicked = start;
      perDay++;
    }
  }
  return { ok: true, service: service.name, minutes: service.minutes, euros: service.euros, from, to, options };
}

export interface HoldRequest {
  serviceId: string;
  start: string;
  stylist: Stylist;
  customerName: string;
}

export type HoldResult = { ok: true; hold: Hold } | Refusal;

export function placeHold(request: HoldRequest, now: Date, active: Hold[], confirmed: Set<string>, makeId: () => string): HoldResult {
  const service = findService(request.serviceId);
  if (!service) return { ok: false, reason: `Unknown service "${request.serviceId}".` };
  if (!service.bookable) {
    return { ok: false, reason: `${service.name} needs a free consultation with Mia first. Offer to hold a consultation (pmu-consult) instead.` };
  }
  if (!service.stylists.includes(request.stylist)) {
    return { ok: false, reason: `${request.stylist} doesn't do ${service.name}. It's done by ${service.stylists.join(" and ")}.` };
  }
  const start = parseStart(request.start);
  if (!start) return { ok: false, reason: `"${request.start}" isn't a valid time. Use 2026-11-07T10:15.` };

  const hours = HOURS[weekday(start.date)];
  if (!hours) return { ok: false, reason: `The studio is closed on ${dayName(start.date)}s. Open Tuesday to Saturday.` };
  const end = start.minutes + service.minutes;
  if (start.minutes < hours.open || end > hours.close) {
    return {
      ok: false,
      reason: `${dayName(start.date)} hours are ${clock(hours.open)}–${clock(hours.close)}, and ${service.name} takes ${service.minutes} min, so it must start between ${clock(hours.open)} and ${clock(hours.close - service.minutes)}.`,
    };
  }
  if (start.minutes % SLOT_STEP !== 0) return { ok: false, reason: "Times start on the quarter hour (10:00, 10:15, 10:30…)." };

  const today = helsinkiNow(now);
  if (start.date < today.date || (start.date === today.date && start.minutes < today.minutes + LEAD_MINUTES)) {
    return { ok: false, reason: `That time has passed or is less than ${LEAD_MINUTES / 60} hours away.` };
  }
  if (start.date > addDays(today.date, BOOKING_WINDOW_DAYS)) return { ok: false, reason: `Bookings open ${BOOKING_WINDOW_DAYS} days ahead.` };

  const pending = active.filter((h) => !confirmed.has(h.id));
  if (pending.length >= MAX_ACTIVE_HOLDS) return { ok: false, reason: `This chat already holds ${MAX_ACTIVE_HOLDS} times. Release one first.` };
  if (!isFree(start.date, start.minutes, end, request.stylist, holdBlocks(active, confirmed))) {
    return { ok: false, reason: `${request.stylist} is already booked at ${clock(start.minutes)} on ${dayName(start.date)}. Call find_times for free times.` };
  }

  const name = request.customerName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return { ok: false, reason: "Ask for the customer's first name before holding a time." };

  return {
    ok: true,
    hold: {
      id: makeId(),
      serviceId: service.id,
      service: service.name,
      date: start.date,
      start: start.minutes,
      end,
      stylist: request.stylist,
      euros: service.euros,
      customer: name,
      expiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000).toISOString(),
    },
  };
}

// The holds live in the conversation itself: every successful hold_time and
// release_hold result is a tool part in the chat history. Both the server and
// the page read them back the same way, so there's no database to keep in sync.

interface PartLike {
  type: string;
  state?: string;
  output?: unknown;
}

interface MessageLike {
  role: string;
  parts: PartLike[];
}

function isHold(value: unknown): value is Hold {
  const h = value as Hold;
  return !!h && typeof h.id === "string" && typeof h.date === "string" && typeof h.start === "number" && typeof h.end === "number" && STYLISTS.includes(h.stylist);
}

export type Decisions = Record<string, "confirmed" | "released">;

export function holdsFrom(messages: MessageLike[], decisions: Decisions, now: Date): Hold[] {
  const holds = new Map<string, Hold>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.state !== "output-available") continue;
      const output = part.output as { ok?: boolean; hold?: unknown; released?: string } | undefined;
      if (part.type === "tool-hold_time" && output?.ok && isHold(output.hold)) holds.set(output.hold.id, output.hold);
      if (part.type === "tool-release_hold" && output?.ok && output.released) holds.delete(output.released);
    }
  }
  return [...holds.values()].filter((h) => {
    const decision = decisions[h.id];
    if (decision === "released") return false;
    return decision === "confirmed" || new Date(h.expiresAt).getTime() > now.getTime();
  });
}
