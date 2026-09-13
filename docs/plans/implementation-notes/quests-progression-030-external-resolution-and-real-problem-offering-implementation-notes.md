# Implementation Notes: quests-progression-030 — External resolution and real problem offering

## `pollWorldDrivenSources` is the hardcoded fail

```ts
if (status === 'resolved') {
  const failed = uniqueOutcomeForState(def, 'failed')
  if (failed) this.applyOutcome(def, failed.id)
}
```

Generated wolf-den (`materializeWolfDenPressureQuest`) already authors:

- `den_destroyed` complete
- `resolved_without_player` failed

`uniqueOutcomeForState` is correct only when there is **one** failed outcome. Here there is one, so it “works”, but it **cannot** distinguish “player destroyed den” vs “world resolved”. Player destroy is supposed to go through `pollDestroySpawnPointObjectives` → `advanceStage` → report → `den_destroyed`.

**Order in createApp** (`onSpawnPointDestroyed` and boot): `pollDestroySpawnPointObjectives` then `pollWorldDrivenSources`. If the objective already advanced, state is `ready_to_report` / not `active`, so source `resolved` must **not** fail a non-active quest. Verify: after destroy, state is not `active` — then the resolved branch’s `s.state !== 'active'` continue already protects it. Add a test that would fail if someone polls source first.

When still `active` and source `resolved` (pressure gone / den gone without this quest’s destroy objective completing): apply **named** `resolved_without_player` if present, else unique failed.

Do not treat `absent` as failed-with-reward; keep `invalidated` for missing binding.

## Stop quest-started stray

`createApp.ts` `syncLostLivestockQuests`:

```ts
animal.startLivestockStray({ predators })
```

Delete this mutation. Keep `pollLostLivestockSources()`. Offering already requires snapshot via `meetsAvailability` (`lost-alive` / `corpse-uninspected`).

Fauna-025: `AnimalAgent` classifies displacement into the same episode. Tests in `settlementQuestOpportunities` / `QuestManager.test.ts` lost-livestock section should use an injected snapshot, not start stray from quest.

`collectLostLivestockOpportunities` still picking a non-stray animal at boot is OK until 031 — but **offering** that def must fail availability until a real stray/corpse snapshot. Today `meetsAvailability` already rejects other snapshots; if a def exists for a calm animal, it stays `not_offered`. The bug is forcing stray to make the errand real.

## Authored `zagubiona-owca`

Out of scope. Still `find_animal` + resolver.

## Recommendation on outcome polarity

Keep `resolved_without_player` as `state: 'failed'` (no hero reward). Only change **selection** of that id vs a generic unique failed. Do not flip it to `complete` in this plan (save semantics / UI “Zakończone” already groups failed).

## Model

M / Composer or Grok; fallback Sonnet. Logic is localized; the stray deletion is the behaviour change that needs the fauna-025 tests in mind.
