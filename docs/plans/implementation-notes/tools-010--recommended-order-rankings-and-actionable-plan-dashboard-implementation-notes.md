# Implementation Notes: Recommended Order Rankings and Actionable Plan Dashboard

**Reviewed:** 2026-09-03  
**Plan:** \x60tools-010--recommended-order-rankings-and-actionable-plan-dashboard.md\x60

## Current implementation anchors

- \x60scripts/docs/plans-recommended-order.ts\x60 currently owns plan discovery, dependency graph construction, scoring and generated output. The main seams are \x60Plan\x60, \x60parsePlan()\x60, \x60loadPlans()\x60, \x60buildDependents()\x60, \x60countTransitiveDependents()\x60, \x60depthOf()\x60, \x60score()\x60, \x60ready()\x60, \x60recommend()\x60 and \x60main()\x60.
- \x60scripts/docs/config.ts\x60 already contains the canonical metadata regexes and vocabularies, including \x60PLAN_TYPE_RE\x60, \x60PLAN_ROADMAP_RE\x60, \x60PRIORITY_WEIGHTS\x60 and \x60EFFORT_PENALTIES\x60. Do not duplicate these values in the recommendation script.
- \x60scripts/docs/plan-metadata.ts\x60 is now the shared plan-header reader/validator. Reuse \x60parsePlanHeader()\x60 rather than adding another Type/Roadmap parser. \x60listRoadmapFiles()\x60 is the existing roadmap source.
- \x60scripts/docs/plans-sync.ts\x60 already validates the metadata contract and filename/domain consistency. The recommendation generator should consume the validated contract, not become a second metadata validator.
- \x60package.json\x60 exposes both \x60pnpm plans:recommended-order\x60 and the broader \x60pnpm docs:sync\x60. The latter runs plan synchronization before documentation generation, so the generated recommendation must remain safe to regenerate independently and as part of docs sync.

## Important current-state discrepancies

- The current recommendation script has its own \x60PRIORITY_WEIGHT\x60 / \x60EFFORT_PENALTY\x60 constants even though \x60config.ts\x60 already exposes the canonical \x60PRIORITY_WEIGHTS\x60 / \x60EFFORT_PENALTIES\x60. Prefer the existing config values while preserving the current numeric formula.
- The current script does **not** parse \x60Type\x60 or \x60Roadmap\x60; this is now possible without changing the metadata contract because tools-009 already added those fields and the shared parser.
- \x60tools-009\x60 is currently \x60verification needed\x60 and has already implemented the metadata/parser infrastructure consumed by this plan. The plan declares \x60Depends on: none\x60, but there is a real implementation dependency on the infrastructure introduced by tools-009. Do not recreate that infrastructure merely because the plan metadata says no dependency.
- There is no current \x60docs/plans/DEPENDENCIES.md\x60 in the repository despite it being listed as an integration point in tools-009. Use the live dependency graph in \x60plans-recommended-order.ts\x60, not that stale/nonexistent document.

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

Keep **readiness boolean/derived**, not manually stored. Do not add a \x60quick-win\x60 or similar metadata field.

Use a small profile configuration for Top 5 rather than five bespoke scoring functions. A profile should define qualification plus relative weights/adjustments over the shared metrics and a stable tie-breaker. Keep the metric calculation itself independent from profile selection.

For **Overall**, preserve the meaning and numeric behaviour of the current \x60score()\x60 as closely as possible. The current formula is:

\x60priority + direct*4 + transitive*10 + depth*2 - effortPenalty\x60

Avoid silently introducing a new readiness bonus here unless the plan explicitly requires it; readiness is already enforced by the execution-order selection step.

For the other profiles, use the existing score/signals as the base and apply only the minimum profile-specific weighting needed to express the requested perspective:

- Roadmap Focus: roadmap presence should be a modest preference, not a hard filter unless explicitly intended.
- Bug Fixes: qualify \x60Type === bug || Type === fix\x60; rank using the same impact/effort/readiness signals.
- Polish: qualify \x60Type === polish\x60.
- Ready Now: qualify \x60Status === planned\x60 and \x60ready === true\x60 first; only then rank by effort/priority/impact.

All Top 5 candidates should be actionable plan candidates, not completed historical plans. Keep the status handling conservative: planned is the normal candidate pool; do not make \x60done\x60 or \x60verification needed\x60 appear as recommendations.

## Execution order must remain separate

Do not feed Top 5 profile scores back into \x60recommend()\x60.

The existing execution algorithm is a dependency-aware greedy ordering:

1. remaining = planned plans;
2. completed = done + verification needed;
3. only dependency-ready candidates enter the current step;
4. candidates are ordered by the existing unlock/depth/priority/effort score;
5. the selected plan becomes completed for the purposes of subsequent readiness.

Preserve this algorithm and its current score semantics. The dashboard is a selection aid; execution order is a prerequisite-respecting schedule.

\x60Initially blocked\x60 should continue to use the same \x60ready()\x60 semantics as execution order so the generated document cannot show contradictory readiness information.

## Plan parsing / legacy handling

The current loader deliberately supports both:

- new domain-local IDs such as \x60tools-010\x60;
- legacy date/global IDs such as \x602026-08-20--177--npc-combat.md\x60.

Keep that behaviour. Legacy plans can still be dependency nodes and therefore need titles in the Mermaid graph.

Do not force legacy plans through the new Type/Roadmap contract. They are already represented with fallback priority/effort values for graph/scoring purposes.

Prefer extracting the new metadata through \x60parsePlanHeader()\x60 while retaining the existing filename/legacy ID discovery logic. Avoid a broad rewrite of plan discovery.

## Mermaid graph

Current output creates nodes using only IDs and creates dependency nodes separately, which is why labels lose context.

Create a deterministic node-id function from the plan ID (the current hyphen-to-underscore approach is sufficient if kept collision-safe). Resolve every node label from \x60byId\x60 when possible:

\x60ID — Title\x60

For dependency-only nodes, \x60byId\x60 already contains the legacy/new plan record because dependency validation runs before graph generation. Unknown dependencies should remain impossible.

Escape Mermaid label content explicitly. At minimum handle quotes, backslashes and line breaks in titles. Do not interpolate raw plan titles into a quoted Mermaid label.

Keep graph generation limited to current plans plus their dependencies as today; do not turn it into a graph of every archived/internal artifact beyond the records already loaded by the current loader.

## Testing / maintainability

The current recommendation script has no repository test file and executes \x60main()\x60 immediately on import. If adding focused unit tests, first extract/export pure helpers and add the same import guard pattern already used by \x60scripts/docs/generate-plan-docs.ts\x60:

\x60if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) { ... }\x60

Useful pure-test targets:

- metadata extraction into the shared metric model;
- readiness;
- profile qualification/ranking;
- deterministic tie-breaking;
- preservation of the current execution score/order;
- Mermaid escaping and labels;
- no completed plans in Top 5;
- Ready Now excludes blocked plans.

Note that the root \x60tsconfig.json\x60 includes \x60src\x60 only, so \x60pnpm type-check\x60 does not type-check \x60scripts/docs/*.ts\x60. Script tests or direct \x60tsx\x60 execution are therefore important for this change; \x60pnpm plans:recommended-order\x60 and \x60pnpm docs:sync\x60 are the relevant integration checks.

## Generated output

\x60docs/plans/RECOMMENDED-ORDER.md\x60 is generated and must not be edited manually.

After implementation, inspect the generated document against the actual current plan set. In particular verify:

- Top 5 sections contain sensible, distinct perspectives;
- Overall remains close to the old ordering semantics;
- Ready Now contains only dependency-ready planned plans;
- execution order still contains every planned plan exactly once;
- Initially Blocked agrees with the execution algorithm;
- Mermaid labels include full titles;
- a second generator run produces no diff.

