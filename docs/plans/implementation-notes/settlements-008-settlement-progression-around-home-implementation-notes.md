# Implementation notes: Settlement progression around home

Plan: `docs/plans/settlements-008-settlement-progression-around-home.md`

## Current seams to reuse

- `src/settlement/settlementGenerator.ts` is already plan-first: `resolveSettlementContext()` → `chooseSettlementSite()` → `resolveVillageIdentity()` → families → `VillagePlan`. Keep one generation path; progression should only supply an effective minimum normal size before site search.
- `resolveSettlementContext()` currently rolls `provisionalSize` once from cell-center terrain. `chooseSettlementSite()` then uses `villageSizeConfig(provisionalSize)` for footprint-aware suitability. Therefore the minimum tier must be applied **before** `chooseSettlementSite()`, not after a site/plan exists.
- `src/settlement/settlementPlanCache.ts` is the single world-scoped `SettlementDef` cache used by `SettlementsManager`, roads and other lookups. It is the correct place to memoize the resolved near/far progression targets once per world. Do not add a second `SettlementDef` cache.
- `findSettlementSite()` already performs the required bounded seeded site feasibility work, including footprint dryness and river-channel rejection. Reuse it; do not add a parallel terrain suitability algorithm.
- `VillageSize` ordering is not encoded today. Add one small normal-tier helper/order for `SM < MD < LG < XL`; `OUTPOST` must stay outside this ordering.

## Recommended shape

Keep target selection separate from full settlement generation.

A small pure settlement-generation helper/module may resolve a plain result such as:

```ts
type SettlementProgressionPolicy = {
  minimumFor(cell: SettlementCell): RolledVillageSize | null
}
```

Resolve it lazily once per world from the same generation inputs already owned by `SettlementResolveContext` plus the registered river query, then keep it beside `defCache` in `settlementPlanCache.ts`. `clearSettlementDefCache()` must clear this derived policy too.

`settlementDefFor()` should pass only the selected cell's minimum tier into the existing generator. Do not make `generateSettlementDef()` scan the near/far rings on every invocation.

A minimal generator change is an optional effective minimum-size input to `generateSettlementCore()` / public wrappers. Normal cells receive none and preserve today's path exactly.

## Home size rule

Current `homeSize: 'auto'` uses unrestricted `rollVillageSize()` and can therefore produce `LG`/`XL`; the plan's `SM | MD` home guarantee is **not implemented yet**.

For auto home, keep the existing roll/RNG and clamp the result to at most `MD` (`SM → SM`, `MD/LG/XL → MD`). This avoids introducing a new random stream.

The plan scopes progression to default `homeSize: auto`. An explicit `WorldConfig.settlements.homeSize` should remain authoritative and should not be silently rewritten; do not invent additional near/far behavior for explicit overrides unless the plan is changed.

## Target selection and feasibility

Use Chebyshev distance from `{ gx: 0, gz: 0 }`, matching the settlement grid helpers:

- near candidates: distance 1–2;
- far candidates: distance 3–5.

Order candidates with a dedicated deterministic hash/seed salt per ring. Do not consume/change the existing `cellSeed()`, naming, family, resource or layout RNG streams.

For each candidate:

1. calculate its ordinary terrain roll;
2. clamp that roll upward to the ring minimum (`MD`/`LG`), preserving a naturally rolled larger tier such as `XL`;
3. run the existing resource/context + `findSettlementSite()` feasibility path using that effective footprint;
4. reject `null` sites;
5. reject a candidate that would become an `OUTPOST` under the existing final-site terrain/resource/outpost predicate;
6. select the first feasible candidate in seeded order.

The outpost check is important: today `resolveVillageIdentity()` can replace any non-home `provisionalSize` with `OUTPOST` after site selection. Simply raising `provisionalSize` does **not** satisfy the plan's “target cannot be outpost” rule. Prefer factoring/reusing the existing outpost predicate for the probe rather than disabling outposts globally or adding a target-only identity path.

The feasibility probe may reuse `resolveSettlementContext()` / `chooseSettlementSite()` after a small refactor, but it must stop before families, profession staffing, `planVillageLayout()`, clearings and props. Do not probe candidates by calling `settlementDefFor()` or `generateSettlementDef()` recursively.

## Determinism / compatibility

- Progression state is derived worldgen data; no `SaveData` field or migration.
- Candidate ordering must depend only on stable generation inputs and dedicated salts, never streaming/load order.
- The winning cell keeps its existing `cellKey`, `cellSeed`, center offset, naming seed and layout seed.
- Applying a larger minimum may legitimately change that cell's chosen site because footprint-aware scoring changes. That is an intended consequence of changing `provisionalSize`; unrelated cells must remain byte-for-byte on their existing generation path.
- Keep the current canonical river query ownership in `settlementPlanCache.ts`; a feasibility pass must use the same river geometry as final generation or it can select a target that later fails/moves.

## Tests

Extend `src/settlement/settlementGenerator.test.ts` and add a focused policy test file if that keeps fixtures smaller.

High-value cases only:

- auto home is always `SM`/`MD`; explicit `SM/MD/LG/XL` still wins unchanged;
- same seed resolves identical near/far target cells regardless of lookup order;
- near minimum follows auto home (`SM → MD`, `MD → LG`), far minimum is `LG`;
- natural `XL` roll survives a lower minimum;
- wet/unfit first candidate advances to the next candidate;
- a candidate that would resolve to `OUTPOST` is skipped;
- non-target cells still equal the old ordinary `rollVillageSize()` path;
- clearing the settlement cache also clears progression-policy memoization.

Avoid broad snapshot tests of complete `VillagePlan`s for many seeds; test target identity/minimum separately, then a few integration cases through the canonical generator/cache seam.

## Guardrails

- No new settlement generator, runtime correction or persisted target list.
- No full `VillagePlan` generation during target search.
- No target discovery through `SettlementsManager.peekDef()` / `settlementDefFor()` recursion.
- No `Math.random()` and no reuse of existing RNG streams for candidate ranking.
- Do not change settlement ids, grid spacing, streaming or road ownership.
- Manual browser verification remains with the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**