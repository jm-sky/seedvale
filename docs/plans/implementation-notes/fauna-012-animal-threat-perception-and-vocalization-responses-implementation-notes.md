# Implementation notes: fauna-012 animal threat perception and vocalization responses

## Current codebase state

- `fauna-010` and `fauna-011` are still `planned` and their assumed APIs are not present yet. In particular, current `AnimalKind` has no `dog`, and `AnimalDef` still predates fauna-010's species diet/metabolism contract. Implement fauna-012 against the actual post-010/post-011 code, not against their plan text.
- Current vocalization is presentation-oriented: `AnimalAgent.update()` calls `onVocalize(kind, x, z)` after `tickSpontaneousVocalizeCooldown()`, while `audio/animalSounds.ts` chooses/playbacks the clip. No semantic stimulus (`howl`/`bark`/`crow`, context, source id, age) exists yet.
- Wild fauna and settlement livestock are updated through separate owners: `fauna/createFauna.ts` (`Fauna.update`) vs `settlement/createSettlement.ts` / `settlement/livestock.ts`. `gameLoop.ts` currently wires both vocalization callbacks directly to `playSpontaneousAnimalSound()`. A stimulus store owned only by `createFauna.ts` would therefore be the wrong boundary.
- `fauna/faunaDecision.ts` is the central top-level behaviour arbitration seam. Keep new threat/alert consequences as inputs/candidates there; do not add an independent reaction update path beside it.

## Recommended ownership and semantic seam

Introduce one small world/runtime-owned transient fauna-stimulus registry shared by wild fauna and loaded settlements. `gameLoop.ts`/`WorldBundle` is the natural integration boundary because it already sees both update paths; the registry itself should live in a fauna-focused module, not in audio.

A vocalization stimulus should carry only simulation semantics needed by consumers, for example:

- stable transient event id,
- `sourceAnimalId`, `sourceKind`, position,
- semantic kind (`howl` / `bark` / `crow`),
- context (`ambient` / `alert`),
- simulation timestamp or remaining lifetime.

Do not use the sound asset/URL as stimulus identity. Presentation should become a consumer/fan-out of the same semantic emission, so simulation truth does not depend on WebAudio, camera distance, playback throttling or whether a clip exists.

Prefer an explicit emission method/callback over broadening `playSpontaneousAnimalSound()` into simulation responsibility. Existing ambient cooldown/time weighting in `audio/animalSounds.ts` can remain the trigger policy for spontaneous calls for now, but the actual semantic event must be emitted before audio concurrency/drop decisions.

## Storage and querying

- Stimuli are transient and should not enter save data. Prune by simulation time/lifetime.
- Keep storage strictly bounded. Event volume is very low, so a small capped recent-event buffer plus squared-distance filtering is preferable to introducing a new spatial index/grid prematurely.
- Query only on the existing fauna decision/perception cadence where possible; do not scan the buffer every render frame for every animal.
- Return only recent/in-range candidates and perform species/relevance scoring in pure code. Avoid storing duplicated per-observer copies of an event.
- Event id plus a tiny per-agent transient `lastHandled...`/cooldown seam is enough for novelty where needed. Do not add persistent animal memory for fauna-012.

## Threat perception reuse

Keep two concepts separate:

1. **Live spatial threat state** — current animal/NPC positions, current target/attack state.
2. **Transient stimuli** — howl/bark/crow that happened recently.

Do not convert ordinary proximity into events.

Current `NearbyNpcCandidate` is only `{ id, x, z }`. Current predator NPC targeting is authoritative inside `AnimalAgent` via `npcTarget` / `resolveNpcTarget()` / `senseNpcThreat()`, but that shape does not expose who is attacking whom. fauna-011's household guarding therefore still needs the narrow read-only combat/threat seam described in its implementation notes. fauna-012 should consume that seam rather than infer an attack from distance or introduce a second combat target state.

Likewise, reuse loaded/local candidate lists already assembled by the game loop. Do not add world-wide NPC/animal searches.

## Behaviour integration

`faunaDecision.ts` currently ranks player threat, NPC threat, fire avoidance, frenzy and normal predator/prey behaviour. Extend this arbitration only when a perceived stimulus must actually change behaviour. Keep perception/scoring separate from execution:

```text
nearby live state + recent stimuli
→ species-specific relevance score
→ small transient alert/threat input
→ existing behaviour arbitration
→ existing movement/combat/vocalization actions
```

Do not let a stimulus directly call `fleeFrom()`, `attack()` or bark from the registry/query layer.

For v1, use declarative species response tuning rather than branches spread through `AnimalAgent`. Exact values should be small configuration (hearing/reaction radius, response weight/cooldown) associated with species/capability after fauna-010/011 settles `AnimalDef`.

## Vocalization response rules

- Preserve the existing spontaneous wolf howl timing and howl pause from fauna-009; semantic emission should wrap/extend it, not replace the cooldown logic.
- `ambient` and `alert` must be distinct. A dog's alert bark may carry stronger threat relevance than an ambient howl/crow, but receiving an alert bark must not automatically emit another bark.
- Bark should be an outcome of the dog's guard/alert decision with its own cooldown/novelty gate. This prevents dog↔dog feedback loops.
- A wolf howl should be able to raise local alert/flee pressure for appropriate domestic/prey animals without forcing an immediate behaviour if a higher-priority live threat already exists.
- Rooster crow is primarily a semantic/ambient stimulus in this plan; do not invent broad behavioural responses merely because the event exists.

## Cross-owner update ordering

Because settlement livestock and wild fauna are updated in separate passes, define event visibility deliberately. Prefer a simple rule such as "events emitted this simulation tick are queryable immediately by later consumers and remain alive long enough that pass order cannot make them disappear". Do not rely on audio callback ordering.

If exact same-frame symmetry would require restructuring both update passes, avoid it: a short-lived stimulus surviving into the next fauna decision tick is sufficient and more robust.

## Debug/tests

- Put stimulus matching/relevance/expiry in pure functions and unit-test them without Three.js.
- Extend existing fauna decision tests only for behaviour arbitration changes; do not duplicate scoring tests in `AnimalAgent` tests.
- Add debug visibility for the currently selected perceived stimulus / alert reason only if it materially helps verification. Avoid a permanent verbose event log.
- Essential cases: expired/out-of-range ignored; same event not repeatedly retriggering; bark does not echo recursively; higher-priority live threat wins; semantic emission still occurs when audio playback is unavailable/throttled.

## Implementation order

1. Land/rebase fauna-010 and fauna-011; inspect their actual resulting `AnimalDef`, dog guard and combat-view seams.
2. Add the shared transient semantic stimulus registry and pure query/relevance helpers.
3. Change wolf/rooster/dog vocalization emission to publish semantic events while preserving existing audio presentation.
4. Feed relevant stimuli into `AnimalAgent` perception and `faunaDecision.ts` through a narrow transient alert/threat input.
5. Add species response tuning and bark anti-feedback/cooldown rules.
6. Add focused tests/debug visibility and verify both cross-boundary directions: wild → settlement animals and settlement dog → nearby wild fauna.

## Pitfalls

- Do not implement fauna-012 before reconciling the still-unimplemented fauna-010/011 contracts.
- Do not place the registry in `audio/animalSounds.ts` or make AI depend on successful sound playback.
- Do not place it solely inside `Fauna`, because livestock/dogs live under settlement ownership.
- Do not create a generic global event bus for this feature.
- Do not turn proximity/contact into event spam; use live state for ongoing threats.
- Do not duplicate combat target/household ownership state in stimuli.
- Do not persist recent vocalizations, alert cooldowns or selected transient stimuli.
- Do not bypass `faunaDecision.ts` with direct reaction side effects.
