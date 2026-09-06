# Plan: Household-Owned Profession Workplaces

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-002~~ ~~settlements-npcs-011~~
**Domain:** `settlements-npcs`
**Subdomains:** `household` `schedules`
**Tags:** `professions` `workplace` `yard` `placement`
**Roadmap:** -

## Goal

Make profession-specific physical workplaces belong to the household that actually contains the profession instead of existing as unconditional settlement-wide props.

Blacksmith is the first migration case:

- a settlement without a blacksmith has no anvil or grind workbench;
- a household containing a blacksmith gets the blacksmith equipment in that household's yard;
- the blacksmith NPC resolves a workplace owned by its household;
- profession equipment no longer invents an unrelated position near the settlement center.

The first stage should fix the current bug with the smallest coherent change. Profession-aware yard sizing is deliberately a second stage so the initial fix does not require a larger `VillagePlanner` rewrite.

## Current problem

The existing household/home model already gives every family a stable house/yard relationship, but the blacksmith workplace bypasses it.

Current flow:

```text
settlement
  └─ buildSettlementProps()
       └─ always creates blacksmith equipment
            ├─ anvil
            └─ grind workbench
                 ↓
            SettlementLandmarks.blacksmith
                 ↓
            workplaceFor('blacksmith')
```

The equipment is created even when no family contains a blacksmith and its position is chosen by a local settlement-center fallback rather than by the owning household yard.

This causes both semantic and spatial bugs: an empty profession can leave unexplained equipment behind, and the equipment can overlap unrelated infrastructure such as the settlement campfire.

## Ownership rule

Profession equipment should follow the existing world ownership chain:

```text
family
  ↓
household
  ↓
home
  ↓
household yard
  ↓
profession equipment
```

Do not create a separate global `work` plot or a new `ProfessionBuildingManager` for blacksmith equipment.

A workplace may still be communal or world-owned when that matches the profession: farmer → garden/field, fisher → dock, trader → market, woodcutter → trees. The household-owned rule applies only where the physical workplace is naturally part of the household.

## Stage 1 — Blacksmith household ownership

### 1. Derive blacksmith presence from family data

Use the already-generated settlement family definitions as the source for static placement requirements:

```text
def.families
  → family.members
  → member.character.role
```

For each family, determine whether that household contains a blacksmith.

Do not make static settlement placement depend on runtime `NpcAgent` state.

### 2. Place blacksmith equipment in the owning yard

Move anvil + grind workbench placement from the global settlement-center block into the yard of the house corresponding to the blacksmith family.

Reuse the existing family/house index alignment and household-yard concepts. Position equipment deterministically relative to that house and within the already reserved conservative yard clearance.

Treat the anvil + grind workbench as one logical workplace with a small internal arrangement rather than two independent settlement plots.

The workplace should expose a sensible NPC work/interaction anchor rather than forcing the NPC to target the exact center of the anvil mesh.

### 3. Conditional materialization

If no family contains a blacksmith:

- create no anvil;
- create no grind workbench;
- expose no blacksmith workplace.

If one family contains a blacksmith, create one workplace for that household.

If multiple households can contain blacksmiths, the representation must support one workplace per owning household rather than preserving a settlement-wide singleton.

### 4. Household-aware workplace resolution

The current blacksmith path through `workplaceFor()` only sees a settlement-wide landmark. Adjust the workplace resolution boundary so a blacksmith NPC can resolve the workplace belonging to its own household/home.

Preserve existing mappings for communal/world-owned workplaces.

Do not create a second NPC workplace system: extend the existing `Place`/`workplaceFor` mechanism or its immediate replacement.

### 5. Spatial safety for Stage 1

Use the current conservative household yard reservation as the initial spatial contract.

Ensure the blacksmith workplace:

- does not intersect the house footprint;
- fits inside the current usable yard clearance;
- does not collide with existing common yard props;
- remains deterministic for the same seed/family layout.

Do not add mesh-level collision solving or runtime settlement replanning.

If the current conservative yard is demonstrably insufficient for the blacksmith arrangement, keep the Stage 1 equipment compact and record the exact deficit for Stage 2 rather than broadly enlarging every household plot without evidence.

## Stage 2 — Profession-aware yard requirements

Once Stage 1 is stable, let settlement layout reserve yard space according to the actual household professions instead of using one conservative requirement for every family.

### 6. Per-family spatial requirements

Derive a household yard requirement from the generated family roles before house plot placement.

Conceptually:

```text
family roles
  → yard requirements
  → required household clearance
  → house plot placement
```

A household with a blacksmith may require more usable yard area than a household without profession equipment.

Keep the requirements deterministic and plain-data. Do not couple `VillagePlanner` to runtime NPC objects or rendered meshes.

### 7. Extend the existing yard contract

Extend the existing household-yard geometry contract rather than introducing a parallel occupancy system.

The planner should continue to own settlement-scale spacing. Profession equipment should consume the yard space reserved by that planner.

Prefer the smallest reusable representation that can later cover another real profession equipment case; do not design a generalized `profession → equipment[]` framework solely for hypothetical future content.

### 8. Keep equipment local to its parent footprint

Planner-level reservation should operate on the household/workplace footprint, not individual GLB meshes.

Within the reserved yard, child props can use deterministic local offsets:

```text
blacksmith workplace footprint
  ├─ anvil
  ├─ grind workbench
  └─ NPC work/access anchor
```

This keeps settlement planning coarse and scalable while preserving useful clearance.

## Audit while implementing

Inspect other props currently created unconditionally and classify them as:

- settlement infrastructure;
- communal workplace;
- household profession equipment;
- decoration.

At minimum inspect market, notice board and other profession-related props encountered in the same placement code.

Do not expand this plan into migrating unrelated props unless the same ownership bug is clearly present and the change stays coherent.

In particular, do not remove the market merely because a settlement currently has no trader without a separate semantic decision: a market can plausibly be communal settlement infrastructure.

## Tests

### Population → equipment

- settlement with no blacksmith family → no blacksmith equipment/workplace;
- blacksmith family → equipment appears at that family's yard;
- blacksmith workplace resolves to the correct household/home;
- multiple blacksmith households, if valid generator output, get separate workplaces.

### Spatial regression

- blacksmith equipment does not overlap its house footprint;
- blacksmith equipment does not overlap existing household storage/barrel/trough placement;
- blacksmith equipment does not overlap another household yard;
- regression coverage prevents the original campfire/blacksmith overlap;
- deterministic output for the same seed and family roles.

### NPC regression

- blacksmith resolves and uses its household workplace;
- non-blacksmith workplace mappings retain current behavior;
- a settlement without a blacksmith does not expose a phantom blacksmith workplace.

### Stage 2 planner coverage

When profession-aware sizing is added, test representative settlement sizes/seeds and assert the computed family-specific yard clearances are respected by house/yard/infrastructure spacing.

## Non-goals

- profession equipment for every role;
- dedicated forge buildings;
- blacksmith production/economy overhaul;
- weapon sharpening redesign;
- dynamic runtime profession changes and settlement replanning;
- physics or mesh-level placement solver;
- a new `ProfessionManager`, `PlacementManager` or parallel spatial system;
- unrelated settlement layout rewrite.

## Verification

Automated verification should cover the relevant unit/property tests and normal TypeScript/build checks used by the repository.

Manual browser verification is performed by the User, not the AI:

1. inspect a settlement without a blacksmith and confirm no anvil/workbench exists;
2. inspect a settlement with a blacksmith and confirm equipment is at that household's home yard;
3. confirm the NPC walks to a usable work anchor;
4. inspect several settlement sizes/seeds for visible yard/campfire/house overlaps;
5. after Stage 2, compare ordinary and profession-heavy households to confirm only the households that need more space reserve it.

Do not run `pnpm docs:sync`; documentation synchronization is handled by the GitHub workflow.

## Documentation / discovery

Add JSDoc for any important shared/public household profession workplace or yard-requirement helper introduced by the implementation. Use `@domain settlements-npcs` where it improves AI preflight discovery.

Update current-state documentation if the ownership contract or public architecture changes materially.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
