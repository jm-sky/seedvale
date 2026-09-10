# Seedvale — Fauna & Ecosystem

**Purpose:** current-state reference for wild animals, livestock, and rats — the shared `AnimalAgent` runtime, the behaviour pipeline, the settlement-adjacent ecosystem seams, and (most importantly) the persistence boundary between the three.

**Not:** NPC decision-consumption logic ([npc.md](./npc.md) owns how a hunter/farmer *consumes* what this doc exposes), settlement economy internals ([settlements.md](./settlements.md)), combat resolver internals ([combat.md](./combat.md) owns the damage pipeline; this doc covers only fauna's own outgoing-damage asymmetry), water-traversal ownership ([water.md](./water.md) owns the physical water answer; this doc covers only how fauna consumes it), or a plan/changelog.

**Last verified:** 2026-09-10

When this file and the code disagree, the code wins — update this file.

---

## Architecture

`src/fauna/AnimalAgent.ts` is the central per-animal integration point (decision dispatch, movement, combat, riding, needs pursuit, production, persistence, public API) and is supposed to stay one class. Species taxonomy lives in `animalDefs.ts`; corpse/remains/decay/rabies-exposure/food-claim state in `animalCorpse.ts`; food/water source selection and atomic relief in `animalForaging.ts`; water-trip commitment and the shared radial probe in `animalRoaming.ts`. Top-level behaviour arbitration is already a tested priority table in `faunaDecision.ts`. The remaining composed modules (combat, water-traversal classification, predator/human decision, dog-guard, prey-alert perception, herd cohesion, spawner lifecycle, hunting hooks, harvest, meat, livestock production) are called as thin adapters. This is a real structural difference from the NPC domain — fauna already had the decision-table shape the NPC refactor later copied, and the later AnimalAgent split (fauna-017) moved ownership, not arbitration.

**Livestock and rats are not a parallel type.** Both are plain `AnimalAgent` instances of the exact same class wild fauna uses, distinguished only by ownership/registration — see [Persistence classes](#persistence-classes) and [Settlement/ecosystem interactions](#settlementecosystem-interactions).

## Species data

`AnimalDef` (one entry per `AnimalKind` — predator/prey/livestock species) is the single per-species data table: role, sociability, speeds, detect/flee/notice/panic ranges, and a set of optional capability blocks that follow a consistent convention: **the presence of the field is the capability**, not a separate boolean flag. `mount` (ridable), `production` (egg/milk), `scavenging` (rotting-corpse/bones food value), `diet` (grass/item herbivore or meat diet), `water` (swim capability), `roaming` (species wander band), `trips` (periodic long-range water trips, deer/stag only). A dog "eats meat but doesn't hunt" is expressed purely by its role not being `predator`, gating the carcass-seeking food branch — not a dog-specific flag.

## Individual state ownership

One `AnimalAgent` instance per animal holds its own state directly — health, hunger/thirst/stamina, a corpse-lifecycle state object (`animalCorpse.ts`), disease/quest booleans, live combat commitments, and (for livestock only) an owning household reference. **There is no separate authoritative-state object the way NPC has `NpcAuthoritativeState`** — an animal's state lives and dies with the JS object itself. What survives a reload depends entirely on which of the three persistence classes below the individual belongs to.

Population/spawner state is a separate, smaller mechanism: a habitat spawner (cave/thicket/wolfDen) is a small explicit state machine (`active`/`depleted`/`disabled`/`recovering`) independent of any individual animal — it ticks respawn timers in game-days, depletes once enough of its population dies in the current cycle, and recovers after a fixed delay plus a live nearby-population check. This is the one piece of fauna population state with its own persisted snapshot (see below).

## Behaviour

Top-level arbitration is a fixed priority table (13 behaviour kinds, gaps of 10, an ordered scan with a validity gate per candidate) — **structurally parallel to NPC's top-level sequencing layer, not to its pressure layer**: player-attack/ignore/flee > player-flee-prey > npc-attack-frenzied > npc-attack/ignore/flee > fire-avoid > frenzy-beeline > dog-guard > predator-normal > prey-normal (always valid — the guaranteed catch-all). Three hard gates (dead/mounted/rabid) bypass the whole table before it's ever reached.

**Fauna has no equivalent of NPC's three-independent-pressure-producer competition.** The priority table above is entirely about threat/social override behaviour — it contains no hunger/thirst/need candidate at all. Hunger- and thirst-driven food/water-seeking is resolved **inside** the predator/prey catch-all branches via ad hoc internal branching (e.g. "seek water first if hunger is elevated, else seek food"), never as a scored candidate contesting against fire-avoid/dog-guard/etc. This means the behaviour pipeline is genuinely **two-tier and asymmetric**: a fixed-priority threat/social override table on top, un-arbitrated hardcoded-order need-seeking underneath — not a single unified pressure competition the way NPC's needs layer is.

**Roaming:** each species has a home-relative wander band (two named size tiers, plus a flat fallback for species without an override); livestock gets its own fixed band instead. A larger, separate hard cap (also home-relative) bounds every food/water/forage search regardless of species tier. Deer and stag additionally get a periodic long-range water "trip" that deliberately exceeds their own roaming band.

**Habitat/spawning:** wild-fauna "ring" spawns are placed at a settlement-relative offset per habitat profile (open/meadow/forest/water/edge), gated by river-channel clearance and habitat checks; cave/thicket/wolfDen habitat spawners are placed further out and tracked as the separate spawner state machine above. Herd species spawn one or two juveniles alongside an adult per a species-specific chance table.

**Adult/juvenile:** a juvenile spawns smaller and matures after a fixed real-time window. Age advances from the live tick *and* from `resolveTimeSkip()` through the same `advanceAge()` operation, so an 8 h skip matures a cub the same way normal progression does. A juvenile follows its mother within a tight radius; herd leadership is deterministic (the alive herd member with the lexicographically smallest id) rather than a stored/reassigned field, so a dead leader is simply excluded next call.

**Water traversal** classifies the physical water answer (owned by terrain — see [water.md](./water.md)) into dry/wading/swimming/impassable for a given species, using the species' own scale to derive wading depth rather than a new per-species field. `isWalkable` is the single call site every movement mode shares (autonomous wander/food/water search, the local-grid pathfinding fallback, and mounted player-driven movement) — walkability can never diverge between free-roaming and ridden movement. The rest of the per-tick tail is *not* the same guarantee: a mounted animal is intentionally not clamped to its home radius, and until fauna-017 the mounted path also skipped timer/maturity/night-metabolism bookkeeping. Drowning damage applies only while actually swimming and stamina-exhausted, and stops immediately on reaching shore.

## Corpse, decay, and rabies lifecycle

Death (`takeDamage()` → collapse, `onDeath` fires once regardless of cause) starts a decay timeline: **fresh → rotting → bones**, then removal after a linger window (longer if knife-harvested first). Knife-harvest is gated to the fresh phase only, unharvested, unburied. A rotting corpse gets lightweight presentation-only decay FX and saps stamina from nearby live fauna within a small radius — a genuine, if small, ecosystem-consequence hook reusing the existing stamina resource rather than a new status-effect system. Once the linger window ends, the corpse is actually removed from the world — **the concrete difference from NPC death, which has no disposal path at all** (see [npc.md](./npc.md)). Predator food-claim (`claimedBy`) and household sanitation reservation (`cleanupClaimantNpcId`) are mutually exclusive transient locks on that same corpse state — sanitation is not a second corpse lifecycle, and it is not persisted (plan settlements-npcs-029).

**Rabies is a separate infection state layered on top of, and overriding, the normal decision pipeline** — no incubation, the very next tick after infection uses rabid behaviour. Transmission is two-vector: a landed bite (rolled once per attack, never per-tick) or corpse contact (only while the corpse is rotting and was itself rabid; each live/corpse pair rolls at most once). A rabid animal bypasses the behaviour table entirely and single-mindedly chases the nearest live target within a fixed detection range, ignoring human/NPC/fire fear. `frenzied` is a structurally independent boolean (wolf-den/quest-related) — a frenzied predator still participates in the normal priority table (at an elevated priority) rather than bypassing it the way rabies does.

## Environment integration

- **Terrain/hydrology:** species habitat siting (forest density, biome) and spawn-clearance checks reuse the same continuous sampling surface settlements and terrain generation use — never a second geometry representation.
- **River/water queries:** the same terrain-owned river-shore-distance query gates both ordinary wild spawn placement and the wider habitat-spawner placement radius (a cave/thicket/den is a physical prop plus the pack living around it, so it needs more clearance).
- **Road corridors:** a fauna-owned road-corridor check keeps ordinary wild spawns off road corridors, reusing the same corridor geometry settlements produce for their own road network — not a second road representation.
- **Physical water traversal:** see [Water traversal](#behaviour) above; the single terrain-owned "what water is here" answer is shared by autonomous movement, pathfinding, and mounted movement alike.

## Settlement/ecosystem interactions

**Livestock** (7 kinds, spawned by a per-house deterministic roll) is the identical `AnimalAgent` class wild fauna uses, with an owning household set. Ownership changes concrete behaviour at real call sites: water-seeking tries the owner's trough/household water before a natural shoreline; diet-seeking prefers the owner's own stored food before a shared forage patch. Grass forage itself is shared identically by wild fauna and livestock through one atomic service — depletion is a sparse per-patch override, not per-patch object state; patch placement stays deterministic and unpersisted.

**Household dogs** (fauna-011) are livestock-role `AnimalAgent`s (`AnimalDef.role: 'livestock'`, meat diet, `fleeRange: 0`), not a parallel type and not predators — they eat meat but never hunt, and carcass-seeking is gated by role rather than a dog-specific flag. Guard resolution (`dogGuard.ts`) is recomputed fresh every tick: a wolf attacking this dog's own household wins inside a wide home radius; a wolf attacking another settlement inhabitant may be assisted inside a tighter radius; a distant/unrelated wolf never becomes a chase target. Contextual bark is a separate, cooldown-gated stimulus (active guard, then a nearby wolf howl, then a stranger at the house) and never chains dog-to-dog. Idle pest-chase of settlement rats is a third, lower contract — only reached once guard/needs/lure claimed nothing this tick, and home-bounded so a dog never leaves its yard hunting vermin.

**Rats** are a settlement-local pressure/nuisance mechanism implemented as plain `AnimalAgent` instances, physically hosted in `src/settlement/` but fauna-owned by convention. Carrying capacity is food-driven (`(household food + settlement food) / a food-per-pressure constant`, clamped to a small cap). Damaged infested storage adds a temporary `max(normal + 3, 7)` pressure bonus; repairing storage removes that bonus without deleting live rats. An intact infestation nest enables extra replenishment toward that target (at most one spawn per half-day reconciliation, with a deterministic dog-pressure roll); destroying the nest stops that extra replenishment but does not extinguish ordinary food-driven recovery. Dogs no longer subtract from the population target — they hunt rats physically and reduce infestation replenishment by 10% per living dog (floored at 50%). Rats drain real food through the exact same atomic primitives every other consumer uses (household/economy withdraw), gated by a deterministic hashed per-rat roll so outcomes don't depend on frame timing:

```text
settlement food/storage
↔ rats (food-driven carrying capacity; damaged storage adds a temporary floor)
↔ household/economy food drain (same atomic primitives every consumer uses)
↔ infestation nest (extra replenishment while intact)
↔ dogs (physical hunting + replenishment pressure, not target suppression)
```

**Hunting** exposes exactly two operations to NPCs: a nearest-huntable-animal query (preferred species only, predators/livestock/bear never targetable) and a re-validated knife-harvest. The query applies a deterministic, seeded population-protection roll — if a candidate's local spawn population is down to one individual, a roll can skip it, protecting the last of a local population from being hunted to extinction by repeated NPC hunting. Resource yield on death (the knife-harvest operation itself) is shared verbatim between the player's own harvest action and a hunter NPC's post-kill harvest — a single reusable function, never two implementations.

**Livestock production** (egg/milk, only for species whose `AnimalDef.production` is set) is a lazy day-anchor readiness check compared against the current day, not a per-frame timer — correct across any length of settlement unload or time-skip. A product only advances the animal's next cycle once actually collected, so a cycle can't silently advance while nobody's picking it up.

## Persistence classes

Fauna has a genuine four-tier persistence picture plus one sparse exception — treat these as distinct shapes, not degrees of the same thing:

### Livestock
**Persisted, per individual.** Full snapshot (position/yaw/health/hunger/thirst/stamina-as-a-ratio/production-readiness anchor/corpse state) via a generic per-individual snapshot capability that exists on the `AnimalAgent` class itself. Because no live object survives a settlement unload, an explicit capture step must snapshot the currently-loaded animals immediately before save — unlike households/NPC state, which read an already-persistent state object. Tombstones for individuals removed since the last save prevent deterministic respawn logic from resurrecting a disposed corpse.

### Spawner lifecycle
**Persisted, thin.** Only the state-machine/clock fields (state, deaths-this-cycle, disabled-at-day) round-trip — position/type/kind are always deterministic and never persisted; a restored `active` spawner simply restarts its respawn timer from zero.

### Wild fauna
**Not persisted; population is deterministically reconstructed, individual identity is not.** The fixed spawn table plus seeded placement fully reproduces the population every session, but a specific individual's position/health/hunger/rabies-infection/frenzy/juvenile state simply ceases to exist on unload — a wolf that was rabid, mid-chase, or juvenile at save time comes back as a fresh deterministic spawn. Ordinary wild fauna does not go through `AnimalAgent.snapshot()`.

### Persistent habitat occupants
**Persisted per declared slot (plan fauna-018), fauna-owned, sparse.** A stable `habitatId + occupantKey` yields a stable `animalId`. The occupant is a normal `AnimalAgent` using the shared `AnimalSaveState` snapshot (including corpse linger and durable rabies). The slot stays reserved through live → corpse → tombstone, so generic habitat fill/`updateSpawners()` cannot replace it. Tombstone happens at `readyToRemove()`, not on death. Ordinary wild animals are unchanged: they remain unpersisted. The first gameplay consumer is the treasure-map bear cave; this contract does not itself declare that occupant.

### Rats
**Persisted per individual (plan quests-progression-006), with a live pressure target and a separate infestation record (plan quests-progression-013).** Settlement rats use the same `AnimalAgent.snapshot()` / capture-registry pattern as livestock, keyed by settlement id with removed-id tombstones. The *target population* is a live formula over current food and whether shared settlement storage is still damaged (`max(normalTarget + 3, 7)` while damaged); dogs do not change that target. Infestation replenishment (nest intact, below target) is a deterministic bucketed roll reduced by living dogs. Excess live rats are never deleted just because the target falls. Nest position is reconstructed from `VillagePlan`; only `{ storageDamaged, nestDestroyed }` persists.

**Riding is the one place the wild/livestock boundary is player-visible today:** the persisted mount reference stores a livestock animal id specifically because only livestock kinds have a deterministic id that survives a reload — a player who somehow mounted a wild animal would have no way to reconnect the save reference to a real post-reload individual (not currently possible in practice; mount capability is only configured for livestock kinds).

See [persistence.md](./persistence.md) for the full cross-domain classification this fits into.

## Combat

Fauna uses the shared `HealthState`/death primitives every entity uses, and *incoming* damage (player or NPC attacking an animal) goes through the same shared critical-hit/damage pipeline documented in [combat.md](./combat.md).

**Fauna's own outgoing attacks are the one asymmetry:** a flat per-attacker-kind damage lookup table (with a generic fallback), no critical roll, no defense resolution — an older, structurally separate mechanism from the melee/ranged/critical pipeline the rest of combat uses. Fauna has no defense configuration and carries no items, so the *defense* half of this asymmetry is principled; the *critical-roll* half is not obviously so, and whether this is a deliberate simplification or an unmigrated older system is an open maintainer question, not something this document resolves.

## Surface exposed to other domains

What fauna exposes for NPC/settlement consumption — the NPC side of consuming these is documented in [npc.md](./npc.md):

- **Three read-only threat accessors** on an animal: whether it's currently threatening a human, its current NPC attack target (if any), and whether it's committed to a live hunt. Consumers (NPC threat response, a household dog's wolf-defense resolution) build their own candidate lists from these; they never import fauna's decision logic directly.
- **The hunting hooks contract** — a nearest-huntable-animal query (with the seeded population-protection roll) and a re-validated harvest operation, bound to the live fauna system through a late-bound accessor (since fauna is constructed after NPCs at boot).
- **The combat-target adapter** that lets the shared combat resolvers treat an animal as an attackable target without those resolvers knowing anything about `AnimalAgent` internals.

**One confirmed exception to the "hooks, not imports" convention runs the other way:** `fauna/AnimalAgent.ts` imports the NPC-owned movement watchdog module directly (for its own chase/flee stuck detection), rather than going through a hook. This is deliberate reuse, not an oversight worth "fixing" into a fauna-local duplicate.

## Player / riding

Any species whose `AnimalDef.mount` is set is ridable — today, horse and donkey. Mounting hands full movement control to player input; the mount's own AI decision branch is skipped in favour of driven movement while mounted. A persisted mount reference is the only player-side state; the mount itself (`AnimalAgent`) remains fauna-owned and authoritative for HP/stamina/position. Player-side riding cost/benefit (speed, stamina drain) is resolved from the player's own riding skill — see [player-systems.md](./player-systems.md).

Temporary leading is a separate runtime relation (`AnimalDef.lead`, presence = capability). It reuses the same hysteresis follow primitive as owned Follow, with a tighter trailing band, and does not mutate `AnimalOwner` or persisted Follow/Stay. Draft hitch (`AnimalDef.draft`) is a one-way animal→cart transform constraint: the cart has no AI. Hitch is runtime-only and is not saved — settlement livestock can unload while carts persist, so a saved hitch would snap the cart across the map on reload.

## Limitations

- **Wild-fauna individuals have no persistence and no reconstruction guarantee beyond population-level determinism**, except explicitly declared persistent habitat occupants (see [Persistence classes](#persistence-classes)).
- Settlement rats persist as individuals. Their target population remains a live pressure formula (food + damaged-storage bonus); infestation nest/storage facts persist separately. Dogs affect replenishment and physical hunting, not the target.
- Fauna's outgoing attack damage bypasses the shared critical/defense pipeline (see [Combat](#combat)) — a known asymmetry, not yet resolved either way.
- Ordinary movement-target search (wander/food/water) uses unseeded randomness, unlike the deterministic hashed rolls used for population-protection and rat food-eating. Persistent habitat occupants restore durable pools/position and then re-decide; in-flight paths/`SourceTarget`/`AnimalTrip` are not persisted, so this remains a stated policy rather than an accidental desync.
- Blacksmith/farmer-adjacent gaps aside, no disease system beyond rabies exists — a decaying-food risk-penalty seam exists in the corpse-scavenging scoring function but is currently inert.

## Entry points

```text
src/fauna/AnimalAgent.ts
src/fauna/animalDefs.ts
src/fauna/animalCorpse.ts
src/fauna/animalForaging.ts
src/fauna/animalRoaming.ts
src/fauna/AnimalLife.ts
src/fauna/AnimalSpawner.ts
src/fauna/persistentOccupants.ts
src/fauna/createFauna.ts
src/fauna/faunaDecision.ts
src/fauna/faunaCombat.ts
src/fauna/waterTraversal.ts
src/fauna/huntingHooks.ts
src/fauna/animalHarvest.ts
src/fauna/animalMeat.ts
src/fauna/herdCohesion.ts
src/fauna/livestockProduction.ts
src/fauna/predatorHumanDecision.ts
src/fauna/dogGuard.ts
src/fauna/preyAlertPerception.ts
src/fauna/animalLead.ts
src/fauna/followHysteresis.ts
src/fauna/ownedAnimalControl.ts
src/fauna/animalOwnership.ts
src/world/createCarts.ts
src/world/cart.ts
src/settlement/livestock.ts
src/settlement/rats.ts
src/settlement/ratPersistence.ts
src/settlement/ratInfestation.ts
src/settlement/ratNestPlacement.ts
src/world/createGrassForagePatches.ts
```
