import { parseCleanupCutoff } from "./cleanup";

export function collectionStart(value = process.env.COLLECTION_START_AT) {
  return value ? parseCleanupCutoff(value) : null;
}

export function recentSearchStart(start: Date, now = new Date()) {
  // Keep a small margin inside X's moving seven-day boundary.
  return new Date(Math.max(+start, +now - 7 * 86400000 + 30000)).toISOString();
}
