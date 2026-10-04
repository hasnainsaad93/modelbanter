import { afterEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));
import { analyticsAllowed } from "../lib/analytics/client";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("usage analytics", () => {
  it.each(["modelbanter.analytics.disabled", "signalist.analytics.disabled"])("preserves the browser opt-out under %s", async key => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_only");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubGlobal("window", {});
    vi.stubGlobal("location", { hostname: "modelbanter.com", origin: "https://modelbanter.com" });
    vi.stubGlobal("localStorage", { getItem: (name: string) => name === key ? "true" : null });
    const { trackPage } = await import("../lib/analytics/client");
    trackPage("/");
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });
  it("excludes localhost, development, and browsers marked as internal", () => {
    expect(analyticsAllowed("localhost", true, false)).toBe(false);
    expect(analyticsAllowed("127.0.0.1", true, false)).toBe(false);
    expect(analyticsAllowed("modelbanter.example", false, false)).toBe(false);
    expect(analyticsAllowed("modelbanter.example", true, true)).toBe(false);
    expect(analyticsAllowed("modelbanter.example", true, false)).toBe(true);
  });
  it("uses anonymous explicit events and removes private URL parameters", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_only");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubGlobal("window", {});
    vi.stubGlobal("location", { hostname: "modelbanter.example", origin: "https://modelbanter.example" });
    vi.stubGlobal("localStorage", { getItem: () => null });
    const { trackPage, trackUsage } = await import("../lib/analytics/client");
    trackPage("/models/kimi-k3");
    trackUsage("category_selected", { model: "kimi-k3", category: "speed" });
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const options = sdk.init.mock.calls[0][1];
    expect(options).toMatchObject({ autocapture: false, capture_pageview: false, disable_session_recording: true, person_profiles: "never", cookieless_mode: "always" });
    const cleaned = options.before_send({ properties: { $current_url: "https://modelbanter.example/?private=secret#fragment", $referrer: "https://example.com/source?private=secret" } });
    expect(cleaned.properties).toEqual({ $current_url: "https://modelbanter.example/", $referrer: "https://example.com/source" });
    expect(sdk.capture.mock.calls).toEqual([["$pageview", { $current_url: "https://modelbanter.example/models/kimi-k3", $pathname: "/models/kimi-k3" }], ["category_selected", { model: "kimi-k3", category: "speed" }]]);
  });
});
