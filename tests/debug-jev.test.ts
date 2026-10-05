import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/debug/jev/route";
import { JevError } from "../lib/services/jev";

const mocks = vi.hoisted(() => ({ post: vi.fn(), model: vi.fn(), analyze: vi.fn() }));
vi.mock("../lib/server/db", () => ({ db: { xPost: { findUnique: mocks.post }, model: { findUnique: mocks.model } } }));
vi.mock("../lib/services/jev", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/services/jev")>(), analyzeWithJev: mocks.analyze,
}));

const model = { id: "model-id", name: "Model A", slug: "model-a" };
const post = { id: "cmstoredpost", xPostId: "2106864289352937900", text: "Model A writes good code", mentions: [{ model }] };
function request(body: unknown = { postId: post.xPostId }, authorization?: string) {
  return new Request("http://localhost:3000/api/debug/jev", {
    method: "POST", headers: { "Content-Type": "application/json", ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("CRON_SECRET", "");
  mocks.post.mockResolvedValue(post);
  mocks.model.mockResolvedValue(model);
  mocks.analyze.mockResolvedValue({ model: "jev-test", usage: { input_tokens: 100, output_tokens: 20 }, overall: { choice: "POSITIVE" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("stored-post Jev debug endpoint", () => {
  it("looks up an X ID without numeric precision loss and returns the exact input, questions, and unsaved result", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.post.mock.calls[0][0].where).toEqual({ xPostId: post.xPostId });
    expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(post.text, model.name);
    const { data } = await response.json();
    expect(data.persisted).toBe(false);
    expect(data.request.state).toEqual({ target_model: model.name, post: post.text });
    expect(Object.keys(data.request.questions)).toHaveLength(6);
    expect(data.analysis.model).toBe("jev-test");
    expect(mocks.model).not.toHaveBeenCalled();
  });

  it("accepts an internal XPost ID", async () => {
    expect((await POST(request({ postId: post.id }))).status).toBe(200);
    expect(mocks.post.mock.calls[0][0].where).toEqual({ id: post.id });
  });

  it("requires authorization before reading the database or making a paid call in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request())).status).toBe(401);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("enforces a configured development secret and accepts its exact bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "test-only-secret");
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request(undefined, "Bearer wrong"))).status).toBe(401);
    expect((await POST(request(undefined, "Bearer test-only-secret"))).status).toBe(200);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON and numeric IDs before looking up records", async () => {
    const malformed = new Request("http://localhost/api/debug/jev", { method: "POST", body: "{" });
    expect((await POST(malformed)).status).toBe(400);
    expect((await POST(request({ postId: 123 }))).status).toBe(400);
    expect((await POST(request({ postId: " " }))).status).toBe(400);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("does not call Jev for a missing post", async () => {
    mocks.post.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("requires an explicit model for ambiguous or missing associations", async () => {
    mocks.post.mockResolvedValue({ ...post, mentions: [...post.mentions, { model: { ...model, slug: "model-b" } }] });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("model-a, model-b");
    mocks.post.mockResolvedValue({ ...post, mentions: [] });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("uses the explicitly selected catalog model even without a stored association", async () => {
    mocks.post.mockResolvedValue({ ...post, mentions: [] });
    mocks.model.mockResolvedValue({ ...model, name: "Model B", slug: "model-b" });
    expect((await POST(request({ postId: post.xPostId, modelSlug: "model-b" }))).status).toBe(200);
    expect(mocks.model.mock.calls[0][0].where).toEqual({ slug: "model-b" });
    expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(post.text, "Model B");
  });

  it("does not call Jev for an unknown target model", async () => {
    mocks.model.mockResolvedValue(null);
    expect((await POST(request({ postId: post.xPostId, modelSlug: "unknown" }))).status).toBe(404);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("returns Jev errors and propagates rate limiting without fabricating an analysis", async () => {
    mocks.analyze.mockRejectedValue(new JevError("TypeSafe is unavailable (HTTP 429).", 429));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ data: null, error: { code: "JEV_FAILED", message: "TypeSafe is unavailable (HTTP 429)." } });
    mocks.analyze.mockRejectedValue(new JevError("TypeSafe returned decisions that did not match the required schema."));
    expect((await POST(request())).status).toBe(502);
  });

  it("hides database error details and avoids a paid call when lookup fails", async () => {
    mocks.post.mockRejectedValue(new Error("private database details"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database details");
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
