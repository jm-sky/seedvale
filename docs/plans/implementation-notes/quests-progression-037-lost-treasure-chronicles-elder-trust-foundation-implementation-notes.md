# Implementation Notes: quests-progression-037 — Lost Treasure Chronicles elder trust foundation

Recon baseline: current `main` on 2026-09-15. Dependencies `quests-progression-032`, `033` and `034` are already implemented. These notes record only implementation-relevant findings; the source plan owns scope/content intent.

## 1. Authored elder: extend settlement generation narrowly

Current ownership is:

`settlementGenerator.ts::generateSettlementCore()` → `generateFamilies()` → `resolveInitialProfessionStaffing()` → `VillagePlan` / runtime settlement.

The elder must enter before `VillagePlan` creation so household membership, building assignment, streaming and `settlementNpcId()` all see one ordinary resident.

Do **not** reuse the existing `family-reserved-*` id prefix for the elder. Today that prefix has behavioural meaning outside family generation:

- `professionStaffing.ts::isReservedFamily()` excludes those adults from staffing changes;
- `world/expeditionParty.ts::isReservedFamily()` excludes the whole family from expedition candidates.

Those exclusions exist for the fixed home roster, not for generic authored residents. Give the story household/slot its own stable id (or a more explicit narrow marker) and keep the elder eligible for normal systems unless the plan explicitly says otherwise.

`families.ts::reservedHomeFamilies()` is still the useful precedent for constructing a deterministic authored `FamilyMember`, but not for its prefix semantics. `FamilyMember.age` supports an authored 72–78 value even though procedural adults currently roll only 18–70.

Prefer a small input/spec passed only for the selected settlement, e.g. an optional authored-resident injection at the family-generation/core-generation seam. Do not add story lookup logic inside every settlement or a global story-NPC registry.

### Settlement selection

Settlement identity is grid-derived (`SettlementDef.id === cellKey({gx,gz})`), and `settlementGenerator.ts` already owns deterministic cell/site/size generation. Resolve the story settlement from deterministic nearby candidate cells and actual generated defs, then inject the elder only into the selected normal settlement.

Selection guardrails:

- exclude home (`0_0`) and `OUTPOST`;
- prefer actual `SM`/`MD` defs, not a pre-site guessed size;
- use a bounded, stable candidate order/tie-break (cell distance/order + stable id is sufficient); do not depend on runtime streaming order;
- do not alter the chosen settlement's coordinates/size merely to host the story NPC unless no eligible settlement can exist under the current worldgen contract.

If selection needs several generated nearby defs, keep it in deterministic boot/worldgen composition and reuse those same defs; avoid regenerating the same cells through a second independent path with different overrides.

## 2. Stable elder/supporting-NPC binding

`src/settlement/npcIdentity.ts` is authoritative: `settlementNpcId(settlementId, flattenedMemberIndex)`. Therefore insertion order is identity-sensitive.

Once the elder slot is introduced, keep its family/member position deterministic and covered by tests. Do not later insert unrelated members before it without consciously accepting an `NpcId` migration risk.

For story binding, prefer a resolver that works from the selected `SettlementDef` and returns the elder's stable `NpcId` plus household id. Do not resolve him by authored display name.

For generated supporting NPCs, reuse `settlementOpportunityNpcsFromDef()` from `quests/opportunities/settlementNpcMaterialization.ts`; it already projects stable `NpcId`, adult/child status, role, family index and `householdId`. Select deterministically by stable id after filtering:

- adult,
- not the elder,
- preferably different household.

The winter-helper and dispute counterpart may be the same generated resident only if the authored content deliberately wants that; otherwise choose independently but deterministically.

## 3. Quest materialization/composition

Do not put these defs into name-keyed `QUESTS` / `materializeAuthoredQuestDefs()`. That path is intentionally for authored display-name binding (primarily the home roster).

Follow contextual modules such as `src/quests/lostTreasureExpedition.ts`: resolve world/NPC binding first, then build ordinary `QuestDef[]` with stable ids and `QuestNpcRef { npcId }` values.

Recommended focused module responsibilities:

- resolve/accept the already-selected elder settlement binding;
- select supporting residents from `settlementOpportunityNpcsFromDef()`;
- build the winter and dispute `QuestDef`s;
- expose stable quest/outcome ids needed by plan 038.

Compose the returned defs in `createApp.ts` before constructing `QuestManager`, alongside the other contextual definitions. `QuestManager` has no runtime `registerDef`; definitions are expected to be complete at construction and are validated after composition.

Because there is exactly one guaranteed elder, semantic ids such as `story:lost-treasure-chronicles:elder:winter` are safe only while that uniqueness contract remains true. Keep id creation in one exported helper/constant so plan 038 does not duplicate strings.

## 4. Quest A: use the existing nonlinear stage, but keep route selection explicit

`quests-progression-032` is implemented: `QuestStage.objectives`, `mode: 'any'`, per-slot `resultId`, and forward transitions can route one stage to distinct outcomes.

Use two mandatory routes in V1:

- material route: existing `gather_item` with a real player `ItemKind`;
- social route: `talk_to_npc` targeting the selected helper.

`branch` is the cleanest current physical fuel candidate: it is a real player `ItemKind`. Do **not** use settlement `EconomicStock.wood` or raw-resource `coal` as though they were player inventory items; those are different ownership models. A small `branch` count keeps this quest on the existing gather/hand-in path with no economy bridge.

Current `QuestManager` behaviour matters here:

- `gather_item` is consumed only through the giver hand-in path (`inventory.remove`);
- `gatherHandInSlot()` selects the first unfinished gather slot, so do not model several simultaneous material alternatives as multiple gather slots in this quest;
- a material route plus a social `talk_to_npc` route remains an explicit player choice because they require different NPC interactions.

Give each slot a distinct `resultId` and transition directly to its corresponding terminal outcome. This preserves one authoritative outcome id for later story logic and avoids extra story flags.

Do not add optional physical-work route C unless an existing generic objective genuinely models the action. No suitable household-work objective exists in the current quest vocabulary that justifies adding it for this plan.

## 5. Quest B: ordinary staged dialogue is sufficient

Quest B can stay entirely within existing quest contracts:

1. elder briefing/progress line;
2. `talk_to_npc` to the generated counterpart;
3. `talk_to_npc_choice` (or equivalent existing stage `dialogueActions` only if the resolution must occur at different NPCs) for the conscious terminal branch.

Prefer `talk_to_npc_choice` when both final responses are selected in one conversation and terminate in distinct outcomes; it already represents mutually exclusive terminal dialogue outcomes and avoids inventing a generic dialogue-tree layer.

Use `quest_outcome` prerequisite on Quest A with only the implemented winter outcome ids. `QuestManager` already treats `outcomeIds` as OR membership and all quest prerequisites as AND.

Each dispute outcome can use existing `QuestConsequences` for multiple stable-NPC relation deltas plus settlement reputation. No new consequence API is needed.

## 6. Relations and reputation

`QuestManager` remains authoritative for quest-owned Player↔NPC relation values. Reuse the existing thresholds (`stranger 0`, `acquainted 1`, `friendly 3`, `trusted 6`) and tune total deltas across both quests so the mandatory two-quest paths do not automatically reach 6.

`ReputationManager` stays settlement-owned; quest code reaches it through `QuestConsequences.social`. Set `QuestDef.settlementId` to the elder's real settlement id or social consequences/prerequisites cannot target the correct settlement.

Use only `trust`, `competence`, `benevolence`, `integrity`. Keep `renown` omitted/zero for these quests.

Do not persist derived relation tiers or an information-quality value. Plan 038 should read: resolved outcome ids + elder relation + `ReputationManager` state.

## 7. Lifecycle/persistence implications

No new save schema should be required if the elder is reconstructed deterministically from worldgen and the story uses normal quest/relation/reputation persistence.

Critical identity constraint: quest progress restores by quest id while relation keys use stable NPC ids. Changing authored-family insertion order after release can therefore orphan the stored elder relation even if the display name is unchanged. Add deterministic identity tests now.

Do not respawn/recreate the elder in quest code if ordinary NPC lifecycle marks him dead. Story availability should use the same resident identity; later plans own fallback narrative behaviour.

## 8. Focused implementation order

1. Add deterministic nearby story-settlement selection + narrow elder family injection; test exactly one elder and stable `NpcId`.
2. Add binding/supporting-NPC resolver over `SettlementDef` / `settlementOpportunityNpcsFromDef()`.
3. Build the two contextual `QuestDef`s and unit-test validation, prerequisites, routes and consequences.
4. Compose defs in `createApp.ts` and use existing `QuestManager` persistence/consequence seams.
5. Add `QuestManager` regression coverage only if the implemented route exposes a genuinely generic ambiguity; do not patch it speculatively.

## 9. Tests worth adding

Prefer focused tests in/near:

- `src/settlement/families.test.ts` or a new focused authored-resident test for deterministic injection and no unrelated-settlement leakage;
- `src/settlement/npcIdentity`/story binding tests for stable flattened index;
- `src/quests/lostTreasureChroniclesElder.test.ts` for deterministic supporting-NPC choice and valid defs;
- `src/quests/QuestManager.test.ts` for both winter outcomes, Quest B prerequisite OR, multi-NPC relation consequences, exact-once item consumption/consequences and save/restore.

Also explicitly assert the elder's story family does **not** accidentally satisfy the legacy `family-reserved-*` predicate unless that exclusion is intentionally redesigned globally.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
