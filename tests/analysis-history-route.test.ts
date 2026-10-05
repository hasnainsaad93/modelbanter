import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/debug/jev/history/route";
const mocks = vi.hoisted(() => ({ mentions: vi.fn(), revisions: vi.fn() }));
vi.mock("../lib/server/db", () => ({ db: { modelMention: { findMany: mocks.mentions }, analysisRevision: { findMany: mocks.revisions } } }));
const request = (query = "postId=2106864289352937900", auth?: string) => new Request(`http://localhost/api/debug/jev/history?${query}`, { headers: auth ? { Authorization: auth } : {} });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("CRON_SECRET", "");
  mocks.mentions.mockResolvedValue([{ id: "mention", analysisRevision: 2, analysisVersion: "v4", model: { slug: "model" } }]);
  mocks.revisions.mockResolvedValue([{ revision: 2, before: { sentiment: "NEUTRAL" }, after: { sentiment: "POSITIVE" } }]);
});
afterEach(() => vi.unstubAllEnvs());
describe("protected classification history", () => {
  it("authorizes before any read and returns no-store responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const denied = await GET(request()); expect(denied.status).toBe(401); expect(mocks.mentions).not.toHaveBeenCalled();
    vi.stubEnv("CRON_SECRET", "test-secret");
    const allowed = await GET(request(undefined, "Bearer test-secret"));
    expect(allowed.status).toBe(200); expect(allowed.headers.get("Cache-Control")).toBe("no-store");
  });
  it("requires a model for ambiguous associations and validates pagination", async () => {
    mocks.mentions.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    expect((await GET(request())).status).toBe(400); expect(mocks.revisions).not.toHaveBeenCalled();
    expect((await GET(request("postId=123&beforeRevision=-1"))).status).toBe(400);
  });
  it("paginates revisions without losing precision on X IDs", async () => {
    mocks.revisions.mockResolvedValue(Array.from({ length: 21 }, (_, i) => ({ revision: 21 - i })));
    const response = await GET(request("postId=2106864289352937900&modelSlug=model&beforeRevision=22"));
    const { data } = await response.json(); expect(data.revisions).toHaveLength(20); expect(data.nextBeforeRevision).toBe(2);
    expect(mocks.mentions.mock.calls[0][0].where.post).toEqual({ xPostId: "2106864289352937900" });
    expect(mocks.revisions.mock.calls[0][0].where).toEqual({ mentionId: "mention", revision: { lt: 22 } });
  });
  it("does not leak database failures or fabricate history", async () => {
    mocks.mentions.mockRejectedValue(new Error("private database detail"));
    const response = await GET(request()); expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database detail");
  });
});
