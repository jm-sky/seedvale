# Review: Settlements — buildings/resources/infrastructure

**Date:** 2026-09-19  
**Master:** tools-018-codebase-domain-and-flow-audit-master.md  
**Area:** 10 — Settlements — buildings/resources/infrastructure  
**Result:** reviewed; no unresolved high/critical finding in this area

## 1. Scope

Reviewed end-to-end:

- deterministic settlement buildings and runtime materialization,
- mutable building condition/repair state,
- wells, household water infrastructure and pasture trough use,
- settlement cultivation anchors, crops and Farmer work,
- household and settlement storage plus physical storage projections,
- remote resource-site inventories and ore transport,
- ownership/assignment seams used by NPC work and households,
- create → runtime → dispose/stream-out → rebuild,
- save/load ownership for mutable state,
- interaction between physical/world representation and simulation authority.

Founded-settlement live materialization was only followed where it crosses infrastructure. Its missing runtime/streaming is already an area 09 finding and is owned by settlements-021 / settlements-022; it is not duplicated here.

## 2. Entry points and state owners

| Concern | Authority | Runtime / projection | Persistence / continuity |
|---|---|---|---|
| procedural building existence/placement | VillagePlan / SettlementDef | buildSettlementProps() / createSettlement() | deterministic reconstruction |
| mutable structure condition/repair | SettlementStructureStateRegistry on SettlementsManager | house interaction + NPC repair hooks | sparse SaveData.structureStates |
| household wood/water/items | Household | household storage piles/crates/barrels/troughs | SaveData.households |
| settlement stock + concrete food | SettlementEconomy | settlement storage/wood visual | SaveData.settlementEconomies |
| storage destination geometry | SettlementLandmarks + storageDestinations.ts | NPC movement destinations | re-derived from deterministic settlement plan |
| settlement wells | deterministic VillagePlan / landmarks | well props, colliders, per-well queues | reconstructed; stored water remains Household.water |
| settlement cultivation | world crops + CultivationAnchor; household seed/items | field/garden props + Farmer actions | crop state persists through world crop systems; hydration owner missing today |
| remote ore at production site | ResourceSiteInventories | position re-resolved from resource identity | sparse SaveData.resourceSiteInventories |
| unmined deposit reserve | ResourceDeposits / resource-depletion state | streamed deposit presentation | SaveData.resourceDeposits |

The reviewed code generally preserves the intended split: Three.js objects and landmark vectors are projections/anchors, not owners of economic quantities or mutable building condition.

## 3. Flows traced

### 3.1 Procedural building lifecycle

settlementPlanCache / VillagePlan
→ stable planned building ids/placements
→ buildSettlementProps()
→ houses/well/storage/garden/workplace landmarks + scene objects
→ createSettlement()
→ collider/light/NPC integrations
→ Settlement.dispose()
→ settlement group/collider/runtime teardown
→ later stream-in reconstructs presentation from plan
→ mutable household/economy/structure registries are reused by SettlementsManager.

No second authoritative building-existence registry was found for procedural settlements.

### 3.2 Building condition and repair

planned residential building id
→ residentialStructureId(familyIndex)
→ SettlementStructureStateRegistry.resolve()
→ missing mutation record means pristine
→ player/NPC repair both use the shared registry transaction
→ updated record stays manager-owned across stream-out
→ sparse save/load through structureStates
→ runtime house presentation is not used as condition authority.

### 3.3 Household/settlement storage

NPC production/gather result
→ owner-specific inventory/stock (Household or SettlementEconomy)
→ householdStorageDestination() / settlementStorageDestination()
→ physical movement to a deterministic landmark
→ storage visuals read authoritative quantities
→ visual meshes are disposed/rebuilt with settlement runtime
→ quantities survive independently in their registries/save data.

Current wood flow correctly distinguishes settlement wood from each household's wood. The older shared-pile description in historical implementation notes is superseded by current code and settlements-npcs-025 Stage 1 follow-up.

### 3.4 Wells and household water

planned central/household/pasture well
→ SettlementLandmarks.wells with per-well queue
→ NPC resolves nearest usable settlement well or nearby completed Player well
→ drink or water-duty action
→ household deposit mutates Household.water
→ barrels/troughs remain presentation/interaction anchors
→ unload/reload re-derives wells; water quantity remains in household state.

The same physical well list drives NPC settlement-well targeting; instanced presentation meshes are explicitly not queried as gameplay authority.

### 3.5 Settlement cultivation

planned field/garden placement
→ SettlementLandmarks.cultivationAnchors
→ NpcWorkContext.cultivationAnchor
→ Farmer harvest/plant uses shared crop lifecycle and real household seed/items
→ world crop state mutates
→ household/economy receives real output.

The current chain stops short of a persistent settlement-cultivation hydration/drought owner; see F1.

### 3.6 Remote resource sites

shared mineable deposit query
→ Miner planOreGathering()
→ ResourceDeposits.mine(target.id) mutates remaining reserve
→ extracted ore enters ResourceSiteInventories[target.id]
→ Trader enumerates non-empty sites
→ resource position is re-resolved independently of streamed deposit presentation
→ TransportOrder pickup moves goods into carrier transportCargo
→ unload moves goods into SettlementEconomy
→ both depletion and site inventory persist independently.

This preserves conservation boundaries: mined reserve, extracted-but-remote goods, in-transit cargo and settlement-owned stock are separate states with explicit transfers.

## 4. Findings

### F1 — medium — settlement cultivation has no authoritative hydration/drought state yet

**Flow:** settlement field/garden → Farmer work → crop productivity / watering / weather continuity.

**Files/symbols:**

- src/world/cultivationAnchor.ts::CultivationAnchor
- src/settlement/props.ts::SettlementLandmarks.cultivationAnchors
- src/ai/npcProfessionWork.ts::planFarmWork
- existing Player hydration owner in src/world/playerGarden.ts

**Evidence:** settlement cultivation exposes a positional/radius anchor and uses the real crop/seed workflow, but the anchor deliberately carries no persistent hydration state. Rain/drying/drought/watering ownership currently exists for Player gardens, not settlement cultivation.

**Impact:** settlement cultivation can participate in planting/harvesting without the environmental-water state intended to constrain cultivated productivity. Save/load, stream-out catch-up and Farmer watering cannot yet resolve one authoritative settlement cultivation hydration record.

**Owner:** settlements-npcs.

**Existing plan:** settlements-npcs-043-settlement-cultivation-hydration-rain-and-farmer-watering.md exactly covers this gap and explicitly reuses the Player hydration model rather than creating a second farming system.

**Next action:** implement settlements-npcs-043; no duplicate audit plan.

### O1 — observation — household wood destination has a permissive presentation fallback

resolveHouseholdWoodStorage() resolves the index-aligned household wood pile but falls back to the matching home, and finally to the supplied home, if landmark arrays do not match.

Current procedural construction creates aligned homes/wood-storage anchors, so no normal gameplay defect was established. The fallback is nevertheless important for future non-procedural/shared resident contexts: if an invalid capability set reaches this resolver, NPC work can still complete against authoritative household stock while the expected physical wood-storage anchor is absent.

**Follow-up:** no new plan now. settlements-021 already introduces explicit resident capabilities/anchors; storage absence should remain an explicit unsupported capability there rather than being hidden by synthetic landmarks.

### O2 — observation — persisted resource-site goods are not reconciled against current world-site identity on restore

createResourceSiteInventories() restores every non-empty saved key. Trader discovery re-resolves each site's deterministic position and skips a site whose id no longer resolves, so an invalid/stale id cannot create a fake pickup target. The store itself does not delete such an entry.

No normal current-code producer of a stale resource id was found: mining creates inventory only from a real shared deposit target, and ordinary rebuild/save/load preserves the same deterministic identity. Therefore this is a resilience/version-drift risk, not a confirmed current gameplay defect.

**Follow-up:** re-check under area 03 (Persistence & lifecycle continuity), where save validation/migration policy can decide whether stale deterministic-world ids need reconciliation.

### O3 — observation — food/storage presentation is intentionally behind authority, not a duplicate owner

Authoritative food remains in Household.items / SettlementEconomy. The current visualization does not yet provide truthful container fill for every stored kind, but it reads those owners and does not persist a parallel visual quantity.

This gap is already staged in settlements-npcs-025-resource-storage-visualization.md (Stage 2/3). It is a presentation completeness issue, not duplicated resource state.

## 5. Architecture observations

- Deterministic layout owns where infrastructure exists; long-lived registries own mutable simulation state; scene objects own presentation only.
- SettlementStructureStateRegistry, Household, SettlementEconomy and ResourceSiteInventories have distinct responsibilities; no duplicated stock owner was found between them.
- Resource-site logistics correctly separates unmined reserve from extracted stock. ResourceDeposits presentation can unload without losing extracted goods.
- Player-built wells and settlement wells have different lifecycle owners but converge at the NPC water-source decision seam rather than duplicating water-need logic.
- NPC structure repair reuses the same registry transaction as Player repair; no actor-specific repair authority was found.
- Storage visual teardown is settlement-group-owned while quantities are registry-owned; rebuild therefore does not manufacture new stock.
- The main architectural pressure is moving from a procedural SettlementLandmarks bundle to explicit infrastructure capabilities needed by founded settlements. That work is already owned by settlements-021 / settlements-022.

## 6. Cross-domain dependencies / follow-ups

- **Area 03 — Persistence & lifecycle continuity:** revisit stale deterministic resource-site ids and structure-state key/value consistency as save-integrity concerns.
- **Area 09 — Settlements identity & world state:** founded settlements still have authoritative economy/household/residency without live settlement infrastructure/runtime. This is already a high finding there; do not duplicate it.
- **Area 11 — Economy, trade & logistics:** re-check exact transfer atomicity and demand accounting across household → resource-site → cargo → settlement stock.
- **Area 13 — NPC movement, schedules & work:** review stale work assignments/actions when target infrastructure disappears or changes between planning and execution.
- **Area 20 — Interaction/input routing:** player targetability of dense settlement props/wells/storage is outside this review.

## 7. Existing plans that already cover findings

- settlements-npcs-043 — Settlement Cultivation Hydration, Rain & Farmer Watering — **planned**, directly covers F1.
- settlements-npcs-025 — Resource storage visualization — **in progress**, covers remaining storage presentation completeness without adding state ownership.
- settlements-npcs-021 — Remote Production Site Logistics — **verification needed**, already owns the resource-site inventory/transport vertical slice inspected here.
- settlements-021 — Shared settlement resident runtime — **planned**, relevant to explicit infrastructure capabilities and avoiding fake landmarks.
- settlements-022 — Founded settlement live runtime and streaming — **planned**, covers lifecycle/materialization of founded-settlement infrastructure using real world anchors.

## 8. New plans required

None.

The only confirmed medium implementation gap found in area 10 is already covered by settlements-npcs-043. The storage visualization gap is already covered by settlements-npcs-025. The remaining observations are either not currently reachable as a gameplay defect or belong to later audit areas.

## 9. Verification limits

This was a static code/repository review on current main.

Not performed:

- browser/manual gameplay verification,
- visual inspection of storage quantity stages,
- runtime stress test of repeated settlement stream-in/out,
- save corruption/version-drift experiments,
- manual Farmer drought/watering scenario,
- browser verification of well queues or infrastructure interactions.

No production code was changed.

## 10. Master status update

Area 10 can be marked **✅ reviewed**:

- no unresolved critical/high finding was found inside this area's current procedural settlement infrastructure,
- F1 is medium and already has an owning planned implementation,
- no new plan is required,
- founded-settlement missing live infrastructure remains tracked as the existing area 09 high finding rather than being counted twice.
