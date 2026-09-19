# Codebase domain audit 14 — NPC social, households & dialogue

**Date:** 2026-09-19  
**Audited branch:** `main`  
**Audited HEAD:** `933e5ae3696991fc1eeec07aa6097f6d89dbc925`  
**Scope:** code correctness, architecture, lifecycle/persistence, performance only

## Scope

Traced the production flow:

```text
world / NPC event
→ household / relationship / memory mutation
→ persisted/current social state
→ social decision / dialogue context
→ dialogue/action
→ further relationship/history/state mutation
```

The review covered household identity/ownership, family roles, NPC↔NPC and Player↔NPC relationships, relationship mutation, bounded NPC memory/history fields, household assistance inputs, campfire social activity, NPC dialogue context, proactive Player follow-ups, social/profession presentation, death cleanup, settlement streaming, WorldBundle rebuild and save/load.

Missing features, gameplay depth and Vision mismatches were not treated as findings.

## Entry points and state owners

- `src/settlement/household.ts` — authoritative household resources; `HouseholdRegistry` is manager-owned and survives settlement reconstruction.
- `src/settlement/families.ts` / `createSettlement.ts` — deterministic family membership and family/role data; procedural membership is derived once from `def.families`, not mirrored into a second mutable member registry.
- `src/settlement/npcRelationships.ts` — symmetric NPC↔NPC scalar relationship store keyed by an unordered pair of stable NPC ids.
- `src/quests/QuestManager.ts` — separate Player↔NPC relationship store, keyed by stable `NpcId`; this is a different actor topology, not duplicate ownership of NPC↔NPC relations.
- `src/settlement/npcState.ts` — persisted NPC-owned semantic continuity including grave-visit history and `playerFollowUp`.
- `src/ai/socialBehaviour.ts` + `NpcAgent` — runtime social-place candidate/pair/conversation lifecycle.
- `src/ui-vue/store.ts` / `NpcDialogueMenu.vue` — dialogue presentation state; quest callbacks re-read live state rather than copying authoritative quest/social state into Vue.
- `src/ai/npcPlayerFollowUp.ts` / `npcInitiatedDialogueRequest.ts` — persisted follow-up ownership plus a transient UI request seam.
- household/domain histories are bounded diagnostics only; they are not read by cognition/dialogue as authoritative state.

## Flows traced

### Household membership and ownership

Procedural households are 1:1 with `def.families` through `householdIdFor(settlementId, familyIndex)`. `createSettlement.ts` flattens the same family definitions into stable NPC ids and passes the corresponding shared `Household` reference into each agent.

The registry owns household stock/items/water across stream-out/in and rebuild. There is no second mutable household-member list that could drift from family identity. A dead NPC remaining part of family identity is not itself stale resource ownership: household state belongs to the family/home, not to a live-member list.

### NPC↔NPC social relationship

`advanceSocialPairing()` obtains eligible social-place candidates, pairs only actors at the same place, reserves both participants before either conversation starts, and gives both sides one shared completion closure.

`conversationOutcome()` reads the current symmetric relation and produces one delta. The shared `applyOutcomeOnce` guard ensures completion from both participants cannot double-apply that delta. Early interruption/death releases the conversation without applying a completed-conversation result.

`NpcRelationships` canonicalizes unordered id pairs, so reads/mutations from A→B and B→A address the same record. Its snapshot is manager-owned and persisted through the standard WorldBundle/save path.

### Player↔NPC social relationship and dialogue

Current `QuestManager` relation APIs use stable `NpcId`, including the dialogue title resolver and social lookups. Quest consequences and direct adjustments converge on the same Player↔NPC relation map.

Normal dialogue open stores a live `NpcAgent` reference and live quest resolver callbacks. Quest preview/topic resolution explicitly re-reads current quest state; opening the menu itself does not admit/advance a quest.

Presentation-only values such as heading/trade availability/payment proposal are open-session projections. The NPC dialogue is an active modal in the game loop, so world simulation does not advance underneath the menu; the captured `timeOfDay` used by “Co teraz robisz?” is therefore not a stale-running-world bug.

### Memory/history and proactive follow-up

There is no generic authoritative “social memory” store in current code, so none was invented as a finding. Existing semantic history is narrow and owned where needed:

- `NpcAuthoritativeState.graveVisits` persists completed family-grave visit timestamps;
- `NpcAuthoritativeState.playerFollowUp` persists one outstanding NPC→Player follow-up;
- household/domain histories are bounded debug timelines only.

`armNpcPlayerFollowUp()` is idempotent and refuses dead/post-death hosts. Delivery revalidates the follow-up id and consumes only the matching authoritative record. `commitNpcDeath()` clears an undelivered follow-up on the one-shot alive→dead transition.

The module-level initiated-dialogue callback is only a runtime request boundary. It does not own whether a follow-up is owed and therefore cannot lose the semantic event merely because an approach/dialogue attempt is interrupted.

### Save/load/rebuild continuity

Households, NPC state and NPC↔NPC relationships follow the same manager-lifetime `initial*` / `snapshot*` pattern used by `WorldBundle`. Player↔NPC relation state is serialized with quest state.

Transient social execution — candidate cooldown, reservations, current conversation and UI menu state — reconstructs rather than pretending to be authoritative. Persistent semantic effects (relationship values, grave-visit history, follow-ups) live outside those transient objects.

No confirmed double-apply, one-sided relationship mutation, dangling runtime reference after NPC death, or household state duplication was found in the traced production paths.

## Findings

### F1 — MEDIUM — Social pairing scans and allocates across the settlement every update despite per-NPC attempt cadence

**Category:** performance · architecture  
**Affected flow:** loaded settlement update → social candidate discovery → pair selection

`advanceSocialPairing()` runs once per loaded `Settlement.update()`. On every call it:

1. allocates a new `entries` array and invokes `socialCandidate()` for every NPC;
2. allocates a new `Set`;
3. for each candidate, allocates `entries.filter(...)`, then `.map(...)`, before deterministic partner selection.

The expensive semantic attempt is throttled by each NPC's `nextSocialAttemptSim`, but the settlement-wide scan and temporary collections still happen at frame cadence. With multiple loaded settlements this creates avoidable recurring CPU/GC work, and candidate pairing is O(k²) in the number of simultaneously eligible social candidates.

This is also contrary to the original `npc-013` performance guardrail (“do not perform every-frame searches of all NPCs near the campfire”), although its implementation notes documented the current compromise rather than fixing it.

**Files/symbols:** `src/ai/socialBehaviour.ts::advanceSocialPairing`, `SocialParticipant.socialCandidate`, `src/settlement/createSettlement.ts::Settlement.update`, `src/perf/agentCpuDiag.ts` social span.

**Affected callers/consumers:** every loaded settlement; `agentCpuDiag` already measures this block separately.

**Existing coverage:** no active/planned plan found that owns reducing this pairing scan/allocation cadence. `npc-013` and `npc-045` are implemented behavior plans, not an outstanding optimization plan.

**Next action:** `npc-060-social-pairing-cadence-and-allocation.md`.

## Architecture observations

Healthy seams to preserve:

- household resources have one authoritative registry; deterministic family membership is not copied into a second mutable household-membership store;
- NPC↔NPC relationship symmetry is structural, not maintained by two directional records;
- Player↔NPC and NPC↔NPC relations are intentionally distinct stores because they represent different actor relationships;
- relationship mutation from a conversation has a shared once-only completion closure;
- dialogue UI owns presentation/session projections while quest/social authorities remain outside Vue;
- proactive follow-up semantic ownership lives in persisted NPC state, not in an approach action or UI request;
- death cleanup clears outstanding follow-up state while historical family/relationship identity can remain available to history/grave logic;
- debug history buffers are not used as cognition state.

## Cross-domain dependencies / follow-ups

- Area 03 should independently verify the serialization validators/migrations for `NpcStateSnapshot`, households and relationship snapshots.
- Area 15 should re-check conversation/follow-up cancellation through lethal combat/death as part of shared death-pipeline coverage.
- Area 21 should own quest/reputation consequence idempotency beyond the stable Player↔NPC relation boundary verified here.
- Area 23 should re-check UI modal lifetime/stale references broadly; this review only traced the NPC-dialogue path.
- Area 24 should benchmark `agentCpuDiag.social` after `npc-060` and decide whether any broader NPC spatial index is justified.

## Existing plans that already cover findings

None for F1.

Relevant implemented/current context checked to avoid duplicate work:

- `npc-013-night-campfire-gathering.md`;
- `npc-045-campfire-spoken-conversation-pairs.md`;
- `npc-050-npc-initiated-player-follow-ups-and-proactive-dialogue.md`;
- `npc-052-contextual-elder-social-titles.md`;
- `quests-progression-015-stable-npc-identity-for-quests.md`;
- `settlements-npcs-013-hierarchical-domain-history.md`.

## New plans required

- `npc-060-social-pairing-cadence-and-allocation.md` — remove frame-rate settlement-wide social discovery/allocation without changing social-place, relationship or conversation semantics.

## Verification limits

This was a source/code-path audit against current `main`. No browser verification was run, per project rules.

No production finding was inferred from missing social/family/dialogue features or Vision differences. No finding was implemented.

No new benchmark was run. F1 is a structural recurring-path finding; the existing dedicated `agentCpuDiag.social` span is the intended measurement seam for implementation verification.

## Master status update

Area 14 → **✅ reviewed**.

No unresolved high/critical finding was confirmed. F1 is medium and has the focused follow-up plan `npc-060`.
