// Studio Usva: a made-up brow and lash studio in Kallio, Helsinki.
// This file is the single source of truth for what it sells and when it is open.
// The AI never sees a price or an opening hour that doesn't come from here.

export type Stylist = "Iida" | "Veera";

export interface Service {
  id: string;
  name: string;
  nameFi: string;
  /** Fits inside a calendar block. */
  short: string;
  minutes: number;
  euros: number;
  stylists: Stylist[];
  /** False when a person has to decide first (powder brows need a consultation). */
  bookable: boolean;
  note?: string;
}

export const STYLISTS: Stylist[] = ["Iida", "Veera"];

export const SERVICES: Service[] = [
  { id: "brow-lamination", short: "Lamination", name: "Brow lamination", nameFi: "Kulmien laminointi", minutes: 45, euros: 59, stylists: ["Iida", "Veera"], bookable: true },
  { id: "brow-shape-tint", short: "Shape & tint", name: "Brow shape & tint", nameFi: "Kulmien muotoilu ja värjäys", minutes: 30, euros: 35, stylists: ["Iida", "Veera"], bookable: true },
  { id: "lash-lift", short: "Lash lift", name: "Lash lift & tint", nameFi: "Ripsien kestotaivutus ja värjäys", minutes: 60, euros: 65, stylists: ["Veera"], bookable: true },
  { id: "lash-classic", short: "Extensions", name: "Classic lash extensions", nameFi: "Klassiset ripsienpidennykset", minutes: 120, euros: 95, stylists: ["Veera"], bookable: true },
  { id: "lash-refill", short: "Refill", name: "Lash refill (within 3 weeks)", nameFi: "Ripsienpidennysten huolto (3 vk sisällä)", minutes: 75, euros: 55, stylists: ["Veera"], bookable: true },
  { id: "pmu-consult", short: "Consult", name: "Powder brows consultation", nameFi: "Puuterikulmien konsultaatio", minutes: 20, euros: 0, stylists: ["Iida"], bookable: true, note: "Free. Needed before powder brows." },
  {
    id: "pmu-powder",
    short: "Powder brows",
    name: "Powder brows (permanent makeup)",
    nameFi: "Puuterikulmat (pysyvä meikki)",
    minutes: 150,
    euros: 320,
    stylists: ["Iida"],
    bookable: false,
    note: "Booked by Iida after a free consultation. Includes one touch-up within 8 weeks.",
  },
];

/** Opening hours in minutes after midnight, Helsinki time, by weekday (0 = Sunday). */
export const HOURS: Record<number, { open: number; close: number } | null> = {
  0: null,
  1: null,
  2: { open: 600, close: 1080 },
  3: { open: 600, close: 1080 },
  4: { open: 600, close: 1080 },
  5: { open: 600, close: 1080 },
  6: { open: 600, close: 960 },
};

export const FACTS = [
  "Studio Usva is a brow and lash studio in Kallio, Helsinki. It is made up for this demo.",
  "Opening hours: Tuesday to Friday 10:00–18:00, Saturday 10:00–16:00, closed Sunday and Monday.",
  "Stylists: Iida does brows and powder brows. Veera does lashes and brows.",
  "Payment at the studio by card or MobilePay.",
  "Cancellation is free up to 24 hours before. Later cancellations cost 50% of the price.",
  "Bookings open four weeks ahead.",
];

export const HOLD_MINUTES = 15;
export const LEAD_MINUTES = 120;
export const BOOKING_WINDOW_DAYS = 28;
export const MAX_ACTIVE_HOLDS = 2;
export const SLOT_STEP = 15;

export function findService(id: string): Service | undefined {
  return SERVICES.find((s) => s.id === id);
}
