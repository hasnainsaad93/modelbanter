import { describe, expect, it } from "vitest";
import { classifyXError } from "../lib/services/x-client";

describe("X API error classification", () => {
  it("recognizes HTTP 402 as depleted usage credit", () => expect(classifyXError(402, { title: "CreditsDepleted", detail: "Your credits are depleted" })).toBe("usage_limit"));
  it("distinguishes usage-capped 429 responses from rate limits", () => { expect(classifyXError(429, { type: "https://api.x.com/2/problems/usage-capped" })).toBe("usage_limit"); expect(classifyXError(429, { type: "https://api.x.com/2/problems/rate-limit-exceeded" })).toBe("rate_limit"); });
  it("treats invalid credentials and server failures separately", () => { expect(classifyXError(401, { title: "Unauthorized" })).toBe("auth"); expect(classifyXError(503, { title: "Unavailable" })).toBe("transient"); });
});
