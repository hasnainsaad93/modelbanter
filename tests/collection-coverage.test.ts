import { describe, expect, it } from "vitest";
import { describeCoverage, hasCoverage, ingestionFailed, type CollectionOutcome } from "../lib/services/collection-coverage";
import { parseCleanupCutoff } from "../lib/services/cleanup";
import { collectionStart, recentSearchStart } from "../lib/services/collection-window";
import { selectCollectionBatch } from "../lib/services/collection-checkpoint";

const since = new Date("2026-10-01T00:00:00Z");
const outcome = (changes: Partial<CollectionOutcome> = {}): CollectionOutcome => ({ targetCount: 100, targetReached: true, status: "COMPLETED", stopReason: "TARGET_REACHED", newAssociationsInserted: 20, acceptedInCycle: 100, startedAt: new Date("2026-10-04T12:00:00Z"), completedAt: new Date("2026-10-04T12:01:00Z"), ...changes });

describe("collection coverage", () => {
  it("prioritizes incomplete models over older completed attempts and preserves rotation within each group", () => {
    const models = [
      { id: "done", displayOrder: 0, lastCollectionAttemptAt: new Date("2026-10-01") },
      { id: "recent-pause", displayOrder: 1, lastCollectionAttemptAt: new Date("2026-10-04") },
      { id: "older-pause", displayOrder: 2, lastCollectionAttemptAt: new Date("2026-10-03") },
    ];
    expect(selectCollectionBatch(models, 2, new Set(["done"])).map(model => model.id)).toEqual(["older-pause", "recent-pause"]);
    expect(selectCollectionBatch(models, 1, new Set(models.map(model => model.id)))[0].id).toBe("done");
  });
  it("does not mistake a one-post smoke collection for a full target attempt", () => {
    const result = outcome({ targetCount: 1, acceptedInCycle: 1 });
    expect(hasCoverage(result, 100, since)).toBe(false);
    expect(describeCoverage([result], 100, since).state).toBe("Initial sample only");
  });
  it("uses cumulative cycle progress across resumes, not only this invocation's new posts", () => {
    expect(describeCoverage([outcome()], 100, since)).toMatchObject({ covered: true, accepted: 100, state: "Target reached" });
  });
  it("distinguishes real exhausted searches and page caps from resumable incomplete collections", () => {
    expect(describeCoverage([outcome({ targetReached: false, acceptedInCycle: 12, stopReason: "SEARCH_EXHAUSTED" })], 100, since)).toMatchObject({ covered: true, state: "Search exhausted", accepted: 12 });
    expect(describeCoverage([outcome({ targetReached: false, status: "PARTIALLY_COMPLETED", stopReason: "PAGE_CAP" })], 100, since).state).toBe("Page limit reached");
    expect(hasCoverage(outcome({ targetReached: false, status: "PARTIALLY_COMPLETED", stopReason: "TIME_BUDGET" }), 100, since)).toBe(false);
  });
  it("retains the successful time when a later invocation fails and rejects stale coverage", () => {
    const good = outcome();
    const failed = outcome({ startedAt: new Date("2026-10-04T13:00:00Z"), status: "FAILED", targetReached: false, stopReason: "UPSTREAM_ERROR" });
    expect(describeCoverage([failed, good], 100, since)).toMatchObject({ covered: true, stopReason: "UPSTREAM_ERROR", successfulAt: good.completedAt!.toISOString() });
    expect(hasCoverage(outcome({ startedAt: new Date("2026-09-01") }), 100, since)).toBe(false);
  });
  it("recognizes pre-migration terminal outcomes without fabricated cycle totals", () => {
    expect(hasCoverage(outcome({ stopReason: null, acceptedInCycle: null, completedAt: null }), 100, since)).toBe(true);
  });
  it("signals upstream errors even after partial progress while normal pauses remain resumable", () => {
    expect(ingestionFailed({ status: "PARTIALLY_COMPLETED", results: [{ status: "RATE_LIMITED", stopReason: "RATE_LIMIT" }] })).toBe(true);
    expect(ingestionFailed({ status: "PARTIALLY_COMPLETED", results: [{ status: "PARTIALLY_COMPLETED", stopReason: "UPSTREAM_ERROR" }] })).toBe(true);
    expect(ingestionFailed({ status: "PARTIALLY_COMPLETED", results: [{ status: "PARTIALLY_COMPLETED", stopReason: "TIME_BUDGET" }] })).toBe(false);
  });
});

describe("cleanup cutoff", () => {
  it("requires an exact UTC timestamp and rejects invalid or future dates", () => {
    expect(parseCleanupCutoff("2026-10-01T00:00:00Z").toISOString()).toBe("2026-10-01T00:00:00.000Z");
    for (const value of ["2026-10-01", "2026-02-30T00:00:00Z", "2026-10-01T00:00:00-04:00", "9999-01-01T00:00:00Z"]) expect(() => parseCleanupCutoff(value)).toThrow();
  });
  it("keeps the collection floor inside the moving recent-search window", () => {
    const start = collectionStart("2026-10-01T00:00:00Z")!;
    expect(recentSearchStart(start, new Date("2026-10-04T12:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
    expect(recentSearchStart(start, new Date("2026-10-12T12:00:00Z"))).toBe("2026-10-05T12:00:30.000Z");
  });
});
