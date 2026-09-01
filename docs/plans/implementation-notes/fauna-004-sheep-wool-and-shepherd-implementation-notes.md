# Implementation notes: fauna-004 — Sheep wool cycle and shepherd

Plan: `docs/plans/fauna-004-sheep-wool-and-shepherd.md`

## Review outcome

The plan is broadly compatible with the current architecture, but three details are important before implementation:

1. **Shepherd assignment is not implemented today.** `Role` is an exhaustive 8-role union and `characterForSeed()` chooses from `RANDOM_ROLES` independently of livestock ownership. Simply adding `shepherd` to the random pool would create shepherds without sheep and sheep households without shepherds. Prefer a deterministic livestock-aware assignment at settlement/family generation, or another small existing-role selection seam that can see the household's livestock roll. Do not create a second profession-assignment system.
2. **Shears provisioning is not specified enough.** NPC role loadout currently seeds weapons only (plus hunter supplies); a new shearing capability alone does not put the tool in a shepherd's inventory. Define the source explicitly. For an autonomous shepherd, the smallest coherent solution is a role-specific starting utility/tool seed in the existing `npcLoadout.ts` pipeline, not a special shearing inventory or workplace storage.
3. **Wool is not an `EconomicKind`.** Current settlement economy supports bulk economic stock plus concrete food items; arbitrary resources such as wool do not have an economy path. Delivery should therefore initially use `Household.items` (generic inventory), reusing the existing carried-item delivery pattern. Do not invent `SettlementEconomy.wool` or a wool-specific storage system unless the plan is intentionally expanded.

## Existing mechanisms to reuse

### Livestock production

`src/fauna/livestockProduction.ts` already owns the pure absolute-day production math:

- `livestockProductionReady()`
- `nextLivestockProductionReadyAtDays()`
- `initialLivestockProductionReadyAtDays()`

`AnimalAgent` already stores the existing milk/egg anchor as `productionReadyAtDays`. Wool must be **independent** from that anchor: sheep can be milk-ready and wool-ready at different times. Add a separate wool anchor/state rather than changing milk semantics.

Use the same absolute `elapsedDays` model and the existing initial staggering convention. Do not introduce a decrementing timer or a wool-specific per-frame tick.

The current livestock implementation deliberately does not persist `AnimalAgent` runtime state. Keep wool consistent with that architecture; do not add partial SaveData persistence only for wool.

### Sheep ownership

`src/settlement/livestock.ts` already creates sheep as normal `AnimalAgent` instances and assigns:

- `ownerHouseId`
- the matching `Household`
- deterministic animal ids

Use these ownership fields. Do not add another sheep-owner registry.

The existing house/animal relationship is local and deterministic, so shepherd target selection should be bounded to the NPC's household rather than scanning all fauna.

### NPC actions

`src/ai/NpcAgent.ts` already has the generic `startAction()` → `goTo` → `execute` path through `PlannedAction`. Profession-specific work methods such as farmer/fisher/hunter/blacksmith are implemented as small methods called from `beginIdle()`.

Shearing should follow the same pattern:

- discover a valid owned sheep,
- create a normal `PlannedAction`,
- walk to the sheep,
- revalidate at completion,
- mutate world/inventory only after successful completion.

Do not add a shepherd FSM or a second scheduler.

The current NPC carried inventory is `new Inventory(undefined, NPC_CARRY_MAX_WEIGHT)` with a 5 kg weight cap. Four wool at the plan's 1 kg/unit assumption consumes 4 kg, so capacity is material and must be checked before committing the action and again at completion.

### Tool capabilities

`src/items/itemCatalog.ts` defines `ItemCapability` as the single source of truth, and `Inventory.hasCapability()` / `findWithCapability()` are the existing gates.

Add `shearing` as a capability and declare it on the shears item. Do not add `inventory.has('shears')` checks.

The current capability catalog has no shearing capability yet; this is a genuine extension, not a rename of an existing capability.

### Items

Add `wool` to `ItemKind` + `ITEM_DEFS` and the item catalog. It should be a normal stackable resource with no item instance/durability.

There is no reason for a wool-specific world entity or model. Follow the ordinary inventory/item representation.

For the tool, reuse the existing item model/catalog conventions. If no dedicated shears asset exists, keep the tool visually minimal rather than introducing an unrelated asset dependency.

### Household delivery

`Household.items` is the generic, unbounded inventory already used for hunter/fisher outputs. The existing `depositCarriedItems()` helper in `NpcAgent.ts` is the closest reusable pattern.

For wool:

`carried -> Household.items`

Do not use `depositFood()`, because wool is not food. Do not route through `Household.stock`, which is intentionally limited to scalar wood.

## Calendar: high-risk global change

Current `src/world/weather.ts` still defines:

`DAYS_PER_SEASON = 7`

and derives all season boundaries from it. The requested 12-day season therefore changes the world from the current 28-day year to 48 days.

This is not a sheep-local change. Before editing, trace all direct uses of:

- `DAYS_PER_SEASON`
- `getSeason()`
- `getSeasonProgress()`
- any hard-coded 7/28-day seasonal assumptions in tests or other world systems.

Keep season/weather as pure functions of `elapsedDays`; do not add a second calendar state. Existing weather is intentionally time-skip/save-load safe.

The most important regression is not wool timing but systems that independently assumed the old 7-day season length.

## Shepherd role integration

Adding a value to `Role` will affect exhaustive role maps/switches. In particular:

- `src/ai/characters.ts`
- `src/ai/schedule.ts`
- profession dispatch in `NpcAgent.beginIdle()`
- any role-based modifiers/loadouts/tests

The schedule is an exhaustive `Record<Role, ScheduleTemplate>`, so shepherd needs a normal template there.

Do not add a `Profession` type or scheduler.

**Role assignment needs deliberate handling:** the current random role generator has no awareness of livestock ownership. The implementation should make a shepherd meaningful by ensuring the role and owned sheep can coexist deterministically. Avoid globally increasing the random role pool without considering this invariant.

## Flock/pasture behaviour

There is already herd cohesion in `AnimalAgent` and house-anchored livestock has a tight wander radius. Do not create a Pasture entity.

A shepherd's work target can be a deterministic point derived from the household/home and existing terrain walkability/placement APIs. The important constraint is to avoid a new global pasture registry.

For flock checks, keep scans bounded to the NPC's owned livestock. If the current settlement/NPC construction path does not expose that list, add a narrow lookup hook from settlement construction rather than making `NpcAgent` search a global animal collection.

Do not make the shepherd continuously retarget every frame. Select a target on work-decision/action boundaries and let the existing movement watchdog/navigation handle obstruction.

## Threat response

Current `npcAnimalThreat.ts` detects animals that threaten **NPCs**; it does not detect predators threatening livestock. Therefore the plan's shepherd-protection behaviour cannot be obtained by merely reusing the current threat interrupt unchanged.

Reuse the existing combat decision/intent path once a livestock-specific threat is identified. The minimal extension should provide a bounded shepherd-owned-flock threat candidate/interrupt, ideally using the same existing `ThreateningAnimalCandidate` / combat target seam.

Do not create `ShepherdCombatAI`. Do not change global predator semantics just to support shepherds.

A sensible trigger is an owned sheep currently being actively threatened/attacked by a predator, not merely a predator existing somewhere near the settlement.

## Shearing transaction

The action must be transactional in the same sense as current NPC work:

1. Decision-time checks: owned live sheep, wool ready, shepherd has shearing capability, enough carried capacity.
2. Move using normal NPC movement.
3. On completion, revalidate live ownership/target, readiness, capability and capacity.
4. Only then add exactly 4 wool and advance the wool anchor by 24 days.
5. If any validation fails, grant nothing and leave the wool cycle unchanged.

Do not reset the wool anchor when the action starts. This avoids duplication/loss when movement or an action is interrupted.

The sheep's milk anchor must remain untouched.

## Off-screen / time skip

The absolute anchor model already solves the important part:

`readyAtDays <= nowDays`

No catch-up loop is needed. A sheep that becomes ready while its settlement is not actively updated will simply be ready when the next real livestock tick sees the current `elapsedDays`.

Likewise, after a long time skip, do not replay 24 individual days. Resolve readiness directly.

This should mirror fauna-002's final implementation rather than the original fauna-002 plan text where that architecture was still being designed.

## Recommended implementation order

1. Confirm/implement the 48-day calendar migration and update affected weather/season tests.
2. Add wool item + shearing capability + shears provisioning through existing item/loadout seams.
3. Add independent sheep wool anchor and pure timing helpers/tests.
4. Add shepherd role/schedule and livestock-aware role assignment.
5. Add bounded owned-sheep selection and shearing PlannedAction.
6. Reuse existing carried-item → Household.items delivery.
7. Add minimal livestock-threat hook using existing combat intent/response.
8. Add focused regression tests for wool, ownership, capacity, capability, milk independence and calendar boundaries.
9. Run automated checks; leave browser/gameplay verification for manual verification.

## Important non-goals

Do not accidentally pull in:

- wool quality/breeds/age/health/nutrition effects,
- visual fleece growth,
- Pasture entities,
- breeding,
- yarn/cloth processing,
- new economic stock kinds,
- fauna SaveData persistence,
- shepherd-specific combat AI,
- a second scheduler/pathfinding/production timer.

The strongest architectural constraint is: **shepherd is an NPC role built on the existing NPC/action/combat systems, and wool is another livestock production cycle built on the existing absolute-day model — neither deserves a parallel subsystem.**

> **Zrób git commit i push do main, rebase jeżeli trzeba**
