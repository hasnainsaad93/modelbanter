import { describe, expect, it } from "vitest";
import { models, summary } from "../lib/demo-data";
describe("analytics fixtures", () => { it("keeps sentiment distribution internally consistent", () => { expect(summary.positive + summary.negative + summary.neutral).toBe(summary.total); expect(models.every((model) => model.positive + model.negative + model.neutral === model.mentions)).toBe(true); }); });
