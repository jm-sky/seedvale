# Implementation Notes: NPC profession-aware weapon choice and armor use

Plan: `docs/plans/npc-053-profession-aware-weapon-choice-and-armor-use.md`

These notes reflect current `main`; current code wins if it changes before implementation.

## Current seams to reuse

- `NpcAuthoritativeState.personalInventory` is already the authoritative/persisted owner of NPC personal gear. `NpcAgent` already resolves melee, ranged and active defense from that inventory; `carried` remains transient work/ammo supply.
- `src/ai/npcCombat.ts` is the correct ownership boundary for weapon/defense selection. Current `resolveNpcMeleeWeapon()` / `resolveNpcRangedWeapon()` still pick the first catalog-ordered owned kind; replace only that selection policy.
- `NpcAgent.beginCombat()` already resolves once and stores `combatMeleeWeapon` / `combatRangedWeapon`; keep this encounter cache. Update both `beginCombat()` and `canFightBack()` to pass `this.role`.
- `src/items/equipment.ts` is actor-neutral and already owns armor slots, live ownership validation, quality-aware `resolveArmorInstanceEffective()`, `createEquipmentState()`, and `resolveEquipmentModifiers()`.
- `resolveIncomingNpcDamage()` is already the combat-only NPC incoming-damage seam. It receives the authoritative personal inventory and applies active directional defense before `NpcAgent.takeDamage()`. This is the narrow place to add passive armor mitigation.
- `commitNpcDeath()` already moves the complete `personalInventory` into `postDeath.loot`. No death/corpse changes are needed.

Dependencies `items-player-027`, `items-player-029`, and `items-player-047` are present on current `main`; the new dagger/hatchet/masterwork hunting bow catalog entries and armor instance/quality system are available.

## Weapon selection

Change resolver signatures to require `Role`; do not derive profession elsewhere:

```ts
resolveNpcMeleeWeapon(inventory, role)
resolveNpcRangedWeapon(inventory, role)
```

Keep family/preference/scoring helpers pure in `npcCombat.ts`. Prefer a closed `Record<Role, ...>` for melee preferences so adding a new profession forces an explicit choice.

Do not retain `MELEE_CAPABLE_KINDS` / `RANGED_CAPABLE_KINDS` as ranking order. Iteration may still discover candidates from `ITEM_CATALOG`, but final ordering must be score + explicit deterministic tie-break.

For current melee kinds, classify the plan's named weapons explicitly. Any current melee-capable kind not explicitly classified should fall into `tool`, rather than becoming unusable. Add a focused completeness test over current `ITEM_CATALOG[kind].melee` so future catalog additions do not silently receive an unintended family.

Scoring should use catalog stats only:

```text
melee  = damage / (windUp + hitWindow + recovery)
ranged = damage / (drawTime + recovery)
effective = base × 1.5 when family is preferred
```

Guard invalid/non-positive cycle duration defensively even though current catalog values are valid. Compare candidates by:

1. higher effective score;
2. higher base score;
3. lexical `ItemKind`.

Use a small epsilon only if floating-point equality becomes a real test issue; do not introduce fuzzy ranking pre-emptively.

Selection remains by `ItemKind`, not concrete weapon instance. Sharpness/durability therefore stay intentionally out of scope.

## Ranged specifics

All current ranged weapons are bows, including `masterwork_hunting_bow`. Hunter's family bonus therefore multiplies all current candidates equally and does not change their internal ordering; still keep the same scoring path so a later ranged family can extend it cleanly.

Do not touch `resolveNpcAmmo()` / `NpcAgent.resolveRangedAmmo()`: current combat intentionally resolves ammo across personal belongings and transient work supply and removes from the actual source inventory.

## Derived NPC armor

Do not persist NPC `EquipmentState`. Derive best worn armor from owned armor instances when resolving combat damage.

Recommended local flow in `npcCombat.ts`:

```text
personalInventory
→ iterate ARMOR_KIND_LIST / inventory.getInstances(kind)
→ resolveArmorInstanceEffective(instance)
→ choose best instance per EquipmentSlot by damageReduction
→ tie: ItemKind, then instance id
→ createEquipmentState(inventory, derived slot→instance-id map)
→ resolveEquipmentModifiers(...)
```

Use `resolveArmorInstanceEffective()` for quality/weight-adjusted protection; do not reproduce armor formulas or rank directly by raw catalog `damageReduction`.

Using `createEquipmentState()` for the temporary derived selection is preferable to inventing a partial fake `EquipmentState`: it reuses the existing slot/catalog/ownership validation. The state is transient and may be rebuilt on each incoming combat hit; with six slots and the small current armor set this is simpler and safer than introducing an invalidation cache.

## Incoming damage order

Extend `resolveIncomingNpcDamage()` itself, because it is already used only for combat/physical attacks:

```text
raw amount
→ existing resolveDefense() active block
→ derived armor incomingDamageMultiplier
→ returned finalDamage
→ NpcAgent.takeDamage()
```

Preserve `ResolvedDefense.outcome` / `attempted`; only scale its `finalDamage`. Do not route starvation, dehydration, poisoning, healing, or generic `takeDamage()` through armor.

Do not apply movement/stamina/recovery armor restrictions to NPCs in this plan. There is no need to touch locomotion or melee lifecycle to satisfy the definition of done.

## Tests

Extend `src/ai/npcCombat.test.ts`; avoid a new integration harness.

Cover:

- profession preference + ×1.5 threshold and exact tie semantics;
- lexical/catalog-order-independent tie-break;
- guard chooses best sword, trader best compact, hunter best bow;
- clearly superior non-preferred family wins;
- all current melee-capable kinds classify intentionally (explicit family or tool fallback);
- no armor leaves `finalDamage` unchanged after active defense;
- best armor instance per slot wins, including quality;
- multiple slots compose through `resolveEquipmentModifiers()`;
- removing/transferring an armor instance immediately removes its mitigation on the next resolution;
- active block happens before passive armor.

No save-schema or corpse-flow tests are required unless implementation unexpectedly touches those files.

## Pitfalls

- Do not use `NpcAgent.carried` for weapon/armor ownership.
- Do not make profession preferences concrete-item rankings.
- Do not score block chance, range, stamina, sharpness or durability in V1.
- Do not mutate `ITEM_CATALOG` configs or add weapon-family metadata globally.
- Do not cache derived armor without an explicit inventory invalidation mechanism; current on-demand derivation avoids stale bonuses.
- Do not add NPC equipment persistence or visual armor attachment.
- Do not change combat mode selection, ammo selection, projectile lifecycle, or death-loot ownership.

## Suggested implementation order

1. Replace melee/ranged catalog-order selection with role-aware pure scoring + focused tests.
2. Pass `role` from `NpcAgent.canFightBack()` and `beginCombat()`.
3. Add the local best-armor derivation using existing equipment APIs.
4. Apply armor to `resolveIncomingNpcDamage()` after active defense and extend existing combat tests.
5. Run targeted NPC combat tests, typecheck and lint for touched files. Browser/manual verification remains User-owned.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
