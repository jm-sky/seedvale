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

Make profession-specific physical workplaces belong to the household that actually contains the profession when that ownership matches the world semantics.

Blacksmith is the first migration case:

- a settlement without a blacksmith has no anvil or grind workbench;
- a household containing one or more blacksmiths owns one blacksmith workplace in that household's yard;
- multiple blacksmith households own separate workplaces;
- a blacksmith NPC resolves the workplace owned by its household;
- profession equipment no longer invents an unrelated settlement-center position.

Keep communal settlement infrastructure and world/resource workplaces communal/world-owned. Do not turn every `Role` into a household workplace.

## Recon conclusions — current `main`

The current family/layout generation order already supports profession-aware planning:

```text
resolve identity
  → generateFamilies(...)
  → createVillagePlan(..., families, ...)
  → planVillageLayout(..., families, ...)
```

Stage 2 therefore does **not** require rerolling roles or moving family generation across the planner boundary. The planner already receives the same generated families that later become households/NPCs.

The current static/runtime identity chain is also already stable and index-aligned:

```text
def.families[familyIndex]
  ↔ house plot familyIndex/familyId
  ↔ landmarks.homes[familyIndex]
  ↔ homePlaceId(settlementId, familyIndex)
  ↔ households[familyIndex]
```

Reuse this chain. Do not invent a second profession-owner identity.

### Current blacksmith bug

`buildSettlementProps()` currently creates one settlement-wide blacksmith workplace unconditionally:

```text
fallback position near settlement center
  → anvil at (forgeX, forgeZ)
  → grind workbench at (forgeX + 1.0, forgeZ + 0.4)
  → SettlementLandmarks.blacksmith
  → workplaceFor('blacksmith')
```

There is no blacksmith plot or landmark in `VillagePlan`; the current position is a materializer fallback, not planner-owned space. `workplaceFor()` then exposes it as a settlement-wide singleton.

## Workplace ownership audit

Classification is semantic ownership, not merely the module that renders the prop.

| Place / prop | Current use | Ownership classification | Decision for this plan |
|---|---|---|---|
| House + household barrel/trough/storage | one set per family/home | **household-owned** | already correct; must reserve compatible yard slots |
| Blacksmith anvil + grind workbench | `blacksmith` `Place`, sharpening | **household-owned profession equipment** | **migrate now** |
| Garden / garden pads | farmer anchor; crops nearby | **communal settlement infrastructure** | keep communal |
| Planned field / `farm.glb` wheat visual | settlement food specialization; visual is not work target | **decoration/non-workplace** for the current mesh; field area is communal food infrastructure | no ownership migration |
| Market crate + barrel | trader workplace; guard patrol also uses market | **communal settlement infrastructure** | keep communal; conditional/planner mismatch is follow-up |
| Merchant wagon + merchant horse spawn | home-settlement market flavor / merchant setup | **communal/special settlement infrastructure**, not household workplace | follow-up only if merchant ownership is redesigned |
| Well | guard/hunter/fisher fallback anchor; water use | **communal settlement infrastructure** | keep communal |
| Stockpile + settlement storage | miner fallback/deposit and settlement economy | **communal settlement infrastructure** | keep communal |
| Dock | fisher workplace anchor | **communal settlement infrastructure** linked to the settlement/coast | keep communal |
| Settlement trees | woodcutter targets | **world/resource-owned** | keep world-owned |
| Ore deposits | miner's real extraction targets | **world/resource-owned** | keep world-owned |
| Live fauna hunted by hunter | hunter's real expedition targets | **world/resource-owned** | keep world-owned |
| Notice board | Work Contract publication | **communal settlement infrastructure** | keep communal |
| Decorative barrels beside stockpile | visual clutter | **decoration/non-workplace** | no change |
| Hay beside gardens | visual/lodging interaction, not profession work target | **decoration/non-workplace** | no change |

The important distinction is that a `Place` may be only an idle/crafting anchor while the actual work target is world-owned. Ownership follows the actual system semantics, not the name `workplace` alone.

## Profession → workplace matrix

All current `Role` values must remain covered.

| Role | Where work currently happens | Owner | Physical profession equipment required? | Current code vs intended semantics |
|---|---|---|---|---|
| `woodcutter` | settlement/world tree selected round-robin; real tree lifecycle target | world/resource | no dedicated household equipment | **aligned** — `workplaceFor()` points at a tree; keep world-owned |
| `farmer` | communal garden anchor; harvest/plant targets crops around it | settlement/community | garden/crops exist, but not household profession equipment | **aligned enough** — keep garden communal |
| `guard` | deterministic patrol through home, well and market | settlement/community + own home | no dedicated workplace equipment | **aligned** — well is only the generic anchor, patrol is the real work behavior |
| `trader` | market for own-household surplus transfer; other-household pickup and settlement storage for collection flow | settlement/community | market infrastructure, not household-owned equipment | **semantically communal**, but materialization is inconsistent with planner sizing; follow-up |
| `miner` | real ore deposit query; deposit to settlement stockpile; stockpile is idle fallback anchor | world/resource for extraction; settlement for storage | no dedicated household equipment | **aligned** — do not turn stockpile/mine into household property |
| `fisher` | dock when present; fishing action refuses to fish at the well; well is only no-dock idle fallback | settlement/community + world fishing spot semantics | dock, but not household-specific equipment | **aligned** — keep dock communal |
| `hunter` | live fauna expedition; household arrow crafting currently uses generic well workplace anchor | world/resource for hunting; communal anchor for fallback craft | no current dedicated physical crafting equipment | **partially abstract but intentional** — no migration now |
| `blacksmith` | sharpening uses own household inventory but walks to settlement-wide anvil landmark | **household** | **yes: anvil + grind workbench + reachable work anchor** | **not aligned** — migrate in Stage 1 |

## Ownership rule

Profession equipment should follow the existing world ownership chain when it is naturally part of a household livelihood:

```text
family roles
  ↓
household
  ↓
home
  ↓
household yard
  ↓
profession equipment/work anchor
```

Do not create a global `ProfessionBuildingManager`, a second `Place` system, a new occupancy grid, or a blacksmith settlement plot merely to preserve the old singleton shape.

## Blacksmith spatial contract

The blacksmith workplace is one compact household-yard footprint containing three semantic elements:

```text
blacksmith workplace
  ├─ anvil
  ├─ grind workbench
  └─ NPC work/access anchor
```

### Existing internal arrangement to preserve as the starting geometry

Current materialization establishes a useful compact relative arrangement:

- anvil center: local `(0, 0)`;
- grind workbench center: local `(+1.0, +0.4)`;
- center-to-center distance: about `1.08 m`;
- anvil and workbench may keep independent deterministic yaw, but their **positions** must be derived from one workplace basis;
- the work/access anchor must be beside the equipment in free space, not at the anvil mesh center.

Treat those offsets as the baseline arrangement to migrate into the household yard, not as two independently placed props.

### Yard basis

Use the owning house plus the existing yard convention to derive a deterministic local frame:

- **outward axis**: from settlement core toward the house, matching current barrel/trough/storage yard placement;
- **tangent axis**: perpendicular to that outward axis;
- common household props and profession equipment receive separate deterministic sectors/slots within that frame;
- do not consume extra `coreRandom()` calls that shift unrelated settlement decoration when a family/home-derived deterministic seed can isolate the profession layout.

The house entrance/front generally faces the plaza while common yard props occupy the outward side. Blacksmith equipment should stay in the outward/lateral yard area and must not block the house entrance/access path.

### Required invariants

For every materialized blacksmith workplace:

1. **Ownership** — workplace identity resolves to exactly one `familyIndex` / home / household.
2. **Conditional existence** — no blacksmith family means no anvil, no grind workbench and no blacksmith `Place`.
3. **House clearance** — equipment/access envelope is outside the actual `houseFootprintRadius()`.
4. **Common-yard clearance** — equipment/access envelope does not overlap that house's barrel, trough or storage slots.
5. **Access** — the NPC work anchor is outside equipment envelopes and has a clear local approach; do not target mesh centers.
6. **Neighbour clearance** — the workplace stays inside space legitimately belonging to the owning household rather than spilling into another house/infrastructure reservation.
7. **Determinism** — same world seed + settlement + family roles + house layout produces the same workplace geometry.
8. **Shared household workplace** — multiple blacksmith members in one household share one workplace; multiple blacksmith households get distinct workplace identities.

Do not add blacksmith props to the generic settlement collider system solely for this plan unless existing NPC/player navigation semantics require it. Spatial invariants should first be enforced by deterministic placement geometry and tests, not a new runtime collision solver.

## Yard reservation audit: current contract is not fully conservative

Do **not** assume the present `HOUSE_PLOT_RADIUS = 4.5` test proves enough usable yard for active modular houses.

Current `householdYardRadius()` derives `MAX_HOUSE_FOOTPRINT_RADIUS` from legacy `HOUSE_CATALOG`, whose largest home footprint radius is about `2.2`; with the outer storage offset `1.9`, the tested default yard requirement is about `4.1`.

Production settlement homes, however, preferentially use modular `HouseDefinition`s. Their runtime radius comes from `houseFootprintRadius(def)`:

```text
4×4  → ~3.28 radius → common storage edge ~5.18
6×4  → ~4.06 radius → common storage edge ~5.96
6×6  → ~4.69 radius → common storage edge ~6.59
8×6  → ~5.45 radius → common storage edge ~7.35
```

Therefore:

- `HOUSE_PLOT_RADIUS = 4.5 >= householdYardRadius()` is only proving the legacy-catalog contract;
- for several active modular houses, even existing common household props extend beyond the nominal 4.5 m house plot radius;
- Stage 1 must not claim guaranteed yard containment merely because the current unit test passes;
- Stage 2 must unify the yard requirement with the **actual selected house definition** (or an equally conservative plain-data bound) and profession requirements.

This is directly relevant to workplace placement, but it is not permission for a broad unrelated settlement rewrite.

## Stage 1 — Household ownership with bounded placement

Stage 1 fixes the ownership/materialization bug without rewriting `VillagePlanner`.

### 1. Derive owners from generated families

Use `def.families` / `familyIndex` as the static source of profession ownership before props are materialized. Runtime `NpcAgent` state must not decide whether static profession equipment exists.

One household containing any number of blacksmith members requires one blacksmith workplace.

### 2. Materialize per owning house

Replace the unconditional settlement-center blacksmith block with per-family yard materialization attached to the corresponding house/home index.

The output must support zero, one or many household-owned blacksmith workplaces rather than `SettlementLandmarks.blacksmith: Vector3` as a singleton.

Keep the workplace as a child concept of the household yard; do not add a `VillageLandmarkKind = 'blacksmith'` global landmark.

### 3. Resolve the correct workplace for the NPC

Extend the current `Place` / `workplaceFor()` boundary so household identity/home identity is available for household-owned roles.

Communal/world mappings remain unchanged.

A blacksmith `Place.id` must include stable household/home ownership rather than only settlement identity. Two blacksmith households in one settlement must not resolve the same `Place`.

### 4. Stage 1 spatial guarantee

Because the current nominal house-plot reservation is not sufficient for all modular houses, Stage 1 uses a **bounded conservative migration rule**:

- derive geometry from the **actual materialized house footprint**, not `HOUSE_CATALOG`'s legacy maximum;
- place blacksmith equipment in a dedicated outward/lateral sector that avoids the existing common yard-prop positions and house entrance;
- prove local non-overlap against the actual house + common yard placements in pure geometry tests;
- do not globally enlarge every plot or re-plan settlements in Stage 1;
- if a specific house/layout cannot satisfy the required compact workplace without leaving legitimately available local space, do **not** silently overlap: make the placement limitation explicit and cover it with a failing/unsupported-case decision before implementation is considered complete.

Stage 1 solves ownership and local layout. It does **not** establish a universal planner guarantee that every possible household yard has profession capacity — that is Stage 2.

## Stage 2 — Profession-aware yard sizing

Stage 2 makes the planner reserve enough space before materialization.

### 5. Compute per-family requirement before house plot placement

The planner already receives generated `families`, so derive requirements directly from that same data:

```text
selected house definition / conservative house footprint
  + common household yard requirements
  + family profession requirements
  → required household yard radius/footprint
  → house plot radius / spacing
```

Do not duplicate or reroll roles in `VillagePlanner`.

### 6. Use actual house-size truth consistently

The selected `HouseDefinition` and planner must not disagree about the physical house radius.

Prefer one deterministic plain-data source of the selected house definition/footprint that both planning and materialization can consume. Avoid making `VillagePlanner` inspect rendered meshes or Three.js objects.

The common yard contract must cover the active modular `HOME_HOUSE_DEFINITIONS`, not only legacy `HOUSE_CATALOG` fallback footprints.

### 7. Extend existing planner/clearing mechanisms

Thread the family-specific requirement through the existing house plot radius/spacing path instead of adding a parallel occupancy system.

Also keep `layoutClearingsFromPlan()` consistent: today house clearing radius is `max(params.houseRadius, plot.radius * 0.85)`. If the plot radius now expresses required usable profession yard, the terrain clearing/exclusion contract must not shrink it back below the usable requirement without an explicit reason.

Planner-level reservation stays coarse: one household footprint. The anvil/workbench/access offsets remain local child geometry inside it.

### 8. Preserve scalability

Profession-aware sizing should be a small pure geometry contract keyed by real current requirements. It may be reusable by a future profession with genuine household equipment, but do not pre-design a generic equipment framework for hypothetical roles.

## Stage 1 vs Stage 2 boundary

| Concern | Stage 1 | Stage 2 |
|---|---|---|
| remove unconditional settlement-wide blacksmith props | **yes** | — |
| zero/one/many blacksmith household workplaces | **yes** | — |
| household-aware `Place` resolution | **yes** | — |
| compact anvil/workbench/access arrangement | **yes** | may reuse unchanged |
| use actual house footprint for local non-overlap | **yes** | **yes** |
| globally guarantee enough reserved yard for every selected house/profession | no | **yes** |
| per-family planner house radius | no | **yes** |
| reconcile modular house footprints with yard contract | document/guard locally | **yes** |
| make terrain clearing honor profession-aware yard size | no | **yes** |
| new placement manager / occupancy grid | **no** | **no** |

## Related ownership problems

### Migrate now

Only the blacksmith workplace pair:

- anvil;
- grind workbench;
- their household-owned work/access anchor and workplace identity.

These share the same clear ownership bug and are one logical workplace.

### Follow-up / record, do not expand scope

1. **Market materialization vs planner semantics** — `VILLAGE_SIZE_CONFIG` plans markets only for LG/XL, while `buildSettlementProps()` still materializes a fallback market in every settlement. The market is also used by guard patrol and is a legitimate communal place, so do not remove/migrate it here. A separate decision should reconcile conditional planning/materialization, especially because the home settlement's unique trader can exist in SM/MD.
2. **Merchant wagon ownership/conditionality** — the home-settlement wagon is tied spatially to the market and exists as settlement flavor/infrastructure. Do not reinterpret it as Kasia's household property in this plan.
3. **Hunter crafting anchor** — arrow crafting currently uses the communal well workplace anchor despite being household-stock-based. There is no dedicated physical crafting prop today, so this is a semantic abstraction, not the same prop-ownership bug. Revisit only when a real household hunting/crafting surface exists.
4. **Legacy yard-radius source** — the common yard contract does not include active modular house footprints. This must be addressed by Stage 2 because it directly blocks a trustworthy profession-aware reservation contract; avoid turning it into a broader house-system refactor.

### Explicitly not ownership bugs

- notice board: communal Work Contract infrastructure;
- stockpile / settlement storage: settlement economy infrastructure;
- garden/dock/well: communal facilities;
- trees/deposits/fauna: world/resource-owned work targets;
- decorative stockpile barrels/hay/wheat mesh: decoration/non-workplace;
- household barrel/trough/storage: already household-owned.

## Test scenarios

Tests should prove ownership and geometry from plain data wherever possible; avoid a large scene/bootstrap fixture when a focused resolver/geometry test is enough.

### Scenario A — no blacksmith

Given a settlement whose generated families contain no `blacksmith`:

- zero blacksmith workplace records;
- zero anvil/workbench materializations;
- no NPC can resolve a phantom blacksmith `Place`;
- all other `workplaceFor()` mappings remain unchanged.

### Scenario B — one blacksmith household

Given families `F0`, `F1`, `F2` where only `F1` contains a blacksmith:

- exactly one workplace is owned by `F1` / its home id;
- its equipment is derived from `house[1]`, never settlement-center fallback coordinates;
- the blacksmith in `F1` resolves that workplace;
- non-blacksmith members of `F1` keep their normal communal/world workplaces;
- equipment clears the actual house footprint and `F1` barrel/trough/storage placements.

### Scenario C — two blacksmiths in one household

Given one family with two blacksmith members:

- one household workplace is materialized;
- both NPCs resolve the same stable household workplace id;
- no duplicate anvil/workbench pair is created.

### Scenario D — two blacksmith households

Given `F0` and `F2` containing blacksmiths:

- two workplace records and two equipment pairs exist;
- ids are distinct and stable by household/home identity;
- each NPC resolves only its own household workplace;
- neither workplace uses the old settlement-wide id/position.

### Scenario E — large modular house

Use an active 8×6 `HouseDefinition` (or equivalent deterministic selected definition):

- test uses `houseFootprintRadius(def)`, not legacy `HOUSE_CATALOG` max;
- common yard props demonstrate why nominal `HOUSE_PLOT_RADIUS = 4.5` is not a containment proof;
- Stage 1 compact blacksmith geometry either fits the accepted local contract without overlap or the unsupported layout is surfaced explicitly;
- Stage 2 required radius is at least actual house footprint + common/profession requirement.

### Scenario F — small legacy/fallback house

For a legacy/fallback house:

- Stage 1 layout remains valid;
- profession geometry does not depend on the modular-only path;
- same ownership identity rules apply.

### Scenario G — communal/world role regression

Assert representative mappings and ownership stay unchanged:

- farmer → garden;
- miner → stockpile as idle/deposit anchor while real mining targets a deposit;
- fisher → dock, and no-dock fallback does not become a household fishing prop;
- guard → communal patrol points;
- hunter → world fauna / current communal craft anchor;
- trader → market;
- woodcutter → tree.

### Scenario H — Stage 2 planner spacing

For representative SM/MD/LG/XL seeds/family sets with otherwise identical terrain:

- house plots retain stable `familyIndex`/`familyId` ownership;
- a blacksmith household's required plot/yard reservation is not smaller than an equivalent non-blacksmith household with the same house footprint;
- neighbouring houses/infrastructure respect the family-specific reservation;
- clearing radius does not invalidate the planner's required usable yard;
- results are deterministic for identical input.

### Scenario I — original central-overlap regression

A blacksmith workplace must never be produced from the old `(-2, -5)` settlement-center fallback. Campfire/market/notice-board positions are irrelevant to blacksmith ownership once equipment is attached to its household yard; do not solve this with special-case `avoid(campfire)` logic.

## Non-goals

- profession equipment for every role;
- dedicated forge buildings;
- blacksmith production/economy overhaul;
- weapon sharpening redesign;
- dynamic runtime profession changes and settlement replanning;
- physics or mesh-level placement solver;
- generic `ProfessionBuildingManager`, `ProfessionManager`, `PlacementManager` or occupancy grid;
- household ownership of communal market/garden/dock/well/stockpile;
- unrelated settlement layout rewrite.

## Verification

Automated verification should cover focused workplace resolution, household yard geometry, planner spacing and the repository's normal TypeScript/build checks.

Manual browser verification is performed by the User, not the AI:

1. settlement without a blacksmith has no anvil/workbench;
2. blacksmith equipment appears at the correct household yard;
3. NPC walks to a usable work/access anchor rather than inside the anvil;
4. two blacksmith households, if generated/test-injected, resolve separate workplaces;
5. inspect small and large modular houses for barrel/trough/storage/equipment/entrance clearance;
6. after Stage 2, compare ordinary and blacksmith households and confirm only required yard reservations grow.

Do not run `pnpm docs:sync`; documentation synchronization is handled by the GitHub workflow.

## Documentation / discovery

Add JSDoc for any important shared/public household profession workplace or yard-requirement helper introduced by the implementation. Use `@domain settlements-npcs` where it improves AI preflight discovery.

Update current-state documentation if the ownership contract or public architecture changes materially.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
