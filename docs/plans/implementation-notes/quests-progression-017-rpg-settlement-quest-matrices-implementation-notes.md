# Implementation Notes: quests-progression-017 — RPG settlement quest matrices

**Prepared:** 2026-09-10  
**Plan:** `quests-progression-017-rpg-settlement-quest-matrices.md`  
**Landed:** 2026-09-10

## Landed 015/016 contracts used

- Stable quest NPC identity is `QuestNpcRef.npcId` (`src/settlement/npcState.ts::NpcId`). Givers/targets come from `opportunityNpcsFromSettlement` / `settlementNpcId` over `SettlementDef` family order — never loaded `NpcAgent`s.
- 016 owns `src/quests/opportunities/`: lightweight `SettlementQuestOpportunity` → `materializeSettlementQuestOpportunity` → normal `QuestDef` at composition root (`createApp.ts`). `QuestManager` still owns progress. Generated ids reconstruct from `SaveQuests.progress[].id`.
- 016 did **not** land a multi-source priority/limit/cooldown store (single wolf-den source). 017 added that shared selection in `settlementQuestSelection.ts` rather than a second selector.
- World-driven wolf-den remains home-only (`includeWorldDriven: def.isHome`). Empty neighbor spawners must not mint a fake `${settlementId}:wolfDen` opportunity.

## Exact seams

| Concern | Owner |
| --- | --- |
| Candidate collection (world) | `collectSettlementQuestOpportunities` |
| Candidate collection (RPG) | `collectRpgQuestOpportunities` |
| Selection / limit / matrix duplicate guard | `selectSettlementQuestOpportunities` |
| Materialization | `materializeSettlementQuestOpportunity` → `materializeRpgQuestOpportunity` |
| Composition | `createApp.ts` before `new QuestManager` |
| Landmark lookup | `ChunkManager.findLandmarkNear` (injected as data-only `RpgLandmarkRef[]`) |
| Other settlements | `nearbyRpgSettlementDefs` → `SettlementsManager.peekDef` / plan cache |
| Persistence | existing quest progress ids; no save-schema bump |

Quest ids: `rpg:<matrixId>:<settlementId>:<sourceId>`. `settlementId` is `${gx}_${gz}`.

## Matrices

1. **Sekret starego miejsca** — `interact_landmark` on `smallRuins` / `ruins` / `monolith` / `stoneCircle`. Cemetery skipped (burial). No eligible landmark → no candidate. Occupied authored landmark ids are excluded.
2. **Umowa między osadami** — talk + choice between giver settlement and a different settlement's first adult. Target settlement is nearest other def with an adult. Framing only: no diplomacy/trade/stock transfer.
3. **Podejrzany transport** — same-settlement talk + `talk_to_npc_choice`. No parcel inventory, NPC handoff, or settlement-economy mutation; V1 is dialogue mystery/choice over two real adults (prefer trader giver, guard counterpart).

All three domain seams existed, so the third matrix is included. Inter-settlement stock transfer remains unimplemented (`STATE.md`) and was not faked.

## Selection

`SETTLEMENT_QUEST_OPPORTUNITY_LIMIT = 2`. World-driven candidates are not dropped for RPG. RPG matrices hash-order per settlement so neighbors do not all pick the same pair. Persisted generated ids always rematerialize.

No new cooldown table: boot-time selection + persisted ids. A completed generated quest stays in `QuestManager` like other defs.

## Call sites

- `src/app/createApp.ts` — home + two nearest neighbor defs; landmark search uses the existing `LANDMARK_QUEST_SEARCH_CHUNK_RADIUS`.
- Tests: `src/quests/opportunities/rpgQuestMatrices.test.ts`
