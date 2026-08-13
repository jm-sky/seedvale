# Plan 070 — World Observatory — Implementation Notes

> Review and implementation plan based on the current codebase and the current `docs/STATE.md`, `docs/plans/README.md`, `docs/VISION.md`, `docs/ROADMAP.md`, plus plans 071 and 069.
>
> This document intentionally narrows the original XL plan. World Observatory is a difficult cross-cutting feature: it touches simulation ownership, settlement streaming, economy, NPC/family state, fauna, historical data and the Vue UI. The implementation should therefore be incremental and should expose existing state rather than create a second simulation model.

## 1. Review verdict

**Direction: approved, but the original plan is too broad to implement as one feature.**

The most important part of the plan is not the UI. It is the principle:

> **World Observatory is a read-only window into the simulation, not another simulation system.**

The original plan mixes three different things:

1. current-state inspection;
2. historical/trend analysis;
3. world-event/history infrastructure.

These should not be implemented together.

Recommended order:

```text
071 — settlement economy
        ↓
069 — household resources
        ↓
070-A — observability/read model foundation
        ↓
070-B — settlement + household + NPC inspection
        ↓
070-C — economy/resource flows
        ↓
070-D — events + history
        ↓
070-E — trends/charts
        ↓
070-F — fauna / social graph / advanced views
```

The panel can therefore start small and become richer as the simulation itself gains authoritative state.

---

## 2. Why 070 should not start as an XL UI project

The current project already has:

- `Settlement` / `SettlementsManager`;
- NPC agents with needs, schedules, actions, traits, family context and relations;
- `SettlementEconomy` and `EconomyRegistry` from 071;
- settlement definitions/families/homes from the village-generation pipeline;
- fauna agents/life simulation;
- a hybrid vanilla DOM + Vue 3/Tailwind UI;
- streaming of settlements;
- a mutable `WorldBundle` lifecycle.

`SettlementsManager` already owns the important distinction between settlement definitions, loaded runtime settlements and settlement economies. The observatory must respect this lifecycle instead of traversing Three.js scene objects or creating a parallel global registry.

The current Vue architecture also provides a suitable presentation layer: one Vue overlay with a small reactive store and facade-compatible screens. Do not migrate unrelated UI as part of 070.

---

## 3. Core architectural decision

### 3.1 No `WorldObservatoryManager` owning copied world state

Do **not** create something like:

```text
WorldObservatoryManager
  ├── settlements[]
  ├── households[]
  ├── npcs[]
  ├── resources[]
  └── animals[]
```

That would become a second simulation database and would immediately create synchronization problems.

Instead use a read-only query/projection boundary:

```text
Simulation state
      ↓
Observatory queries / adapters
      ↓
small read-only view models
      ↓
Vue Observatory UI
```

The view models are **ephemeral UI projections**, not authoritative state.

### 3.2 The observatory should not know Three.js

The UI must not inspect:

- meshes;
- `Object3D.userData`;
- scene children;
- NPC visual labels;
- GLTF objects;
- physical props to infer economic state.

All information must come from simulation/domain state.

This keeps the observatory useful even when entities are streamed out or their visual representation changes.

### 3.3 Read-only means read-only

The first version should not expose actions such as:

- give resource;
- heal NPC;
- teleport NPC;
- change needs;
- force production;
- complete development;
- kill/spawn animal;
- change relationship.

Those belong to debug tooling, not the game-facing Observatory.

A future debug inspector can reuse the same query layer if needed.

---

# 4. Current state vs historical state

This is the most important scope split.

## 4.1 Current state — implement first

The first observatory should answer:

```text
What is happening now?
```

Examples:

- settlement population;
- households;
- household stock;
- settlement stock;
- shortages/surplus;
- NPC current activity;
- NPC needs;
- NPC household/family;
- available production/demand;
- livestock count;
- loaded/unloaded settlement state.

This requires no new historical database.

## 4.2 History — separate implementation stage

The original plan asks for:

- births;
- deaths;
- migration;
- harvests;
- conflicts;
- threats;
- production history;
- relationship changes.

These cannot be reconstructed reliably from current state alone.

Do not fake history by polling current values and guessing what happened.

When history becomes necessary, add a small domain event/history mechanism with explicit event emission at authoritative state transitions.

Example:

```text
NPC action completes
      ↓
state mutation
      ↓
optional simulation event
      ↓
bounded history buffer
      ↓
Observatory event feed
```

The history mechanism should be introduced only when the first real consumer exists.

---

# 5. Trends and charts are not free

The original plan lists population, stock, production, consumption, births, deaths and migration charts.

A chart needs historical samples or events. The observatory cannot derive a reliable trend from one current snapshot.

Therefore:

```text
current value     → query directly
trend over time    → historical sample/event infrastructure
```

Do not add a generic time-series database for 070.

Start with a bounded, low-frequency simulation history owned by the relevant simulation/domain layer.

Possible later structure:

```text
SettlementHistory
  ├── periodic economic samples
  └── significant events
```

Keep it bounded in memory initially. Persistence can be added when the save model is ready.

---

# 6. Recommended observability boundary

Create a small domain-facing query API. Exact filenames should follow repository conventions, but the conceptual separation should be:

```text
src/observability/
  worldObservatory.ts
  types.ts
```

or an equivalent location if the existing architecture suggests a better domain owner.

Avoid a large hierarchy such as:

```text
observatory/
  managers/
  repositories/
  stores/
  adapters/
  presenters/
  serializers/
```

The first version needs only a thin read boundary.

Conceptually:

```ts
type WorldObservatory = {
  getWorldSummary(): WorldSummary
  getSettlements(): SettlementSummary[]
  getSettlement(id: SettlementId): SettlementDetails | null
  getHousehold(id: HouseholdId): HouseholdDetails | null
  getNpc(id: NpcId): NpcDetails | null
}
```

The exact API should use existing ID/types rather than introducing duplicate identity systems.

---

# 7. Read model rules

Every field in an observatory view model must have a clear owner.

Example:

| Observatory data | Authoritative owner |
|---|---|
| settlement stock | `SettlementEconomy` |
| shortage/surplus | `SettlementEconomy` |
| household stock | household layer from 069 |
| NPC needs | `NpcAgent` / needs state |
| NPC action | existing NPC action/FSM state |
| schedule | NPC schedule state |
| family membership | settlement/family model |
| home | existing `Place` / settlement model |
| livestock | settlement/household animal state |
| wild animal needs | `AnimalAgent` / fauna simulation |
| production definition | economy static definitions |
| development state | settlement/economy development state |

If a field has no authoritative owner, **do not add it to the Observatory just to fill the UI**. Fix the underlying simulation first or defer that view.

---

# 8. Settlement streaming is a major constraint

The observatory is a world-level view, while settlement runtime entities can be streamed in/out.

This means it must distinguish:

```text
persistent/derivable settlement state
```

from:

```text
currently instantiated runtime state
```

For example, a settlement summary should not disappear simply because its meshes/NPC agents are currently unloaded.

The 071 `EconomyRegistry` already moves settlement economy ownership toward a settlement-level, stream-safe boundary. 069 should similarly make household state settlement-owned rather than `NpcAgent`-owned.

For the first implementation, it is acceptable for highly transient fields such as:

- current exact NPC action;
- exact position;
- live path;
- animation state;

to be shown only for currently loaded settlements.

The UI should make that distinction explicit rather than silently presenting stale values.

---

# 9. Proposed UI information architecture

Do not implement the entire hierarchy from the original plan immediately.

Start with:

```text
WORLD
  └── SETTLEMENTS
        └── SETTLEMENT
              ├── Economy
              ├── Households
              └── NPCs
```

Recommended first screens:

### A — Settlement list

Show:

- name;
- population/family count when authoritative;
- key stock levels;
- shortage/surplus indicators;
- loaded/unloaded indicator if relevant;
- one or two simple status signals.

No charts yet.

### B — Settlement details

Show:

- population;
- families/households;
- settlement stock;
- demands and shortages;
- production summary;
- development state;
- livestock count where available.

### C — Household details

Show:

- household identity;
- members;
- home;
- household stock;
- basic resource status;
- animals where the household model exposes them.

### D — NPC details

Show:

- name/identity;
- role/profession;
- household/family;
- needs;
- schedule/current action;
- stamina/vigor where available;
- relations only if already exposed by the authoritative NPC model.

This is enough to prove the Observatory concept.

---

# 10. Avoid a separate global NPC index unless required

The original hierarchy suggests a global `WORLD → NPCs` list.

Do not create a second NPC registry just for the UI.

Prefer:

```text
WORLD → Settlements → NPCs
```

Initially.

A global NPC index becomes justified only when there is an existing stable world-level identity/index or when the UI genuinely needs cross-settlement search.

The same rule applies to households.

---

# 11. Refresh strategy

The Observatory does not need reactive updates every simulation frame.

Do not push every NPC state change into Vue.

Recommended model:

```text
simulation runs normally
        ↓
observatory refresh requested
        ↓
query current authoritative state
        ↓
replace small read-only projection
        ↓
Vue renders
```

Suggested cadence:

- refresh immediately when the Observatory opens;
- refresh at a bounded rate while open, roughly 2–4 times/second initially;
- refresh on major user navigation inside the Observatory;
- do not subscribe Vue directly to the NPC hot loop.

Exact cadence should be measured, not treated as a gameplay rule.

---

# 12. Vue integration

Use the existing hybrid Vue architecture from plan 046.

Do not create a second UI framework or another global state library.

Recommended shape:

```text
src/ui-vue/
  App.vue
  store.ts
  ...existing screens...
  observatory/
    ObservatoryScreen.vue
    ObservatorySettlementList.vue
    ObservatorySettlement.vue
    ObservatoryHousehold.vue
    ObservatoryNpc.vue
```

The names are suggestions only; follow current repository naming conventions.

The Observatory UI should consume a facade/query object rather than import `NpcAgent`, `Settlement`, `SettlementEconomy` or Three.js types directly into `.vue` components.

This is important for keeping the UI decoupled from simulation lifecycle.

---

# 13. Integration point in `createApp.ts`

`createApp.ts` should remain orchestration, not become the observatory implementation.

Conceptually:

```text
createApp
  ├── world systems
  ├── simulation
  └── observatory facade
          ↓
       Vue UI
```

The facade can receive the existing `SettlementsManager` and other authoritative services once during app creation.

Do not destructure mutable `WorldBundle` members that may later be replaced by `rebuildWorldBundle()`.

If a future observatory dependency comes from `WorldBundle`, resolve it through the live bundle reference following the existing plan 053/054 lifecycle rule.

---

# 14. First implementation should use 071 + 069 as prerequisites

The original plan correctly declares:

```text
070 depends on 071, 069
```

Keep this dependency in the plan index.

Reason:

- 071 gives the Observatory a real settlement economy to inspect;
- 069 gives it a real household layer to inspect.

Without those layers, the panel would mostly display NPC/debug state and would encourage premature UI design around incomplete concepts.

However, the **observability boundary can be designed and tested earlier** without exposing the unfinished UI. Do not block architectural preparation, but do block the complete gameplay-facing Observatory on 071 + 069.

---

# 15. Recommended implementation phases

## Phase 0 — Contract and proof of concept

Goal: prove that the UI can read simulation state without owning it.

Implement:

- minimal `WorldObservatory` read interface;
- one world/settlement summary query;
- immutable/plain view types;
- one Vue screen showing a settlement summary;
- bounded refresh while open.

Use only data already authoritative in the current codebase.

Acceptance:

```text
open Observatory
→ see current settlement data
→ change simulation state
→ reopen/refresh
→ values reflect real simulation state
```

No household history, charts or event log.

## Phase 1 — Settlement Observatory

After 071:

- settlement stock;
- demands;
- shortages/surplus;
- production summary;
- development state;
- population/family counts where already authoritative.

Use `SettlementEconomy` directly through the read boundary.

Acceptance:

- wood stock changes after a real woodcutter deposit;
- shortage/surplus changes with stock;
- development status reflects actual economy state;
- no duplicated economic quantity exists in Observatory code.

## Phase 2 — Household Observatory

After 069:

- household list;
- household stock;
- members;
- home;
- animals if owned by the household model;
- basic resource warnings derived from household policy/state.

Acceptance:

```text
NPC gathers resource
→ resource enters household
→ Observatory shows new household stock
```

and:

```text
NPC consumes resource
→ household stock decreases
→ Observatory reflects the decrease
```

## Phase 3 — NPC drill-down

Add:

```text
Settlement → Household → NPC
```

Show only existing authoritative state:

- needs;
- role/profession;
- schedule;
- current action;
- stamina/vigor;
- family/household.

Do not create an Observatory-specific NPC state machine.

## Phase 4 — Events/history

Only after the current-state views are useful.

Introduce a small simulation history mechanism for significant events.

Start with events that already have clear authoritative transitions, for example:

- production completed;
- development completed;
- birth/death when those systems exist;
- household created;
- significant threat/attack;
- major settlement change.

Do not invent events by polling.

Use a bounded history buffer first.

## Phase 5 — Trends

Add historical samples only for metrics that provide useful information.

Start with:

- population;
- food/wood/water or equivalent authoritative stocks;
- production/consumption where those rates are actually modeled.

Do not chart values that are merely inferred from UI polling.

Use a low sampling frequency and bounded history.

## Phase 6 — Fauna

Add ecosystem views only when the fauna model provides stable authoritative data.

First useful view:

```text
species → population → basic needs/status
```

Defer:

- territories;
- routes;
- kill history;
- ecosystem graphs;

until those concepts actually exist as simulation state rather than being reconstructed from agents/meshes.

Wild fauna should remain separate from settlement economy/household stock unless a future explicit livestock/economy coupling is defined.

## Phase 7 — Social graph / advanced world view

Only after relationships/family systems are mature enough to support it.

Do not build a generic graph visualisation just because the original plan mentions one.

Start with simple relationship lists; add graph visualisation only if it materially improves the observation experience.

---

# 16. What should be removed/deferred from the original plan

The following should **not** be part of the first implementation:

- full world-wide NPC index;
- complete event history;
- migration history;
- birth/death history before those systems exist;
- economic time-series database;
- production-chain visualisation before multiple production chains exist;
- fauna territories/routes before those are authoritative simulation concepts;
- social graph visualisation;
- trade analytics before trade exists;
- persistence of Observatory-specific data;
- debug controls/actions.

The original plan is a good **vision for the mature Observatory**, not a single implementation scope.

---

# 17. Performance

The Observatory should be cheap when closed and bounded when open.

### Closed

No continuous Observatory-specific scans.

### Open

Avoid:

- full-world per-frame traversal;
- scanning every Three.js object;
- scanning every NPC every frame;
- allocating large nested view trees every frame.

Prefer:

```text
user selects settlement
        ↓
query only selected scope
        ↓
small projection
```

For a settlement list, use settlement-level state rather than expanding every household/NPC just to display a row.

For large NPC lists, follow the existing UI lesson from the villagers screen: use pagination/virtualisation if the data set grows.

A Web Worker is **not** appropriate for the first Observatory implementation. The work is mostly reading small in-memory simulation state and formatting a UI projection; worker communication would add complexity without meaningful benefit.

---

# 18. Persistence

Do not create a separate Observatory save file or database.

Current-state views should read the same state that the game saves when persistence is available.

Historical data should initially be treated as transient runtime history unless/until the world persistence model explicitly requires it.

This avoids creating an observatory-specific persistence architecture before the simulation persistence architecture is mature.

---

# 19. Testing strategy

## Domain/query tests

Test that:

- settlement summary reflects authoritative economy state;
- household summary reflects authoritative household stock;
- NPC summary reflects current needs/action state;
- missing/unloaded runtime entities do not crash queries;
- no query mutates simulation state.

## Integration tests

At least:

```text
woodcutter action completes
→ settlement stock changes
→ observatory query returns changed value
```

and after 069:

```text
resource deposited into household
→ household query returns changed value
```

## UI/browser verification

Manual checks should verify:

- opening/closing Observatory does not pause or corrupt simulation unless explicitly designed to;
- values update while the world continues running;
- navigation Settlement → Household → NPC works;
- the UI does not block normal camera/game input when closed;
- mobile layout remains usable;
- unloaded settlements do not show misleading live runtime data.

---

# 20. Acceptance criteria for the first usable Observatory

The first gameplay-facing implementation should be considered successful when:

- [ ] Observatory is a read-only presentation layer.
- [ ] It has no duplicate authoritative world/economy/NPC state.
- [ ] It does not inspect Three.js objects to infer simulation state.
- [ ] Settlement economy values come from `SettlementEconomy`.
- [ ] Household values come from the 069 household layer.
- [ ] NPC values come from the existing NPC systems.
- [ ] Settlement → Household → NPC navigation works.
- [ ] The simulation continues normally while the Observatory is open.
- [ ] Refreshing the view reflects actual simulation changes.
- [ ] The UI does not require per-frame Vue reactivity.
- [ ] No worker is introduced without measured need.
- [ ] Technical checks pass: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.
- [ ] Manual browser verification covers desktop and touch layouts.

---

# 21. Recommended final shape

The mature architecture should converge toward:

```text
                    SIMULATION
                        │
          ┌─────────────┼─────────────┐
          │             │             │
     Settlement      NPC/Family      Fauna
       Economy        Household
          │             │             │
          └─────────────┼─────────────┘
                        ↓
                Observatory Queries
                        ↓
              Read-only View Models
                        ↓
                    Vue UI

Optional later:

Simulation events
        ↓
bounded history
        ↓
Observatory events/trends
```

The crucial boundary is:

```text
simulation owns truth
observatory owns presentation
```

That keeps 070 aligned with Seedvale's central design principle: the Observatory should make the living world easier to understand without becoming the system that makes the world live.

---

## 22. Relationship to the original plan

Keep the original `2026-08-11--070--world-observatory.md` as the long-term product scope. This implementation-notes file is the execution guide.

The original plan's final criterion remains valid:

```text
World
  → Settlement
    → Household
      → NPC
        → Need
          → Action
            → Resource
              → Event
```

The implementation difference is that these layers should be exposed **only when their authoritative simulation state exists**. The Observatory should grow alongside the simulation rather than forcing unfinished systems into existence for the sake of the UI.
