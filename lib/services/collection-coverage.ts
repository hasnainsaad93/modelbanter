export const stopReasons = ["TARGET_REACHED", "SEARCH_EXHAUSTED", "PAGE_CAP", "TIME_BUDGET", "RATE_LIMIT", "USAGE_LIMIT", "UPSTREAM_ERROR", "CURSOR_INVALID"] as const;
export type StopReason = typeof stopReasons[number];

export type CollectionOutcome = {
  targetCount: number; targetReached: boolean; status: string; stopReason: string | null;
  newAssociationsInserted: number; acceptedInCycle: number | null;
  startedAt: Date; completedAt: Date | null;
};

export function terminalReason(result: CollectionOutcome): string | null {
  if (result.stopReason) return result.stopReason;
  if (result.targetReached) return "TARGET_REACHED";
  return result.status === "COMPLETED" ? "SEARCH_EXHAUSTED" : null;
}

export function hasCoverage(result: CollectionOutcome, target: number, since: Date) {
  return result.targetCount >= target && result.startedAt >= since &&
    ["TARGET_REACHED", "SEARCH_EXHAUSTED", "PAGE_CAP"].includes(terminalReason(result) ?? "") &&
    result.status !== "RUNNING" && result.status !== "FAILED";
}

export function describeCoverage(results: CollectionOutcome[], target: number, since: Date) {
  const sorted = [...results].sort((a, b) => +b.startedAt - +a.startedAt);
  const latest = sorted[0];
  const completed = sorted.find(result => hasCoverage(result, target, since));
  const successful = sorted.find(result => result.status === "COMPLETED" && result.targetCount >= target);
  return {
    covered: !!completed, target,
    accepted: latest ? latest.acceptedInCycle ?? (latest.targetReached ? latest.newAssociationsInserted : null) : null,
    attemptedAt: latest?.startedAt.toISOString() ?? null,
    successfulAt: successful ? (successful.completedAt ?? successful.startedAt).toISOString() : null,
    stopReason: latest ? terminalReason(latest) : null,
    state: completed ? terminalReason(completed) === "TARGET_REACHED" ? "Target reached" : terminalReason(completed) === "SEARCH_EXHAUSTED" ? "Search exhausted" : "Page limit reached" : latest?.targetCount && latest.targetCount < target ? "Initial sample only" : latest ? "Collection incomplete" : "Not collected",
  };
}

export function ingestionFailed(result: { status: string; results?: { stopReason?: string | null; status: string }[] }) {
  const failures = ["RATE_LIMIT", "USAGE_LIMIT", "UPSTREAM_ERROR", "CURSOR_INVALID"];
  return ["FAILED", "RATE_LIMITED", "USAGE_LIMIT_REACHED"].includes(result.status) ||
    !!result.results?.some(item => item.status === "FAILED" || item.status === "RATE_LIMITED" || item.status === "USAGE_LIMIT_REACHED" || failures.includes(item.stopReason ?? ""));
}
