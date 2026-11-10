import { describe, expect, it } from "vitest";
import { LIMITS, parseEntries, parseEntryLine } from "../strength-entry";

const ok = (text: string) => {
  const r = parseEntryLine(text);
  if (!r.ok) throw new Error(`expected a good line, got: ${r.error}`);
  return r.exercise;
};
const bad = (text: string) => {
  const r = parseEntryLine(text);
  if (r.ok) throw new Error("expected an error");
  return r.error;
};

describe("sets x reps at kg", () => {
  it("reads the usual form", () => {
    expect(ok("Bench press, 4 x 8 at 40 kg")).toEqual({ name: "Bench press", sets: Array(4).fill({ reps: 8, kg: 40 }) });
  });

  it("reads the short forms people really type", () => {
    for (const t of ["Bench press, 4x8 @ 40", "Bench press, 4 x 8 x 40", "Bench press, 4x8@40kg", "Bench press: 4 X 8 at 40 kg", "Bench press, 4 × 8 with 40kg"]) {
      expect(ok(t).sets, t).toEqual(Array(4).fill({ reps: 8, kg: 40 }));
    }
  });

  it("reads half kilos with a dot", () => {
    expect(ok("Lateral raise, 3 x 12 at 4.5 kg").sets[0]).toEqual({ reps: 12, kg: 4.5 });
  });

  it("no weight means body weight", () => {
    expect(ok("Pull ups, 3 x 10").sets).toEqual(Array(3).fill({ reps: 10, kg: null }));
  });

  it("0 kg also means body weight", () => {
    expect(ok("Pull ups, 3 x 10 at 0 kg").sets[0].kg).toBeNull();
  });
});

describe("each set on its own", () => {
  it("reads sets with different weights", () => {
    expect(ok("Bench press: 8 at 40, 8 at 40, 6 at 45 kg").sets).toEqual([{ reps: 8, kg: 40 }, { reps: 8, kg: 40 }, { reps: 6, kg: 45 }]);
  });

  it("allows semicolons and mixes in body weight sets", () => {
    expect(ok("Dips, 10; 8 at 5; 6 at 10").sets).toEqual([{ reps: 10, kg: null }, { reps: 8, kg: 5 }, { reps: 6, kg: 10 }]);
  });

  it("a single set on its own line", () => {
    expect(ok("Deadlift, 5 at 100 kg").sets).toEqual([{ reps: 5, kg: 100 }]);
  });
});

describe("the exercise name", () => {
  it("ends at the first digit word when there is no comma", () => {
    expect(ok("Pull ups 3 x 10")).toEqual({ name: "Pull ups", sets: Array(3).fill({ reps: 10, kg: null }) });
  });

  it("a comma lets the name hold digits", () => {
    expect(ok("21s curls, 3 x 7 at 20 kg").name).toBe("21s curls");
  });

  it("tidies spaces and starts with a capital letter", () => {
    expect(ok("  seated   cable row ,3x10 at 50").name).toBe("Seated cable row");
  });

  it("refuses an empty or very long name", () => {
    expect(bad(", 3 x 10")).toMatch(/could not find|empty/);
    expect(bad(`${"a".repeat(LIMITS.nameLength + 1)}, 3 x 10`)).toMatch(/longer than/);
    expect(ok(`${"a".repeat(LIMITS.nameLength)}, 3 x 10`).name).toHaveLength(LIMITS.nameLength);
  });
});

describe("limits, so a typing slip cannot save nonsense", () => {
  it("allows exactly the limits and refuses one more", () => {
    expect(ok(`A, ${LIMITS.sets} x 5`).sets).toHaveLength(LIMITS.sets);
    expect(bad(`A, ${LIMITS.sets + 1} x 5`)).toMatch(/more than the 20 limit/);
    expect(ok(`A, 1 x ${LIMITS.reps} at 10`).sets[0].reps).toBe(LIMITS.reps);
    expect(bad(`A, 1 x ${LIMITS.reps + 1}`)).toMatch(/more than the 300 limit/);
    expect(ok(`A, 1 x 5 at ${LIMITS.kg}`).sets[0].kg).toBe(LIMITS.kg);
    expect(bad(`A, 1 x 5 at ${LIMITS.kg + 1}`)).toMatch(/more than the 500 kg limit/);
  });

  it("refuses zero sets and zero reps", () => {
    expect(bad("A, 0 x 5")).toMatch(/Sets must be at least 1/);
    expect(bad("A, 3 x 0")).toMatch(/Reps must be at least 1/);
    expect(bad("A, 0 at 40")).toMatch(/Reps must be at least 1/);
  });

  it("applies the same limits to each set on its own", () => {
    expect(bad("A, 8 at 40, 301 at 40")).toMatch(/more than the 300 limit/);
    expect(bad("A, 8 at 501")).toMatch(/500 kg limit/);
    const many = Array(LIMITS.sets + 1).fill("5 at 10").join(", ");
    expect(bad(`A, ${many}`)).toMatch(/more than the 20 limit/);
  });
});

describe("mistakes get a plain message", () => {
  it("a comma used as a decimal point is explained", () => {
    expect(bad("Raise, 3 x 12 at 22,5 kg")).toMatch(/Use a dot/);
  });

  it("text that is not sets says what to try", () => {
    expect(bad("Bench press, lots")).toMatch(/Try: Bench press, 4 x 8 at 40 kg/);
    expect(bad("Bench press")).toMatch(/could not find/);
    expect(bad("Bench press, 4 x eight")).toMatch(/could not read/);
  });

  it("more than two decimal places is not a weight", () => {
    expect(bad("A, 3 x 5 at 4.555")).toMatch(/could not read/);
  });
});

describe("several lines", () => {
  it("reads each line, skips blank ones, and keeps the order", () => {
    const r = parseEntries("Bench press, 4 x 8 at 40\n\nPull ups, 3 x 10\r\nRow, 3 x 12 at 30 kg");
    expect(r.errors).toEqual([]);
    expect(r.exercises.map((e) => e.name)).toEqual(["Bench press", "Pull ups", "Row"]);
  });

  it("points at the line that is wrong, counting blank lines, and a bad line blocks nothing else from being checked", () => {
    const r = parseEntries("Bench press, 4 x 8 at 40\n\nnonsense\nRow, 3 x 12 at 600");
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
    expect(r.exercises).toHaveLength(1);
  });

  it("empty text asks for an exercise", () => {
    expect(parseEntries("  \n \n").errors).toEqual([{ line: 1, error: "Type at least one exercise." }]);
  });

  it("limits how much goes in at once", () => {
    const many = Array(LIMITS.exercises + 1).fill("A, 1 x 5").join("\n");
    expect(parseEntries(many).errors[0].error).toMatch(/more than 30 exercises/);
    const heavy = Array(11).fill("A, 20 x 5").join("\n");
    expect(parseEntries(heavy).errors[0].error).toMatch(/more than 200 sets/);
  });
});

describe("a name needs a letter", () => {
  it("punctuation or numbers alone are not an exercise", () => {
    expect(bad(", 3 x 10")).toMatch(/empty|could not find/);
    expect(bad("123 3 x 10")).toMatch(/could not find|empty/);
    expect(bad("- 3 x 10")).toMatch(/empty/);
  });

  it("names in other languages are fine", () => {
    expect(ok("Développé couché, 3 x 8 at 40").name).toBe("Développé couché");
  });
});
