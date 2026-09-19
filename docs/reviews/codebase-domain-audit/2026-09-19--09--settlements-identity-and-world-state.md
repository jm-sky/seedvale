# Codebase domain audit 09: Settlements — identity & world state

**Date:** 2026-09-19  
**Area:** Settlements — identity & world state  
**Baseline:** current `main` during review (HEAD `f5f93b13b476b2572b729563a309967f551f70b7`; concurrent docs commits landed during the review, so key source files were re-read from the final baseline).  
**Result:** ⚠️ reviewed with unresolved high findings

## 1. Scope

Reviewed settlement identity and authoritative-state continuity centered on:

- `src/settlement/settlementPlanCache.ts`,
- `src/settlement/settlementGenerator.ts`,
- `src/shared/SettlementName.ts`,
- `src/settlement/SettlementsManager.ts`,
- `src/settlement/createSettlement.ts`,
- `src/settlement/foundedSettlement.ts`,
- `src/settlement/foundedSettlementBootstrap.ts`,
- `src/settlement/settlementWorldgenCache.ts`,
- `src/persistence/saveData.ts`,
- `src/app/saveState.ts`,
- `src/app/worldBundle.ts`,
- current settlement state docs,
- active founded-settlement plans `settlements-003`, `020`, `021`, `022`,
- procedural-name plan `settlements-017`.

The traced flows were:

```text
procedural cell
→ shared settlement plan cache
→ deterministic SettlementDef / identity / name
→ SettlementsManager entry
→ live Settlement runtime
→ unload
→ registry-owned state survives
→ reload / WorldBundle rebuild

expedition arrival
→ founded bootstrap transaction
→ FoundedSettlementRecord + residency
→ economy / households / physical tents
→ save / rebuild snapshot
→ future founded live runtime
```

## 2. Entry points and state owners

### Procedural settlement definition

`settlementPlanCache.ts` is the runtime authority for procedural `SettlementDef` data. IDs are derived from grid identity as `${gx}_${gz}`; home is the explicit `(0,0)` cell. The optional IndexedDB settlement-definition cache only hydrates that same runtime cache.

Hydration does not overwrite a definition already computed in the current realm: `ingestHydratedSettlementDef()` returns when `defCache.has(key)`. Cache validation also requires `def.id === `${gx}_${gz}`` and the home flag to match `gx === 0 && gz === 0`.

### Procedural naming

The current `settlementPlanCache.ts::uniqueNameFor()` computes names against a deterministic predecessor order, not stream/query order. It uses `pickUniqueSettlementName()` and memoizes the resolved result. This is the implementation of `settlements-017`; its plan is currently `verification needed`.

### Live procedural runtime

`SettlementsManager` owns streaming entries keyed by settlement id. An entry contains the stable `SettlementDef`, optional live `Settlement`, and optional pending async load. Three.js/NPC runtime is therefore a projection of the definition plus registry-owned mutable state, not the owner of identity.

Economy, households, NPC authoritative state, relationships, livestock/rats, structure state and founded-settlement state live in manager-lifetime registries rather than in the transient `Settlement` object.

### Founded settlement authority

`FoundedSettlementRegistry` owns the persisted fact that a nonprocedural settlement exists plus the explicit `NpcId -> settlementId` residency override.

Founded ids are deterministic and namespaced:

```text
settlement:founded:<siteId>
```

This cannot collide with procedural `${gx}_${gz}` ids under the current formats.

Physical tents, households, economy and NPC state remain owned by their existing registries. The founded record intentionally does not duplicate these states.

## 3. Flows traced

### Procedural generation → runtime

```text
cell
→ settlementDefFor()
→ uniqueNameFor()
→ generateSettlementDef()
→ defCache
→ SettlementsManager.ensureLoaded()
→ createSettlement(def, economy, deps)
→ live Settlement
```

The home settlement uses the same constructor path but is permanently retained. Neighbor settlements use distance-based streaming.

### Procedural unload / reload

On unload, the manager captures the mutable state that is explicitly owned outside the live runtime, performs NPC/transport handoff, disposes the live settlement and removes the entry. Re-entry resolves the same `SettlementDef` and reconstructs runtime against the same manager-lifetime registries.

This is the correct ownership direction: the live `Settlement` is not the authoritative persistence object.

### Settlement-definition persistence

`settlementWorldgenCache.ts` persists generated definitions as a performance cache, not as mutable simulation state. Fingerprinting/versioning controls invalidation. Runtime-computed definitions win over late hydration.

No code path was found where this cache writes household/economy/NPC/founded changes back into procedural generation or overwrites them.

### Founded bootstrap → save/rebuild

`bootstrapFoundedSettlement()` currently creates:

- a stable `FoundedSettlementRecord`,
- residency overrides,
- a founded economy,
- one household per founder,
- stable physical tent ids,
- cleared expedition travel state.

`snapshotFoundedSettlements()` is written into `SaveData.foundedSettlements` and is also carried through `WorldBundle` rebuild seeding.

## 4. Findings

### F1 — high — existing founded bootstrap can mint missing authoritative shelter state

**Affected flow:** founded settlement restore/reconciliation → physical home state.

**Evidence:**

In `foundedSettlementBootstrap.ts`, when a founded record already exists, the function iterates its residents and checks each stable tent id. If a tent is missing, it calls:

```text
placedTents.place(existing.x, existing.z, 0, nowDays,
  { id: tentId, condition: 100 })
```

No inventory instance is consumed and no persisted physical tent state is available to justify condition/position/yaw.

The same path then recreates/repairs residency, household binding and economy and returns ordinary `existing`.

**Why wrong:** a missing persisted physical object is an authority/integrity failure, not a safe derived binding. Reconstruction can fabricate a perfect tent and hide loss/corruption of persisted state.

**Owner:** settlements / founded bootstrap.

**Existing plan:** `settlements-020-founded-settlement-bootstrap-integrity.md` explicitly covers this exact defect, including an inconsistency result, stable-home semantics and legacy migration.

**Next action:** implement `settlements-020`; do not create a second recovery mechanism.

### F2 — high — founded residency override is not yet enforced by procedural resident materialization

**Affected flow:** founded NPC residency → procedural settlement reload/materialization.

**Evidence:**

`FoundedSettlementRegistry` persists an explicit residency override and `SettlementsManager.residencySettlementId(npcId)` exposes it.

The current procedural `createSettlement()` resident path is still driven by the procedural `SettlementDef` family/member definitions. It does not yet use the founded residency override to suppress a resident whose semantic home moved to a founded settlement.

The current implementation notes for `settlements-021` identify this same seam and require a narrow residency lookup/predicate in the procedural resident path.

**Why wrong:** authoritative residency and runtime materialization can disagree. After founding, reconstruction of the source procedural settlement can rematerialize an NPC that the persisted residency map says belongs to the founded settlement. Once founded live runtime is added, this would become a direct one-live-agent identity violation unless fixed first.

**Owner:** settlements resident materialization.

**Existing plan:** `settlements-021-shared-settlement-resident-runtime.md` covers the fix and intentionally depends on `settlements-020`.

**Next action:** implement `settlements-021` after `020`; residency must gate presentation/materialization, not become a second NPC-state store.

### F3 — high — persisted founded settlements are not yet part of the loaded-settlement lifecycle

**Affected flow:** founded authoritative state → runtime creation / unload / reload / consumers.

**Evidence:**

`SettlementsManager` stores founded records and exposes list/get/snapshot/bootstrap APIs, but its live `entries` map and `ensureLoaded()` currently accept procedural `SettlementDef` only.

The streaming `recheck()` discovers procedural cells via `cellsWithinRadius()` and `defFor(cell)`; it does not scan founded records. `getLoaded()` and consumers therefore only see procedural live settlements.

A founded settlement can consequently have real persisted record/economy/households/residency without a corresponding loaded runtime when the player is nearby.

**Why wrong:** the authoritative world says the settlement exists, while the live settlement lifecycle has no representation for it. This is an incomplete implementation boundary rather than evidence that the founded registry itself should become a runtime object.

**Owner:** settlements streaming/runtime composition.

**Existing plan:** `settlements-022-founded-settlement-live-runtime-and-streaming.md` covers a common source/lifecycle, founded runtime adapter, world-space streaming and consumer audit. It correctly forbids synthetic `SettlementDef` generation.

**Next action:** implement `settlements-022` after `021`.

### F4 — medium — pending procedural settlement loads ignore stream-out intent

**Affected flow:** asynchronous settlement load → player leaves radius → completion.

**Evidence:**

`ensureLoaded()` immediately inserts an entry and starts an async `waitForChunks(...).then(createSettlement(...))` pipeline.

During `recheck()`, unload explicitly skips every entry with `pendingPromise`:

```text
if (entry.def.isHome || entry.pendingPromise) continue
```

Therefore leaving the unload radius while a build is pending does not mark the load unwanted. If the entry still exists at completion, the built runtime is published and `onSettlementAvailable` fires. It is only eligible for unload on a later recheck.

**Why wrong:** observer movement can cause temporary materialization of an out-of-range settlement and unnecessary NPC/render work. The lifecycle lacks an explicit desired-load/generation token.

**Owner:** settlements streaming lifecycle.

**Existing plan:** `settlements-022` already calls this out and requires shared race-safe desired-load semantics for both procedural and founded sources.

**Next action:** fix in the shared lifecycle while implementing `022`, not as a founded-only special case.

## 5. Architecture observations

### Procedural IDs and home identity are currently stable

Procedural settlement id is cell-derived, and cache validation enforces the same id/cell pairing. Home is explicitly tied to `(0,0)`; the manager always resolves and permanently retains that source.

No path was found where a runtime `Settlement` object mints or replaces procedural identity.

### Procedural duplicate-name bug is already implemented, pending manual verification

The old single-candidate naming approach allowed two settlements to receive the same display name. Current `uniqueNameFor()` resolves against a deterministic predecessor set and is independent of streaming order.

`settlements-017` is therefore not a new finding from this audit; its implementation is present and the plan is `verification needed`.

### Founded display identity is intentionally incomplete

`FoundedSettlementRecord` has stable id/site/center/sponsor/resident identity but no user-facing display name. This does not currently cause a duplicate-name runtime bug because founded settlements are not yet presented through the common loaded settlement UI.

`settlements-022` already requires a stable founded display identity and explicitly rejects using `siteId` as an automatic user-facing name or generating a random name per load.

### Procedural worldgen cache is not settlement simulation persistence

The IndexedDB settlement-definition cache stores deterministic generated definitions. Mutable settlement state stays in dedicated registries/save fields. This separation is important: procedural generation should not be modified to absorb player/founded changes.

Late cache hydration also does not replace an already computed current-session def, which avoids a second source of truth during asynchronous startup.

### Save validation is structural, while semantic consistency is domain-owned

`saveData.ts` verifies the shape of founded records/residency but does not prove map-key/id/site consistency or that every residency target has a matching record. The application's own serializer produces coherent data, so this audit does not classify that alone as a confirmed persistence defect.

Semantic founded-state reconciliation belongs at the founded bootstrap/restore boundary; `settlements-020` is already the focused owner for those consistency checks.

## 6. Cross-domain dependencies / follow-ups

- **Persistence audit (area 03):** verify the complete `SaveData.foundedSettlements` restore/migration boundary and behavior on malformed/cross-version data.
- **NPC movement/work audits (areas 12/13):** after `021/022`, verify residents use founded capabilities/anchors without assuming procedural houses, stockpile or workplace landmarks.
- **UI ↔ simulation audit (area 23):** after common loaded-runtime work, verify Villagers/minimap/debug consumers use common identity/capabilities rather than procedural-only fields.
- **Economy/logistics audit (area 11):** founded economy may exist before physical storage; do not infer a stockpile endpoint from economy presence alone.
- **Performance audit (area 24):** `022`'s planned founded scan should remain on the existing throttled settlement recheck, not per frame.

## 7. Existing plans that already cover findings

- `settlements-017-deterministically-unique-settlement-names.md` — implemented; browser verification pending.
- `settlements-020-founded-settlement-bootstrap-integrity.md` — F1 and founded-state consistency.
- `settlements-021-shared-settlement-resident-runtime.md` — F2 and one-live-resident/materialization ownership.
- `settlements-022-founded-settlement-live-runtime-and-streaming.md` — F3/F4, common runtime lifecycle, founded display identity, consumer integration.
- `settlements-003-colony-bootstrap.md` — parent feature series; currently still `in progress`.

## 8. New plans required

None.

All confirmed findings in this audit are already owned by active/planned settlement work. Creating another plan would duplicate the founded-settlement series.

## 9. Verification limits

This was a static code/documentation review of current `main`.

No browser/gameplay verification was performed. In particular, `settlements-017` remains `verification needed` until User-owned browser verification is completed.

No production finding was implemented in this audit.

## 10. Master status update

Area 09 should be marked:

**⚠️ reviewed with unresolved high/critical findings**

because F1–F3 remain unresolved on current `main`, with ownership already assigned to `settlements-020/021/022`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
