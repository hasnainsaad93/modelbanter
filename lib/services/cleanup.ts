export function parseCleanupCutoff(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) throw new Error("Cutoff must be an explicit UTC timestamp, for example 2026-10-01T00:00:00Z.");
  const date = new Date(value);
  if (!Number.isFinite(+date) || date.toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")) throw new Error("Cutoff is not a valid UTC date.");
  if (+date > Date.now()) throw new Error("Cutoff cannot be in the future.");
  return date;
}
