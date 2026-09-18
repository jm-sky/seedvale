# Plan: Local threat assistance and guard response

**Created:** 2026-09-17
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** npc-046, npc-047
**Domain:** `npc`
**Subdomains:** `behavior` `decision-making` `combat`
**Tags:** `guards` `threats` `alarm` `cooperation` `predators`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Let nearby settlement NPCs, especially guards, learn about and respond to a live local predator threat without requiring each NPC to discover the entire fauna world independently.

Add the smallest reusable transient local assistance signal on top of the existing bounded animal-threat forwarding path. Guards gain wider local awareness and a strong defend bias while still using the same generic threat arbitration, combat and emergency locomotion as other NPCs.

Target flow:

```text
live local predator danger / shepherd assistance situation
→ bounded transient local threat-assistance candidate
→ nearby NPC perceives candidate within role-appropriate radius
→ same arbitrateAnimalThreat()
→ guard healthy + armed: strong defend bias
→ run through npc-046 to live threat → existing beginCombat()
→ civilian: ordinary defend/flee arbitration
→ threat disappears → signal disappears automatically
```

## Current foundation verified on `main`

### Threat candidates are already caller-bounded

`src/ai/npcAnimalThreat.ts::ThreateningAnimalCandidate[]` is already passed into NPC updates rather than discovered by each NPC.

Current forwarding path is already represented through:

```text
runtime/fauna candidate construction
→ SettlementsManager.update(... nearbyAnimalThreats)
→ Settlement.update(... nearbyAnimalThreats)
→ NpcAgent.update(... nearbyAnimalThreats)
```

`NpcAgent.update()` defaults the list to empty for compatibility.

This is the seam to extend. Do not add a global event bus or second threat registry.

### Generic threat scoring already exists

`arbitrateAnimalThreat()` already decides defend/flee from real usable capability, HP and personality. A local assistance signal must be **information**, not an order to fight.

Consumers still run the same scorer.

### Guard equipment already exists

`src/ai/npcLoadout.ts` already maps guard to a real `long_sword` personal loadout. Keep that authoritative. Do not add a transient guard weapon or role-specific damage table.

### Emergency run is dependency-owned

`npc-046` owns NPC run speed/stamina/animation. Guards responding to live danger request that same run locomotion; this plan must not implement a second guard sprint.

### Shepherd personal response is dependency-owned

`npc-047` owns shepherd recognition/response to threatened owned livestock. This plan adds the local cooperation layer so that a shepherd danger situation can be visible to nearby assistance-capable NPCs without making the shepherd directly command them.

## Scope

### 1. Transient local threat-assistance candidate

Add the narrowest read-only candidate needed to expose live settlement-local danger, conceptually containing:

```ts
{
  sourceNpcId?: string
  threatAnimalId: string
  x: number
  z: number
  target: CombatTargetHandle
  kind: 'predator'
}
```

Exact naming/optional fields should follow the current composition code.

Requirements:

- transient and derived from live danger,
- bounded to relevant/materialized local settlement/fauna context,
- not persisted,
- not stored in `NpcAuthoritativeState`,
- contains/reuses the existing live `CombatTargetHandle`,
- disappears when the underlying threat is no longer live.

Prefer deriving the list each update from current threat facts over maintaining timeout/state cleanup.

### 2. Reuse existing forwarding/composition path

Extend the current settlement/NPC update composition seam rather than introducing callbacks:

```text
caller builds bounded local candidates once
→ SettlementsManager / Settlement forwards them
→ each NPC performs cheap local radius filtering/arbitration
```

Avoid:

```text
each NPC → scan every AnimalAgent
```

and avoid:

```text
AnimalAgent → callback every nearby NPC
```

### 3. Role-appropriate local perception

Ordinary NPCs may react only within a conservative local danger/assistance radius.

Guards receive a larger but still bounded local awareness radius because settlement protection is their role.

Do not make guards omniscient across the settlement/world. Candidate construction and per-NPC consumption must remain spatially bounded.

### 4. Same arbitration for civilians and guards

Every consumer still uses `arbitrateAnimalThreat()`.

- civilians defend or flee according to existing capability/HP/personality,
- alarm presence must not force civilians to attack,
- guards get a strong role defend bias while healthy and armed,
- critically hurt/incapable guards retain a valid flee path.

Express guard responsibility as the narrowest generic scoring/context input possible. Do not create `guardThreatDecision()` or a guard FSM.

### 5. Guard emergency response execution

A guard choosing defend:

- uses the candidate's existing `CombatTargetHandle`,
- interrupts ordinary patrol/work through existing action interruption semantics,
- uses `npc-046` run while responding to the live danger,
- enters normal `beginCombat()` / NPC combat lifecycle,
- returns to ordinary patrol/work after danger clears.

### 6. Assistance source semantics

A shepherd in `npc-047` that has a real owned-flock threat is one valid source/context for local assistance.

However, design the signal around **live danger**, not a shepherd-specific command, so the same bounded mechanism can represent a predator attacking another nearby NPC/livestock when that information already exists in the current threat candidate bridge.

Do not broaden V1 into bandit/warfare alerts or a generic world event bus.

## Expected files

Likely implementation surface, subject to current-code verification:

- `src/ai/npcAnimalThreat.ts` — assistance-candidate/perception types and generic guard-context scoring input if this is the narrowest owner.
- `src/ai/NpcAgent.ts` — consume local candidate, interrupt patrol/work, request run, call existing combat/flee paths.
- `src/settlement/SettlementsManager.ts` — forward bounded local assistance candidates alongside existing nearby animal threats.
- `src/settlement/createSettlement.ts` / settlement update contract — propagate the same bounded input to NPCs.
- the existing runtime/fauna→settlement composition call site that currently builds/forwards `ThreateningAnimalCandidate[]` — derive assistance candidates once here if possible.
- targeted threat/settlement integration tests.

Add JSDoc with `@domain npc` to important architectural/public helpers.

## Non-goals

- NPC emergency locomotion implementation (`npc-046`).
- Livestock safe flee (`fauna-037`).
- Shepherd own-flock decision/loadout (`npc-047`).
- Settlement-wide/global alert state.
- Persisted alarms/history.
- Guard barracks/shifts/watch towers.
- Guard squads/formations/tactics.
- Bandit/warfare settlement defense.
- New combat/damage/weapon system.
- Guard SPEA candidate ranking.
- Guard-specific HP multiplier.
- Player/camera-dependent response.
- Web Worker for local threat arbitration.

## Verification

Automated tests should cover at minimum:

- local assistance candidates are derived only from live threat data,
- candidates disappear when underlying threat/target is gone,
- candidate forwarding remains bounded through the existing settlement update path,
- ordinary NPC outside local radius does not react,
- ordinary NPC inside radius still uses generic defend/flee arbitration rather than always fighting,
- guard perceives relevant local danger at the configured wider bounded radius,
- healthy armed guard receives strong defend bias and can choose defend,
- critically hurt/incapable guard can still choose flee,
- guard response interrupts patrol/work through existing lifecycle,
- guard response uses `npc-046` run and existing `beginCombat()` with supplied target handle,
- guard retains real `long_sword` personal loadout; no second weapon path is introduced,
- no player/camera presence is required by decision tests,
- no per-NPC full-fauna scan is introduced,
- `pnpm type-check`,
- targeted Vitest suites for threat arbitration and settlement forwarding.

Manual browser verification belongs to the User:

- create a predator attack near settlement livestock/shepherd,
- nearby guard notices without being personally attacked first,
- guard visibly runs to the live predator and engages,
- civilians do not all suicide-rush the predator,
- badly hurt guard can retreat,
- after danger ends guards/civilians return to ordinary patrol/work without stuck alarm/combat state,
- repeat while player/camera is not centered on the incident to confirm simulation independence.

> **Zrób git commit i push do main, rebase jeżeli trzeba**