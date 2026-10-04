import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { analyzeWithJev } = await import("../lib/services/jev");
const cases = [
  { text: "Kimi K3 writes excellent code, but it is slow and expensive.", model: "Kimi K3", expected: { overall: "MIXED", code_quality: "POSITIVE", speed: "NEGATIVE", cost: "NEGATIVE", reasoning: "NOT_DISCUSSED" } },
  { text: "Kimi K3 is excellent. Claude Opus is terrible.", model: "Kimi K3", expected: { overall: "POSITIVE" } },
  { text: "Kimi K3 is excellent. Claude Opus is terrible.", model: "Claude Opus", expected: { overall: "NEGATIVE" } },
  { text: "Kimi K3 was released today.", model: "Kimi K3", expected: { overall: "NEUTRAL", speed: "NOT_DISCUSSED" } },
];
let failures = 0;
for (const item of cases) {
  const result = await analyzeWithJev(item.text, item.model);
  const actual = { overall: result.overall.choice, ...Object.fromEntries(Object.entries(result.categories).map(([key, value]) => [key, value.choice])) };
  const passed = Object.entries(item.expected).every(([key, value]) => actual[key as keyof typeof actual] === value);
  console.log(JSON.stringify({ model: item.model, passed, expected: item.expected, actual, relevance: result.relevance.choice }));
  if (!passed) failures++;
}
if (failures) process.exitCode = 1;
