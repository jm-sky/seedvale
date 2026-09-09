# fauna-013 — Animal hand-feeding and human affinity — Implementation Notes

> Focused recon against current `main` after `fauna-017`. Preserve the existing feeding interaction and the post-refactor fauna ownership boundaries; do not move food/source logic back into `AnimalAgent`.

## Current codebase facts

### Feeding already exists

- `src/app/interactables.ts`
  - animal prompts already flow through the existing `Interactable.kind === 'animal'` path;
  - `feedItemKindFor(animal)` supplies the compatible carried item used for `Nakarm` prompt selection.
- `src/app/actions/survivalActions.ts`
  - `feedAnimal()` is the existing player adapter;
  - it uses `selectDietFeedKind()` and removes one inventory item **only after** the animal operation returns success;
  - preserve this ordering.
- `AnimalAgent.feedByPlayer(itemKind)` is still the public feed seam, but is pre-refactor in shape: it reads `def.diet.items[itemKind]` and calls `consumeFood(this.life, relief)` directly.
- Existing feed tests already cover compatible-item selection and the consume-only-on-success invariant. Extend them; do not build another interaction test harness.

### Ownership after `fauna-017`

`src/fauna/AnimalAgent.ts`

- Remains the per-animal integration point and owner of agent lifecycle/public API.
- Keeps movement/intent/timers and `sourceTarget` execution orchestration.
- Should revalidate agent-level facts hand-feeding needs, especially `isDead()` / live availability.
- Compatibility re-exports from `AnimalAgent.ts` exist only to avoid breaking old importers; new code should import canonical helpers directly from their modules.

`src/fauna/animalForaging.ts`

- Is now the canonical owner of food/water source selection, live validation and atomic source relief.
- Exports `selectDietFeedKind()`.
- `SourceTarget.kind === 'feed'` means **autonomous household stored-food target**, not player hand-feeding.
- `applySourceRelief()` owns the autonomous five-arm completion switch and only grants hunger relief after the underlying source mutation succeeds.
- For household feed it removes the exact selected item and then calls `consumeFood(ctx.life, ctx.def.diet?.items?.[kind] ?? 1)`.

Do not route transient player hand-feeding through `SourceTarget`/`actionTimer`; instead extract/reuse a small shared diet-item acceptance/relief primitive in this module (or immediately adjacent food-domain code) so autonomous and hand feeding cannot drift on compatibility/nutrition.

`src/fauna/AnimalLife.ts`

- Owns `AnimalLifeState.hunger` and `consumeFood()`.
- `NEED_ELEVATED_THRESHOLD` is currently `0.5` and is already the threshold that starts real food/water seeking.
- Prefer reusing it as the V1 hand-feed acceptance threshold unless implementation evidence requires otherwise.
- Do not introduce hand-feed-specific hunger state, cooldown or nutrition constants.

`src/fauna/animalDefs.ts`

- `AnimalDef` is the canonical species-data table.
- Optional fields follow the convention “presence of config = capability” (`mount`, `production`, `scavenging`, `diet`, `water`, `roaming`, `trips`).
- Dog is `role: 'livestock'`, `sociability: 'domestic'`, with a meat diet; it is not a predator.
- Add affinity support as a small optional capability/config here rather than adding more feeding-time `kind === 'dog'` checks.

## Recommended hand-feed contract

Keep `survivalActions.feedAnimal()` as the player transaction adapter:

```text
select carried diet item
→ call animal hand-feed operation
→ on true: Inventory.remove(kind, 1)
→ on false: inventory unchanged
```

Evolve `feedByPlayer()` into an actor-aware, lifecycle-aware thin adapter (`tryHandFeed` or equivalent). It should not own diet math itself after `fauna-017`.

The commit path should revalidate:

1. animal is alive/available (`AnimalAgent` lifecycle),
2. item is still accepted by `AnimalDef.diet.items`,
3. hunger satisfies the shared acceptance predicate,
4. shared food-domain operation applies the normal diet relief,
5. only then affinity may change and the caller may remove inventory.

The prompt in `interactables.ts` can reuse the same read-only acceptance predicate to suppress `Nakarm` for a satiated animal, but the domain operation remains authoritative.

## Affinity ownership

Keep sparse affinity on the individual `AnimalAgent`; do not create a global relationship manager.

Recommended shape:

- optional affinity capability/config on `AnimalDef`, enabled for dog in V1;
- runtime sparse `Map` or equivalent only for affinity-enabled animals;
- serializable sparse entry list/object in `AnimalSaveState`;
- entry created only when a real successful interaction changes the value;
- bounded numeric values and one configured familiarity/trust threshold.

Do not allocate empty affinity state for horse/cow/etc. just because they can be hand-fed.

### Ownership is separate

Existing dog familiarity to its family comes from ownership context:

```text
AnimalAgent.ownerHouseId
+ candidate NPC homeId
```

Do not materialize household members as affinity entries.

Affinity must not alter:

- `ownerHouseId`,
- protected household membership,
- `resolveDogGuardTarget()`,
- wolf-defense priority,
- combat loyalty.

## Human identity seam

There is still no project-wide persistent human-actor identity abstraction suitable for this feature.

Use the smallest fauna-facing stable representation:

- one stable namespaced player id;
- future NPC ids derived from existing stable NPC ids, e.g. `npc:<id>`.

Do not key affinity by `PlayerController`, `NpcAgent` object identity, array position or transient candidate index. Do not start a global actor-identity refactor.

## Dog social integration

`src/fauna/dogGuard.ts`

- `resolveDogGuardTarget()` owns wolf-defense target priority. Leave it unchanged.
- `resolveDogBarkStimulus()` owns the pure three-tier bark decision: guard → recent wolf howl → stranger.
- `StrangerNpcCandidate` currently carries only `{ x, z, homeId? }`.
- Owning-household NPCs are already ignored as strangers when `homeId === ownerHouseId`.

Extend only the stranger candidate/evaluation seam so a non-household human can carry stable identity / interpreted familiarity. A trusted outsider should no longer produce the normal stranger stimulus (or should have explicitly reduced relevance if that is the chosen final rule).

`AnimalAgent.updateDogVocalization()` is the adapter that maps live world state into the pure resolver. Player data is already available elsewhere in `AnimalAgent.update()`/perception; add the player as a bounded candidate there rather than performing another global scan.

Important performance guardrail from `fauna-017`: dog perception call-sites were specifically cleaned up to avoid per-tick `.map()`/`.filter()` allocation. Do not reintroduce allocation-heavy candidate construction just to add affinity/player familiarity.

## Persistence

`AnimalSaveState` remains defined on `AnimalAgent` and is the common per-individual snapshot representation.

`src/settlement/livestock.ts`

- `LivestockSaveRecord` extends `AnimalSaveState` with settlement/id/kind/owner fields.
- Dogs already use this same livestock stream-out/save/load path.

`src/persistence/saveData.ts`

- validates livestock records explicitly;
- new affinity data must be optional and backward-compatible;
- validate stable human id strings and finite bounded numeric values.

Implementation path:

```text
AnimalAgent.snapshot()
→ optional sparse affinity serialization
→ LivestockSaveRecord
→ saveData validation
→ AnimalAgent.hydrate()
```

Do not create `DogAffinitySaveData`.

Do not extend wild-fauna persistence. `AnimalSaveState` being capable of holding affinity does not mean current wild reconstruction starts persisting individual wild animals.

## Lifecycle constraints

The relevant lifecycle distinction is already owned by `AnimalAgent`/corpse state:

- live animal: may proceed to food acceptance;
- dead/corpse: hand-feed rejects;
- no new feedable/dead marker.

Juvenile/adult maturation (`advanceAge()` live tick + time-skip) is unrelated and should not be modified by this plan.

Corpse/scavenging food remains the autonomous `animalForaging` + `animalCorpse` path; hand-feeding must not blur living-animal feeding with carcass consumption.

## Suggested implementation order

1. Add shared food-acceptance/read+commit helpers around `AnimalLife` / `animalForaging` using current diet values.
2. Convert `AnimalAgent.feedByPlayer()` into lifecycle-aware actor-aware adapter delegating food rules.
3. Update `FeedableAnimal`/`feedAnimal()` signatures while preserving consume-on-success transaction ordering.
4. Gate `Nakarm` prompt with the same read-only acceptance contract.
5. Add optional affinity capability to `AnimalDef` and sparse per-agent state.
6. Apply affinity gain only after successful food commit.
7. Extend `dogGuard.ts` stranger candidate/resolver and `AnimalAgent.updateDogVocalization()` player adapter.
8. Extend `AnimalSaveState` snapshot/hydrate and `saveData.ts` validation.
9. Add focused tests/debug fields.

## Tests to extend

- `src/fauna/animalForaging.test.ts`
  - shared diet compatibility/relief primitive;
  - hand-feed relief matches the same configured diet value used by autonomous stored-food feeding.
- existing survival/feed tests
  - satiated rejection keeps inventory;
  - dead/rejected animal keeps inventory;
  - successful feed still removes exactly one unit.
- `src/fauna/AnimalAgent.test.ts` or a small focused affinity-domain test
  - dog successful feed increments only feeding human;
  - different human ids remain independent;
  - non-affinity species create no relationship state.
- `src/fauna/dogGuard.test.ts`
  - own household remains familiar from `homeId`;
  - unfamiliar outsider can trigger stranger bark;
  - trusted outsider does not;
  - guard-target resolution stays unchanged.
- livestock/persistence tests
  - affinity survives snapshot → validation → hydrate;
  - old records without affinity remain valid;
  - malformed affinity entries are rejected/ignored according to existing validator convention.

## Pitfalls

- Do **not** implement a second `handFeedAnimal()` interaction/raycast pipeline.
- Do **not** keep diet/hunger mutation inside an expanding `AnimalAgent.feedByPlayer()`; `fauna-017` moved food ownership out deliberately.
- Do **not** repurpose `SourceTarget.kind === 'feed'` into player interaction state; it is an autonomous household source target.
- Do **not** remove inventory before the animal commit succeeds.
- Do **not** put affinity rules in `interactables.ts`, `gameLoop.ts` or UI code.
- Do **not** use `QuestManager`/NPC relationships for animal affinity.
- Do **not** add global relationship scans or per-tick allocation-heavy dog candidate arrays.
- Do **not** broaden scope into following, commands, player ownership, taming, negative memory, caretaker work or wild-individual persistence.

## Import guidance after `fauna-017`

For new call-sites prefer canonical modules:

```text
animalDefs.ts      → species/diet/capability data
animalForaging.ts  → food/source selection + validation + relief helpers
AnimalLife.ts      → hunger state/mutation
animalCorpse.ts    → corpse lifecycle
animalRoaming.ts   → trip/probe logic
```

Avoid new imports of these symbols through `AnimalAgent.ts` compatibility re-exports.
