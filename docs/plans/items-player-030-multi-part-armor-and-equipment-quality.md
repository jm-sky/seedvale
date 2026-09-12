# Plan: Multi-part armor and equipment quality

**Created:** 2026-09-12
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** items-player-029
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `inventory` `items`
**Tags:** `armor` `equipment` `quality`
**Roadmap:** -

## Goal

Extend the wearable-armor system introduced by `items-player-029` into a composable multi-part armor system and introduce three quality levels for individual armor pieces.

The system should distinguish:

```text
armor kind/material
+ equipment slot
+ individual item quality
→ effective protection, weight and usage penalties
```

Quality represents the quality of materials, craftsmanship, construction, fitting and weight distribution.

A better-quality item should provide a better **protection / weight / mobility / stamina-cost** trade-off rather than simply multiplying armor protection.

## Target armor slots

Use the following target slot model:

```text
head
body
arms
hands
legs
feet
```

| Slot | Examples |
|---|---|
| `head` | leather helmet, metal helmet |
| `body` | leather armor, chainmail |
| `arms` | leather / metal pauldrons and arm protection |
| `hands` | leather / metal gloves or gauntlets |
| `legs` | leather / metal greaves |
| `feet` | leather boots, metal sabatons |

Do not introduce highly granular slots such as `neck`, `waist`, `leftShoulder`, `rightShoulder`, etc.

The six-slot model should remain understandable for player equipment management and scalable to future NPC equipment.

## Target protective item catalog

Target armor kinds:

```text
body
- leather armor
- chainmail

head
- leather helmet
- metal helmet

arms
- leather pauldrons
- metal pauldrons

hands
- leather gloves
- metal gauntlets

legs
- leather greaves
- metal greaves

feet
- leather boots
- metal sabatons
```

This gives a target of **12 armor ItemKinds × 3 possible qualities per physical instance**.

Do not create quality-specific kinds such as `chainmail_good` or `chainmail_masterwork`. Quality belongs to the physical instance.

Concrete new item kinds remain asset-gated. The architecture may support all six slots even when some corresponding visual assets are introduced later.

## Quality levels

Every armor instance has exactly one quality:

```ts
type ArmorQuality = 'common' | 'good' | 'masterwork'
```

Player-facing labels:

```text
Zwykła
Dobra
Mistrzowska
```

### Common

Ordinary equipment: ordinary materials and craftsmanship, average fitting and normal material usage. Uses the armor kind's baseline protection, weight and penalties.

### Good

Well-made equipment with better materials, construction, fitting, weight distribution and less unnecessary material.

Compared with common quality it should:

- provide somewhat better protection,
- weigh less,
- impose a smaller stamina penalty,
- impose a smaller movement penalty,
- impose smaller melee/recovery or mobility penalties where applicable.

### Masterwork

Exceptional craftsmanship with excellent materials, efficient construction, fitting and weight distribution.

Compared with common/good quality it should:

- provide the best protection,
- have the lowest effective weight,
- impose the smallest stamina penalty,
- impose the smallest movement penalty,
- impose the smallest recovery/mobility penalties.

The primary value of masterwork armor should be its excellent **protection-to-penalty ratio**, not disproportionately high damage reduction.

## Current architecture / recon

### Equipment

`src/items/equipment.ts` currently defines `EquipmentSlot = 'body'` and stores selected armor as an `ItemKind`.

This cannot distinguish two physical copies of the same armor kind with different qualities.

The existing ownership rule remains correct:

```text
Inventory owns item
Equipment references worn item
```

Do not introduce `EquipmentInventory` or another ownership container.

### Item instances

`src/items/itemInstances.ts` already provides stable physical item identity through `ItemInstance { id, kind }`.

`Inventory` already supports instance storage, lookup, mutation and persistence. Armor quality should extend this existing mechanism.

### Weight

Instance weight is currently derived from `ITEM_DEFS[instance.kind].weight`.

Quality requires effective instance weight. Introduce one shared resolver conceptually:

```text
base ItemKind weight
× instance-specific weight modifier
→ effective item weight
```

Use the same effective weight wherever an instance contributes physical mass or capacity. Do not special-case armor inside player encumbrance.

## Architecture

### 1. Expand equipment slots

Extend the equipment slot model to:

```ts
type EquipmentSlot =
  | 'head'
  | 'body'
  | 'arms'
  | 'hands'
  | 'legs'
  | 'feet'
```

Each slot contains at most one equipped physical instance.

### 2. Equipment references instances

Replace kind-only worn armor references with stable instance identity.

Conceptually:

```ts
type EquippedItemRef = { instanceId: string }
```

The owned `ArmorItemInstance` supplies `kind` and `quality`; the catalog supplies the base armor definition.

### 3. Armor becomes instance-backed

Introduce armor instances by extending the existing item-instance system:

```ts
type ArmorItemInstance = ItemInstance & {
  quality: ArmorQuality
}
```

Do not copy catalog armor statistics onto each instance. Instance state contains only genuinely per-instance information.

### 4. Keep base armor properties catalog-driven

`ITEM_CATALOG[kind].armor` remains the source of intrinsic armor design properties.

It should describe:

- equipment slot,
- base protection,
- base stamina penalty where justified,
- base movement/mobility penalty where justified,
- base melee/recovery penalty where justified.

`ITEM_DEFS[kind].weight` remains the ordinary/base physical weight. Quality modifies these baselines.

Do not create separate hard-coded statistics for each `ItemKind × quality` combination.

### 5. Quality modifies both benefits and penalties

Introduce one centralized quality definition/resolver:

```text
ArmorConfig baseline
+ ArmorQuality
→ effective armor properties
```

Quality may affect:

```text
protection            ↑ with quality
effective weight      ↓ with quality
stamina penalty       ↓ with quality
movement penalty      ↓ with quality
recovery penalty      ↓ with quality
mobility restriction  ↓ with quality
```

Exact mathematics and final balance numbers are deliberately outside this planning stage.

All quality effects must be resolved centrally rather than scattered through combat, movement or UI consumers.

### 6. Weight and direct armor penalties are distinct

Armor burden has two sources.

#### Physical mass

```text
armor effective weight
→ Inventory.totalWeight()
→ existing encumbrance
→ existing consequences
```

Quality reduces effective weight.

#### Armor-specific restriction

Some armor can additionally impose direct penalties because of rigidity, poor fitting, restricted joints, inefficient weight distribution or interference with movement.

These penalties may affect existing armor modifier channels such as stamina expenditure, movement and melee recovery. Quality reduces these penalties.

Therefore `weight penalty ≠ armor restriction penalty`. Both may coexist.

Do not make stamina depend only on weight, and do not use direct stamina penalties to duplicate effects already adequately represented by weight.

### 7. Central effective armor resolver

Keep `resolveEquipmentModifiers()` as the single gameplay derivation point.

Extend it to:

```text
equipped armor instance
→ base ArmorConfig
→ quality adjustment
→ effective piece modifiers

all equipped pieces
→ composition
→ EquipmentModifiers
```

Combat/movement systems must consume the aggregate result. They must not know individual quality rules, slots or specific armor kinds.

Never scatter checks such as `if (quality === 'masterwork')` through player systems.

### 8. Multi-piece composition

All equipped pieces contribute to the final armor state.

The composition model must avoid runaway protection when six pieces are worn. Exact mathematics should be decided during implementation/balance work, but the resolver must make composition explicit and deterministic.

Mixed armor sets are explicitly supported.

### 9. Equipment ownership invariants

For every slot:

- referenced instance must exist in the owning `Inventory`,
- its armor definition must match the slot,
- one instance cannot occupy multiple slots,
- removing/selling/dropping/transferring the instance invalidates equipment,
- invalid equipment contributes no gameplay effect,
- save/load never recreates a missing item.

### 10. Persistence

Persist armor instance `id`, `kind` and `quality`. Equipment persists instance IDs per occupied slot.

Older saves using the current body `ItemKind` representation require migration.

Existing `leather_armor` and `chainmail` should become physical armor instances with `quality = common`.

Migration must preserve ownership and equipped state without duplicating items.

### 11. Acquisition defaults

Ordinary newly acquired armor defaults to `common`.

Future systems may explicitly produce `good` and `masterwork`, for example skilled smiths/leatherworkers, expensive merchants, rare loot, quest rewards or crafting quality.

Do not implement those generation systems here.

### 12. UI

Extend the existing inventory/equipment presentation.

For an armor instance show:

- name,
- quality,
- equipment slot,
- effective weight,
- protection,
- stamina penalty,
- movement penalty,
- other relevant mobility/recovery penalties,
- equipped state.

Values displayed by UI must come from the same effective-property resolver used by gameplay. Do not duplicate quality calculations in Vue.

## Scope

Implement:

1. six-slot equipment model: `head`, `body`, `arms`, `hands`, `legs`, `feet`,
2. armor instance identity,
3. `common` / `good` / `masterwork`,
4. conversion of armor to instance-backed items,
5. equipment referencing instance IDs,
6. centralized effective armor-quality resolver,
7. quality-aware effective weight,
8. quality-aware armor penalties,
9. multi-piece equipment modifier composition,
10. persistence of quality and equipped instances,
11. migration of existing armor,
12. inventory UI support,
13. new armor kinds for confirmed usable assets,
14. tests covering slots, quality, ownership, weight, modifiers and persistence,
15. JSDoc for important public equipment/quality resolver APIs with `@domain items-player`.

## Non-goals

Do not implement:

- final balance tuning,
- armor durability,
- degradation,
- repair,
- smithing/leatherworking,
- crafting quality generation,
- random loot quality generation,
- merchant quality generation,
- NPC autonomous armor choice,
- NPC armor economy,
- hit-location damage,
- armor penetration,
- damage-type redesign,
- highly granular body slots,
- full character equipment screen,
- character-model armor attachment unless already supported economically by the existing asset pipeline.

## Implementation guardrails

- `Inventory` remains the sole owner of armor.
- Equipment stores references only.
- Quality belongs to `ItemInstance`, never `ItemKind`.
- Do not create quality-specific item kinds.
- Base armor properties remain catalog-driven.
- Quality adjustments have one source of truth.
- Effective item weight has one source of truth.
- Weight feeds the existing encumbrance mechanism.
- Direct armor penalties represent restrictions not adequately represented by mass.
- Quality may reduce both weight and direct armor penalties.
- Gameplay and UI consume the same effective-property resolver.
- Preserve actor-neutral equipment concepts for future NPC reuse.
- Avoid unrelated combat/movement refactors.

## Verification

Automated:

- every armor instance has valid quality,
- each armor kind occupies only its declared slot,
- one instance cannot occupy multiple slots,
- removing an equipped instance removes its effects,
- mixed armor sets compose correctly,
- qualities produce different effective properties,
- effective weight is used consistently by inventory capacity and encumbrance,
- quality survives save/load,
- all equipped instance IDs survive save/load,
- old leather/chainmail ownership migrates to common instances,
- old equipped body armor remains equipped after migration,
- UI/gameplay use consistent effective values.

Manual browser verification by User:

- equip armor in all available slots,
- create a mixed leather/metal set,
- compare common/good/masterwork versions of the same piece,
- verify weight differences,
- verify stamina/movement/recovery penalties differ with quality,
- verify protection differences,
- verify encumbrance interaction,
- save/load a mixed-quality set,
- verify compatibility with an existing save.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
