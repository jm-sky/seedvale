# Implementation notes — plan 185: NPC Role-Based Carried Weapons

**Reviewed:** 2026-08-21  
**Plan:** [2026-08-21--185--npc-role-based-carried-weapons.md](./2026-08-21--185--npc-role-based-carried-weapons.md)  
**Dependencies reviewed:** 177, 179, 184

## 1. Important correction to the plan: there is no existing NPC sword loadout

The current codebase does **not** contain an NPC that is already initialized with a sword.

The apparent existing sword path is `src/items/guardSword.ts`, but that mechanism is for the **player**: the home-settlement guard can grant the player a `long_sword` through dialogue/quest progression. It checks whether the player already has a sword; it does not put a sword into the guard's `NpcAgent` inventory.

Therefore:

- do not look for a hidden existing NPC sword-assignment path indefinitely;
- do not preserve `guardSword.ts` as an NPC-equipment source;
- `guardSword.ts` must remain a player reward mechanism and should not be coupled to plan 185;
- plan 185 is introducing the first role-based NPC weapon initialization mechanism.

The plan's acceptance criterion "existing NPC with sword → still has sword" should be interpreted as a regression check for the existing **player** sword reward, not as an existing NPC loadout, unless fresh code reconnaissance during implementation discovers otherwise.

## 2. Current NPC Inventory is temporary carrying, not persistent equipment

`NpcAgent` currently owns:

```ts
private readonly carried = new Inventory(undefined, NPC_CARRY_MAX_WEIGHT)
```

with `NPC_CARRY_MAX_WEIGHT = 5`.

The surrounding comments explicitly describe this inventory as a **brief hold between extracting a world resource and delivering it**, not as a persistent belongings/equipment system. This is the biggest architectural detail the implementation must account for.

Plan 185 therefore needs to deliberately extend the existing `carried` inventory's role rather than create `npc.weapon`, an equipment manager, or another inventory.

Recommended V1 interpretation:

- keep `NpcAgent.carried` as the single source of truth;
- seed its initial contents with a role-derived weapon during construction;
- do not add a separate equipment slot/state;
- do not add persistence merely for this feature unless the existing NPC lifecycle actually requires it;
- because NPC roles are deterministic/generated at construction, a default weapon can be deterministically re-derived when an NPC is reconstructed rather than persisted as duplicate state.

This is consistent with the plan's requirement to avoid a new equipment system.

## 3. Current role model

`src/ai/characters.ts` currently defines exactly these roles:

```text
woodcutter
farmer
guard
trader
miner
fisher
```

Random procedural NPCs use:

```text
woodcutter, farmer, guard, miner, fisher
```

`trader` is reserved for the home-settlement merchant (`Kasia`).

Reserved characters include:

- Anna → farmer
- Piotr → woodcutter
- Kasia → trader
- Marek → guard

Do not introduce a new role enum or duplicate role definitions for weapons.

## 4. Current melee items — use the catalog, not hard-coded weapon tables

`src/items/itemCatalog.ts` is the authoritative gameplay metadata source.

Current melee-capable item kinds include at least:

```text
knife
long_sword
spear
short_sword
shovel
axe
pitchfork
sickle
```

Important current details:

- `knife` — melee config, defense config, model; currently `spawn: 'starting'`.
- `long_sword` — melee + defense; `spawn: 'none'`; model exists; intended acquisition is via guard/merchant/player progression.
- `spear` — melee + defense; merchant stock.
- `short_sword` — melee + defense; merchant stock.
- `axe` — melee + defense + `wood_chopping` capability.
- `pitchfork` / `sickle` — melee + defense; village-onetime tools.
- `shovel` — melee + defense, but its gameplay identity is a digging tool and it is not a good default NPC weapon for this plan.
- `pickaxe` is **not currently melee-capable** despite being a tool, so do not assign it as a combat weapon merely because the NPC role is `miner`.

The exact catalog contents should still be rechecked at implementation time rather than copied from this note.

## 5. Recommended V1 role mapping

The codebase supports the following conservative initial mapping without introducing new items:

| Role | Default weapon | Rationale |
|---|---|---|
| `woodcutter` | `axe` | direct existing role/tool relationship; axe already declares `wood_chopping` |
| `guard` | `long_sword` | strongest existing sword identity and the existing guard/sword game concept |
| `farmer` | `knife` | existing light melee weapon; also semantically useful for harvesting/butchering |
| `trader` | none | merchant does not currently have a combat-role requirement |
| `miner` | none | `pickaxe` currently has no melee config, so do not pretend it is a weapon |
| `fisher` | none | no existing role-specific melee item is justified by current systems |

This is intentionally smaller than "every role gets a weapon". The plan says that a role may remain unarmed when there is no appropriate existing weapon.

If implementation reconnaissance finds an already-established role/tool convention that changes this mapping, prefer that existing convention.

## 6. Keep role → default weapon as a pure, central mapping

A small module/function is appropriate, for example:

```ts
export function defaultWeaponForRole(role: Role): ItemKind | null
```

The exact filename/API should follow project conventions.

The function should be pure data mapping only. It should not mutate inventory and should not know about `NpcAgent`.

Avoid:

```ts
if (role === 'woodcutter') this.carried.add('axe')
if (role === 'guard') this.carried.add('long_sword')
```

inside `NpcAgent`.

This also makes the mapping straightforward to unit-test without constructing a Three.js NPC.

## 7. Initialization ordering in NpcAgent

`NpcAgent` currently receives the `FamilyMember` in its constructor and assigns:

```text
const character = member.character
this.role = character.role
...
this.carried = new Inventory(...)
```

The `carried` field is currently initialized as a class field before the constructor body, while `role` is assigned in the constructor.

Do not force the role mapping into a class-field initializer that cannot see the resolved character role.

The cleanest implementation is likely to change the current inventory initialization so that the inventory is created/seeded after the role is known, while preserving the current `readonly` ownership semantics.

For example conceptually:

```text
resolve character
→ assign role
→ create NPC carried Inventory
→ add default role weapon if any
```

The exact refactor should follow TypeScript initialization rules and existing constructor structure.

## 8. Existing weapon preservation / duplicate prevention

There is currently no NPC weapon initialization to preserve, so the plan's "existing NPC sword" branch is not applicable to today's code.

Still, make the initialization helper idempotent where practical:

```text
if carried already holds the default kind
    do nothing
else
    add it once
```

Do not add a weapon in `update()`, combat start, threat reaction, or every construction pass.

A particularly important invariant is:

```text
one NPC construction → at most one default weapon unit
```

Do not use `add()` in a path that can execute repeatedly.

## 9. Inventory capacity is currently sufficient, but use the real API

`Inventory.add()` enforces both weight and size constraints. `NpcAgent` currently has a 5 kg carry limit and no explicit size limit (`Infinity`).

All proposed defaults fit comfortably under the existing NPC carry limit.

Use:

```ts
carried.add(kind, 1)
```

and check the boolean result if the implementation needs to guarantee successful initialization.

Do not bypass Inventory internals or add a special `addWeapon()` method unless a concrete existing need appears.

## 10. Item capability architecture: do not invent `melee` as an ItemCapability string

Plan 184 is already implemented.

Its important architectural decision is that `melee`, `ranged` and `defense` remain **rich capability/config fields** on `ITEM_CATALOG`. They were deliberately not converted into the generic `ItemCapability` string union.

Therefore plan 185 should use the existing combat abstraction as follows:

```text
Inventory
→ resolveNpcMeleeWeapon()
→ ITEM_CATALOG[kind].melee
```

and, where only presence is needed by threat logic, derive the boolean from the existing resolver/capability surface rather than adding another registry.

Do **not** add:

```ts
ItemCapability = ... | 'melee'
```

just for this plan.

## 11. NPC combat 177 is already inventory-driven

`src/ai/npcCombat.ts` already derives `MELEE_CAPABLE_KINDS` directly from `ITEM_CATALOG`:

```ts
const MELEE_CAPABLE_KINDS = Object.keys(ITEM_CATALOG)
  .filter((kind) => ITEM_CATALOG[kind].melee != null)
```

`resolveNpcMeleeWeapon(carried)` then finds the first matching kind actually held by the NPC.

This means plan 185 should require no combat registry changes for axe/sword/knife as long as their catalog entries continue to expose `melee`.

The desired runtime path is already:

```text
role
→ default ItemKind
→ NpcAgent.carried
→ resolveNpcMeleeWeapon(carried)
→ existing melee lifecycle / NPC Combat 177
```

Do not add weapon-specific combat branches.

## 12. Plan 179 threat decision: current API is exactly what the plan describes

`src/ai/npcAnimalThreat.ts` currently accepts:

```ts
hasMeleeCapability: boolean
hasRangedCapability: boolean
healthRatio: number
```

The decision deliberately treats lack of both capabilities as an impossible `defend` action and selects `flee`.

The current code does **not** have a `hasMeleeCapability()` method on `NpcAgent`.

The implementation should therefore not assume that method already exists. Inspect the current `NpcAgent.reactToAnimalThreat()` path and use the same existing resolver/capability calculation there.

A likely implementation is conceptually:

```ts
const meleeWeapon = resolveNpcMeleeWeapon(this.carried)
const rangedWeapon = resolveNpcRangedWeapon(this.carried)
const response = decideAnimalThreatResponse({
  hasMeleeCapability: meleeWeapon != null,
  hasRangedCapability: rangedWeapon != null,
  healthRatio: ...,
})
```

If the current code already performs equivalent checks, only the newly seeded inventory should be necessary for the threat decision to start seeing the NPC as armed.

Do not add weapon-specific rules such as `axe → defend` or `sword → defend`.

## 13. Do not confuse tool capabilities with combat capabilities

Plan 184 introduced operation capabilities such as:

```text
wood_chopping
meat_harvesting
branch_trimming
soil_digging
rock_mining
fire_starting
fishing
```

These are **not** substitutes for melee combat configuration.

For example:

```text
axe → wood_chopping + melee
pickaxe → rock_mining but currently no melee
```

So `Inventory.hasCapability('wood_chopping')` is not the correct question for NPC combat. Use `resolveNpcMeleeWeapon()` / the catalog's `melee` field.

## 14. Persistence / reload semantics

Current NPC `carried` inventory is not a persistent NPC belongings model. Do not expand save data solely to satisfy the wording "weapon in Inventory".

The preferred V1 model is:

```text
NPC recreated
→ role is recreated deterministically
→ default weapon is derived again
→ Inventory contains the role weapon
```

This is derived initial state, not a separately persisted equipment state.

However, implementation must inspect the actual NPC reconstruction/lifecycle before finalizing this decision. If a later code path starts treating `carried` as persistent NPC state, do not silently discard that behavior.

## 15. Role changes

Current `role` is a readonly value on `NpcAgent` and the `CharacterDef` role is generated/reserved at NPC creation. There is no current role-change/equipment lifecycle to integrate with.

Therefore no automatic weapon replacement should be implemented.

Do not introduce mutable role/equipment synchronization as part of plan 185.

## 16. Visual weapon representation is outside this plan

The existing held-item visual system is primarily player-oriented (`HeldTool` / `heldToolVisual.ts`). The NPC combat implementation resolves weapon data from `Inventory`; it does not require a visual weapon attachment to execute melee damage.

Do not expand NPC rendering/animation to display swords/axes unless the implementation discovers that current NPC combat already depends on a visual representation.

A combat-capable NPC can be technically armed through Inventory first. Visual presentation can remain a separate concern.

## 17. Important distinction: `long_sword` is currently a special player reward

`src/items/guardSword.ts` contains `askGuardForSword()` and `shouldGrantQuestSword()`. The latter protects the player's quest sword from duplicate grants.

Do not reuse this module for NPC role initialization.

Instead, plan 185 should directly add the existing `long_sword` item kind to the NPC's existing `Inventory` during NPC initialization.

This also means the guard's role-based sword is a new source of `long_sword`, while the guard dialogue remains the existing source for the player. The two flows should remain independent.

## 18. Tests — prefer pure tests plus small integration coverage

The role mapping should be tested without Three.js where possible:

```text
woodcutter → axe
farmer → knife
guard → long_sword
trader → null
miner → null
fisher → null
```

Then test the Inventory/NPC integration:

```text
new woodcutter → carried.holdsAny('axe')
new guard → carried.holdsAny('long_sword')
new farmer → carried.holdsAny('knife')
```

Existing combat resolver tests should be extended only if needed:

```text
Inventory({ axe }) → resolveNpcMeleeWeapon() === axe
Inventory({ knife }) → resolveNpcMeleeWeapon() === knife
Inventory({ long_sword }) → resolveNpcMeleeWeapon() === long_sword
```

Plan 179 tests should remain capability-oriented:

```text
armed + healthy → defend
unarmed → flee
```

Do not write tests that encode weapon-specific threat decisions.

## 19. Potential pitfall: NPC Inventory currently serves mining logistics

`NpcAgent.carried` is already used by the miner/resource-delivery flow. Adding one default weapon consumes a small amount of carry capacity.

This is harmless with the current 5 kg limit and weapon weights, but the implementation should not accidentally make the NPC inventory capacity depend on the weapon or reserve a fake equipment slot.

The same Inventory must continue to support:

```text
ore extraction → temporary carrying → household/settlement delivery
```

alongside the new default weapon.

## 20. Potential pitfall: weapon selection order

`resolveNpcMeleeWeapon()` scans derived catalog order and returns the first melee-capable item the NPC carries.

V1 role initialization should normally give an NPC exactly one melee weapon, so selection ambiguity does not arise.

Do not add multiple default melee weapons to an NPC as a way to represent "backup weapons". That would immediately make resolver ordering part of gameplay semantics.

## 21. Scope recommendation

Keep the implementation small:

1. Add one pure role → default weapon mapping using existing `Role` and `ItemKind` types.
2. Seed the existing `NpcAgent.carried` Inventory once at NPC construction.
3. Do not create an equipment object/slot/manager.
4. Do not modify `npcCombat.ts` unless a concrete integration defect is discovered.
5. Do not modify `npcAnimalThreat.ts`'s decision model; only ensure its existing capability input sees the newly carried weapon.
6. Add focused tests.
7. Verify the wolf → NPC threat → defend → NPC Combat 177 path.

## 22. Verification checklist

### Static / automated

- role mapping tests pass;
- NPC inventory initialization tests pass;
- `resolveNpcMeleeWeapon()` resolves axe/knife/long_sword;
- unarmed NPC still resolves no melee weapon;
- animal threat tests preserve `defend`/`flee` capability semantics;
- `npx vue-tsc --noEmit`;
- `npx eslint .`;
- `npm run build`;
- `npx vitest run`.

### Browser / gameplay

1. Start a fresh world.
2. Inspect several NPC professions.
3. Confirm woodcutters carry an axe, guards a long sword, and farmers a knife according to the final mapping.
4. Confirm miners/fishers/trader remain valid unarmed NPCs if the final mapping leaves them without a weapon.
5. Trigger the existing `setFrenzyWolf()` debug scenario.
6. Confirm the threatened armed NPC selects `defend` rather than `flee` when healthy.
7. Confirm `beginCombat()` enters the existing NPC Combat 177 melee path.
8. Confirm the resolved weapon is the actual Inventory item and damage reaches the wolf.
9. Confirm an unarmed NPC still flees.
10. Confirm player guard sword dialogue still grants the player's sword correctly and was not coupled to NPC equipment.

## 23. Final architectural decision

**Inventory remains the only NPC carried-item state.**

The new system should be:

```text
CharacterDef.role
      ↓
role → default ItemKind
      ↓
NpcAgent.carried: Inventory
      ↓
existing ITEM_CATALOG melee config
      ↓
resolveNpcMeleeWeapon()
      ↓
plan 179 capability decision
      ↓
plan 177 NPC Combat
```

No equipment manager, no weapon field, no weapon registry, no new combat pipeline, no weapon-specific threat rules.

The most important implementation correction is that the current codebase has **no pre-existing NPC sword assignment to preserve**; `guardSword.ts` is a player-reward path. Plan 185 should build the role-based initialization on the already-existing Inventory/combat architecture instead of trying to merge with a nonexistent NPC equipment path.
