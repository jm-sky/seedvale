# Implementation Notes: quests-progression-065 — Blacksmith — Missing Forge Input

**Prepared:** 2026-09-18  
**Plan:** `quests-progression-065-blacksmith-missing-tools.md`

## Recon verdict

Draft title “Missing Tools” does not match current simulation ownership.

Current Blacksmith work has two independent paths:

1. weapon sharpening at the household-owned grind workplace, gated by a `whetstone` in `Household.items` and a sharpenable household weapon;
2. `BLACKSMITH_IRON_ROD_PRODUCTION`, gated by settlement bulk stock `iron ×2 + coal ×1`, producing `iron_rod` into the Blacksmith household's `Household.items`.

There is no generic Blacksmith hammer/tool requirement in `ProductionDef`, `productionExecutor.ts` or current work planning. Do not add one for quest flavor.

V1 should therefore be a **real forge-input shortage quest** bound to the existing `blacksmith.iron_rod` production shortage.

## Verified ownership / current seams

### Role, staffing and workplace

- `src/ai/characters.ts::Role` contains `blacksmith`.
- `src/settlement/professionStaffing.ts::ROLE_STAFFING_POLICY.blacksmith` performs deterministic initial staffing. Small settlements can have no Blacksmith; larger workforces make the role increasingly likely. Duplicate Blacksmiths are constrained by workforce size.
- `settlements-npcs-002` already wired normal Blacksmith profession work; do not create a quest-specific work loop.
- `settlements-npcs-024` moved the workplace to the Blacksmith household. `src/settlement/places.ts::workplaceFor(..., 'blacksmith', ...)` resolves the household-owned `landmarks.blacksmithWorkplaces` entry.
- Workplace geometry is ordinary settlement state/presentation, not quest state.

### Production

`src/economy/production.ts::BLACKSMITH_IRON_ROD_PRODUCTION` is authoritative:

```ts
{
  id: 'blacksmith.iron_rod',
  role: 'blacksmith',
  inputs: [
    { kind: 'iron', amount: 2 },
    { kind: 'coal', amount: 1 },
  ],
  itemOutputs: [{ kind: 'iron_rod', amount: 1 }],
}
```

`src/economy/productionExecutor.ts::preflightProductionInputs()` and `executeProduction()` are the only recipe rule/commit seam to reuse. Do not duplicate recipe requirements in quest code.

`src/ai/npcProfessionWork.ts`:

- prefers a valid sharpening job when the household has a `whetstone`;
- otherwise preflights / observes `BLACKSMITH_IRON_ROD_PRODUCTION`;
- successful forge work commits through the existing production executor;
- output remains in the household's normal item inventory.

### Production shortage

`src/economy/productionShortage.ts` already owns the blocker observation:

```ts
type ProductionShortageRecord = {
  recipeId: string
  category: 'stock' | 'item'
  kind: EconomicKind | ItemKind
  householdId?: string
  firstBlockedSimTime: number
  lastBlockedSimTime: number
}
```

Relevant helpers already exist:

- `isProductionShortagePersistent()`;
- `productionShortageKey()`;
- `clearProductionShortageByRecipe()`;
- `revalidateProductionShortages()`;
- `SettlementEconomy.productionShortages()`.

These shortages are persisted inside `SettlementEconomySnapshot.productionShortages` and are revalidated against live inputs after restore. There is no need for quest persistence such as `missingIron=true` or a delivery counter.

### Owner distinction

Do not route the requested ore/material to the Blacksmith NPC.

- `NpcAuthoritativeState.personalInventory` = durable personal belongings.
- `Household.items` = family item stock, including Blacksmith output and whetstone.
- `SettlementEconomy` bulk stock = owner of the `iron` / `coal` inputs consumed by `blacksmith.iron_rod`.

The existing quest `transferItemCount` path transfers items to an NPC `personalInventory`. It is therefore the wrong operation for this quest.

`src/settlement/householdResourceTransfer.ts` is also not reusable directly: it intentionally supports food and branch/beam wood only. Do not widen it into arbitrary household/settlement material transfer just for 065.

## Existing autonomous resolution

`src/economy/oreTransportDemand.ts` already derives transport demand from `SettlementEconomy.productionShortages()` for exactly `iron` and `coal`.

`uncoveredOreProductionNeed()` suppresses duplicate demand when an incoming ore order is already committed. Delivered ore reaches `SettlementEconomy.items`, then `creditDeliveredOreToStock()` credits it into bulk stock read by Blacksmith production.

Therefore the quest must tolerate this sequence:

```text
active shortage quest
→ Trader/resource-site logistics supplies the missing input
→ normal production shortage disappears
→ quest objective succeeds without player attribution
```

Do not reserve the shortage for the player and do not suppress autonomous logistics while the quest is active.

## V1 eligibility: exactly one blocking input

`preflightProductionInputs()` reports the first insufficient input. Since the current recipe has two stock inputs, a naive quest could request iron while coal is also missing, producing a misleading “fixed” quest whose forge is still blocked.

For V1 materialize only when the current persistent shortage has one concrete missing stock input and every other recipe input is currently sufficient.

For the current recipe this means:

- iron quest: `iron < 2` and `coal >= 1`;
- coal quest: `coal < 1` and `iron >= 2`.

Do not hardcode these numbers in quest logic. Derive the selected input requirement and “all other inputs sufficient” predicate from `BLACKSMITH_IRON_ROD_PRODUCTION.inputs`.

If multiple inputs are simultaneously insufficient, skip this opportunity. A later general production-support quest may support bundles/multi-input delivery.

## Binding contract

The contextual definition should bind:

```ts
type BlacksmithForgeShortageBinding = {
  settlementId: string
  blacksmith: QuestNpcRef
  recipeId: string // current V1: blacksmith.iron_rod
  missingKind: 'iron' | 'coal'
}
```

Do not persist current stock quantity, required amount, delivered amount, shortage timestamps or runtime object refs in quest progress.

The exact Blacksmith is selected deterministically from stable settlement NPC identities. Display name is presentation only.

A suitable stable quest id is conceptually:

```text
world:blacksmith-forge-input:<settlementId>:<missingKind>
```

If the opportunities subsystem already has a canonical contextual-id helper, reuse it instead of introducing another parser.

## Completion predicate

The quest objective should observe the bound shortage, not who handed over an item.

Recommended narrow objective:

```ts
{
  type: 'resolve_production_shortage',
  settlementId,
  recipeId: 'blacksmith.iron_rod',
  category: 'stock',
  kind: missingKind,
}
```

The lookup injected into `QuestManager` should re-resolve the current `SettlementEconomy` by `settlementId` and expose a small plain-data result such as:

```text
missing settlement
| still_blocked
| resolved
```

`resolved` means that the exact bound shortage key no longer exists after the economy's normal revalidation. This is deliberately stronger than “player clicked Deliver” and does not add actor attribution.

Why absence of the exact shortage is sufficient in V1:

- eligibility requires the other recipe inputs to be sufficient at acceptance;
- restoring the requested input clears/revalidates the real blocker;
- if Blacksmith immediately consumes inputs and produces an `iron_rod`, production has in fact resumed, even if a later work bout creates a new shortage;
- autonomous transport may resolve the same blocker legitimately.

Do not make completion depend on current raw stock being continuously above a threshold; successful production may consume it before the quest poll runs.

## Player delivery seam

A new **domain-level**, actor-neutral transaction is justified because current player transfer APIs do not target settlement economic stock.

Prefer a focused economy helper, e.g. in `src/economy/oreDelivery.ts` or a small refactor beside `oreTransportDemand.ts`, with semantics:

```text
source Inventory
+ destination SettlementEconomy
+ allowed blacksmith stock input kind
+ positive amount
→ atomically remove real item(s)
→ add matching EconomicKind stock
→ normal shortage revalidation
```

Guardrails:

- accept only current forge stock inputs needed by this quest (`iron`, `coal`) rather than every mineable future commodity;
- use the existing ore item→economic-kind mapping from `terrain/depositMining.ts`;
- do not mutate `SettlementEconomy` directly from `QuestManager` or Vue;
- do not mint/replace the item;
- failure must leave source inventory unchanged;
- preserve normal economy history/revalidation semantics.

If a small extraction lets `creditDeliveredOreToStock()` and player delivery share the same source-inventory→bulk-stock primitive cleanly, do that. Do not force the refactor if it makes transport code less clear.

The player-facing trigger can be a quest dialogue action with the bound Blacksmith, but the physical transaction must be handled through an injected/domain action seam, not the existing `transferItemCount.toNpc` contract.

The action should derive the amount still needed from the live recipe/economy at execution time. Never trust an offer-time amount after autonomous transport or another mutation.

## Contextual opportunity / definition reconstruction

Reuse `src/quests/opportunities/` and stable settlement NPC materialization.

Candidate settlement requirements:

1. materialized/known settlement economy exists;
2. adult stable Blacksmith NPC exists;
3. that Blacksmith's household has its normal Blacksmith workplace;
4. a **persistent** `blacksmith.iron_rod` stock shortage exists;
5. missing kind is `iron` or `coal`;
6. all other recipe inputs are currently sufficient;
7. no already committed incoming ore is expected to solve the same uncovered shortage, if the existing opportunity selection can query transport orders cheaply.

Point 7 is offer-quality filtering, not a lock: even after acceptance another transport order may appear and solve the problem.

Use a bounded deterministic selection. Follow the existing contextual quest convention rather than generating one definition per Blacksmith every poll.

Critical restore rule: if a persisted quest is already `offered` / `active` / `ready_to_report`, reconstruct the same definition/binding even if new-offer eligibility is no longer true. Otherwise an autonomous resolution during save/load can erase the definition before `QuestManager` reconciles it.

## Lifecycle

### Before acceptance

- shortage no longer exists → no offer / withdraw stale offer;
- Blacksmith missing/dead → no new offer;
- another input also becomes insufficient → opportunity is no longer eligible for a new offer;
- incoming autonomous supply may suppress a new offer.

No retroactive reward if the world solved the shortage before acceptance.

### After acceptance

- exact shortage resolves by player delivery → objective success;
- exact shortage resolves by Trader/resource logistics → objective success;
- Blacksmith produces successfully and clears the shortage → objective success;
- settlement/economy cannot be resolved technically → invalidate according to existing world-bound objective policy; do not fabricate replacement state;
- do not rebind to another Blacksmith or another shortage kind.

The quest asks for help with a real local problem, not proof of player contribution.

## Marker / dialogue

Reuse `QuestManager.labelMarker(npcId)` and quests-progression-055 actionability semantics.

There is no separate physical target marker: the actionable target is the bound Blacksmith giver.

Dialogue can mention the live missing kind and remaining amount derived from recipe/economy at interaction time, e.g. “Brakuje nam jeszcze dwóch sztuk żelaza do wytopu.” Do not claim a missing hammer, broken forge, or unavailable tool unless the domain state actually represents it.

If the shortage resolves externally while active, the next interaction should present the ordinary ready-to-report state, not a stale “deliver” button.

## Rewards

Use normal `QuestOutcome` / `QuestConsequences`:

- `10 × coin`;
- relation with the bound Blacksmith `+2`;
- settlement reputation: `competence +2`, `benevolence +1`;
- no renown;
- no Known Deed;
- no unique item.

Reward applies exactly once through the existing quest resolution path.

## Trade / vendor guardrail

Current generic NPC trade and Blacksmith vendor stock are not the production-input owner.

- Blacksmith trade goods come from eligible `Household.items` / `personalInventory`.
- Buying/selling through the generic NPC trade transaction does not mean `SettlementEconomy.stock.iron/coal` increased.
- Do not mark the quest complete because the player sold ore to the Blacksmith.
- Do not mirror trade stock into production stock.

A future economic integration may make trade feed settlement input ownership; if that lands before implementation, the implementation agent must use the new real owner flow rather than preserve this historical separation.

## Persistence

No new save field is expected.

Existing persisted owners:

```text
SettlementEconomySnapshot
  → stock
  → productionShortages

QuestManager / SaveData.quests
  → lifecycle / outcome / relation state

NpcStateRegistry
  → exact Blacksmith identity/personal state
```

The player-delivery transaction mutates existing player `Inventory` + `SettlementEconomy`; both already persist normally.

## Suggested implementation order

1. Add focused tests for shortage-based candidate selection, including “both inputs missing = no offer”.
2. Add the actor-neutral player Inventory → forge input stock transaction and tests.
3. Add the narrow production-shortage objective/read lookup to quest contracts + `QuestManager`.
4. Add deterministic contextual definition materialization with exact Blacksmith `NpcId`.
5. Wire dialogue delivery through the new domain action.
6. Wire bounded reconciliation at existing quest/economy interaction checkpoints; avoid per-frame scans.
7. Add reward/dialogue/marker tests and save/load continuity coverage.

## Focused tests

### Economy / delivery

- iron item delivery removes exact player count and increases settlement iron stock;
- coal equivalent;
- unsupported commodity rejected without mutation;
- insufficient player inventory is atomic;
- shortage revalidation uses normal economy path;
- transport delivery still works after any shared-helper refactor.

### Opportunity

- requires stable adult Blacksmith + owned workplace;
- requires persistent `blacksmith.iron_rod` shortage;
- iron shortage with coal sufficient is eligible;
- coal shortage with iron sufficient is eligible;
- both missing is not eligible;
- non-Blacksmith recipe shortage is ignored;
- deterministic giver/binding/id;
- committed incoming supply can suppress a new offer without becoming quest-owned state.

### Quest lifecycle

- exact bound shortage only;
- shortage resolving before acceptance gives no reward;
- player delivery resolves active objective;
- autonomous ore transport resolves active objective;
- successful normal Blacksmith production may resolve objective;
- a later new shortage does not revoke already achieved quest progress;
- no player-contribution counter;
- exact-once reward/consequences;
- save/load reconstructs active definition even if offer eligibility changed;
- settlement unload/reload keeps stable giver/binding;
- marker remains on existing `labelMarker` pipeline.

### Regression

- Blacksmith sharpening still uses household `whetstone`;
- iron-rod production still consumes `SettlementEconomy` inputs and outputs to `Household.items`;
- generic NPC trade remains independent;
- player→household food/wood transfer remains unchanged.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
