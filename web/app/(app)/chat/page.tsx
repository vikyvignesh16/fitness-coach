import Link from "next/link";
import { ChatPanel } from "@/components/chat/chat-panel";
import { MemoryPanel } from "@/components/chat/memory-panel";
import { StatusBanner } from "@/components/status-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseThreadParam, spendLine, threadTitle } from "@/lib/chat";
import { loadChatPage } from "@/lib/data";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ thread?: string | string[] }> }) {
  const { thread } = await searchParams;
  const { threads, activeThreadId, messages, facts, spend } = await loadChatPage(parseThreadParam(thread));
  const line = spendLine(spend);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Chat with the coach</h1>
        <p className="text-muted-foreground text-sm">Not medical advice. Lasting pain means stop planned training and see a professional.</p>
      </div>

      {line.level === "stop" && <StatusBanner level="stop" title="The monthly spending cap is reached">The coach will not answer until next month, or until the cap is raised.</StatusBanner>}
      {line.level === "careful" && <StatusBanner level="careful" title="Close to the monthly spending cap">{line.text}.</StatusBanner>}

      <Card>
        <CardContent>
          {/* key makes a different chat start fresh instead of mixing messages */}
          <ChatPanel key={activeThreadId ?? "new"} threadId={activeThreadId} initialMessages={messages} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your chats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Link href="/chat" className="text-primary mb-2 inline-block font-medium underline-offset-4 hover:underline">New chat</Link>
          <ul className="space-y-1">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/chat?thread=${t.id}`} aria-current={t.id === activeThreadId ? "page" : undefined}
                  className={`underline-offset-4 hover:underline ${t.id === activeThreadId ? "font-medium" : "text-muted-foreground"}`}>
                  {threadTitle(t)}
                </Link>
              </li>
            ))}
            {threads.length === 0 && <li className="text-muted-foreground">No chats yet.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the coach remembers</CardTitle>
        </CardHeader>
        <CardContent>
          <MemoryPanel facts={facts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What leaves this app</CardTitle>
          <CardDescription>{line.text}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            When you ask about your sleep, runs or plan, the coach reads those numbers and sends them, with your message, to OpenRouter
            and OpenAI so a model can write the answer. Your notes, photos and logins are never read.
          </p>
          <p>Every answer is checked in code before you see it: its numbers must come from your data, and advice about food or treatment needs a source.</p>
        </CardContent>
      </Card>
    </>
  );
}
