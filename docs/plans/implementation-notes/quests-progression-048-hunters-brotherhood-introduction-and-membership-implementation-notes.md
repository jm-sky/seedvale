# Implementation notes: quests-progression-048 Hunters Brotherhood introduction and membership

## Current seams to reuse

- `src/quests/opportunities/hunterProfessionQuests.ts` already owns the deterministic home Hunter selection. Reuse `selectHunterQuestGiver()`; do not create a second selector. `hunterProfessionQuestId(homeId, giver.id, 3)` is the exact Hunter III prerequisite quest id.
- `SettlementDef` → stable NPC identity is already handled by `settlementOpportunityNpcsFromDef()` / `settlementNpcId()`. Binding must use those `NpcId`s, never runtime `NpcAgent`s or names.
- `createApp.ts` already computes `neighborDefs = nearbyRpgSettlementDefs(homeDef, peekDef)` and materializes lightweight NPC projections for home + bounded nearby settlements. Reuse this bounded set; do not add another world scan.
- `QuestManager` already supports `quest_outcome`, `exposure: 'story'`, multi-objective `mode: 'all'`, `talk_to_npc`, exact-once outcomes, relation/social consequences and save/load progress. Brotherhood needs no manager/runtime changes.

## Recommended module boundary

Put the pure cast resolver + quest builder in a dedicated quest module, e.g. `src/quests/huntersBrotherhoodIntroduction.ts`. This is authored story binding, not a new `SettlementQuestOpportunity` source; do not extend the world-opportunity union unless implementation discovers a real world-problem source.

Keep `OpportunityNpc` lightweight. `settlementOpportunityNpcsFromDef()` already provides enough identity/profession data; personality/traits are unnecessary for V1.

Suggested public concepts:

```ts
type HuntersBrotherhoodBinding = {
  homeSettlementId: string
  secondSettlementId: string
  inviterNpcId: NpcId
  practicalNpcId: NpcId
  masterNpcId: NpcId
  trophyNpcId: NpcId
  ambitiousNpcId: NpcId
}

resolveHuntersBrotherhoodBinding(...): HuntersBrotherhoodBinding | undefined
buildHuntersBrotherhoodIntroductionQuest(...): QuestDef | undefined
```

`inviterNpcId === practicalNpcId` is an invariant.

## Cast resolution

Use definition order as deterministic tie-breaking; no runtime RNG/hash is needed.

1. Resolve the home practical/inviter with `selectHunterQuestGiver(homeNpcs)`. No giver => no binding.
2. Consider the already bounded nearby settlement defs in nearest/id order from `nearbyRpgSettlementDefs()`.
3. For each candidate second settlement, test whether home + that settlement can provide **four distinct adults total** including the inviter, with at least one adult from the second settlement. Pick the first candidate that can.
4. `master`: from the selected second settlement, first adult `role === 'hunter'`, otherwise first adult.
5. Remaining `trophy`: prefer a remaining adult Hunter across the two-settlement pool, otherwise first remaining adult.
6. `ambitious`: first remaining adult.

Exclude already selected ids at every step. Minimum viable cast is therefore exactly four distinct adults: practical/inviter + master + trophy + ambitious. Because master is always from the second settlement and practical is home, the two-settlement invariant is guaranteed.

Do not require `trophy`/`ambitious` to be professional Hunters and never mutate `CharacterDef.role`.

## Quest shape

Prefer one story quest with the home practical Hunter as `giver`.

- `availability.prerequisites`: exact Hunter III quest id + outcome `hunter_iii_complete`.
- `offerPolicy: { exposure: 'story' }`.
- Offer/accept itself is the invitation; do **not** create an empty invitation stage.
- First gameplay stage: `objectives: { mode: 'all', ... }` with three stable slots for `master`, `trophy`, `ambitious`, each using `talk_to_npc` with its bound `NpcId`.
- After all three talks, normal `ready_to_report` flow should return to the inviter. Use the existing report interaction as the acknowledgement/joining scene; this avoids a custom final-action mechanism and avoids making the master a second pseudo-giver.
- Terminal outcome: `hunters_brotherhood_joined`.

If the current `QuestStage` contract requires explicit slot ids, use semantic ids (`master`, `trophy`, `ambitious`) so persisted stage progress is stable and readable.

Export/reuse the Hunter III outcome constant from `hunterProfessionQuests.ts` rather than duplicating an untyped magic string if that can be done without widening unrelated API surface.

## Composition and rematerialization

Integrate next to the existing home-only `buildHunterProfessionQuests()` assembly in `createApp.ts`, using the same `homeDef`, `neighborDefs`, NPC projections and `persistedQuestIds` context already computed there.

The Brotherhood quest definition should be materialized on every boot whenever the deterministic cast still resolves. Quest progress/outcome continues to come only from `initialSave.quests.progress` → `QuestManager`; do not persist the binding separately.

Do not gate definition construction on Hunter III already being complete. Materialize the definition and let `quest_outcome` availability perform the gating, otherwise prerequisite validation/rematerialization becomes more fragile.

A saved accepted/completed Brotherhood quest therefore needs no special reconstruction path as long as the same world seed/settlement definitions reproduce the same cast and quest id.

Use a stable quest id derived from the home settlement + inviter (or another equally stable binding key), not display names and not second-settlement presentation text.

## Rewards / consequences

Keep this below the Hunter I–III progression scale. A small relation increase to inviter/master is enough; avoid item reward and avoid new Brotherhood reputation/currency. Existing Hunter chain awards competence/trust/renown materially, so this story-introduction quest should not repeat that progression payload unless balance review shows a small existing-social delta is needed.

## Tests that matter

Add focused tests around the pure resolver/builder rather than expanding `QuestManager` unless a manager regression is found:

- same defs => same binding/quest id;
- inviter is exactly `selectHunterQuestGiver(homeNpcs)`;
- four distinct adult ids, master from selected second settlement;
- second-settlement Hunter preferred for master, fallback adult works;
- fewer than four professional Hunters still succeeds;
- insufficient total adults / no suitable second settlement => no binding;
- Hunter III exact prerequisite + `exposure: 'story'` + terminal `hunters_brotherhood_joined`;
- meeting stage requires all three distinct conversations;
- definition can be rebuilt with the same ids when its quest id already exists in persisted progress.

No Brotherhood-specific SaveData, tick, worker, runtime manager or profession changes.