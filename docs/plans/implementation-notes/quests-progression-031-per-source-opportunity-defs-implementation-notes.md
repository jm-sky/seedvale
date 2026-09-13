# Implementation Notes: quests-progression-031 — Per-source opportunity defs

## Copy the wolf-den shape, not a factory

Wolf den: `collectWolfDenPressureOpportunities` always returns the den opportunity; `wolfDenPressureSourceStatus` gates `present`. `QuestManager` never gains defs mid-session.

Lost livestock: change `collectLostLivestockOpportunities` to return **one opportunity per** local household-owned candidate with a stable `animalId`, not `find` first stray else `selectLostLivestock` single pick.

`lostLivestockQuestId(settlementId, animalId)` already exists. `parseLostLivestockQuestId` + persisted rematerialization in `collectSettlementQuestOpportunities` already rebuilds missing live candidates from save ids.

## Availability

`QuestManager.meetsAvailability` already:

```ts
const lost = this.lostLivestockSource.getSnapshot(def.id)
if (lost !== 'untracked' && lost !== 'lost-alive' && lost !== 'corpse-uninspected') return false
```

Non-stray animals must return a snapshot that is **not** those two (e.g. untracked vs a new `'home'`). Today `LostLivestockSourceLookup` uses fauna `LostLivestockSourceStatus | 'untracked'`. Check `src/fauna/animalStray.ts` for statuses (`lost-alive`, `returned`, `corpse-*`, `unavailable`). Calm livestock should map to something that fails the offer gate — if the lookup returns `untracked` for a generated lost-livestock **id**, `meetsAvailability` treats it as OK (`untracked` is ignored). **That is the footgun.**

For generated lost-livestock defs, `untracked` must not mean “ordinary authored quest”. The lookup in createApp must return a concrete non-offerable status for a materialized livestock quest whose animal is at home. Extend the lookup (not QuestManager special-case on prefix) so `getSnapshot(questId)` is always typed for those ids.

Do not parse prefixes inside `QuestManager` if the lookup can do it.

## Selection cap

`selectSettlementQuestOpportunities`: `take(opportunity, opportunity.kind !== 'rpg-matrix')` already ignores limit for world-driven. Per-animal defs will all be selected. That is intended. RPG still capped.

## `QuestManager` constructor

No `registerDef`. Home livestock count is small; iterating `defs` in `onInteract` / polls stays fine.

## Tests

- `collectLostLivestockOpportunities` returns N ids for N household animals.
- Snapshot `returned`/`unavailable`/at-home → quest stays `not_offered` / hidden from `list()`.
- Two animals, stray on B only → only B’s giver dialog offers that quest id.
- Persisted progress for animal B rematerializes when B is no longer the “selected” stray.

## Model

M / Composer or Grok; fallback Sonnet. The availability-vs-untracked footgun is the main design trap.
