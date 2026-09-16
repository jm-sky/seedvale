# Plan: Hunters Brotherhood — exceptional animal finale

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** quests-progression-053
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `progression`
**Tags:** `hunters-brotherhood` `fauna` `exceptional-animal` `finale` `choice`
**Roadmap:** `quests-hunters-brotherhood.md`

## Goal

Close the current Hunters Brotherhood arc with one rare, persistent, visually unmistakable wild animal that exists as a real world inhabitant rather than a quest-only target.

The finale should test the player's hunting competence and prior Brotherhood history while still allowing different resolutions. Killing the animal is not automatically the best or worst result, and sparing it must leave the same concrete animal alive in the world.

The exceptional animal is **not** an alpha wolf/bear and must not reuse `alpha` as a narrative shortcut. Alpha is currently a combat/social-significance variant for a wolf-den pack leader. The finale animal is a different concept: an individually rare animal whose exceptional nature may be expressed through unusual size and appearance rather than aggression or pack dominance.

## Core flow

```text
048 Brotherhood membership
→ 049 hunting-ground investigation
→ 053 competing hunting strategy
→ exceptional animal becomes narratively relevant
→ find the concrete persistent animal
→ resolve the encounter
→ persistent world + social consequences
```

The animal may already exist before the quest becomes available. Quest activation reveals its significance; it must not create the animal as a transient quest spawn.

## Exceptional animal identity

Prefer a **stag** for V1 because it fits the established hunter progression and creates a clearer contrast with existing alpha predators.

The authored finale binding should resolve one stable habitat and one persistent occupant, for example:

```text
stable habitat
→ PersistentOccupantDecl
→ stable animalId
→ exceptional presentation/variant
→ normal AnimalAgent lifecycle
→ save/load snapshot
→ corpse/tombstone if killed
```

Reuse `src/fauna/persistentOccupants.ts`. Fauna remains authoritative for identity, life state, corpse state and tombstones.

The quest layer owns only discovery, objectives, decisions and historical outcomes.

## Exceptional is distinct from alpha

Current `AnimalVariant` only contains `normal | alpha`, and `alpha` combines larger scale, stronger combat stats, danger significance and darkening. That semantic bundle is wrong for this finale.

Extend the existing fauna-owned per-individual variant/presentation mechanism rather than introducing quest-owned visual overrides or a second modifier pipeline.

The exceptional animal should support a distinct authored presentation such as:

- somewhat larger body scale than a normal stag;
- unusual coat tint that can be **lighter rather than darker**;
- V1 preferred presentation: pale / white / albino-like stag;
- clearly recognizable at normal gameplay distance;
- no automatic alpha-style damage, danger or pack-leader semantics.

The implementation should evolve the existing tint representation beyond `visualDarken` if required. Prefer an explicit presentation/tint contract that can represent lightening or a target tint rather than abusing a negative darkening coefficient.

Example conceptual direction — exact type decided during implementation notes after code recon:

```ts
type AnimalVariant = 'normal' | 'alpha' | 'exceptional'

type AnimalVariantDef = {
  scaleMultiplier: number
  healthMultiplier: number
  damageMultiplier: number
  speedMultiplier: number
  dangerMultiplier: number
  presentation: {
    tint?: number
    tintStrength?: number
  }
}
```

Guardrails:

- do not make `exceptional` an alias for `alpha`;
- do not automatically make an exceptional herbivore more aggressive or more damaging;
- do not introduce a separate `GreatTrophyManager` or quest-only material mutation path;
- keep variant/presentation ownership in fauna;
- ordinary animals keep their current appearance and stats.

This scoped extension should remain reusable for future rare individuals without turning V1 into a procedural rarity system.

## Rarity and world independence

For this authored finale, rarity means that the world composition declares only one such individual for the selected Brotherhood region/habitat.

Do **not** add random global albino/rare-animal spawning in this plan.

The exceptional animal should be composed deterministically through the normal world/fauna construction path, not spawned because the player accepted or activated the quest.

This preserves:

```text
world exists
→ rare individual exists
→ player/Brotherhood later discovers its significance
```

rather than:

```text
quest starts
→ special animal appears for player
```

## Discovery

After `053`, the Brotherhood receives or develops credible knowledge of the exceptional animal in the same broader region.

Prefer existing target-specific objective mechanisms:

- `find_animal`;
- `spot_animal`;
- stable `animalId` binding.

The quest must target the concrete persistent individual. Seeing or killing another stag must not satisfy target-specific stages.

The player should encounter the animal in the world before committing to the final resolution.

Do not add a generic procedural tracking system in this plan.

## Historical context

The finale should reuse existing social/history state rather than introducing a Brotherhood morality score.

At minimum, read the outcome of `quests-progression-053` and normal live relations/reputation where useful.

Examples:

- after a big hunt, the master may be more cautious about taking another exceptional animal;
- after habitat support, the master may trust the player's ecological judgment more;
- after predator hunting, the ambitious hunter may show more respect for the player's hunting competence;
- normal player↔NPC relation values may modulate authored reactions where that is naturally useful.

These are authored variations, not a requirement for every dialogue line.

## Finale resolutions

### 1. Hunt the exceptional animal

The player chooses to hunt and kill the concrete persistent animal.

Requirements:

- only the bound `animalId` satisfies the kill objective;
- death is handled by normal fauna combat/lifecycle;
- persistent occupant tombstone prevents replacement by a new copy;
- normal corpse/harvest systems remain authoritative;
- reward values use existing competence/renown/relation scales.

The animal being visually exceptional must not imply boss-style HP unless recon identifies a small justified species-independent variation already supported by the existing variant mechanism. Visual rarity and combat difficulty are separate concerns.

### 2. Find and spare

The player finds the animal and deliberately decides not to kill it.

This must be an explicit authored resolution rather than merely waiting near the animal.

A minimal flow may be:

```text
find/observe concrete animal
→ return to Brotherhood
→ state the decision to leave it alive
→ finale outcome
```

After completion:

- the same animal remains alive;
- it continues normal fauna simulation;
- save/load preserves it;
- the player may encounter it again later.

This visible persistence is a primary payoff of the branch.

### 3. Ambitious hunter attempt — conditional scope

Allow the player to give the opportunity to the ambitious Brotherhood member **only if recon confirms an existing, credible NPC→fauna action/resolution path**.

Do not fake an NPC hunt by rolling a quest-layer random result and directly killing/removing the animal.

If current NPC combat/action infrastructure cannot support the branch cleanly, omit it from V1 without blocking the rest of the finale.

Potential outcomes, only when systemically supported:

- ambitious hunter succeeds;
- the animal escapes;
- the NPC fails or is injured;
- the player intervenes.

### Protection — optional authored extension

A distinct `protected` outcome only exists if it means more than `spared`.

If current autonomous NPC hunting cannot target this animal, do not create a fake protection policy solely for narrative wording. Protection can remain dialogue flavor within `spared`.

If a real hunting-policy mechanism exists by implementation time, it may become a separate meaningful outcome that prevents eligible NPC hunting from targeting this individual or habitat.

### Deception / substitute trophy — optional, not V1-required

Only include deception if existing inventory/harvest provenance can support a real substitute trophy and the world can distinguish the exceptional animal's continued survival.

Do not add a quest-only `fake_trophy` item or hidden morality meter just to make this branch work.

If provenance is insufficient, defer this branch.

## Exceptional presentation and persistence

The exceptional presentation must reconstruct deterministically after streaming and save/load.

Do not rely on a one-time material mutation performed by the quest.

The implementation should ensure the persistent occupant declaration/binding provides enough information for normal fauna construction to assign the same exceptional variant/presentation every time the individual is recreated.

If `AnimalSaveState` does not persist variants because variants are composition-derived, keep that model: the exceptional trait should be re-derived from the stable declaration/binding rather than duplicated into mutable save state unless current architecture requires otherwise.

## Animal can die independently

The world remains independent of the player.

If the exceptional animal can die through normal simulation before the final player decision, the quest must not soft-lock.

Provide a bounded fallback resolution:

```text
animal already dead
→ locate/inspect known target or corpse when possible
→ report what is actually knowable
→ alternate finale resolution
```

Do not invent a killer or cause of death when the simulation does not record one.

If current simulation effectively prevents this individual from dying off-screen, retain defensive lifecycle handling anyway.

## Outcomes

Final outcomes record historical resolution, not copied fauna state.

Core outcomes:

```text
brotherhood_finale_exceptional_animal_killed
brotherhood_finale_exceptional_animal_spared
```

Conditional outcomes may be added only for implemented meaningful branches, for example:

```text
brotherhood_finale_ambitious_hunt
brotherhood_finale_exceptional_animal_protected
brotherhood_finale_deception
brotherhood_finale_animal_already_dead
```

Do not encode every social reaction into outcome names. Player↔NPC relations and settlement reputation remain authoritative for social state.

## Rewards and social consequences

Do not define one universally superior reward.

Possible emphasis:

- kill: tangible harvest/trophy where existing item systems support it, competence and/or renown;
- spare: trust/benevolence/relation consequences where authored context supports them;
- ambitious branch: relationship and competence consequences according to the actual result;
- deception, if implemented: authored integrity/social consequences through existing systems.

Use socially consequential dialogue selectively where the scene naturally contains disagreement, promise, deception or loyalty. Ordinary informational dialogue needs no artificial penalties.

Do not create Brotherhood reputation or morality state.

## Ownership

```text
world/fauna
→ exceptional individual declaration
→ variant/presentation
→ identity and lifecycle
→ death/corpse/tombstone

QuestDef / QuestManager
→ discovery and stage progress
→ authored decision
→ historical outcome
→ existing social consequences

inventory
→ real harvest/trophy items

NPC systems
→ NPC hunting action only if the ambitious branch is actually supported
```

## Required recon before implementation notes

1. Verify how `PersistentOccupantDecl` declarations are assembled into the normal `worldBundle.ts` / fauna composition path and choose the stable Brotherhood-region habitat binding.
2. Verify `find_animal`, `spot_animal` and `kill_target_animal` target-specific semantics for a stable persistent `animalId`.
3. Trace `AnimalVariant` construction from declaration/spawn to `AnimalAgent` and identify the smallest clean extension for an `exceptional` variant distinct from `alpha`.
4. Replace/extend `visualDarken` only through the shared fauna presentation path so a pale/albino tint can be represented without regressions to existing alpha/dangerous visuals.
5. Verify GLB/material tinting behavior through `tintPropMaterials()` so a light/white target tint remains visually readable and does not destroy material detail.
6. Verify scale application and collider/interaction implications for a moderately larger stag.
7. Verify how stag corpse/antler/harvest rewards work for a specific persistent individual.
8. Determine whether item provenance can support a substitute-trophy deception branch; omit if not.
9. Determine whether an NPC can credibly pursue/attack this exact persistent animal; omit ambitious branch if not.
10. Determine whether any real NPC hunting policy exists that could make `protected` mechanically distinct from `spared`; otherwise merge them.
11. Verify the existing social/reputation reward scales before assigning concrete values.

Document exact files, symbols, ownership and integration seams in the implementation notes so the implementation agent does not repeat this recon.

After implementation notes are complete, add the required `**Model:**` metadata with exactly two implementation models according to `PLANNING.md`.

Add JSDoc with `@domain` for important new public architectural functions/resolvers, especially any fauna variant/presentation resolver and Brotherhood finale binding.

## Non-goals

- alpha wolf/bear redesign;
- turning the exceptional stag into an alpha predator equivalent;
- generic boss animals;
- global procedural rare/albino spawning;
- random legendary-animal generation;
- Brotherhood ranks or faction reputation;
- morality meter;
- trophy leaderboard;
- generic tracking system;
- quest-owned animal lifecycle or presentation;
- broad NPC hunting-policy redesign unless required as a separate dependency.

## Verification

Automated tests should cover the deterministic/stateful contracts that do not require a browser:

1. exceptional binding resolves the same habitat/occupant/animal identity deterministically;
2. exceptional presentation is distinct from `alpha` and does not inherit alpha-only combat semantics;
3. pale/light tint resolution is deterministic and ordinary/alpha visuals remain unchanged;
4. persistent exceptional animal reconstructs with the same variant after save/load/stream rebuild;
5. another stag cannot satisfy target-specific objectives;
6. killing the target creates the normal persistent tombstone and does not respawn a replacement;
7. spared completion leaves the persistent animal alive;
8. already-dead lifecycle state cannot soft-lock the finale;
9. conditional branches are only offered when their supporting mechanisms are implemented;
10. outcomes preserve historical resolution without duplicating fauna state;
11. no Brotherhood reputation, morality state or parallel exceptional-animal manager is introduced.

Browser/manual verification is performed by the user, not the AI agent. Verify visually that the exceptional stag is clearly recognizable as unusual — preferably pale/white/albino-like and moderately larger — while still reading as the same animal species and retaining sensible materials, animation, collider/interactions and normal world behavior.

> **Zrób git commit i push do main, rebase jeżeli trzeba**