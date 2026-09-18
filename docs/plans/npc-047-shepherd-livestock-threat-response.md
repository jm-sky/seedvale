# Plan: Shepherd livestock threat response

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~npc-046~~, ~~fauna-037~~
**Domain:** `npc`
**Subdomains:** `behavior` `decision-making` `combat` `work`
**Tags:** `shepherd` `livestock` `predators` `combat` `loadout`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Make a shepherd responsible for owned livestock react immediately when a predator commits to that flock: interrupt ordinary work, decide through the existing defend/flee arbitration, defend when capable, and run away when not.

This plan does not introduce settlement-wide cooperation. It ends at the shepherd's own response. Local assistance/alarm propagation and guards belong to `npc-048`.

Target flow:

```text
existing predator candidate targets livestock owned by shepherd household
→ existing senseOwnedFlockThreat()
→ interrupt ordinary shepherd work
→ existing arbitrateAnimalThreat()
→ capable/healthy → run toward threat as needed + existing beginCombat()
→ vulnerable/unarmed → run away through existing flee path
→ threat clears → ordinary shepherd work re-arbitrates/resumes
```

## Current foundation verified on `main`

### Owned-flock threat sensing already exists

`src/fauna/shepherdFlock.ts` already exports `senseOwnedFlockThreat()` and `FLOCK_THREAT_RADIUS` over caller-provided `ThreateningAnimalCandidate[]`.

`NpcAgent.ts` already imports `senseOwnedFlockThreat`, `FLOCK_THREAT_RADIUS` and `ShepherdFlockHooks`, so the semantic seam is already connected to the NPC coordination layer.

Do not add predator→shepherd callbacks or a second predator target registry.

### Threat candidates already carry livestock ownership and combat target

`src/ai/npcAnimalThreat.ts::ThreateningAnimalCandidate` already includes prey identity/ownership context (`preyAnimalId`, `preyOwnerHouseId`) and a `CombatTargetHandle` for the threatening animal.

A shepherd defending livestock should reuse that handle through the existing combat entry path; do not rediscover the predator from fauna state.

### Defend/flee arbitration is already centralized

`arbitrateAnimalThreat()` already scores usable combat capability, HP ratio and personality/neuroticism. Shepherd protection should feed/bias the same mechanism rather than create a shepherd combat FSM.

### Emergency NPC run is owned by dependency `npc-046`

This plan consumes the semantic run locomotion introduced by `npc-046`; it must not duplicate run speed, stamina drain or animation rules.

### Personal belongings/loadout already has one owner

`src/ai/npcLoadout.ts::seedInitialPersonalBelongingsIfNeeded()` seeds role equipment into the authoritative NPC personal inventory. Guard already uses the same central role-loadout path (`long_sword`).

Shepherd defensive equipment belongs there, not in shepherd work/combat code and not in transient `NpcAgent.carried`.

Existing item catalog already contains the intended real weapon kinds (`knife`, `spear`, `pitchfork`, `axe`).

## Scope

### 1. Elevate owned-flock threat to immediate interruption

When a shepherd's `senseOwnedFlockThreat()` returns a live threat:

- interrupt shearing, deposit, herding, idle-at-workplace and other low-priority profession execution,
- preserve persistent Plan/action interruption semantics,
- do not create persistent shepherd combat state,
- collapse/death/critical physiological safety still outranks this response.

After danger clears, normal profession arbitration should select the next appropriate shepherd action.

### 2. Reuse existing defend/flee arbitration

Convert the owned-flock threat into the existing threat-decision input rather than adding `decideShepherdThreat()`.

Required behaviour:

- healthy shepherd with usable real weapon can choose defend,
- badly hurt or genuinely unable shepherd can choose flee,
- role responsibility may provide the narrowest justified defend bias/input if the generic scorer otherwise treats a flock threat too weakly,
- hard inability to fight must still override role bravery.

Any shepherd-specific bias must be expressed in the generic arbitration contract, not by bypassing its result.

### 3. Defend through existing combat

A defending shepherd:

- uses the candidate's existing `CombatTargetHandle`,
- uses `NpcAgent.beginCombat()` / existing NPC combat lifecycle,
- uses `npc-046` run only for emergency approach/positioning when movement to the live threat is required,
- receives no shepherd-specific damage multiplier or HP formula.

### 4. Flee through existing emergency locomotion

A shepherd that chooses flee uses the same personal-threat flee/run execution provided by `npc-046`.

Do not add another flee destination system in this plan.

### 5. Shepherd defensive personal loadout

Every newly generated shepherd receives:

```text
knife: 100%
```

plus exactly one deterministic primary defensive weapon:

```text
spear:     45%
pitchfork: 30%
axe:       25%
```

Requirements:

- deterministic from stable NPC/world identity with an isolated RNG salt,
- reconstructing the same NPC must not reroll,
- seeding is idempotent and must not duplicate equipment,
- selected weapon is a real item in authoritative `personalInventory`,
- knife is independent of the primary weapon,
- existing shears remain profession equipment/tooling and do not count as the primary defensive weapon,
- do not grant shepherd `long_sword`; it remains guard-specific,
- combat capability comes from the real item catalog + existing Strength/combat resolution.

Respect current save compatibility: `seedInitialPersonalBelongingsIfNeeded()` already distinguishes first generation from restored NPC state. Do not silently seed new equipment into old restored saves unless the existing loadout migration policy explicitly supports it.

## Expected files

Likely implementation surface, subject to current-code verification:

- `src/ai/NpcAgent.ts` — elevate existing flock-threat sensing into immediate interruption/response and reuse combat/flee execution.
- `src/fauna/shepherdFlock.ts` — expected to remain mostly pure; extend only if the existing returned candidate lacks a narrow field required by the generic threat scorer.
- `src/ai/npcAnimalThreat.ts` — narrow role/context bias input only if needed; keep one scorer.
- `src/ai/npcLoadout.ts` — knife + deterministic weighted primary defensive weapon.
- relevant NPC/loadout/shepherd-flock tests.

Add JSDoc with `@domain npc` / `@domain fauna` to important new public helpers.

## Non-goals

- Livestock flee target selection (`fauna-037`).
- NPC run implementation (`npc-046`).
- Local assistance/alarm signal (`npc-048`).
- Guard response (`npc-048`).
- Guard physical candidate ranking/SPEA/HP tuning.
- Settlement-wide combat manager.
- Shepherd combat FSM.
- New weapon/damage system.
- Persistent shepherd combat/alarm state.

## Verification

Automated tests should cover at minimum:

- shepherd detects predator committed to livestock owned by its household,
- unrelated household livestock does not trigger that shepherd,
- live flock threat interrupts ordinary shepherd work through existing cancellation semantics,
- healthy armed shepherd can choose defend through generic arbitration,
- vulnerable/unusable-weapon shepherd can still choose flee,
- defending shepherd reuses the candidate `CombatTargetHandle` and existing combat path,
- flee/approach uses `npc-046` emergency locomotion rather than a second run implementation,
- shepherd always gets `knife` on initial generated loadout,
- shepherd gets exactly one deterministic primary weapon with 45/30/25 selection policy,
- reconstruction does not reroll or duplicate knife/primary/shears,
- restored NPC state is not unexpectedly reseeded contrary to existing loadout policy,
- threat clear allows ordinary shepherd work to re-arbitrate,
- `pnpm type-check`,
- targeted Vitest suites for shepherd flock sensing, threat arbitration and loadout.

Manual browser verification belongs to the User:

- place shepherd + owned livestock near predators,
- predator commits to owned livestock → shepherd stops routine work immediately,
- healthy armed shepherd may run in and defend,
- badly injured/unable shepherd runs away instead of suicide-attacking,
- after threat ends surviving shepherd resumes ordinary behaviour,
- inspect/debug inventory confirms real deterministic shepherd weapons.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
