# Codebase domain audit 16 — Fauna ecosystem

**Date:** 2026-09-19  
**Area:** 16 — Fauna ecosystem  
**Scope:** code correctness, architecture, lifecycle/persistence, performance  
**Baseline:** current `main`  
**Result:** ⚠️ reviewed with unresolved high findings

## 1. Scope

Traced:

```text
population / spawn authority
→ runtime materialization
→ needs / habitat / movement
→ predator/prey interaction
→ lifecycle / juvenile aging
→ death / corpse
→ removal
→ off-screen ticking
→ save/load / WorldBundle rebuild reconciliation
```

This review deliberately does **not** treat absent ecosystem features, roadmap gaps or Vision differences as findings.

Primary code inspected:

- `src/fauna/createFauna.ts`
- `src/fauna/AnimalSpawner.ts`
- `src/fauna/AnimalAgent.ts`
- `src/fauna/animalForaging.ts`
- `src/fauna/animalRoaming.ts`
- `src/fauna/animalCorpse.ts`
- `src/fauna/animalUpdateCadence.ts`
- `src/fauna/persistentOccupants.ts`
- `src/fauna/habitatPressure.ts`
- settlement livestock/rat composition seams where they affect fauna lifecycle.

Relevant current-state docs and existing plans were checked before creating follow-up work.

## 2. Entry points and state owners

### Ordinary wild fauna

`createFauna()` owns the live `AnimalAgent[]` and creates ordinary ring-spawn animals plus habitat-spawner populations. Ordinary wild individuals deliberately have no durable per-animal reconstruction contract.

### Managed habitat population

`PreySpawner` owns persisted spawn-point lifecycle state:

- `active | depleted | disabled | recovering`;
- configured `maxPreyCount`;
- cycle deaths and recovery timing;
- pressure/scenario fields.

Individual agents carry optional `spawnPointId`, and `createFauna()` already maintains an `animalId → spawnerId` association for death accounting.

### Persistent habitat occupants

`persistentOccupants.ts` owns sparse stable habitat-slot identity, snapshots and tombstones. Materialization still uses ordinary `AnimalAgent` instances, but restore/tombstone decisions are made from the registry before the agent is created.

### Livestock

Settlement-owned livestock uses the same `AnimalAgent` implementation but a different persistence owner (`LivestockRegistry`). This separation is intentional; the wild pool and livestock pool are not competing authoritative copies.

### Corpse/lifecycle state

Per-animal live/corpse state remains on `AnimalAgent` and extracted fauna helpers. Corpse phase/removal uses world-day anchors. Persistent categories snapshot that state; ordinary wild fauna does not.

## 3. Flows traced

### Spawn and population

Initial wild ring spawning applies dry-site, river, road and habitat gates. Managed habitat initial fill reserves persistent slots. Runtime managed respawn goes through `updateSpawners()` and then the same `spawnAgent()` path.

### Needs and movement

Hunger/thirst timers advance through the shared life tick. Food/water target selection is bounded and target-based; movement uses the shared walkability/water traversal seam. Long-range trips are explicit commitments and intentionally may leave the local roam band.

### Predator/prey and threats

Wild predators receive the wild `others` pool plus the explicit deduplicated `huntableLivestock` encounter set. A committed livestock target is revalidated against current encounter membership, preventing disposed livestock references from remaining valid after settlement streaming changes.

### Juvenile/lifecycle

Juvenile maturation uses the same age-advance operation in live ticks and time-skip catch-up. Current juvenile creation is part of spawn materialization; absence of a broader reproduction simulator is not treated as a defect.

### Death/corpse/removal

Death enters the fauna-owned corpse timeline. `readyToRemove()` is polled by `createFauna()`; persistent habitat slots are tombstoned before runtime disposal. Corpse timing is world-time based.

### Off-screen

Wild fauna is not chunk-streamed. All wild agents continue to exist and receive `AnimalAgent.update()`; cadence lowers behaviour/presentation frequency for low-importance agents without introducing a second off-screen rule set.

### Rebuild/save

- ordinary wild individuals: population-level deterministic reconstruction only, by current documented policy;
- persistent habitat occupants: stable habitat-slot identity + snapshot/tombstone;
- livestock: `LivestockRegistry`;
- spawn points: persisted FSM snapshot.

No duplicate persistence registry was found.

## 4. Findings

### F16-1 — High — managed spawner population cap counts proximity, not owned live population

**Category:** correctness / lifecycle / population authority

`AnimalSpawner.updateSpawners()` treats `maxPreyCount` as a cap but computes occupancy by counting same-kind live animals physically within `SPAWNER_RADIUS = 12` of the spawner.

That is not equivalent to the logical population owned by that spawner:

- spawner-created animals already have stable `spawnPointId`;
- ordinary roaming may extend well beyond 12 m;
- committed water/settlement trips intentionally exceed local roaming bounds;
- `createFauna()` already keeps `animalId → spawnerId` provenance for death accounting.

A live animal that walks outside 12 m stops counting toward the cap. After the respawn interval the habitat can create a replacement although no member died or permanently left the population. Repeating this can grow a managed population beyond its configured cap and amplifies downstream simulation cost.

There is a second correctness edge in the same function: `onRespawn()` returns `void`, but the bookkeeping increments local `nearby` even when the caller cannot find a valid dry spawn position and creates no animal. This can consume catch-up interval budget for a spawn that did not occur.

**Required direction:** make replenishment occupancy use logical living membership/provenance (`spawnPointId` / existing association), while keeping the separate nearby-population rule used for ecological recovery/colonization. Make respawn success explicit so failed materialization does not advance population bookkeeping.

**Plan:** `fauna-041-managed-spawner-population-authority.md`.

### F16-2 — Medium — full-rate fauna perception still scales O(N²) and allocates population scratch arrays every frame

**Category:** performance / architecture

`Fauna.update()` still passes the whole wild `agents` array as `others` to every agent. Full-rate sensing/targeting remains outside the fauna-028 behaviour cadence, and several operations linearly scan that collection:

- nearest predator/prey lookup;
- fresh prey acquisition;
- carcass search;
- rabid/live-target scans and related threat queries.

Overall proximity work therefore retains an O(N²) shape as fauna population grows.

Separately, the managed-spawner pass constructs:

```ts
agents.filter(...).map(...)
```

on every update, and `updateSpawners()` then filters that list again for each spawner. This creates recurring short-lived arrays and adds O(spawners × animals) work even when no respawn can occur yet.

`fauna-028` reduced behaviour/presentation cadence, and `fauna-033` targets movement/water/collider hot paths; neither removes these full-rate population scans.

**Required direction:** add a fauna-owned bounded proximity/occupancy view or equivalent reused scratch index at the existing composition boundary, without creating a second simulation manager or changing ownership. Keep exact target-selection semantics and stable tie-breaking. Gate/reuse spawner occupancy work by actual respawn need where possible.

**Plan:** `fauna-042-fauna-proximity-and-population-scan-cost.md`.

### F16-3 — Medium — frenzy branches preserve a stale carcass food claim while abandoning feeding

**Category:** correctness / lifecycle

Current `AnimalAgent` explicitly omits `cancelSourceTarget()` in both `npc-attack-frenzied` and `frenzy-beeline`.

If the predator previously claimed a carcass, it can abandon the feeding action to charge an NPC/settlement while the corpse still holds `foodClaimedBy` for that predator. Other scavengers therefore see the carcass as reserved although the claimant is no longer pursuing it.

Death-side claim cleanup was already fixed, so this is a narrower branch-transition defect, not the old dead-claim bug.

**Required direction:** centralize/normalize source-target cancellation for behaviour transitions that truly abandon the forage action, while preserving branches such as intentional ignore that continue normal predator/needs execution.

**Plan:** `fauna-043-frenzy-source-target-claim-cleanup.md`.

## 5. Architecture observations

The strongest parts of the current fauna architecture are worth preserving:

- wild, persistent-occupant and livestock persistence classes are explicit rather than accidental copies;
- persistent occupants reuse `AnimalAgent` plus one sparse registry instead of introducing a second wildlife simulator;
- predator↔livestock interaction uses an explicit read-only encounter set rather than merging ownership pools;
- off-screen fauna follows the same simulation path as visible fauna;
- corpse timing is based on world time, avoiding camera/visibility-dependent decay;
- update cadence is shared by wild fauna and livestock.

The main architectural pressure point is population discovery: multiple behaviours and spawner bookkeeping repeatedly rediscover local membership from the flat runtime array even where stable provenance already exists.

## 6. Cross-domain dependencies / follow-ups

- Area 17 (Domestic animals & ownership) should treat `LivestockRegistry` continuity separately; this review did not duplicate its ownership audit.
- Area 15 (Combat) owns shared damage-pipeline symmetry; fauna combat was inspected only enough to verify prey/corpse lifecycle continuity.
- Area 02 already owns global time-skip exactness. No duplicate time-skip plan was created here.

## 7. Existing plans that already cover findings

Checked before creating new work:

- `fauna-018-persistent-habitat-occupants.md` — stable habitat slots/tombstones; does not correct ordinary managed population occupancy.
- `fauna-026-predator-livestock-encounter-set.md` — fixes cross-pool prey visibility and stale streamed-livestock targets.
- `fauna-028-animal-agent-update-cadence.md` — implemented behaviour/presentation cadence; sensing remains full-rate by design.
- `fauna-029-animal-water-route-preference-and-corpse-world-time.md` — already covers corpse world-time consistency.
- `fauna-031-wildlife-habitat-pressure-assessment.md` — derived/cache-only habitat pressure; not population authority.
- `fauna-033-animal-movement-hot-path-performance.md` — water/collider/movement diagnostics and optimizations; not `others` scans.
- `fauna-036-interruptible-carcass-feeding.md` — interruptible feeding mechanism, but current frenzy branches still deliberately omit cancellation.
- `fauna-040-settlement-rat-reconciliation-checkpoint.md` — rat-specific reconciliation; not wild managed habitat populations.

No active fauna plan found that closes F16-1, F16-2 or F16-3.

## 8. New plans required

1. `fauna-041-managed-spawner-population-authority.md` — F16-1.
2. `fauna-042-fauna-proximity-and-population-scan-cost.md` — F16-2.
3. `fauna-043-frenzy-source-target-claim-cleanup.md` — F16-3.

## 9. Verification limits

Review only. No production code was changed and no browser verification was performed.

Findings are static control-flow/state-ownership findings confirmed against current `main`. Performance impact of F16-2 still requires browser/runtime measurement after implementation; the O(N²) growth shape itself is structural.

## 10. Master status update

Area 16 should be marked:

**⚠️ reviewed with unresolved high/critical findings**

because F16-1 violates the configured managed-population cap and can create excess animals without a corresponding death/removal event.
