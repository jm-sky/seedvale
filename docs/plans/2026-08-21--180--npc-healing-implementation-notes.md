# Plan 180 — Implementation Notes: NPC Healing

**Reviewed:** 2026-08-21  
**Plan:** `2026-08-21--180--npc-healing.md`  
**Status:** `implementation notes`  
**Source of truth:** current code + tests + build configuration. The plan is treated as intent, not as a description of the current implementation.

## 1. Review verdict

Plan 180 fits the Seedvale architecture, but several assumptions in the plan do **not** match the current code and must be corrected before implementation.

The most important findings are:

1. **Plan 177 is already implemented.** NPC combat, incoming damage, `HealthState` and NPC death are available. Do not recreate combat plumbing.
2. **`HealthState` currently contains only `maxHp`, `currentHp` and `dead`.** It has no injury/condition/source information. `healHealth()` simply restores HP and therefore cannot by itself distinguish physical injury from any other future source of lost HP.
3. **Current NPC needs are only `food`, `water`, `waterDuty`, `wood`, `idle`.** There is no general pressure/problem system in `Needs.ts` and no `health` need should be added just to represent an injury.
4. **NPC starvation/dehydration damage is not part of the current NPC implementation.** Plan 165 concerns player hunger/thirst/deprivation; it is not evidence that NPC hunger/thirst currently damages NPC HP. Therefore V1 should not invent a second deprivation-damage system merely to satisfy the wording of plan 180.
5. **The player already has a catalog-driven health consumable path, but it is player-action code.** `survivalActions.ts` reads `ITEM_CATALOG[kind].consumable`, removes the item and calls `healHealth()`. NPCs cannot call this player action closure directly. The implementation needs a small reusable item/effect seam or an NPC-local use of the same catalog contract; it must not create a second consumable definition.
6. **There is no generic medical-location system.** `NpcAgent` already has `home` and settlement `Place` data, so V1 should use an existing destination such as home rather than introducing `HealingLocation`, hospital, doctor or medical manager.
7. **The existing NPC action system is already the correct execution mechanism.** `NpcAgent` uses `PlannedAction` + `ActionLifecycle` with generic `goTo → execute`; healing should become another `ActionId`, not another FSM or manager.

The implementation should therefore be a small extension of the existing NPC decision/action, inventory and health seams.

## 2. Current health architecture

### `src/shared/HealthState.ts`

The current shared health primitive is deliberately small:

```ts
export type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}
```

`damageHealth()` subtracts HP and marks the state dead at zero. `healHealth()` adds HP up to `maxHp` and never revives a dead entity.

Keep this boundary. Do **not** put NPC AI, attacker/source information, inventory, treatment policy or conditions into `HealthState` just for plan 180.

The current contract means that a healing action can safely call `healHealth()`, but the decision whether HP loss is actually healable must be represented elsewhere.

### NPC combat damage

Plan 177 already routes incoming NPC damage through:

```text
animal / NPC / player attack
        ↓
NpcAgent.applyIncomingCombatDamage()
        ↓
resolveIncomingNpcDamage()
        ↓
HealthState
        ↓
NpcAgent death/reaction
```

`resolveIncomingNpcDamage()` remains a pure defense resolver. Do not add healing there and do not make combat automatically consume a healing item.

The important extension point for plan 180 is the **NPC-owned damage consequence**, immediately after final damage has been accepted by the existing health path. That is where V1 can record that the NPC has an outstanding physical injury.

## 3. The missing V1 injury representation

The plan correctly says that `currentHp < maxHp` is not enough. The current repository, however, has no condition/injury model to answer that question.

Do not implement the full future model:

```text
conditions[]
injuries[]
severity
duration
effects
treatment
```

For V1, use the smallest explicit runtime representation that answers one question:

> Does this NPC currently have healable physical injury caused by actual physical damage?

Recommended direction:

```ts
private physicalInjury = 0
```

or an equally small existing-state-compatible representation if the final code inspection reveals a better owner.

Semantics:

- `physicalInjury === 0` → no healable physical injury;
- positive value → outstanding physical injury;
- combat damage increases it by the **actual final damage** applied after defense;
- healing reduces it by the actual health restored;
- it must never exceed the actual HP deficit attributable to the injury;
- it must not be created by hunger/thirst need values;
- it must not revive a dead NPC.

The key invariant is:

```text
physicalInjury <= maxHp - currentHp
```

If the implementation later introduces other damage sources, this simple field can be replaced by a proper condition collection without changing the decision/action contract.

Do not use `currentHp < maxHp` as a fallback when `physicalInjury === 0`. That would immediately reintroduce the exact ambiguity this plan is trying to remove.

### Important current-code consequence

At present, NPC HP damage is provided by combat. The plan's starvation/dehydration distinction is therefore mostly a **future compatibility requirement**, not a current second damage path.

Do not implement NPC starvation/dehydration HP damage as part of 180. If a future plan adds such damage, it must explicitly classify that damage as non-healable deprivation rather than silently increasing `physicalInjury`.

## 4. Healing should be a pressure/decision, not a NeedId

Current `src/ai/Needs.ts` defines:

```text
food
water
waterDuty
wood
idle
```

and `pickNeed()` arbitrates those needs before schedule-driven actions.

Do **not** add:

```ts
NeedId = ... | 'health'
```

just to make healing fit the existing `pickNeed()` API. Physical injury is not the same semantic category as hunger, thirst or wood duty.

The clean V1 integration is a small additional decision input in `NpcAgent.choose()`:

```text
critical survival / collapse handling
        ↓
existing pickNeed()
        ↓
healable physical injury pressure
        ↓
schedule
```

However, exact priority must be decided from the existing `choose()` implementation, not copied from the plan. In particular, critical thirst/water currently has established priority semantics and should not accidentally lose to a moderate injury.

A useful pure helper can be introduced if needed, for example conceptually:

```ts
healingPriorityFor(injury, health, hasConsumable)
```

but do not create a generic `NpcDecisionManager`, `PressureManager` or `HealingAI`.

### Recommended priority semantics

Use existing need scoring as the first authority. Healing should compete with the result only when there is an actual injury and an available health consumable.

A conservative V1 rule is:

```text
critical water / food need
    → existing need wins

no urgent survival need + serious injury
    → healing wins over ordinary schedule/work

minor injury
    → may continue normal activity

no injury / no usable medicine
    → normal decision flow
```

Do not invent personality-based medical scoring unless the existing decision layer already exposes a clean trait/personality input that can be reused without creating a second scoring system.

## 5. Consumables: reuse the existing catalog contract

`src/items/itemCatalog.ts` already defines:

```ts
consumable?: {
  need: 'hunger' | 'thirst' | 'health'
  relief: number
  resultKind?: ItemKind
}
```

This is the correct source of truth.

The current player consume path in `src/app/actions/survivalActions.ts` does exactly what plan 180 wants conceptually:

```text
ITEM_CATALOG[kind].consumable
        ↓
Inventory.remove()
        ↓
apply effect
        ↓
healHealth() for need === 'health'
```

The NPC implementation must not hardcode `bandage`, its healing amount, or a future medicine list.

Resolve a candidate by:

```ts
ITEM_CATALOG[kind].consumable?.need === 'health'
```

and verify the item is actually present in `NpcAgent`'s carried `Inventory`.

### Player consume code is not an NPC API

Do not make `NpcAgent` depend on `createSurvivalActions()` or fake a `PlayerActionContext` just to call `consumeItem()`.

That would couple NPC simulation to player UI/action wiring.

If duplication is undesirable, extract only the **domain-neutral item effect operation** needed by both paths, e.g. a small helper that:

- reads `ITEM_CATALOG[kind].consumable`;
- validates/removes the item;
- applies the health effect through `healHealth()`;
- handles `resultKind` if a health consumable ever needs one.

Keep player-specific HUD/toast/freshness behaviour in player actions.

Do not create `NpcConsumableSystem`.

## 6. NPC Inventory ownership

`NpcAgent` already owns a temporary/carried `Inventory` and plan 177 uses that same inventory to resolve NPC weapons/ammo.

Use the same inventory for medicine.

Required flow:

```text
decision
  ↓
find carried health consumable
  ↓
select treatment location
  ↓
goTo
  ↓
execute healing
  ↓
remove item
  ↓
healHealth()
  ↓
reduce physicalInjury
  ↓
complete action
```

Do not add:

- medical storage;
- NPC backpack class;
- medicine reservation ledger;
- household medicine stock;
- automatic item spawning;
- a separate consumable inventory.

If normal NPC generation currently does not give NPCs a health consumable, that is a gameplay/data issue, not a reason to create a provisioning system inside plan 180. The implementation can be tested with an NPC that actually carries a health consumable.

## 7. Action integration

`NpcAgent` already has a generic phase/action model:

```text
choose
  ↓
goTo
  ↓
execute
```

and a generic `NpcPlannedAction` containing destination, duration and `onComplete`.

Add a small `ActionId` such as:

```ts
'heal'
```

rather than adding a new phase like:

```text
healing
movingToHealing
usingMedicine
```

The action should carry enough data to perform the treatment safely, for example:

```text
itemKind
selected destination
```

Avoid storing a Three.js `Object3D` or long-lived `NpcAgent` reference inside the action. The existing action model intentionally uses plain destination snapshots.

### Duration

Healing should be a real simulation action rather than an instant HP mutation when the decision is made.

Use a small fixed treatment duration or an existing generic action duration convention. Do not tie the duration to render animation. The action should still work for off-screen NPC simulation.

## 8. Treatment location: use existing home/place data

There is no `HealingLocation` abstraction in the current code.

`NpcAgent` already has a `home` position and settlement places already represent existing world locations. V1 should prefer:

```text
NPC home
```

as the treatment destination.

Do not create:

- hospital;
- doctor;
- medical station;
- `HealingLocation`;
- `SafePlaceManager`.

The plan's broader concept of "other known safe place" is future scope unless the current code already exposes a generic safe-place contract.

### Home is a destination, not a teleport

The healing action must go through the existing `goTo` movement lifecycle. Never set the NPC position to home just because healing was selected.

If the NPC has no usable home destination, fall back to the smallest existing valid destination rather than introducing a new location system. If no valid destination exists, the healing action should fail cleanly and the NPC should return to normal decision making.

## 9. Healing execution semantics

The actual treatment completion should be authoritative and revalidate state.

At `execute` completion:

1. NPC is alive.
2. `physicalInjury > 0`.
3. The selected item is still present in inventory.
4. The selected catalog entry still has `consumable.need === 'health'`.
5. Healing is still meaningful (`currentHp < maxHp`).
6. Remove exactly one item.
7. Apply the catalog `relief` through `healHealth()`.
8. Reduce `physicalInjury` by the actual HP restored, not blindly by catalog relief.
9. Complete the action.

If any precondition is invalid, do not consume the item.

This matters because the world may change while the NPC is walking to treatment: another system may damage/kill the NPC, the item may be removed by a future inventory mechanic, or the injury may already have been treated.

### Do not heal dead NPCs

`healHealth()` already refuses to heal `dead` health. The action should additionally fail early rather than consuming a medicine that cannot have an effect.

## 10. Combat → healing transition

Plan 177 deliberately keeps combat as an execution mode and lets normal NPC decision-making resume after combat.

The intended flow is:

```text
NPC receives combat damage
        ↓
physicalInjury > 0
        ↓
combat continues normally
        ↓
combat ends / target invalid
        ↓
normal choose()
        ↓
healing pressure
        ↓
heal action
```

Do **not** add a combat callback that automatically starts healing.

Do not make `NpcAgent.applyIncomingCombatDamage()` call `beginHealing()`.

This preserves the architecture from plan 177: combat executes an intent; health/injury is state; decision code chooses the next action.

## 11. Healing must not interrupt active combat

The plan explicitly says an NPC should not stop active combat simply because it is injured.

Therefore the existing `combat` phase must remain authoritative. Healing pressure should only be evaluated once normal decision-making resumes, unless the current combat implementation explicitly ends/cancels first.

Do not extend the critical-need interrupt mechanism from plan 114 to automatically interrupt combat for healing.

The existing critical interrupt path is designed around `goTo` / `execute` need actions and has specific cleanup semantics. Combat is a different phase with its own lifecycle.

## 12. Interaction with critical hunger/thirst

Current NPC `Needs.ts` represents hunger/thirst as rising urgency, not HP damage.

Therefore the implementation should treat these independently:

```text
hunger/thirst need
    → existing food/water response

physicalInjury
    → healing response
```

If both exist, use the existing need arbitration first and only select healing when it is not superseded by a genuinely urgent need.

Do not implement:

```ts
if (npc.health.currentHp < npc.health.maxHp) heal()
```

and do not implement:

```ts
if (npc.needs.hunger > threshold && hpLow) useBandage()
```

The bandage must respond to `physicalInjury`, not to deprivation level.

## 13. Future starvation/dehydration damage

This is a significant plan/code discrepancy worth documenting for the implementing agent.

Plan 180 describes three possible HP-loss sources:

```text
physical injury
starvation
dehydration
```

The current repository does not yet implement the NPC side of the latter two. Plan 165 is a **player** hunger/thirst/deprivation plan and should not be pulled into 180 merely to manufacture the distinction.

When a future NPC deprivation system is implemented, its damage path must explicitly avoid marking the damage as `physicalInjury`.

Conceptually:

```text
apply NPC damage
    ├─ physical combat/environmental injury → physicalInjury += finalDamage
    ├─ starvation                       → HP damage only
    └─ dehydration                      → HP damage only
```

That future distinction should be implemented at the damage-source owner, not by inspecting HP deltas after the fact.

## 14. No full injury/condition system in V1

Do not introduce a large abstraction now just because future injuries are mentioned in the plan.

Avoid:

```text
ConditionManager
InjuryManager
MedicalSystem
TreatmentSystem
HealthController
```

The V1 contract should be small enough that a future migration can replace:

```text
physicalInjury: number
```

with something like:

```text
injuries[] / conditions[]
```

without changing:

```text
NPC decision → PlannedAction → Inventory → treatment
```

## 15. Suggested implementation ownership

Likely touch points, to confirm against the final code before editing:

```text
src/ai/NpcAgent.ts
  - V1 physical injury state
  - injury update from accepted damage
  - healing candidate selection
  - healing decision/action
  - heal action completion

src/shared/HealthState.ts
  - normally NO change

src/items/itemCatalog.ts
  - normally NO change; existing `consumable.need === 'health'` is authoritative

src/app/actions/survivalActions.ts
  - possibly extract a small domain-neutral consumable effect helper;
    do not make NPCs depend on PlayerActionContext

src/ai/Needs.ts
  - normally NO change unless the existing arbitration genuinely needs a
    small pure scoring extension; do not add `health` as NeedId

src/shared/... tests
  - health regression if a shared helper is extracted

src/ai/... tests
  - pure healing/injury decision tests where practical
```

Do not touch combat architecture from plan 177 except at the smallest NPC-owned damage consequence seam.

## 16. Potential issue: NPC inventory may not contain medicine

The item catalog contains `bandage`, and the catalog supports `health` consumables, but the implementation must verify how NPC inventories are populated in the current code.

Do not assume that every NPC owns a bandage.

The correct runtime rule is:

```text
injury + no health consumable
    → no healing action
    → normal decision flow
```

This is important for off-screen simulation: there must be no hidden item creation simply because an NPC became injured.

If gameplay later needs settlement medicine supply, that belongs to inventory/logistics/economy work, not to this healing plan.

## 17. Potential issue: injury amount vs HP deficit

The simple V1 representation needs careful handling when multiple events happen between healing decisions.

Example:

```text
maxHp = 100
HP = 100

combat damage 20
→ HP 80
→ physicalInjury 20

combat damage 10
→ HP 70
→ physicalInjury 30

heal item relief 25
→ HP 95
→ physicalInjury 5
```

This gives a stable invariant and prevents a healing item from claiming to treat more injury than the HP it actually restored.

If another future non-healable damage source reduces HP after the injury is recorded, the implementation must not allow `physicalInjury` to exceed the actual HP deficit. This is another reason to clamp the V1 field at action time.

## 18. Action interruption and stale healing actions

Reuse the existing `ActionLifecycle` cancellation/failure cleanup.

A healing action must tolerate:

- NPC death;
- item disappearing;
- injury disappearing;
- destination becoming invalid;
- movement watchdog abandonment;
- another higher-priority critical need interrupting before treatment starts.

Do not create `cancelHealing()` or a second healing cleanup mechanism unless the generic action lifecycle genuinely cannot represent the required cleanup.

The action should have no partial mutation before its authoritative completion point. In particular:

```text
start action
  → no item removal
  → no HP mutation

complete action
  → validate
  → remove item
  → heal
```

## 19. Performance

Healing is low-frequency and should be cheap.

Do not add:

- per-frame scans for injured NPCs;
- a global `NpcHealingSystem`;
- a global inventory scan;
- a medical manager;
- worker communication;
- per-frame item catalog traversal for every NPC.

Candidate medicine lookup can happen when `choose()` evaluates the NPC. If the NPC inventory is small/count-based, a linear scan of carried item kinds is acceptable.

If a central helper is extracted, it should remain a pure/local operation.

## 20. Tests

Prioritize pure behaviour and existing boundaries.

### Injury state

- combat damage creates physical injury;
- defense-reduced final damage is the amount recorded as injury;
- multiple damage events accumulate;
- injury never exceeds the actual HP deficit;
- healing reduces injury by the actual HP restored;
- dead NPC cannot be healed/revived;
- starvation/dehydration values do not create physical injury.

### Consumable selection

- an inventory item with `consumable.need === 'health'` is a valid candidate;
- an item with `hunger`/`thirst` is not a healing candidate;
- no health consumable means no healing action;
- the implementation does not depend on the literal `bandage` kind;
- catalog `relief` is used rather than a hardcoded amount.

### Decision

- no physical injury → no healing pressure;
- minor injury may leave the current normal decision unchanged;
- sufficiently serious injury can beat ordinary schedule/work;
- critical food/water need retains the established priority;
- healing is not selected merely because `currentHp < maxHp`;
- healing does not interrupt active combat.

### Action

- NPC moves to the selected existing treatment destination;
- no teleport occurs;
- item is not consumed when movement/action fails;
- item is consumed once on successful completion;
- HP increases once;
- injury decreases by the actual healed amount;
- after completion the next decision is fresh rather than an automatic return-to-work action.

### Combat integration

- existing plan 177 combat tests remain green;
- accepted NPC damage records injury without starting healing;
- combat ending returns to normal decision flow;
- dead NPC remains dead.

## 21. Verification guidance

Technical verification should cover:

```text
npx tsc --noEmit
npm run lint
npm run build
npm test
```

For the browser/manual pass, the highest-value scenario is:

```text
NPC with health consumable
    ↓
receive combat damage
    ↓
remain in combat until combat ends
    ↓
normal decision
    ↓
select healing
    ↓
walk home
    ↓
wait treatment duration
    ↓
consume health item
    ↓
HP restored
    ↓
normal decision again
```

Also verify:

```text
NPC low HP but no physical injury
    → no healing

NPC injured but no health consumable
    → no healing

NPC injured + critical thirst/hunger
    → existing urgent need remains authoritative

NPC dies before treatment completes
    → no item consumption / no revive
```

Do not treat the existence of a health consumable in the item catalog as proof that NPC gameplay can currently acquire or carry one. Test with an actually populated NPC inventory or add a controlled debug/test setup rather than production-only provisioning.

## 22. Final implementation guidance

The safest implementation shape is:

```text
existing combat damage
        ↓
NpcAgent records minimal physical injury
        ↓
normal NPC decision
        ↓
healing pressure (not NeedId)
        ↓
existing PlannedAction / goTo → execute
        ↓
existing NPC Inventory
        ↓
ITEM_CATALOG consumable.need === 'health'
        ↓
healHealth()
        ↓
physical injury reduced
        ↓
normal decision
```

The important architectural rule is that **injury is state, healing is a decision, treatment is an action, and the item catalog/inventory remain the resource mechanism**.

Do not solve the future condition system, medical facilities, NPC medicine logistics, deprivation damage or a generic AI pressure framework inside plan 180.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
