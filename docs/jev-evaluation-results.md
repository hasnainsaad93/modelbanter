# Jev classification evaluation results

The v3 candidate improves agreement with the draft references for overall sentiment, cost, and coding on reserved examples. It does not improve every decision. These references were annotated by the assistant and still need independent human review; the numbers below are agreement with those drafts, not measured production accuracy.

## What was evaluated

- 156 distinct stored posts across 13 enabled models, selected from a local snapshot using read-only queries.
- 107 development examples and 49 reserved examples after grouping conversations to prevent leakage.
- 32 behavioral examples, including the known Sonnet and Opus coding-stack post for each target.
- Frozen v2 baseline and v3 candidate, both using `jev-1.13.0` and identical stored text.
- Candidate prompts were frozen before reading reserved examples. No tuning was performed on reserved results.
- No X requests, database writes, schema migrations, or historical reclassification.

## Reserved example results

Numbers are matching labels / judged references. Ambiguous (`null`) references are excluded. Category labels are judged only where the reference establishes target relevance. Raw agreement includes NOT_DISCUSSED, so the discussion counts below are also necessary.

| Question | Baseline | Candidate |
| --- | --- | --- |
| Model relevance | 47 / 49 | 47 / 49 |
| Overall | 26 / 40 | 29 / 40 |
| Reasoning | 42 / 46 | 42 / 46 |
| Speed | 45 / 47 | 45 / 47 |
| Cost | 42 / 46 | 43 / 46 |
| Coding | 35 / 43 | 38 / 43 |

At the unchanged 0.3 cutoff, the baseline accepted none of the eight coding-discussion references in the reserved sample. The candidate included four of those eight, plus one reference marked as not discussing coding. Three of its five accepted, judgeable coding labels matched the draft labels. A further ambiguous coding reference was accepted and is tracked separately. This is improved coverage with remaining false inclusions, not evidence that coding classification is solved.

Overall exact label agreement rose from 26/40 to 29/40. Among accepted, judgeable overall decisions, agreement rose from 24/33 to 26/33. The candidate also accepted six ambiguous overall references versus five for the baseline. Missing-context handling remains Phase 3 work.

## Development results

These examples were used to tune the rules, so their scores are not independent validation.

| Question | Baseline | Candidate |
| --- | --- | --- |
| Model relevance | 104 / 107 | 102 / 107 |
| Overall | 75 / 98 | 81 / 98 |
| Reasoning | 95 / 105 | 97 / 105 |
| Speed | 101 / 105 | 104 / 105 |
| Cost | 86 / 103 | 93 / 103 |
| Coding | 86 / 105 | 94 / 105 |

Relevance agreement declined on development examples, despite gains in sentiment questions. This is a regression to review rather than hide. The broad first candidate also invented too many reasoning/coding discussions; tighter boundaries reduced that problem before the reserved run.

## Behavioral checks

The final candidate matched all 32 relevance references and all 30 applicable references for each sentiment question. These controlled examples overlap the kinds of examples given in the rules and should be treated as regression checks, not an independent estimate of real-world quality.

The known post beginning “sonnet 5.5 + opus 5.5 is an insane coding stack” returned POSITIVE for coding, with 0.99 confidence, for both Opus and Sonnet. These were actual API responses; they were not database updates.

## Remaining errors

- A comparison between a person using Fable and a person using Haiku incorrectly gained reasoning and coding judgments for Haiku (`real-018`).
- A clear free-access/value endorsement of Sonnet was excluded from cost (`real-039`).
- A generated forecast attributed to DeepSeek was treated as overall NOT_DISCUSSED instead of factual NEUTRAL (`real-069`).
- Praise for Astra building Sol was transferred to Sol overall (`real-099`).
- An explicitly named Luna model was marked relevance UNCLEAR (`real-123`).

These reserved examples have now been inspected. Any further prompt tuning against them would make them development data; create a fresh reserved sample for the next iteration.

## Threshold decision

Keep MIN_CONFIDENCE at 0.3. The report includes 0.3–0.7 sweeps per question; sentiment curves hold relevance at 0.3. The small number of positive category references and provisional labels do not support reliable per-category calibration. Higher confidence can still accompany wrong decisions, and raising a cutoff alone can discard useful evidence.

## Usage and reproducibility

All development iterations, behavioral checks, and reserved comparisons produced 616 recorded successful analyses using 2,060,493 input tokens. At the published $0.042 per million input tokens, the estimate is $0.0865 (about nine cents). This is not an invoice and excludes any unrecorded failed/retried requests.

Final comparison reports are stored under `work/jev-evaluation/development-v1`, `work/jev-evaluation/behavioral`, and `work/jev-evaluation/holdout`. Raw files are gitignored. The tracked aggregate report is `tests/fixtures/jev-evaluation-report.json`; it includes request/dataset hashes, threshold curves, confusion counts, and representative/challenge strata.

Run `npx tsx scripts/render-jev-review.ts` to create `work/jev-evaluation/reference-review.html`. The form is local, makes no network requests, and lets a person edit labels and export reviewed JSON. Editing a label clears that case's review status until explicitly marked reviewed again.

## Deployment scope

The revised code is ready for local review and debug calls. Production has not been deployed or reclassified. Human review of the reference sample remains outstanding; it is not silently replaced by assistant annotation. Existing v2 data keeps its old results. History storage, missing-context retrieval, explicit uncertainty labels, and bulk reclassification are outside Phases 1 and 2.

See the [classification guide](jev-classification-guide.md) for rules and commands. Pricing and version behavior were checked against [TypeSafe model documentation](https://docs.typesafe.ai/models).
