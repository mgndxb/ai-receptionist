import { describe, expect, it } from "vitest";

import { bookedOn, findTimes, holdsFrom, openDays, placeHold, type Hold } from "./calendar";
import { addDays, helsinkiNow, parseStart, weekday } from "./time";

// Friday 6 November 2026, 09:00 in Helsinki (07:00 UTC).
const NOW = new Date("2026-11-06T07:00:00Z");
const ids = () => {
  let n = 0;
  return () => `H-${String(++n).padStart(4, "0")}`;
};

function freeStart(serviceId = "lash-lift", from = "2026-11-07") {
  const found = findTimes({ serviceId, fromDate: from }, NOW);
  if (!found.ok) throw new Error(found.reason);
  return found.options[0]!;
}

describe("time", () => {
  it("reads Helsinki time, not the machine's", () => {
    expect(helsinkiNow(NOW)).toEqual({ date: "2026-11-06", minutes: 9 * 60 });
    // Just after midnight in Helsinki is still the previous day in UTC.
    expect(helsinkiNow(new Date("2026-11-06T22:30:00Z")).date).toBe("2026-11-07");
  });

  it("handles month ends and rejects nonsense", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(weekday("2026-11-07")).toBe(6);
    expect(parseStart("2026-02-30T10:00")).toBeNull();
    expect(parseStart("2026-11-07T25:00")).toBeNull();
    expect(parseStart("2026-11-07T10:15")).toEqual({ date: "2026-11-07", minutes: 615 });
  });
});

describe("calendar", () => {
  it("is the same for every visitor and never overlaps", () => {
    expect(bookedOn("2026-11-07")).toEqual(bookedOn("2026-11-07"));
    for (const date of openDays("2026-11-03", 12)) {
      const blocks = bookedOn(date);
      for (const a of blocks) for (const b of blocks) if (a !== b && a.stylist === b.stylist) expect(a.start < b.end && b.start < a.end).toBe(false);
    }
  });

  it("is closed on Sundays and Mondays", () => {
    expect(bookedOn("2026-11-08")).toEqual([]);
    expect(openDays("2026-11-07", 3)).toEqual(["2026-11-07", "2026-11-10", "2026-11-11"]);
  });

  it("only offers times that are free, open and far enough ahead", () => {
    const found = findTimes({ serviceId: "lash-lift", fromDate: "2026-11-06", toDate: "2026-11-11" }, NOW);
    if (!found.ok) throw new Error(found.reason);
    expect(found.options.length).toBeGreaterThan(0);
    for (const option of found.options) {
      const start = parseStart(option.start)!;
      expect(weekday(start.date)).not.toBe(0);
      expect(weekday(start.date)).not.toBe(1);
      expect(option.stylist).toBe("Veera");
      if (start.date === "2026-11-06") expect(start.minutes).toBeGreaterThanOrEqual(11 * 60);
      const clash = bookedOn(start.date).some((b) => b.stylist === option.stylist && b.start < start.minutes + 60 && start.minutes < b.end);
      expect(clash).toBe(false);
    }
  });

  it("won't search for powder brows, which need a consultation", () => {
    const found = findTimes({ serviceId: "pmu-powder", fromDate: "2026-11-07" }, NOW);
    expect(found.ok).toBe(false);
  });
});

describe("holds", () => {
  it("holds a free time and prices it from the menu", () => {
    const option = freeStart();
    const result = placeHold({ serviceId: "lash-lift", start: option.start, stylist: option.stylist, customerName: " Anna " }, NOW, [], new Set(), ids());
    expect(result).toMatchObject({ ok: true, hold: { id: "H-0001", euros: 65, customer: "Anna", stylist: "Veera" } });
  });

  it("refuses closed days, closed hours, the past and the wrong stylist", () => {
    const make = ids();
    const attempt = (start: string, stylist: "Iida" | "Veera" = "Veera", serviceId = "lash-lift") =>
      placeHold({ serviceId, start, stylist, customerName: "Anna" }, NOW, [], new Set(), make);
    expect(attempt("2026-11-08T12:00")).toMatchObject({ ok: false, reason: expect.stringContaining("closed on Sundays") });
    expect(attempt("2026-11-07T09:00")).toMatchObject({ ok: false, reason: expect.stringContaining("10:00–16:00") });
    expect(attempt("2026-11-07T15:30")).toMatchObject({ ok: false, reason: expect.stringContaining("between 10:00 and 15:00") });
    expect(attempt("2026-11-06T10:00")).toMatchObject({ ok: false, reason: expect.stringContaining("passed") });
    expect(attempt("2026-11-07T12:00", "Iida")).toMatchObject({ ok: false, reason: expect.stringContaining("doesn't do") });
    expect(attempt("2026-11-07T12:00", "Iida", "pmu-powder")).toMatchObject({ ok: false, reason: expect.stringContaining("consultation") });
    expect(attempt("2026-11-07T12:10")).toMatchObject({ ok: false, reason: expect.stringContaining("quarter hour") });
  });

  it("never double-books, not even against its own holds", () => {
    const make = ids();
    const option = freeStart();
    const first = placeHold({ serviceId: "lash-lift", start: option.start, stylist: option.stylist, customerName: "Anna" }, NOW, [], new Set(), make);
    if (!first.ok) throw new Error(first.reason);
    const again = placeHold({ serviceId: "lash-lift", start: option.start, stylist: option.stylist, customerName: "Ben" }, NOW, [first.hold], new Set(), make);
    expect(again).toMatchObject({ ok: false, reason: expect.stringContaining("already booked") });

    const taken = bookedOn("2026-11-07").find((b) => b.stylist === "Veera" && b.kind === "booked")!;
    const clash = placeHold({ serviceId: "brow-shape-tint", start: `2026-11-07T${String(taken.start / 60 | 0).padStart(2, "0")}:${String(taken.start % 60).padStart(2, "0")}`, stylist: "Veera", customerName: "Ben" }, NOW, [], new Set(), make);
    expect(clash.ok).toBe(false);
  });

  it("caps open holds per chat", () => {
    const fake = (id: string): Hold => ({ id, serviceId: "lash-lift", service: "Lash lift", date: "2026-11-20", start: 600, end: 660, stylist: "Veera", euros: 65, customer: "A", expiresAt: "2099-01-01T00:00:00Z" });
    const option = freeStart("brow-shape-tint");
    const result = placeHold({ serviceId: "brow-shape-tint", start: option.start, stylist: option.stylist, customerName: "Anna" }, NOW, [fake("H-A"), fake("H-B")], new Set(), ids());
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("Release one") });
  });

  it("reads holds back from the chat, minus released and expired ones", () => {
    const hold = (id: string, expiresAt: string): Hold => ({ id, serviceId: "lash-lift", service: "Lash lift", date: "2026-11-20", start: 600, end: 660, stylist: "Veera", euros: 65, customer: "A", expiresAt });
    const messages = [
      { role: "user", parts: [{ type: "text" }] },
      {
        role: "assistant",
        parts: [
          { type: "tool-hold_time", state: "output-available", output: { ok: true, hold: hold("H-KEEP", "2026-11-06T07:10:00Z") } },
          { type: "tool-hold_time", state: "output-available", output: { ok: true, hold: hold("H-GONE", "2026-11-06T07:10:00Z") } },
          { type: "tool-hold_time", state: "output-available", output: { ok: true, hold: hold("H-OLD", "2026-11-06T06:59:00Z") } },
          { type: "tool-hold_time", state: "output-available", output: { ok: true, hold: hold("H-MINE", "2026-11-06T06:00:00Z") } },
          { type: "tool-hold_time", state: "output-available", output: { ok: false, reason: "nope" } },
          { type: "tool-release_hold", state: "output-available", output: { ok: true, released: "H-GONE" } },
        ],
      },
    ];
    const ids = holdsFrom(messages, { "H-MINE": "confirmed" }, NOW).map((h) => h.id);
    expect(ids).toEqual(["H-KEEP", "H-MINE"]);
  });
});
