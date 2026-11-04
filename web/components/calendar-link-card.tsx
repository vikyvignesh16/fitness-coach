"use client";

import { Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { createFeedLink, type FeedLinkResult } from "@/app/(app)/calendar/feed-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Make or replace the private calendar link, and show it once. */
export function CalendarLinkCard({
  createdOn,
  create = createFeedLink,
}: {
  createdOn: string | null; // e.g. "4 Nov", when the current link was made, or null if there is none
  create?: () => Promise<FeedLinkResult>;
}) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  function onClick() {
    if (createdOn && !confirming && !url) {
      setConfirming(true); // replacing a link stops the old one working in Google Calendar
      return;
    }
    setError(null);
    setConfirming(false);
    start(async () => {
      try {
        const r = await create();
        setUrl(r.url);
        setError(r.error);
      } catch {
        setError("Not saved. Check your signal and try again.");
      }
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      setCopied(true);
    } catch {
      setError("Could not copy. Press and hold the link to copy it.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Calendar</CardTitle>
        <CardDescription>
          Your planned runs as all day events, with the steps in the description. Google reads this link on its own,
          about once or twice a day, so a change to the plan shows up late. It only goes one way: nothing you do in
          Google changes the plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {url ? (
          <>
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Calendar link" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy link">
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              </Button>
            </div>
            <p className="text-muted-foreground">
              This link is shown once. Treat it like a password: anyone who has it can see your training dates. In
              Google Calendar on a computer, open Other calendars, choose From URL, and paste it.
            </p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              {createdOn
                ? `A link was made on ${createdOn}. For safety it cannot be shown again.`
                : "No link yet."}
            </p>
            <Button type="button" variant={createdOn ? "outline" : "default"} disabled={pending} onClick={onClick}>
              {pending ? "Working..." : confirming ? "Tap again to replace the old link" : createdOn ? "Make a new link" : "Make my calendar link"}
            </Button>
            {confirming && <p className="text-muted-foreground">The old link will stop working in Google Calendar.</p>}
          </>
        )}
        {error && <p role="alert" className="text-sm" style={{ color: "#d03b3b" }}>{error}</p>}
      </CardContent>
    </Card>
  );
}
