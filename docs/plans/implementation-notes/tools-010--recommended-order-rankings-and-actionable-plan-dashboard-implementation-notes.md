# Implementation Notes: Recommended Order Rankings and Actionable Plan Dashboard

**Reviewed:** 2026-09-03  
**Plan:** `tools-010--recommended-order-rankings-and-actionable-plan-dashboard.md`

## Current implementation anchors

- `scripts/docs/plans-recommended-order.ts` currently owns plan discovery, dependency graph construction, scoring and generated output. The main seams are `Plan`, `parsePlan()`, `loadPlans()`, `buildDependents()`, `countTransitiveDependents()`, `depthOf()`, `score()`, `ready()`, `recommend()` and `main()`.
- `scripts/docs/config.ts` already contains the canonical metadata regexes and vocabularies, including `PLAN_TYPE_RE`, `PLAN_ROADMAP_RE`, `PRIORITY_WEIGHTS` and `EFFORT_PENALTIES`. Do not duplicate these values in the recommendation script.
- `scripts/docs/plan-metadata.ts` is now the shared plan-header reader/validator. Reuse `parsePlanHeader()` rather than adding another Type/Roadmap parser. `listRoadmapFiles()` is the existing roadmap source.
- `scripts/docs/plans-sync.ts` already validates the metadata contract and filename/domain consistency. The recommendation generator should consume the validated contract, not become a second metadata validator.
- `package.json` exposes both `pnpm plans:recommended-order` and the broader `pnpm docs:sync`. The latter runs plan synchronization before documentation generation, so the generated recommendation must remain safe to regenerate independently and as part of docs sync.

## Important current-state discrepancies

- The current recommendation script has its own `PRIORITY_WEIGHT` / `EFFORT_PENALTY` constants even though `config.ts` already exposes the canonical `PRIORITY_WEIGHTS` / `EFFORT_PENALTIES`. Prefer the existing config values while preserving the current numeric formula.
- The current script does **not** parse `Type` or `Roadmap`; this is now possible without changing the metadata contract because tools-009 already added those fields and the shared parser.
- `tools-009` is currently `verification needed` and has already implemented the metadata/parser infrastructure consumed by this plan. The plan declares `Depends on: none`, but there is a real implementation dependency on the infrastructure introduced by tools-009. Do not recreate that infrastructure merely because the plan metadata says no dependency.
- There is no current `docs/plans/DEPENDENCIES.md` in the repository despite it being listed as an integration point in tools-009. Use the live dependency graph in `plans-recommended-order.ts`, not that stale/nonexistent document.

## Ranking architecture

Build one derived metric object per plan after the dependency graph is available. It should contain the existing structural signals at minimum:

- priority weight;
- effort penalty;
- direct dependent count;
- transitive dependent count;
- dependency depth;
- readiness;
- Type;
- Roadmap presence/value.

Keep **readiness boolean/derived**, not manually stored. Do not add a `quick-win` or similar metadata field.

Use a small profile configuration for Top 5 rather than five bespoke scoring functions. A profile should define qualification plus relative weights/adjustments over the shared metrics and a stable tie-breaker. Keep the metric calculation itself independent from profile selection.

For **Overall**, preserve the meaning and numeric behaviour of the current `score()` as closely as possible. The current formula is:

`priority + direct*4 + transitive*10 + depth*2 - effortPenalty`

Avoid silently introducing a new readiness bonus here unless the plan explicitly requires it; readiness is already enforced by the execution-order selection step.

For the other profiles, use the existing score/signals as the base and apply only the minimum profile-specific weighting needed to express the requested perspective:

- Roadmap Focus: roadmap presence should be a modest preference, not a hard filter unless explicitly intended.
- Bug Fixes: qualify `Type === bug || Type === fix`; rank using the same impact/effort/readiness signals.
- Polish: qualify `Type === polish`.
- Ready Now: qualify `Status === planned` and `ready === true` first; only then rank by effort/priority/impact.

All Top 5 candidates should be actionable plan candidates, not completed historical plans. Keep the status handling conservative: planned is the normal candidate pool; do not make `done` or `verification needed` appear as recommendations.

## Execution order must remain separate

Do not feed Top 5 profile scores back into `recommend()`.

The existing execution algorithm is a dependency-aware greedy ordering:

1. remaining = planned plans;
2. completed = done + verification needed;
3. only dependency-ready candidates enter the current step;
4. candidates are ordered by the existing unlock/depth/priority/effort score;
5. the selected plan becomes completed for the purposes of subsequent readiness.

Preserve this algorithm and its current score semantics. The dashboard is a selection aid; execution order is a prerequisite-respecting schedule.

`Initially blocked` should continue to use the same `ready()` semantics as execution order so the generated document cannot show contradictory readiness information.

## Plan parsing / legacy handling

The current loader deliberately supports both:

- new domain-local IDs such as `tools-010`;
- legacy date/global IDs such as `2026-08-20--177--npc-combat.md`.

Keep that behaviour. Legacy plans can still be dependency nodes and therefore need titles in the Mermaid graph.

Do not force legacy plans through the new Type/Roadmap contract. They are already represented with fallback priority/effort values for graph/scoring purposes.

Prefer extracting the new metadata through `parsePlanHeader()` while retaining the existing filename/legacy ID discovery logic. Avoid a broad rewrite of plan discovery.

## Mermaid graph

Current output creates nodes using only IDs and creates dependency nodes separately, which is why labels lose context.

Create a deterministic node-id function from the plan ID (the current hyphen-to-underscore approach is sufficient if kept collision-safe). Resolve every node label from `byId` when possible:

`ID — Title`

For dependency-only nodes, `byId` already contains the legacy/new plan record because dependency validation runs before graph generation. Unknown dependencies should remain impossible.

Escape Mermaid label content explicitly. At minimum handle quotes, backslashes and line breaks in titles. Do not interpolate raw plan titles into a quoted Mermaid label.

Keep graph generation limited to current plans plus their dependencies as today; do not turn it into a graph of every archived/internal artifact beyond the records already loaded by the current loader.

## Testing / maintainability

The current recommendation script has no repository test file and executes `main()` immediately on import. If adding focused unit tests, first extract/export pure helpers and add the same import guard pattern already used by `scripts/docs/generate-plan-docs.ts`:

`if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) { ... }`

Useful pure-test targets:

- metadata extraction into the shared metric model;
- readiness;
- profile qualification/ranking;
- deterministic tie-breaking;
- preservation of the current execution score/order;
- Mermaid escaping and labels;
- no completed plans in Top 5;
- Ready Now excludes blocked plans.

Note that the root `tsconfig.json` includes `src` only, so `pnpm type-check` does not type-check `scripts/docs/*.ts`. Script tests or direct `tsx` execution are therefore important for this change; `pnpm plans:recommended-order` and `pnpm docs:sync` are the relevant integration checks.

## Generated output

`docs/plans/RECOMMENDED-ORDER.md` is generated and must not be edited manually.

After implementation, inspect the generated document against the actual current plan set. In particular verify:

- Top 5 sections contain sensible, distinct perspectives;
- Overall remains close to the old ordering semantics;
- Ready Now contains only dependency-ready planned plans;
- execution order still contains every planned plan exactly once;
- Initially Blocked agrees with the execution algorithm;
- Mermaid labels include full titles;
- a second generator run produces no diff.

