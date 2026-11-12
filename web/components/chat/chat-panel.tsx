"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sendMessageAction } from "@/app/(app)/chat/actions";
import { StatusBanner } from "@/components/status-banner";
import { Button } from "@/components/ui/button";
import { MAX_TEXT, noticesFor, type ChatMessage } from "@/lib/chat";

type Deps = { send: typeof sendMessageAction };
const defaultDeps: Deps = { send: sendMessageAction };

type Shown = { key: string; role: "user" | "coach"; body: string; notices?: string[] };

/** The conversation and the box to write in. The answer is shown only when it has been checked, so there is no word by word typing. */
export function ChatPanel({
  threadId,
  initialMessages,
  deps = defaultDeps,
}: {
  threadId: string | null;
  initialMessages: ChatMessage[];
  deps?: Deps;
}) {
  const router = useRouter();
  const [shown, setShown] = useState<Shown[]>(() => initialMessages.map((m) => ({ key: m.id, role: m.role, body: m.body })));
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [shown, pending]);

  const trimmed = text.trim();
  const tooLong = text.length > MAX_TEXT;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || tooLong || pending) return;
    const sent = trimmed;
    setError(null);
    setPending(true);
    setText("");
    setShown((all) => [...all, { key: `local-${++counter.current}`, role: "user", body: sent }]);
    try {
      const result = await deps.send({ text: sent, threadId });
      if (!result.ok) {
        setError(result.error);
        setText(sent); // give the message back so nothing typed is lost
        setShown((all) => all.slice(0, -1));
        return;
      }
      setShown((all) => [...all, { key: `local-${++counter.current}`, role: "coach", body: result.reply, notices: noticesFor(result) }]);
      if (threadId === null && result.threadId) router.replace(`/chat?thread=${result.threadId}`); // a new chat now has an address
      else router.refresh(); // updates the list of chats and the spending line
    } catch {
      setError("Could not reach the coach.");
      setText(sent);
      setShown((all) => all.slice(0, -1));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div role="log" aria-live="polite" aria-label="Conversation" className="space-y-3">
        {shown.length === 0 && (
          <p className="text-muted-foreground text-sm">Ask about your sleep, your runs or your plan. Say &quot;remember that...&quot; and the coach keeps a short note.</p>
        )}
        {shown.map((m) => (
          <div key={m.key} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
              <p className="sr-only">{m.role === "user" ? "You: " : "Coach: "}</p>
              {m.body}
              {m.notices && m.notices.length > 0 && (
                <ul className="text-muted-foreground border-t pt-2 text-xs">
                  {m.notices.map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
            </div>
          </div>
        ))}
        {pending && <p role="status" className="text-muted-foreground text-sm">Coach is thinking...</p>}
        <div ref={bottom} />
      </div>

      {error && <StatusBanner level="careful" title={error} />}

      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="chat-text" className="sr-only">Message the coach</label>
        <textarea
          id="chat-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          disabled={pending}
          placeholder="Message the coach"
          aria-invalid={tooLong}
          className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full resize-y rounded-lg border px-3 py-2 text-base outline-none focus-visible:ring-3 disabled:opacity-50 md:text-sm"
        />
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>{text.length} / {MAX_TEXT}</span>
          <Button type="submit" disabled={pending || !trimmed || tooLong}>Send</Button>
        </div>
      </form>
    </div>
  );
}
