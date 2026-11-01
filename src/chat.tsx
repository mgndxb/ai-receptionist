import type { ChatStatus, UIMessage } from "ai";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { isToolPart } from "./derive";
import type { Decisions, Hold } from "./studio/calendar";
import { clock, shortDay } from "./studio/time";

export const GREETING: UIMessage = {
  id: "greeting",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "Hi! I'm the AI receptionist at Arc Brow & Lash. I can tell you about our treatments, find a free time and hold it for you. Write in any language you like.",
    },
  ],
};

const STARTERS = ["Lash lift this Saturday?", "How much is brow lamination?", "¿Tenéis hueco para cejas mañana?"];

const ACTIVITY: Record<string, string> = {
  get_services: "Checked the menu",
  find_times: "Looked at the calendar",
  release_hold: "Released a time",
  hand_off: "Passed to the stylists",
};

function Bubble({ from, children }: { from: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={`enter flex ${from === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-[20px] px-4 py-2.5 text-[15px] leading-[1.45] whitespace-pre-wrap ${
          from === "user" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-line bg-paper"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Activity({ label, refused }: { label: string; refused?: boolean }) {
  return (
    <p className={`enter flex items-center gap-1.5 pl-1 text-[12px] ${refused ? "text-refuse" : "text-ash"}`}>
      <span className={`size-1.5 rounded-full ${refused ? "bg-refuse" : "bg-faint"}`} aria-hidden />
      {label}
    </p>
  );
}

function BookingCard({ hold, decision, now, onDecide }: { hold: Hold; decision?: "confirmed" | "released"; now: number; onDecide: (id: string, d: "confirmed" | "released") => void }) {
  const left = Math.max(0, new Date(hold.expiresAt).getTime() - now);
  const expired = !decision && left === 0;
  const state = decision ?? (expired ? "expired" : "held");
  const mm = Math.floor(left / 60_000);
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");

  return (
    <div className={`enter mr-2 overflow-hidden rounded-[20px] border bg-paper sm:mr-8 ${state === "held" ? "border-cherry/50" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div>
          <p className="font-display text-[17px] leading-tight font-semibold tracking-[-0.01em]">{hold.service}</p>
          <p className="mt-1 text-[13.5px] text-ash">
            {shortDay(hold.date)} at {clock(hold.start)}–{clock(hold.end)} with {hold.stylist}
          </p>
        </div>
        <p className="font-display text-[19px] font-semibold tabular-nums">{hold.euros === 0 ? "Free" : `${hold.euros} €`}</p>
      </div>
      <div className="mt-3 border-t border-line px-4 py-3">
        {state === "held" && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onDecide(hold.id, "confirmed")} className="press h-9 flex-1 rounded-full bg-cherry px-3 text-[14px] font-medium whitespace-nowrap text-white hover:bg-cherry/90">
              Confirm booking
            </button>
            <button type="button" onClick={() => onDecide(hold.id, "released")} className="press h-9 rounded-full border border-line px-3 text-[14px] text-ash hover:border-ink/30 hover:text-ink">
              Release
            </button>
            <span className="w-10 text-right font-mono text-[12px] text-cherry tabular-nums" aria-label="Time left on the hold">
              {mm}:{ss}
            </span>
          </div>
        )}
        {state === "confirmed" && (
          <p className="text-[13.5px] text-sage">
            <strong className="font-semibold">Booked for {hold.customer}.</strong> A real studio would text you a confirmation now. This demo sends nothing.
          </p>
        )}
        {state === "released" && <p className="text-[13.5px] text-ash">Released. The time is free again.</p>}
        {state === "expired" && <p className="text-[13.5px] text-ash">The 15-minute hold ran out, so the time went back on the calendar.</p>}
      </div>
    </div>
  );
}

function AssistantMessage({ message, decisions, now, onDecide }: { message: UIMessage; decisions: Decisions; now: number; onDecide: (id: string, d: "confirmed" | "released") => void }) {
  return (
    <>
      {message.parts.map((part, i) => {
        const key = `${message.id}-${i}`;
        if (part.type === "text") return part.text.trim() ? <Bubble key={key} from="assistant">{part.text.trim()}</Bubble> : null;
        if (!isToolPart(part)) return null;
        const tool = part.type.slice(5);
        if (part.state !== "output-available" || !part.output) return null;
        if (tool === "hold_time") {
          if (part.output.ok) {
            const hold = part.output.hold as Hold;
            return <BookingCard key={key} hold={hold} decision={decisions[hold.id]} now={now} onDecide={onDecide} />;
          }
          return <Activity key={key} label="The calendar said no" refused />;
        }
        return <Activity key={key} label={part.output.ok === false ? `${ACTIVITY[tool] ?? tool}, refused` : (ACTIVITY[tool] ?? tool)} refused={part.output.ok === false} />;
      })}
    </>
  );
}

function Typing() {
  return (
    <div className="flex justify-start" aria-label="The receptionist is typing">
      <div className="flex gap-1 rounded-[20px] rounded-bl-md border border-line bg-paper px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="dot size-1.5 rounded-full bg-ash" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({
  messages,
  status,
  error,
  decisions,
  now,
  onSend,
  onDecide,
  onRetry,
  onReset,
}: {
  messages: UIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  decisions: Decisions;
  now: number;
  onSend: (text: string) => void;
  onDecide: (id: string, d: "confirmed" | "released") => void;
  onRetry: () => void;
  onReset: () => void;
}) {
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const last = messages.at(-1);
  const waiting = busy && (last?.role === "user" || !last?.parts.some((p) => p.type === "text" && p.text.trim()));
  const length = JSON.stringify(last?.parts ?? []).length;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, length, waiting, error]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    onSend(text);
    setInput("");
  };

  return (
    <section className="panel flex h-[min(720px,82dvh)] flex-col overflow-hidden" aria-label="Chat with the studio">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="grid size-10 place-items-center rounded-full bg-ink font-display text-[14px] font-bold tracking-[-0.03em] text-white" aria-hidden>
          <span>
            arc<span className="text-cherry">.</span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-tight font-semibold">Arc Brow &amp; Lash</p>
          <p className="text-[12.5px] text-ash">AI receptionist, answers in seconds</p>
        </div>
        <button type="button" onClick={onReset} disabled={busy || messages.length < 2} className="press rounded-full border border-line px-3 py-1.5 text-[12.5px] text-ash hover:text-ink disabled:opacity-40">
          New chat
        </button>
      </header>

      <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-4" aria-live="polite">
        {messages.map((message) =>
          message.role === "user" ? (
            <Bubble key={message.id} from="user">
              {message.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
            </Bubble>
          ) : (
            <AssistantMessage key={message.id} message={message} decisions={decisions} now={now} onDecide={onDecide} />
          ),
        )}
        {waiting && <Typing />}
        {error && (
          <div className="enter rounded-2xl border border-refuse/25 bg-refuse-wash px-4 py-3 text-[13.5px] text-refuse">
            <p>{error.message.length < 200 ? error.message : "Something went wrong."}</p>
            <button type="button" onClick={onRetry} className="press mt-2 font-medium underline underline-offset-4">
              Try again
            </button>
          </div>
        )}
      </div>

      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 px-3.5 pb-3">
          {STARTERS.map((text) => (
            <button key={text} type="button" onClick={() => onSend(text)} className="press rounded-full border border-line bg-mist/60 px-3.5 py-1.5 text-[13.5px] hover:border-ink/25">
              {text}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-3">
        <label htmlFor="message" className="sr-only">
          Message
        </label>
        <input
          id="message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={600}
          autoComplete="off"
          placeholder="Message Arc Brow & Lash…"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-mist/50 px-4 text-[15px] outline-none placeholder:text-faint focus:border-ink/30 focus:bg-paper"
        />
        <button type="submit" disabled={busy || !input.trim()} className="press grid size-11 place-items-center rounded-full bg-ink text-white disabled:opacity-30" aria-label="Send">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
      <p className="px-4 pb-3 text-[11.5px] text-faint">Demo with a made-up studio. Don't type real personal details.</p>
    </section>
  );
}
