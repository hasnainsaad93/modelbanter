"use client";
import posthog from "posthog-js";

export type UsageEvent = "model_opened" | "category_selected" | "filter_changed" | "source_post_opened";
export type UsageProperties = { model?: string; vendor?: string; category?: string; range?: string; sentiment?: string; filter?: string };
let initialized = false;
export function analyticsAllowed(hostname: string, production: boolean, excluded: boolean) {
  return production && !excluded && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname) && !hostname.endsWith(".local");
}
export function initializeAnalytics() {
  if (initialized) return true;
  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token?.startsWith("phc_") || !host || typeof window === "undefined") return false;
  let excluded = false;
  try {
    // Preserve opt-outs set before the ModelBanter rename.
    excluded = localStorage.getItem("modelbanter.analytics.disabled") === "true" || localStorage.getItem("signalist.analytics.disabled") === "true";
  } catch { return false; }
  if (!analyticsAllowed(location.hostname, process.env.NODE_ENV === "production", excluded)) return false;
  posthog.init(token, {
    api_host: host, autocapture: false, capture_pageview: false, capture_pageleave: false,
    disable_session_recording: true, disable_surveys: true, enable_heatmaps: false,
    advanced_disable_feature_flags: true, person_profiles: "never", cookieless_mode: "always",
    persistence: "memory", disable_external_dependency_loading: true,
    before_send: event => {
      if (!event) return null;
      // Send clean routes, not query strings, hashes, post text, or search terms.
      if (typeof event.properties.$current_url === "string") {
        const url = new URL(event.properties.$current_url);
        event.properties.$current_url = url.origin + url.pathname;
      }
      if (typeof event.properties.$referrer === "string") {
        try { const url = new URL(event.properties.$referrer); event.properties.$referrer = url.origin + url.pathname; } catch { delete event.properties.$referrer; }
      }
      return event;
    },
  });
  initialized = true;
  return true;
}
export function trackUsage(event: UsageEvent, properties: UsageProperties = {}) {
  if (initializeAnalytics()) posthog.capture(event, properties);
}
export function trackPage(pathname: string) {
  if (initializeAnalytics()) posthog.capture("$pageview", { $current_url: `${location.origin}${pathname}`, $pathname: pathname });
}
