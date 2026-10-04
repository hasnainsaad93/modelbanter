import { describe, expect, it } from "vitest";
import { checkpointMatches, freshCheckpoint, readCheckpoint, selectCollectionBatch } from "../lib/services/collection-checkpoint";

describe("collection rotation", () => {
  it("puts unstarted models first, then the oldest attempts, with deterministic ties", () => {
    const models = [
      { id: "a", displayOrder: 0, lastCollectionAttemptAt: new Date(10000) },
      { id: "b", displayOrder: 1, lastCollectionAttemptAt: new Date(5000) },
      { id: "d", displayOrder: 3, lastCollectionAttemptAt: null },
      { id: "c", displayOrder: 2, lastCollectionAttemptAt: null },
    ];
    expect(selectCollectionBatch(models, 3).map(model => model.id)).toEqual(["c", "d", "b"]);
    const attempted = selectCollectionBatch(models, 3).map(model => model.id);
    const next = models.map(model => attempted.includes(model.id) ? { ...model, lastCollectionAttemptAt: new Date(20000) } : model);
    expect(selectCollectionBatch(next, 1)[0].id).toBe("a");
    expect(models[0].lastCollectionAttemptAt).toEqual(new Date(10000));
  });
  it("starts fresh if settings, search identity, or cursor age changes", () => {
    const checkpoint = freshCheckpoint("Kimi K3", 100, 20, 100);
    expect(checkpointMatches(checkpoint, "Kimi K3", 100, 20, 100)).toBe(true);
    expect(checkpointMatches(checkpoint, "Kimi K4", 100, 20, 100)).toBe(false);
    expect(checkpointMatches(checkpoint, "Kimi K3", 200, 20, 100)).toBe(false);
    expect(checkpointMatches({ ...checkpoint, endTime: new Date(Date.now() - 7 * 86400000).toISOString() }, "Kimi K3", 100, 20, 100)).toBe(false);
    expect(readCheckpoint(checkpoint)?.cycleId).toBe(checkpoint.cycleId);
    expect(readCheckpoint({ version: 1, pending: "broken" })).toBeUndefined();
  });
});
