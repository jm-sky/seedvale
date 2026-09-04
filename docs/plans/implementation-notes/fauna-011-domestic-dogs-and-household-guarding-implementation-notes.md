# Implementation notes: fauna-011 domestic dogs and household guarding

## Existing ownership and lifecycle to reuse

- `src/fauna/AnimalAgent.ts` owns live animal behaviour, movement, combat entry points, life state and snapshot/hydrate integration.
- `src/fauna/AnimalLife.ts` owns shared hunger/thirst/stamina state and operations. `fauna-010` is expected to move species-specific rates/capacity into `AnimalDef`; do not add dog-specific runtime need state.
- `src/settlement/livestock.ts` already assigns domestic animals durable `ownerHouseId` and derives household/home ownership from existing settlement data. Use `dog -> ownerHouseId -> Household -> members/home`; do not create protected-NPC lists.
- Domestic animal persistence already carries ownership separately from `AnimalAgent` runtime snapshots. Dog should fit that path rather than introduce `DogSaveData`.

## Behaviour seams

- `src/fauna/faunaDecision.ts` is the central decision/arbitration seam. Existing role routing currently sends predators through predator-normal and non-predators through prey-normal after higher-priority branches.
- Current `AnimalRole = 'predator' | 'prey' | 'livestock'` conflates several concepts. A dog cannot simply be classified as predator: predator-normal currently seeks prey and attacks it. It also cannot behave like livestock/prey because prey-normal flees predators.
- After `fauna-010`, inspect the actual resulting diet API first. Make only the smallest additional separation required so dog can eat meat and fight wolves without inheriting predator hunting.
- Keep guard/home behaviour inside the existing AnimalAgent decision/update flow. Do not create a second dog update loop.

## Combat reuse

- `AnimalAgent` already has a shared animal-vs-animal attack path (`attack(target: AnimalAgent)` in the current code) that enforces cooldown, stamina, attack animation, damage and rabies transmission where applicable.
- Reuse that path for dog-vs-wolf. If its current visibility/placement prevents guard behaviour from using it cleanly, refactor only the access boundary; do not duplicate attack logic.
- Existing human/NPC attack flows maintain stable targets. In particular wolf NPC combat already has an authoritative `npcTarget`. Expose a narrow read-only view of that fact for dog threat evaluation rather than inferring attacks from distance.
- The current nearby NPC perception shape is minimal (`id/x/z`), so household membership and active attack state may require a small integration seam. Ownership must still resolve through `ownerHouseId` and existing Household membership.

## Food and water

- Current animal water resolution already prefers animal troughs and then natural shoreline/water access. Player wells are a separate interactable path and are not part of animal drinking. Preserve this shared invariant; do not add a dog-only well exclusion.
- Before fauna-010, `findFoodTarget()` derives food behaviour from role (`predator -> carcass`, otherwise forage). fauna-010 is intended to separate diet from `AnimalRole`; implement dog only against the post-fauna-010 contract.
- Existing meat items live in the shared item catalog and carry semantic food metadata, including meat/bait metadata. Prefer semantic compatibility from item metadata over a duplicated `DOG_FOOD` list.
- V1 dog should not autonomously seek carcasses. Normal feeding sources are own-household compatible food plus direct player feeding.

## Player interaction

- Live animals are already exposed through `Interactable.kind === 'animal'` and the central animal interaction dispatch handles attack, mount, milk and observe paths.
- Add feeding to this existing interaction path; do not create a separate raycast/interactable system.
- `Inventory.remove()` already removes stack items. Revalidate the current inventory API after fauna-010/related changes and consume exactly one compatible food item only on successful feeding.
- Manual NPC-to-animal feeding is intentionally outside fauna-011. Household-owned autonomous consumption is sufficient for NPC-side care in this phase.

## Vocalization and howl response

- Current animal vocalization has an `onVocalize(kind, x, z)` callback used for presentation/audio and spontaneous vocalizations. Wolf howl already uses this path and pauses movement briefly after howling.
- Dog AI must not depend on WebAudio, camera distance or whether the player can hear the sound. Add only enough semantic source/type/position information for fauna perception to react to a howl and for presentation to remain a consumer.
- Avoid turning fauna-011 into a global event-bus rewrite. The reusable seam only needs to support existing wolf howl and dog bark cleanly.
- Bark response requires novelty/cooldown. Do not make "heard dog bark" automatically produce another bark, otherwise multiple dogs can form a feedback loop.

## Guard relevance

Required priority order:

```text
wolf attacking own household member
>
wolf attacking nearby settlement inhabitant
>
relevant wolf near own home/household
>
distant unrelated wolf
```

- Own-household membership comes from the dog's `ownerHouseId` and existing Household members.
- Use the attacker's authoritative current target to identify an actual attack. Do not approximate "attacking" from proximity alone.
- Foreign-household assistance should remain local and lower priority than own-household defense.
- Include disengagement/home pressure so a dog stops chasing when the threat is stale, too far from home/protected NPC, dead or otherwise no longer relevant.

## Models and animations

Existing assets:

- `public/models/fauna/dog_husky.glb`
- `public/models/fauna/dog_shiba.glb`

They are Quaternius models with many animations, but exact clip names were not verified through the GitHub connector because the assets are binary. During implementation inspect both GLBs locally and map real clip names into the existing semantic animation selection. Treat Husky/Shiba as visual variants of one simulation kind.

## Persistence and transient state

Persist through existing domestic-animal state:

- stable animal identity,
- kind/variant where the current asset system requires it,
- `ownerHouseId`,
- position/orientation,
- health,
- `AnimalLifeState`,
- existing corpse/production state where applicable.

Do not persist transient runtime facts unless the current architecture already does so:

- bark cooldown,
- last heard stimulus,
- temporary alert,
- active guard target.

These should reconstruct from current world state after load.

## Performance constraints

- Do not scan all NPCs/wolves/households every frame per dog.
- Reuse existing bounded nearby-candidate/perception mechanisms and fauna decision cadence.
- Keep vocalization stimuli spatially bounded and short-lived.
- Do not introduce a worker just for dogs.

## Implementation order

1. Finish/rebase onto fauna-010 and inspect the final `AnimalDef` diet/metabolism API.
2. Wire `dog` kind plus Husky/Shiba visual variants and animation mappings.
3. Reuse domestic ownership/spawn/persistence and establish local home behaviour.
4. Configure dog metabolism/diet and household food consumption.
5. Add generic player → animal feeding through the existing animal interaction path.
6. Add minimal semantic vocalization stimulus needed for wolf howl → dog alert/bark.
7. Expose authoritative wolf/NPC threat information and add guard scoring/priorities.
8. Reuse existing animal combat for dog-vs-wolf and add disengagement/return-home behaviour.
9. Add focused decision/feeding/vocalization tests and existing fauna debug visibility.

## Pitfalls

- Do not assign dog `predator` and accept inherited prey hunting as a shortcut.
- Do not assign dog ordinary livestock/prey behaviour and then special-case wolf fleeing.
- Do not create dog-specific food, water, combat, persistence or interaction subsystems.
- Do not duplicate Household membership on the dog.
- Do not infer an active wolf attack solely from distance.
- Do not make vocalization perception depend on audio presentation.
- Do not broaden this plan into carcass scavenging, commands/companionship, persistent animal memory, NPC manual feeding or a general-purpose actor threat/event framework.
