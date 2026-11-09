// Plain words on purpose. These are general explanations of what each number is, not advice and not medical advice.
// The app's rule is that health claims cite the evidence library. That library is still empty, so sources are added
// when it is filled (task 10 of the plan). Until then this text sticks to what the numbers are and how they usually behave.

export const READING_RULES = [
  "Compare with your own normal, not with other people. Your usual is the line that counts.",
  "One day is a bump. Several numbers moving the same way for several days is a pattern.",
  "No data means the watch recorded nothing. It does not mean zero.",
  "These numbers are estimates from a watch. If something hurts or feels wrong, trust that, and see a professional if it lasts.",
];

export const CAR_PICTURE: { metric: string; picture: string; meaning: string }[] = [
  { metric: "Sleep", picture: "The overnight fuel stop", meaning: "More time asleep, and fewer wake-ups, usually means a fuller tank in the morning." },
  { metric: "Recovery", picture: "The fuel gauge", meaning: "How topped up COROS thinks you are right now. It goes down after hard days and up as you rest." },
  { metric: "Resting heart rate", picture: "The engine idling at the lights", meaning: "If it idles faster than your usual for a few days, your body may be working harder than normal (tiredness, stress, illness or heat)." },
  { metric: "HRV", picture: "How smooth the suspension is", meaning: "It is the small difference in timing between heartbeats. Higher than your usual often goes with a body that is coping well. Lower than your usual for several days often goes with tiredness or stress." },
  { metric: "Training load", picture: "How hard the road has been", meaning: "Short-term is the last week or so of hills. Long-term is your usual route over a longer time. Ratio above 1 means lately is harder than usual, below 1 means lighter. COROS adds a word such as Optimized or Maintaining to tell you what it thinks." },
  { metric: "VO2max and threshold pace", picture: "Engine size and the speed you can hold without overheating", meaning: "They move slowly, over weeks and months. Watch the direction, not one reading." },
];

export const SAM_STORY = {
  title: "Sam's Tuesday",
  intro: "Sam is training for a marathon. On Tuesday morning the watch says:",
  facts: [
    "Sleep: 5 hours (Sam usually gets 7 and a half). The fuel stop was short.",
    "HRV: 40 ms (Sam's usual is about 60). The suspension is stiff.",
    "Resting heart rate: 62 (Sam's usual is 54). The engine is idling fast.",
    "Recovery: 55%. The fuel gauge is half full.",
    "Training load ratio: 1.3. This week has been harder than usual.",
  ],
  reading: [
    "Every sign points the same way, and Sam did hard days before it. That is a pattern, so it is worth noticing.",
    "If only the resting heart rate had changed, with great sleep and a normal week, it would just be a bump. Sam would carry on.",
    "The app does not change the plan. Sam's move is to ask the coach plan whether today should stay as written, and to listen to their own legs.",
  ],
};

export function HowToRead() {
  return (
    <details className="bg-card ring-foreground/10 rounded-xl p-4 text-sm ring-1">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">How to read these numbers (a quick, fun guide)</summary>
      <div className="space-y-5 pt-2">
        <section aria-label="Four rules" className="space-y-2">
          <h3 className="font-semibold">Four rules</h3>
          <ol className="list-decimal space-y-1 pl-5">
            {READING_RULES.map((r) => <li key={r}>{r}</li>)}
          </ol>
        </section>

        <section aria-label="Your body is a car" className="space-y-2">
          <h3 className="font-semibold">Picture your body as a car on a long road trip</h3>
          <ul className="space-y-2">
            {CAR_PICTURE.map((row) => (
              <li key={row.metric}>
                <p><span className="font-medium">{row.metric}</span> <span className="text-muted-foreground">is {row.picture.charAt(0).toLowerCase() + row.picture.slice(1)}.</span></p>
                <p className="text-muted-foreground">{row.meaning}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label={SAM_STORY.title} className="space-y-2">
          <h3 className="font-semibold">{SAM_STORY.title}</h3>
          <p>{SAM_STORY.intro}</p>
          <ul className="list-disc space-y-1 pl-5">
            {SAM_STORY.facts.map((f) => <li key={f}>{f}</li>)}
          </ul>
          {SAM_STORY.reading.map((p) => <p key={p}>{p}</p>)}
        </section>

        <p className="text-muted-foreground text-xs">
          This is a general guide, not medical advice. Links to the research behind it will be added when the app&apos;s evidence library is filled.
        </p>
      </div>
    </details>
  );
}
