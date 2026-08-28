# Implementation notes: fauna-002 — Livestock Food Production

Plan: [`fauna-002-livestock-food-production.md`](../fauna-002-livestock-food-production.md)

> A pre-implementation review landed on `main` (this same file path, "Status:
> review complete") while this implementation was already underway. This
> revision **replaces** that review with real post-implementation notes; the
> sections below call out each place the final implementation followed,
> adapted, or deliberately deviated from that review's guidance.

## Summary

Extended the existing livestock model (`AnimalDef`/`AnimalAgent` in
`fauna/AnimalAgent.ts`) with an optional `production` config (plan §5's
`LivestockProduction` sketch), instead of separate `ChickenEggSystem`/
`CowMilkSystem`/`SheepMilkSystem`. Per-animal state lives on the `AnimalAgent`
instance itself, matching how `life.hunger`/`life.thirst` already work — no
global `nextChickenEggTime`-style timer.

- `chicken`: `{ product: 'egg', amount: 1, intervalDays: 1 }`
- `cow`: `{ product: 'milk', amount: 5, intervalDays: 0.5 }`
- `sheep`: `{ product: 'milk', amount: 2, intervalDays: 0.35 }`

## Timer model: absolute day anchors, not a per-frame decrementing timer

The first implementation pass used a decrementing `productionCooldown -= dt`
seconds timer (the review's pitfall #1: "decrementing a production timer
every frame"). That's wrong for streamed settlement livestock: `dt` only
accumulates while the owning settlement is loaded, so the timer would
effectively pause while unloaded — fine for "never overflows", wrong for "the
egg should be ready by the time I get there if enough real world-time has
passed".

Fixed by switching to the same technique `items/timedProcess.ts` already uses
for drying: store one absolute `elapsedDays` anchor
(`AnimalAgent.productionReadyAtDays`) and compare it against `nowDays`
whenever readiness is queried (`fauna/livestockProduction.ts`'s
`livestockProductionReady`) — no per-frame work, no catch-up replay needed.
Whatever `nowDays` the next real `update()` call carries is immediately
correct, whether that's one frame later or after the settlement was unloaded
for 40 in-game days. This also makes the review's §4 (time-skip/off-screen
correctness) fall out for free: `SettlementsManager.update()` already gates
off entirely during a time-skip and while a settlement is unloaded (existing
behavior, also true for livestock hunger/thirst — no special-cased
`resolveTimeSkip` catch-up for livestock exists or was added), so the next
real tick after either just resolves the comparison fresh — never double-runs
a missed cycle, matches the plan's explicit "max one uncollected egg" rule by
construction.

`nowDays` (`dayNight.elapsedDays`) is threaded from `gameLoop.ts` down through
`SettlementsManager.update()` → `Settlement.update()` → each livestock
`AnimalAgent.update()`'s new trailing parameter (defaults to `0`, so every
existing wild-fauna/test call site is unaffected — wild `AnimalDef`s never
set `production`). `fauna/createFauna.ts`'s wild-fauna loop forwards its
already-available `worldDays` the same way, for consistency, though it's
inert there.

The pure day-math (`livestockProductionReady`,
`nextLivestockProductionReadyAtDays`, `initialLivestockProductionReadyAtDays`)
lives in `fauna/livestockProduction.ts` and is unit-tested directly
(`livestockProduction.test.ts`) — the same "extract pure logic out of
`AnimalAgent`, test that" convention the file already uses heavily
(`corpsePhaseFromElapsed`, `canHarvestMeatFrom`, `isCarcassEdible`, …); no
test file constructs a real `AnimalAgent` anywhere in this codebase
(Three.js-heavy), including plan fauna-003's mount methods, so this matches
existing practice rather than being a gap.

## Eggs

A chicken's egg becomes a **real world item** the instant its cycle
completes (`AnimalAgent.readyToLayEgg(nowDays)`), dropped at the chicken's
current position via the existing `items/createDroppedItems.ts` mechanism —
no `EggEntity`. It's then a normal pickup, handled by the existing
`kind: 'item'` interactable/pickup path (no chicken-specific collect
interaction was added — the plan's §11 "Zbierz jajko" example reads as this
same generic "Podnieś: Jajko" prompt, and §2.3/§8 are explicit that the egg
must be a decoupled world item the chicken can walk away from).

The "max one outstanding egg" rule (§2.1) is enforced without polling:
`createDroppedItems.ts`'s `drop()` gained an optional `onCollected` callback
(invoked once from `collect()`), so the chicken learns exactly when its own
drop is picked up and only then starts its next cycle
(`AnimalAgent.notifyEggCollected(nowDays)`, using the `nowDays` current *at
collection time* — the callback closure reads a live per-settlement
`currentNowDays` variable updated every `update()` call, not the `nowDays`
snapshotted at lay time, since collection can happen an arbitrary number of
frames/days later). This is a small, generic addition to an existing system,
not a parallel one.

Wiring: `settlement/createSettlement.ts`'s existing per-frame livestock loop
now also checks `animal.readyToLayEgg(nowDays)` and calls an injected
`dropLivestockProduct` hook (type `DropLivestockProductHook`, in
`fauna/livestockProduction.ts`) — threaded through `SettlementsManager.
update()` the same way `SettlementHuntingHooks`/`SettlementFoodSourceHooks`
already are, supplied at the `gameLoop.ts` call site as
`bundle.droppedItems.drop`. Wild fauna (`Fauna.update`) never needed this —
only livestock (`settlement.livestock`) has `def.production`.

## Milk

Reuses the container model from `items-player-001` unchanged — milk is not a
counted `ItemKind`, it's `content: 'milk'` on a `LiquidContainerItemInstance`
(buckets already declared `allowedContents: ['water', 'milk']`).

- `app/actions/survivalActions.ts` gained `startMilkAnimal(animal)`: picks
  the smallest carried bucket with room for milk (mirrors
  `fillWaterskin`/`carriedWaterContainers`'s existing convention — no new UI,
  no bucket-choice picker), then runs it through the existing busy channel
  (`busy.start`), same mechanism as `startCookAt`/`startIgniteFire`. Esc-cancel
  grants nothing (existing busy-channel contract), satisfying "nie przyznawać
  pełnej ilości mleka" on interruption. The completion callback re-checks
  `animal.canBeMilked(dayNight.elapsedDays)` and re-fetches the container
  instance fresh via `inventory.updateInstance` (not the snapshot captured
  when the channel started), per the review's §6 "don't trust an old
  interactable snapshot".
- Real-time busy-channel duration is a **separate concept** from the
  world-time cooldown (review §6, explicitly not converted mechanically):
  `amount × MILK_SECONDS_PER_LITRE` (3 s/l real time), so a cow's 5 l milking
  (15 s) takes longer than a sheep's 2 l (6 s) — a configuration
  relationship, not a hardcoded per-species duration. The cooldown *before
  the next milking is allowed* is the `intervalDays` world-time anchor above.
- `items/liquidContainer.ts` gained `addLiquidToContainer(instance, content,
  litres)`, the "pour a specific amount, capped by remaining capacity"
  counterpart to the existing `fillLiquidContainer` ("top up to full") — needed
  because a fixed per-species yield can exceed a partially-full bucket's
  remaining room, and the plan requires respecting that (§ verification:
  "ilość mleka respektuje wolną pojemność pojemnika").
- Interaction gating: `interactables.ts`'s existing `animalPromptLabel` now
  also checks `animal.canBeMilked(nowDays)` plus a precomputed
  `hasMilkContainer` boolean (same "computed once, passed in" convention as
  `inventoryHasFreeKnife`) to show `Wydój: <species>` only when milking would
  actually succeed; `gameLoop.ts`'s existing `kind === 'animal'` dispatch gets
  one new branch, after the mount check, before the generic "Obserwuj"
  fallback.

## Deliberate scope boundary: no SaveData persistence for production state

The review's §3/§14 asked for a real `SaveData` addition (a sparse map keyed
by deterministic `animalId`). This was evaluated and **not implemented**,
after re-checking the current architecture directly rather than taking the
review's claim at face value (per `CLAUDE.md`'s source-of-truth ordering,
current code outranks implementation notes/reviews):

`docs/architecture/ARCHITECTURE.md`'s Save schema section is explicit and
unambiguous: *"fauna/livestock HP/death/corpse state is not persisted at all
(killed animals resurrect on reload)"*. No `AnimalAgent` — wild or livestock —
has any per-instance runtime state in `SaveData` today, and not even in the
lighter in-session `WorldBundle`-rebuild carry registries `Household`/NPC
state use (`HouseholdRegistry`/`NpcStateRegistry`) — those exist for NPCs and
households, never for `AnimalAgent`. Adding real save/load persistence for
*only* production state, while the same animal's death/HP still doesn't
survive a reload, would be architecturally incoherent (a killed chicken
resurrects, but its egg cooldown would supposedly survive) and would be the
first-ever per-`AnimalAgent` `SaveData` persistence in this codebase — a new
architectural capability well beyond a single M-sized plan, not the
"smallest correct change" `CLAUDE.md` asks for.

Production state instead follows the exact same non-persistence as the rest
of `AnimalLifeState` (hunger/thirst) — consistent with the existing,
deliberate gap, not a new one. What *is* satisfied for free: an uncollected
egg is a real `droppedItems` entry, and those already round-trip through
`SaveData` — so "an egg the chicken is holding" survives a save/load; only
the production anchor itself resets on a full reload (never mid-session,
since the day-anchor design means it resolves correctly across any
in-session unload/reload of the owning settlement).

Recorded as a follow-up in `docs/plans/LOOSE-ENDS.md` rather than pulled into
this plan's scope — a future "make fauna/livestock runtime state (death, HP,
needs, production) actually persist" plan would need to design that
holistically, not patch it in piecemeal per-feature.

## Other review points — followed as-is

- **§5 liquid-container reuse, §6 BusyAction reuse, §7 interaction ownership,
  §8 DroppedItems (not a new EggEntity), §9 egg position from the chicken's
  live mesh position, §10 no generic NPC pickup subsystem, §11 configuration
  table, §12 production ≠ feeding (animal needs/thirst untouched), §13
  `animalId` as the stable identity (moot today since nothing keys production
  by anything but the `AnimalAgent` instance itself — no persistence, no
  cross-reference needed)** — all followed; no deviations beyond the timer
  model and persistence decisions above.
- **§17 pitfalls** — checked against the final implementation: no per-frame
  decrementing timer (fixed, see above); no reset-on-reload *beyond* what
  every other livestock need already resets (documented, not new); no
  eggs-every-update-after-interval (the `eggPending` gate + `readyToLayEgg`
  check prevent this); no `EggEntity`; milk stays on the same
  `LiquidContainerItemInstance`, never a second numeric `milk: N`; no
  parallel legacy/new bucket state; a full/incompatible bucket can't start
  milking (`carriedMilkContainers()` filters via `canFillLiquidContainer`);
  completion re-checks authoritative state, not the captured snapshot; no
  NPC item-pickup subsystem added; no production state in Vue/UI; no
  `SaveData` migration/version bump (none needed — no new persisted field).

## New/changed public surface

- `fauna/AnimalAgent.ts`: `AnimalDef.production?`, `LivestockProductionConfig`
  (`intervalDays`), `LivestockProductKind`; `AnimalAgent.readyToLayEgg(nowDays)/
  markEggLaid()/notifyEggCollected(nowDays)/canBeMilked(nowDays)/
  startMilkCooldown(nowDays)`; `update()` gained a trailing `nowDays` param.
- `fauna/livestockProduction.ts` (new): `DropLivestockProductHook` type,
  `livestockProductionReady`/`nextLivestockProductionReadyAtDays`/
  `initialLivestockProductionReadyAtDays` pure day-math (tested in
  `livestockProduction.test.ts`).
- `items/items.ts` / `items/itemCatalog.ts`: new `egg` `ItemKind` (food,
  consumable, spoils like other raw food — eaten raw, no cooking/processing
  per §13's out-of-scope list).
- `items/liquidContainer.ts`: `addLiquidToContainer`.
- `items/createDroppedItems.ts`: `drop()` gained an optional `onCollected`
  callback param; not persisted (documented on the type).
- `app/actions/survivalActions.ts`: `SurvivalActions.startMilkAnimal`,
  exported `hasCarriedMilkContainer`.
- `settlement/createSettlement.ts` / `settlement/SettlementsManager.ts`:
  `update()` gained optional trailing `dropLivestockProduct`/`nowDays` params.
- `docs/items/CATALOG.md`: new `egg` row; bucket rows updated (milking wired,
  drink-from-bucket still deferred).

## Verification

- `npx tsc --noEmit` — clean.
- `pnpm run lint` — clean (`lint:fix` only reordered imports once, no other
  changes).
- `pnpm run test` — 209 files / 2030 tests pass. Added coverage:
  `addLiquidToContainer` (`liquidContainer.test.ts`), `createDroppedItems`'s
  `onCollected` hook (`createDroppedItems.test.ts`), and the day-anchor pure
  functions + `ANIMAL_DEFS` production config
  (`livestockProduction.test.ts` — covers the review's high-value list items
  that don't require instantiating a real `AnimalAgent`: individual/
  deterministic timers, resolves correctly after an arbitrarily long
  unloaded interval, no accumulation past one uncollected egg, cow/sheep
  litre amounts, sheep cooldown shorter than cow's).
- `pnpm run build` — clean.
- Browser/gameplay verification (egg laying/collection, milking with both
  bucket kinds, partial-fill capacity clamp, cooldown, settlement stream
  out/in correctness) not done here — left to manual verification per the
  task instructions.
