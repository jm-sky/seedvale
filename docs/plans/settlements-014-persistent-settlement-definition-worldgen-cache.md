# Plan: Persistent settlement definition worldgen cache

**Created:** 2026-09-14
**Status:** `verification needed` 🔍 (implemented 2026-09-16 — browser checks are User-owned)
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-009~~, ~~settlements-011~~, ~~settlements-012~~, ~~settlements-013~~
**Domain:** `settlements`
**Subdomains:** `development` `resources`
**Tags:** `worldgen` `cache` `settlement` `performance`
**Roadmap:** -
**Model:** Opus, Sonnet
**Implemented at:** 2026-09-16 15:53

## Goal

Persist deterministic `SettlementDef` / `VillagePlan` results per seed so reloads, rebuilds and independent saves using the same seed can reuse settlement generation work.

`settlementPlanCache.ts` remains the single runtime owner. Persistent storage only hydrates its existing `defCache`; `generateSettlementDef()` remains the canonical fallback.

## Recon

- `src/settlement/settlementPlanCache.ts` owns `Map<string, SettlementDef | null>` and is shared by `SettlementsManager` and `RoadNetwork`.
- A miss runs `generateSettlementDef()`, including resource scans, terrain classification, river-aware site search, `findSettlementSite`, `planVillageLayout`, family/profession generation, paths/entrances/landmarks and naming.
- `clearSettlementDefCache()` clears defs plus world-scoped river/progression context on rebuild.
- `docs/state/persistence.md` classifies settlement generation as deterministic reconstruction and the current memoization as derived cache.
- Reuse `src/persistence/worldgenCacheDb.ts`; do not add a new DB/store or `SaveData` field.

## Cache contract

Add a settlement-owned adapter near `settlementPlanCache.ts`, e.g. `settlementWorldgenCache.ts`.

Namespace: `settlement-definitions` with explicit version.

Sub-key: `cell:<gx>:<gz>`.

Payload: existing `SettlementDef | null`. Cached `null` is intentional for cells that deterministically produce no settlement.

Do not create a second reduced `VillagePlan` representation unless structured-clone incompatibility is proven.

## Fingerprint

Fingerprint deterministic inputs that can change generation besides seed/cell:

- terrain/raw generation config affecting height and terrain samplers;
- `waterLevel`, `heightScale`, `region`, `localSearchRadius`;
- `homeSize`;
- progression-policy identity / selected minimum-size cells;
- river-generation/config identity used by canonical `RiverQuery`.

Algorithm changes with unchanged config bump the namespace version. Old records are misses, never migrated.

Do not include economy, household, NPC, quest, discovery or player state.

## Integration

Extend the existing `settlementPlanCache`; do not bypass it.

Required lifecycle:

1. activate for current seed + fingerprint;
2. rebuild/new seed invalidates previous activation;
3. hydrate into the same `defCache` used by `settlementDefFor()`;
4. a value generated while hydrate is in flight wins over older hydrated data;
5. miss/failure runs normal `generateSettlementDef()`;
6. generated result enters runtime cache immediately and is queued for async persistent upsert.

Because `settlementDefFor()` is synchronous, keep synchronous lookup after hydrate. Reuse the hydrate-on-activate/debounced-write pattern from `locationsCoarseCache.ts` / `abandonedCemeteryCache.ts`.

During implementation preflight inspect `createWorldBundle` ordering. Start hydration at the earliest point where complete fingerprint/river identity is known. If the existing async build can await one small best-effort hydration before first home lookup, prefer it; otherwise early misses regenerate normally.

Use `putCacheRecords()` and bounded `enforceCacheCap()`. Never pre-generate cells to warm cache.

## Progression invariant

Persistent hits must not bypass `resolveSettlementProgressionPolicy()`. Ensure resolved deterministic policy identity participates in the fingerprint before reading a cached cell.

## Non-goals

- Persisting runtime settlement props, economy, households or NPC state.
- Moving settlement generation to a worker.
- Pre-generating the settlement grid.
- Replacing `settlementPlanCache` with another authority.
- Sharing mutable state between saves using one seed.

## Tests

Cover:

1. `SettlementDef`/nested `VillagePlan` round-trip;
2. cached `null`;
3. same seed/fingerprint/cell hit avoids generation;
4. different seed/fingerprint/version miss;
5. in-flight hydrate cannot overwrite newly generated result;
6. rebuild cannot leak previous-world defs;
7. progression-policy change invalidates relevant records;
8. persistence failure falls back to generation;
9. eviction affects performance only.

## Verification

Run automated checks:

```text
pnpm test
pnpm typecheck
pnpm build
```

Browser verification is done by the user.

Update `docs/state/persistence.md` and `docs/state/settlements.md` after implementation. Add useful JSDoc `@domain settlements` / `@system worldgen-cache` tags on important cache lifecycle seams.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
