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

`quests-progression-029` owns the common terminal-effects / exact-once direction. `030` only selects the correct externally-resolved outcome; do not add a second external-resolution effect pipeline beside `applyOutcome`.

## Split authored stray trigger from generated lost-livestock

Current `createApp.ts` `syncLostLivestockQuests` can call:

```ts
animal.startLivestockStray({ predators })
```

Do **not** delete the concept of a quest-triggered stray. Delete it only from the generic/generated `world:lost-livestock:*` flow.

Seedvale intentionally supports authored narrative quests that cause real world events. For `zagubiona-owca`, the sheep must actually become lost for the authored quest to make sense. The authored flow may therefore call the fauna-owned `startLivestockStray()` API for its bound target.

Required split:

- authored `zagubiona-owca` / equivalent explicit authored binding → may start a real fauna stray episode;
- generated `world:lost-livestock:*` → observes an episode created by simulation and never starts one itself;
- do not infer permission to create the incident from generic `offered` / `active` state;
- authored intent must come from the concrete authored quest/binding/call-site;
- if the target already has a compatible stray episode, reuse it rather than starting another.

After the trigger, fauna owns `lost-alive` / return / corpse / unavailable lifecycle. Quest code observes that state rather than maintaining a duplicate `lost` flag.

## Close the `untracked` availability footgun in 030

Removing generic `startLivestockStray()` is not sufficient by itself.

Today `QuestManager.meetsAvailability` effectively treats `untracked` as “this lookup does not constrain this quest”:

```ts
const lost = this.lostLivestockSource.getSnapshot(def.id)
if (lost !== 'untracked' && lost !== 'lost-alive' && lost !== 'corpse-uninspected') return false
```

Therefore a materialized generated lost-livestock def for a calm animal must **not** return `untracked`, otherwise the offer gate can be bypassed.

For any recognized generated lost-livestock quest id, the lookup must return a concrete snapshot/status:

- `lost-alive` / `corpse-uninspected` → offerable;
- calm/home, `returned`, `corpse-inspected`, `unavailable` etc. → non-offerable;
- `untracked` only when the lookup genuinely does not apply to that quest id.

Do this in `030`, not only in `031`. `031` expands from one candidate to per-source defs and relies on this contract being correct already.

Do not special-case quest-id prefixes inside `QuestManager` if the source lookup can own the mapping.

## Authored `zagubiona-owca`

This flow is **in scope where necessary to preserve authored narrative semantics**.

Do not redesign the entire quest. Keep its existing authored objective/resolver, but ensure that entering the intended authored flow creates or reuses a real fauna-owned stray episode for the bound sheep. Tests must assert both quest state and actual fauna stray state.

The implementation must not turn `zagubiona-owca` into a world-driven-only quest and must not require waiting for a random natural stray.

## Interaction with 031

`quests-progression-031` remains responsible for materializing one stable generated def per eligible livestock identity and live gating those defs mid-session.

`030` must leave these invariants ready for `031`:

- generated opportunities never manufacture the problem;
- authored quests may explicitly manufacture a **real domain incident** as part of narrative content;
- recognized generated source ids always have a meaningful offerable/non-offerable snapshot, not ambiguous `untracked`;
- authored/generated variants do not create duplicate quests/episodes for the same active incident.

## Recommendation on outcome polarity

Keep `resolved_without_player` as `state: 'failed'` (no hero reward). Only change **selection** of that id vs a generic unique failed. Do not flip it to `complete` in this plan (save semantics / UI “Zakończone” already groups failed).

## Tests to protect the boundary

- authored `zagubiona-owca` starts/reuses a real stray episode for its bound target;
- generated offer for a calm animal stays `not_offered` and does not call `startLivestockStray()`;
- natural stray makes the generated source offerable;
- existing compatible stray + authored quest does not create a second episode;
- external wolf-den resolution chooses `resolved_without_player` and still goes through common `applyOutcome` semantics;
- player destruction poll wins before external source resolution.

## Model

M / Composer or Grok; fallback Sonnet. Logic is localized, but authored/generated ownership and the `untracked` availability contract are the two main traps.
