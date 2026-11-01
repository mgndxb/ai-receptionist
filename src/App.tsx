import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";

import { ChatPanel, GREETING } from "./chat";
import { handoffsFrom, latestOptions, traceFrom } from "./derive";
import { Calendar, Inbox, Rules, Trace, Tricks } from "./desk";
import { holdsFrom, openDays, type Decisions } from "./studio/calendar";
import { helsinkiNow } from "./studio/time";

// On GitHub Pages the API lives on Vercel; on Vercel and in development it's same-origin.
const API = import.meta.env.VITE_API_URL ?? "/api/chat";

export function App() {
  const [decisions, setDecisions] = useState<Decisions>({});
  const decisionsRef = useRef(decisions);
  decisionsRef.current = decisions;
  const [transport] = useState(() => new DefaultChatTransport({ api: API, body: () => ({ decisions: decisionsRef.current }) }));
  const { messages, sendMessage, status, error, regenerate, setMessages, clearError } = useChat({ messages: [GREETING], transport });

  // One clock for hold countdowns, expiry and the "now" line on the calendar.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  // Lets screenshot scripts load a finished conversation in development.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __chat: { setMessages, setDecisions } });
  }, [setMessages]);

  const busy = status === "submitted" || status === "streaming";
  const local = helsinkiNow(new Date(now));
  const holds = holdsFrom(messages, decisions, new Date(now));
  const confirmed = new Set(Object.keys(decisions).filter((id) => decisions[id] === "confirmed"));
  const found = latestOptions(messages);

  // Show this week, or jump ahead if the AI is working on a later day.
  const focus = [...holds.map((h) => h.date), ...found.options.map((o) => o.start.slice(0, 10))].sort().at(-1);
  let days = openDays(local.date, 6);
  if (focus && focus > days.at(-1)!) days = openDays(focus, 6);

  const send = (text: string) => {
    if (busy) return;
    clearError();
    void sendMessage({ text });
  };

  const reset = () => {
    setMessages([GREETING]);
    setDecisions({});
    clearError();
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1360px] items-center justify-between gap-4 px-4 pt-6 md:px-8">
        <p className="font-display text-[16px] font-semibold tracking-[-0.02em]">AI Receptionist</p>
        <nav className="flex gap-2 text-[13px]">
          <a href="https://github.com/mgndxb/ai-receptionist" className="press rounded-full border border-line bg-paper px-3.5 py-1.5 text-ash hover:text-ink">
            Source
          </a>
          <a href="https://magnus.is-a.dev/" className="press rounded-full border border-line bg-paper px-3.5 py-1.5 text-ash hover:text-ink">
            Magnus Kaur ↗
          </a>
        </nav>
      </header>

      <section className="mx-auto max-w-[1360px] px-4 pt-12 pb-10 md:px-8 md:pt-16">
        <h1 className="max-w-[16ch] font-display text-[clamp(2.4rem,6.2vw,5.2rem)] leading-[0.95] font-extrabold tracking-[-0.032em]">
          Book a lash lift. Then try to talk it into a discount.
        </h1>
        <p className="mt-6 max-w-[64ch] text-[16.5px] leading-relaxed text-ink/75">
          Beauty studios get the same messages all day, often while the stylist's hands are busy with a client. This is an AI
          receptionist for a made-up studio in Helsinki. It answers in Finnish or English, looks up real free times and holds one
          for you. The rules that matter live in code, not in the prompt, so it can't invent a price, double-book a chair or
          confirm a booking on its own.
        </p>
      </section>

      <main className="mx-auto grid max-w-[1360px] items-start gap-5 px-4 pb-16 md:px-8 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-5">
          <ChatPanel
            messages={messages}
            status={status}
            error={error}
            decisions={decisions}
            now={now}
            onSend={send}
            onDecide={(id, decision) => setDecisions((current) => ({ ...current, [id]: decision }))}
            onRetry={() => {
              clearError();
              void regenerate();
            }}
            onReset={reset}
          />
        </div>
        <div className="min-w-0 space-y-5">
          <Calendar today={local.date} nowMinutes={local.minutes} days={days} holds={holds} confirmed={confirmed} found={found} />
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Trace items={traceFrom(messages)} />
            <div className="space-y-5">
              <Tricks disabled={busy} onTry={send} />
              <Inbox handoffs={handoffsFrom(messages)} />
            </div>
          </div>
          <Rules />
        </div>
      </main>

      <footer className="mx-auto max-w-[1360px] border-t border-line px-4 py-10 text-[13px] leading-relaxed text-ash md:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          <p>
            <strong className="text-ink">The model asks, the code decides.</strong> Claude Haiku 5.5 chooses which tools to call and
            writes the replies. Free times, prices and holds come from plain TypeScript that it can only call.
          </p>
          <p>
            <strong className="text-ink">No API key anywhere.</strong> A Vercel Function reaches Claude through Vercel AI Gateway with
            the project's own short-lived token, under a monthly budget cap.
          </p>
          <p>
            <strong className="text-ink">Built by Magnus Kaur</strong> with TypeScript, React, Vite and the AI SDK. Studio Usva, its
            stylists, prices and bookings are all made up.
          </p>
        </div>
      </footer>
    </div>
  );
}
