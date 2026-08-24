# NPC Physical Stats — Implementation Notes

**Plan:** `npc-001-npc-physical-stats-sex-and-age.md`
**Reviewed against:** current `main` codebase, `docs/STATE.md`, `docs/vision/npc-physical-state.md`

## Current code reality

- `NpcAuthoritativeState` already owns live `HealthState`, `StaminaState`, `VigorState`; `createNpcAuthoritativeState()` still hardcodes `100/100/100`. Do not move runtime mechanics into the new profile system. fileciteturn3file0L2-L6
- `SettlementsManager` owns the `NpcStateRegistry`; state objects survive NPC/settlement reconstruction and in-session `WorldBundle` rebuilds. The generated profile must therefore be stable and must **not** be regenerated when an existing `npcId` is hydrated. fileciteturn10file0L2-L2
- `createSettlement.ts` is the main NPC construction path. It flattens `def.families`, creates deterministic `npcId = settlementId:npc:i`, obtains authoritative state, then passes it to `NpcAgent.create()`. This is the correct integration seam. fileciteturn21file0L2-L2
- `FamilyMember` currently contains `character`, `relation` and visual `scale`, but no age. Children are currently only `relation: 'child'` plus random scale. Add age as actual family-member data rather than deriving it from scale. fileciteturn8file0L2-L2
- `NpcGender` already exists as `male | female` inside `CharacterDef`; use it as the plan's sex input. Do not redesign identity/gender in this plan. fileciteturn24file0L2-L2
- `HealthState`, `StaminaState` and `VigorState` are already shared runtime primitives. The physical profile should only determine their initial/max capacities. fileciteturn23file0L2-L2

## Recommended implementation boundary

Create one small pure module for stable NPC physical-profile generation, preferably next to the NPC/settlement state code (for example `src/settlement/npcPhysicalProfile.ts`). Keep it independent of `NpcAgent` and rendering.

Suggested responsibilities:

- `NpcAge`/age validation and life-stage classification;
- continuous age multiplier interpolation;
- sex modifiers;
- deterministic independent `hpVariation`, `staminaVariation`, `vigorVariation`;
- `generatePhysicalProfile(seed, sex, age)`;
- final max-value clamping/rounding.

The profile should contain the generated inputs/results needed later by the physical model, but do not add `strength`, `agility`, height, build or appearance yet.

`NpcAgent` should consume the resulting `NpcAuthoritativeState`; it must not calculate physical capacities itself.

## Family generation

`src/settlement/families.ts` is the correct place to introduce deterministic ages because it already owns family composition and the family seed. Preserve the current deterministic random stream as much as practical; avoid casually inserting random calls before existing rolls because that would reshuffle roles/traits/names across the whole world.

Add `age` to `FamilyMember` and generate it from a dedicated derived seed/PRNG rather than consuming the existing family-generation PRNG. This isolates the new feature from existing settlement generation results.

For couples, generate two adult ages from a dedicated family-age seed with explicit constraints. For the optional child, generate an age in `0..17` constrained by both parents. Document the chosen constraints in code/tests. Since v1 families have at most one child, sibling-age rules currently have no runtime case; tests should nevertheless cover the helper if the implementation models multiple children generically.

Reserved home families must also receive deterministic ages. Do not add age defaults such as `25` to `RESERVED_CHARACTERS`; those are character identity/role definitions, not family demographic state.

Keep `scale` as presentation-only until the future appearance/character-model work consumes age.

## State integration

Change the authoritative-state creation API so a newly created NPC receives the generated physical capacities, e.g. pass a `PhysicalProfile` (or explicit max values) into `createNpcAuthoritativeState()`.

Important distinction:

- **new NPC id:** generate profile → create state with profile maxima;
- **existing NPC id:** `NpcStateRegistry.getOrCreate()` returns the existing state and must ignore the newly supplied defaults/profile.

This preserves plan 197 lifecycle continuity. Do not persist the physical profile in `SaveData` as part of this plan; current NPC authoritative state is session-continuous but not a full simulation save snapshot. fileciteturn0file0L2-L2

Also update the isolated/fallback `NpcAgent.create()` path, because it currently uses `createNpcAuthoritativeState()` directly. Every NPC construction path must receive the same profile-derived maxima; do not leave a hidden 100/100/100 fallback.

## Determinism

Use the stable generation identity already present in construction: settlement seed/family seed + member index. Prefer a dedicated derived seed for physical generation rather than `Math.random()` or a shared mutable PRNG stream.

A good shape is:

```text
family seed
  ├─ existing family-generation RNG
  ├─ age seed
  └─ per-member physical seed
       ├─ HP variation
       ├─ stamina variation
       └─ vigor variation
```

Do not use runtime object identity, render index, frame number or `Math.random()`.

If profile generation is keyed directly by `npcId`, ensure the seed is still derived from the deterministic world/family inputs rather than a string hash whose implementation could later change. The important invariant is same world seed/family/member => same result.

## Formula details

Implement the plan's formula literally:

`base × sexModifier × ageModifier × independentVariation`

Use a linear interpolation between the specified age anchor ranges rather than a discrete life-stage lookup. The age multiplier must remain continuous at boundaries.

Define one explicit variation range, `0.90..1.10`, and three independent deterministic samples. Do not use one variation value for all three capacities.

Choose and document stable rounding/clamping rules. Prefer integer runtime maxima if the existing state/UI/combat assumptions expect integer capacities; clamp to a positive minimum after multiplication. Do not silently change the baseline scale beyond the requested modifiers.

For vigor, preserve the existing `MAX_VIGOR` contract by replacing the universal initial maximum with the profile-derived value rather than changing vigor mechanics. Search `npcVigor.ts` for any hard-coded assumptions before changing the state constructor.

## Runtime compatibility / pitfalls

- Existing code reads `health.maxHp`, `stamina.max`, `vigor.max`; keep these APIs unchanged.
- Existing fatigue, rest, sleep, combat and healing code should remain untouched except where a hard-coded max is genuinely part of state construction. The plan explicitly changes capacities, not mechanics.
- Current NPC inspection already exposes max/current values; it should automatically reflect the new maxima through the authoritative state. Avoid adding a second copy of max values to `NpcAgent`.
- Do not derive age from `relation`, model scale or visual state.
- Do not regenerate age/profile when a settlement streams out/in.
- Do not add age/physical-profile fields to save data in this plan unless code inspection proves an existing persistence contract requires them; current architecture intentionally does not persist the complete NPC simulation state. fileciteturn0file0L2-L2
- Avoid changing the existing family random sequence. New deterministic streams should be isolated so roles, traits, personalities and names remain stable.

## Tests

Extend the existing focused NPC state/family tests rather than creating broad integration tests.

Minimum useful coverage:

- age generation deterministic and always `0..100`;
- age-stage boundaries and interpolation continuity;
- deterministic profile for identical seed/sex/age;
- distinct deterministic variation channels for HP/stamina/vigor;
- sex modifiers exactly match the plan;
- variation and final-value clamps;
- family parent ages satisfy the chosen constraints;
- child age is developmentally valid and younger than parents;
- reserved and procedural families both receive ages;
- `createNpcAuthoritativeState()` uses profile maxima;
- registry hydration preserves existing maxima/current values;
- existing health/stamina/vigor mechanics still operate with non-100 maxima.

Add a small distribution/property-style test over many deterministic seeds to catch pathological age/profile distributions, but avoid brittle assertions about exact population statistics unless they are part of the design contract.

## Scope guard

Do not introduce physical appearance, body morphs, height/build, heredity, strength/agility, injuries or illnesses here. The vision explicitly treats the physical profile as extensible, but those systems are future layers. fileciteturn23file0L2-L2

Do not refactor `NpcAgent`/family architecture beyond the seams needed to pass age/profile data through the existing construction path.

## Implementation summary (2026-08-24)

**Implemented:**

- `src/settlement/npcPhysicalProfile.ts` — new standalone pure module: age clamping (`clampAge`, `[0,100]`), `lifeStageForAge` (plan §1 table), `ageMultiplierForAge` (piecewise-linear interpolation over anchor points placed at each life-stage bucket's own low/high range value, so the curve is continuous across bucket boundaries except the one deliberate 0.85→0.90 jump at age 17→18 that the plan's own table specifies), sex modifiers (plan §2, exact male/female HP/stamina/vigor multipliers), three independent ±10% variation samples (`hpVariation`/`staminaVariation`/`vigorVariation`, each from its own seed offset), and `generatePhysicalProfile(seed, sex, age)` combining `base × sexModifier × ageModifier × variation`, rounded to a positive integer.
- `src/settlement/families.ts` — added `age: number` to `FamilyMember`. New dedicated `familyAgeSeed()` stream (own magic number, isolated from `familySeed`'s existing role/trait/name RNG) drives `generateAdultAge`/`generateSpouseAge`/`generateChildAge`. Constraints chosen and documented in code: adults roll in `[18, 70]`; spouses stay within 15 years of each other; a child's age leaves at least 18 years to their younger parent (so age is always in `[0, 17]` and never invalid). `reservedHomeFamilies()` now takes the world `seed` and generates Anna/Piotr/Kasia/Marek's ages the same way (familyIndex 0/1) instead of a hardcoded default.
- `src/settlement/npcState.ts` — `createNpcAuthoritativeState()` and `NpcStateRegistry.getOrCreate()` now accept an optional `NpcPhysicalMaxima` (`{maxHp, maxStamina, maxVigor}`), defaulting to the flat 100/100/100 baseline only when omitted. `getOrCreate()` still ignores the passed maxima whenever the `npcId` already has state (plan 197 lifecycle continuity — verified by test).
- `src/settlement/createSettlement.ts` — computes a per-member physical seed (`settlementSeed` + flat member index, own magic number — not a hash of `npcId`), calls `generatePhysicalProfile(seed, member.character.gender, member.age)`, and passes the result into `npcStateRegistry.getOrCreate()`.
- `src/ai/NpcAgent.ts` — the isolated-fallback `npcState` default parameter (no `SettlementsManager`-backed registry) now also derives real maxima from `member.character.gender`/`member.age` via `generatePhysicalProfile(treeIndex, ...)` instead of silently defaulting to 100/100/100.
- No existing stamina/vigor/health mechanics changed — only the constructed `max` values differ.

**Technically verified:** `npx tsc --noEmit`, `pnpm run lint:fix` (clean except 2 pre-existing unrelated errors in `scripts/plans-sync.ts`, confirmed via `git log`/`git stash` to predate this change), `pnpm run test` (1664/1664 passing, including new `npcPhysicalProfile.test.ts` and extended `families.test.ts`/`npcState.test.ts`), `pnpm run build`.

Verified by diffing before/after (`git stash`) that the new isolated age RNG stream produces byte-identical name/role/trait rolls for a fixed seed — pinned as a regression test in `families.test.ts`.

**Not browser/manually verified:** this plan changes deterministic simulation data (max HP/stamina/vigor), not rendering — per the plan's own "Verification" section, browser verification is not the primary target here.
