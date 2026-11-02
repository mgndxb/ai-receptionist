import { describe, expect, it } from "vitest";

import { allowPing, deviceFrom, isBot, notificationFor, placeFrom, readPing } from "./visit";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

describe("visit pings", () => {
  it("reads a ping and cleans what it can't trust", () => {
    expect(readPing('{"kind":"visit","path":"/","ref":"www.LinkedIn.com"}')).toEqual({ kind: "visit", path: "/", ref: "www.linkedin.com" });
    expect(readPing('{"kind":"cv","path":"/magnus-kaur-cv.pdf","ref":""}')).toEqual({ kind: "cv", path: "/magnus-kaur-cv.pdf", ref: "" });
    expect(readPing('{"kind":"visit","path":"javascript:alert(1)","ref":"<b>x</b>"}')).toEqual({ kind: "visit", path: "/", ref: "" });
  });

  it("ignores anything that isn't a ping", () => {
    expect(readPing("not json")).toBeNull();
    expect(readPing('{"kind":"delete"}')).toBeNull();
    expect(readPing("null")).toBeNull();
    expect(readPing(`{"kind":"visit","path":"/${"a".repeat(2_000)}"}`)).toBeNull();
  });

  it("skips bots and tells phones from computers", () => {
    expect(isBot("")).toBe(true);
    expect(isBot("LinkedInBot/1.0 (compatible; Mozilla/5.0)")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/140.0")).toBe(true);
    expect(isBot(IPHONE)).toBe(false);
    expect(deviceFrom(IPHONE)).toBe("phone");
    expect(deviceFrom(MAC)).toBe("computer");
  });

  it("names the place from Vercel's geo headers", () => {
    expect(placeFrom(new Headers({ "x-vercel-ip-city": "Espoo", "x-vercel-ip-country": "FI" }))).toBe("Espoo, Finland");
    expect(placeFrom(new Headers({ "x-vercel-ip-city": "Jyv%C3%A4skyl%C3%A4", "x-vercel-ip-country": "FI" }))).toBe("Jyväskylä, Finland");
    expect(placeFrom(new Headers({ "x-vercel-ip-country": "DE" }))).toBe("Germany");
    expect(placeFrom(new Headers())).toBe("an unknown place");
  });

  it("writes a CV download louder than a visit", () => {
    const visit = notificationFor({ kind: "visit", path: "/", ref: "linkedin.com" }, "Espoo, Finland", "phone");
    const cv = notificationFor({ kind: "cv", path: "/magnus-kaur-cv.pdf", ref: "" }, "Espoo, Finland", "computer");
    expect(visit.title).toBe("Portfolio visit from Espoo, Finland");
    expect(visit.message).toContain("Came from: linkedin.com");
    expect(cv.title).toBe("CV downloaded from Espoo, Finland");
    expect(cv.priority).toBeGreaterThan(visit.priority);
  });

  it("lets one browser ping at most six times an hour", () => {
    const now = Date.now();
    const results = Array.from({ length: 8 }, (_, i) => allowPing("203.0.113.9", now + i));
    expect(results.filter(Boolean)).toHaveLength(6);
    expect(allowPing("203.0.113.9", now + 3_600_001)).toBe(true);
  });
});
