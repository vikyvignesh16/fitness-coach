const RUN_LABELS: Record<string, string> = {
  recovery: "Recovery run",
  easy: "Easy run",
  easy_strides: "Easy run with strides",
  long_run: "Long run",
  quality: "Quality run",
  "10k_test": "10K time trial",
  half_marathon_test: "Half marathon test",
  marathon_race: "Marathon race",
  no_run: "No run",
  not_recorded: "Not recorded",
  actual: "Run",
};

export function runLabel(type: string): string {
  return RUN_LABELS[type] ?? type.replaceAll("_", " ");
}

export function isRestDay(type: string | undefined): boolean {
  return !type || type === "no_run" || type === "not_recorded";
}
