# Implementation Notes: NPC desired gifts, gift acceptance and relationship rewards

Plan: `docs/plans/npc-054-npc-desired-gifts-gift-acceptance-and-relationship-rewards.md`

These notes reflect current `main`; current code wins if it changes before implementation.

## Current seams to reuse

- `NpcAuthoritativeState.personalInventory` in `src/settlement/npcState.ts` is already the persisted owner of NPC personal gear. Add minimal persisted gift memory there; do not create a separate registry/save section.
- `src/app/actions/npcItemTransfer.ts` already provides atomic Player → NPC count/instance transfer, including live recipient/death/source/capacity revalidation and exact instance preservation. Gift commit should delegate to it rather than mutate either inventory directly.
- `src/app/actions/npcItemTransferActions.ts` owns the current one-way Give Item UI flow. Extend it with a gift mode/filter + post-transfer callback/result handling; do not create a second gift screen.
- `NpcDialogueMenu.vue` / `ui-vue/store.ts` are the current dialogue surface. Add dream/gift actions there through existing handlers; keep gift evaluation/mutation outside Vue.
- Player↔NPC relation authority is still `QuestManager`: `getRelation(npcId)`, `getRelationLevel(npcId)`, `adjustRelation(npcId, amount)`. Do not use `NpcRelationships` (NPC↔NPC).
- `NpcAgent.household` is the live NPC's real owning household when one exists. Accepted-gift cleanup occurs from a live dialogue, so pass/use that ownership seam rather than inventing a global NPC→household gift registry.
- `src/items/inventoryTransfer.ts` already gives lossless `transferInventoryCount()` / `transferInventoryInstance()`; use these for personalInventory → Household.items cleanup.

Dependency `npc-053` is implemented on current `main`.

## Do not duplicate npc-053 ranking

Current `src/ai/npcCombat.ts` already owns profession-aware weapon semantics:

- `npcMeleeWeaponFamily(kind)`;
- `npcRangedWeaponFamily(kind)`;
- `resolveNpcMeleeWeapon(inventory, role)`;
- `resolveNpcRangedWeapon(inventory, role)`;
- profession family preferences and deterministic combat score/tie-breaks.

Armor is different: NPC armor selection is instance-aware and derives best per slot using `resolveArmorInstanceEffective()` + equipment helpers.

The gift system needs comparison/rank information, not just “current winner”. Prefer extracting/exporting small pure comparison helpers from the existing combat/equipment logic so combat selection and gifts share the same score semantics. Do not reproduce damage-cycle formulas, profession multipliers, armor quality logic or family tables in `npcGiftPreferences.ts`.

Important current limitation: weapon choice from npc-053 is still primarily `ItemKind`-level; armor is concrete-instance/quality-aware. Do not claim same-kind weapon instances are upgrades unless current item-instance semantics actually provide a meaningful weapon-quality comparison usable by combat. The plan's “same ItemKind can still be an upgrade” should apply only where the existing shared equipment semantics support it.

## Gift resolver shape

Keep one pure domain module, e.g. `src/ai/npcGiftPreferences.ts`, with no inventory mutation/UI imports.

Useful outputs:

```ts
type GiftCategory = 'melee_weapon' | 'compact_weapon' | 'bow' | 'ammunition' | 'armor'

type GiftReaction = 'reject' | 'neutral' | 'good' | 'excellent'

type GiftEvaluation = {
  reaction: GiftReaction
  category: GiftCategory | null
  rank?: number
  relationshipDelta: number
}
```

Prefer category adapters over a second item taxonomy:
- melee/compact/bow from npc-053 family helpers;
- armor from existing armor slot/effective-value helpers;
- ammunition from the compatible ammo kinds/tier data already present in item/ranged config.

The desired-gift resolver should derive from current role + authoritative inventory + persisted gift memory. Persistence is only needed for stability/anti-farming, not as another equipment truth.

## Persisted gift memory

Add an optional field to `NpcAuthoritativeState` / `NpcStateSnapshot`, e.g. `giftMemory?: NpcGiftMemory`, with clone/default handling in the existing create/restore/serialize path.

Keep it compact. A suitable final shape is:

```ts
type NpcGiftMemory = {
  desiredGift?: ItemKind
  bestAcceptedRankByCategory?: Partial<Record<GiftCategory, number>>
}
```

Only persist data that cannot safely be reconstructed:
- stable current desire;
- best rewarded/meaningful rank needed after old gear leaves personalInventory.

Do not persist reaction history, giver identity, timestamps or accepted-item lists unless implementation proves they are required.

When loading an old save, missing memory = empty memory.

## Desired gift selection

Resolve candidates deterministically. Suggested order:

1. role category preference;
2. actual upgrade over current useful owned gear;
3. meaningful improvement over `bestAcceptedRankByCategory`;
4. stronger usefulness/rank;
5. lexical `ItemKind` tie-break.

A persisted `desiredGift` stays valid only while it remains a real upgrade. On dialogue open/query, validate it against live state; if invalid, clear/re-resolve deterministically.

Do not use `Math.random()`. If role/category variety is desired, only add stable `npcId` hashing after the deterministic upgrade ordering is established.

## Gift picker integration

The current Give Item screen receives the whole inventory via `inventoryCountsForUi()` + `buildInventoryGroups()`. Gift filtering should be done before/presentationally when opening in gift mode, not by teaching Vue profession/equipment rules.

Prefer extending `createNpcItemTransferActions` with an optional mode/context:

```ts
openNpcGiveItem(npc, { mode: 'gift', eligible: ... })
```

or equivalent narrow callbacks. The app/domain layer computes eligible kinds/instances; the existing screen only renders the supplied groups.

Keep the ordinary “Daj przedmiot” transfer behavior unchanged if it is still used elsewhere. Gift semantics must not silently turn every generic transfer into a relationship event.

## Transaction boundary

Evaluate first, then use the existing transfer primitive.

Recommended commit flow:

```text
re-resolve live NPC/state
→ re-resolve selected player item/instance
→ fresh pure gift evaluation
→ reject: stop, no mutation
→ giveItemCountToNpc / giveItemInstanceToNpc
→ if transfer failed: stop, no gift memory/relation mutation
→ update gift memory
→ QuestManager.adjustRelation(npcId, delta) when delta > 0
→ reconcile affected equipment category
→ return reaction text/result
```

Do not apply relation/memory before transfer success.

For stacked ammunition, relationship reward must depend on tier/category improvement, not quantity. A larger count of the same tier must not multiply the reward.

## Relationship reward

Use `QuestManager.adjustRelation(npcId, delta)`; this is already the canonical non-quest mutation seam.

Choose concrete deltas against the current relation thresholds in `quests/quests.ts`; keep them modest relative to existing quest consequences. The invariant matters more than the exact numbers:

```text
reject / neutral = 0
good > 0
excellent > good
```

Anti-farming must be enforced by gift evaluation/memory before calling `adjustRelation`, not by adding cooldown logic to QuestManager.

## Equipment reconciliation

Run only after an accepted equipment gift, only for the affected category.

Use the same shared ranking semantics to determine:
- the currently preferred/best item that must stay with the NPC;
- weaker redundant candidates that may leave personalInventory.

For armor, keep best per affected slot/family; do not move unrelated armor slots.

For weapons, never move:
- selected best weapon for the category;
- role-required unrelated tools/loadout belongings;
- quest/story items;
- provisions/currency;
- ammunition stacks as “replaced equipment”.

Use `NpcAgent.household?.items` as destination. If no household exists, keep surplus in personalInventory.

Household `items` is currently an `Inventory` with effectively unbounded storage, but still use `transferInventoryInstance/count` rather than remove+add. If a transfer fails, the old gear stays with the NPC; accepted gift and relation reward remain committed.

## Dialogue wiring

Add the two player-facing actions through the existing NPC dialogue menu handler/state pattern:

- ask about desired gift → pure resolver + response text;
- give gift → open current give-item screen in gift mode.

Do not put resolver logic in `NpcDialogueMenu.vue` or `store.ts`. Those files should only invoke injected handlers and render returned text.

Gift reaction wording can remain a small deterministic resolver keyed by `GiftReaction`; personality tone is optional and should not change usefulness/reward semantics.

## Tests

Prefer focused tests around existing modules rather than a broad UI harness:

- new `npcGiftPreferences.test.ts`: deterministic desire, role preferences, exhausted categories, reject/neutral/good/excellent, repeated-rank anti-farming;
- `npcItemTransferActions` or app-action tests: transfer failure causes no memory/relation mutation; exact instance preserved;
- `npcState` persistence tests: gift memory legacy default + round-trip;
- reconciliation tests: best stays, weaker affected gear moves to own household, no household/failure keeps it, unrelated items untouched;
- one dialogue/store test only for exposing/invoking the new actions, not gift rules.

Reuse existing npc-053 combat/equipment tests when extracting shared ranking helpers so combat behavior remains unchanged.

## Main pitfalls

- Generic Player→NPC transfer is not automatically a gift; keep gift intent explicit.
- Do not key relation/gift memory by display name; current relation ownership uses stable `npcId`.
- Do not use item price as primary usefulness/rank.
- Do not let household cleanup change desired-gift history; memory must prevent regression after old gear leaves personalInventory.
- Do not reorganize the whole personal inventory after every gift.
- Do not make `NpcGiftMemory` a second equipment state.
- Do not widen npc-053 combat behavior accidentally while exporting ranking helpers.

## Suggested implementation order

1. Extract/export the minimal shared npc-053 comparison helpers with regression tests.
2. Add gift resolver + tests.
3. Add optional gift memory to NPC state persistence.
4. Extend give-item app flow with explicit gift mode and transactional post-transfer commit.
5. Wire canonical relation mutation.
6. Add bounded household reconciliation.
7. Add dialogue actions/response wording.
8. Run targeted tests, typecheck and lint. Browser/manual verification remains User-owned.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
