import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "../app/api/cron/ingest/route";
describe("cron authorization", () => {
  it("requires a secret in production", () => expect(isCronAuthorized(new Request("http://local"), { NODE_ENV: "production" })).toBe(false));
  it("accepts an exact bearer token", () => expect(isCronAuthorized(new Request("http://local", { headers: { authorization: "Bearer secret" } }), { NODE_ENV: "production", CRON_SECRET: "secret" })).toBe(true));
  it("allows secretless local development", () => expect(isCronAuthorized(new Request("http://local"), { NODE_ENV: "development" })).toBe(true));
});

