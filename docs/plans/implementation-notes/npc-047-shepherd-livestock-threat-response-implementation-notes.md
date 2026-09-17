# Implementation Notes: npc-047 — Shepherd livestock threat response

**Plan:** `docs/plans/npc-047-shepherd-livestock-threat-response.md`  
**Reviewed:** 2026-09-17  
**Source:** current `main` + targeted shepherd-flock/NPC threat/loadout/combat recon

## Verified current seams

### Shepherd flock threat sensing already exists

`src/fauna/shepherdFlock.ts` exports:

- `FLOCK_THREAT_RADIUS`,
- `senseOwnedFlockThreat(...)`,
- `ShepherdFlockHooks`.

`src/ai/NpcAgent.ts` already imports these symbols. The implementation should trace the existing use and promote the current flock-threat observation into the immediate interruption path rather than adding another sensing pass.

`senseOwnedFlockThreat()` is already bounded over the caller-provided threat candidate list and filters by household ownership. Keep it pure.

### Threat candidates already carry what combat needs

`src/ai/npcAnimalThreat.ts::ThreateningAnimalCandidate` carries live predator identity/position plus prey ownership (`preyAnimalId`, `preyOwnerHouseId`) and the existing `CombatTargetHandle`.

Do not resolve the predator a second time from `AnimalAgent` collections. A defending shepherd should pass that existing target handle into the normal NPC combat entry path.

### One generic defend/flee scorer already exists

`arbitrateAnimalThreat()` / its score helpers already consider:

- usable melee/ranged capability,
- HP ratio,
- neuroticism/personality inputs.

The safest extension is a narrow context/role-responsibility modifier accepted by the existing scorer if tests show owned-flock responsibility needs a defend bias. Do not fork a shepherd-specific decision function while the existing score model can express the same choice.

Keep hard incapability meaningful: no usable weapon/critical condition must still permit or force flee.

### Emergency locomotion comes from `npc-046`

This plan should consume the semantic `run` mode added by `npc-046`. Do not add role-specific speed constants, run flags, animation selection or stamina drain.

A shepherd that flees uses the same emergency flee execution as any NPC. A shepherd that approaches a predator urgently may request the same locomotion mode while the combat target remains live.

### Personal equipment belongs to `npcLoadout.ts`

`src/ai/npcLoadout.ts::seedInitialPersonalBelongingsIfNeeded()` is the central initial personal-loadout path and already respects `needsInitialPersonalLoadout` so reconstructed/restored states are not blindly reseeded.

Guard equipment (`guard → long_sword`) already demonstrates that profession role weapons belong here.

The intended shepherd weapon kinds are existing real `ItemKind`s / item-catalog weapons: `knife`, `spear`, `pitchfork`, `axe`.

Keep all new shepherd equipment in `personalInventory`; do not put it in transient `NpcAgent.carried` work cargo.

## Recommended implementation order

1. Add deterministic shepherd-loadout selection and focused idempotency tests.
2. Trace the existing `senseOwnedFlockThreat()` call in `NpcAgent` and elevate it to the immediate threat-interruption decision path.
3. Feed the returned live candidate into generic `arbitrateAnimalThreat()`.
4. Add only the minimum generic scorer context needed for shepherd responsibility, if baseline scoring is insufficient.
5. `defend` → existing `beginCombat()` with the already-supplied `CombatTargetHandle`.
6. `flee` → dependency `npc-046` emergency run/flee path.
7. Verify threat clear returns control to ordinary shepherd profession arbitration.

## Loadout determinism

The weighted primary selection must not consume a shared generation RNG stream whose order can change when unrelated settlement content changes.

Use a stable identity-derived roll with a dedicated salt conceptually like:

```text
stable npc/world identity + "shepherd-defensive-loadout-v1"
→ deterministic [0, 1)
→ spear 45% / pitchfork 30% / axe 25%
```

Reuse an existing stable RNG/hash helper if available in the loadout/generation layer. Do not introduce `Math.random()`.

Seeding rules:

- ensure knife,
- ensure exactly one chosen primary,
- preserve existing shears logic,
- repeated initial-seed call is idempotent,
- reconstruction/load must not duplicate or reroll,
- legacy restored state follows the existing `needsInitialPersonalLoadout` policy rather than inventing a one-off migration in `NpcAgent`.

## Interruption boundary

The flock threat is an immediate external danger, not a new Need or persistent Goal.

Use the existing action interruption lifecycle:

- cancel current low-priority shepherd work/action,
- leave persistent Plan semantics intact/marked interrupted where applicable,
- enter defend/flee execution,
- after threat clear let normal `choose()`/profession dispatch decide what to do next.

Do not save a `protectingFlock` state into `NpcAuthoritativeState`.

## Combat handoff

A flock threat candidate already provides `target: CombatTargetHandle`. Reuse it.

Do not add:

- shepherd damage multipliers,
- shepherd max-HP bonuses,
- copied animal HP/position state inside NPC state,
- direct predator callbacks into shepherds.

The real weapon catalog plus existing NPC Strength/combat pipeline remains the source of combat capability.

## Files to inspect first during implementation

- `src/fauna/shepherdFlock.ts`
  - `senseOwnedFlockThreat()`
  - `FLOCK_THREAT_RADIUS`
  - current hook/context types
- `src/ai/NpcAgent.ts`
  - existing shepherd flock-threat call site
  - immediate animal-threat branch
  - interruption lifecycle
  - `beginCombat()` / flee execution
- `src/ai/npcAnimalThreat.ts`
  - `ThreateningAnimalCandidate`
  - `arbitrateAnimalThreat()` and score helpers
- `src/ai/npcLoadout.ts`
  - role defaults
  - `seedInitialPersonalBelongingsIfNeeded()`
- `src/fauna/shepherdFlock.test.ts`
- `src/ai/npcAnimalThreat.test.ts`
- existing NPC loadout tests

## Performance guardrails

- reuse caller-bounded `nearbyAnimalThreats`,
- no shepherd → all fauna scan,
- no predator callbacks into arbitrary NPCs,
- no persisted protection/alarm registry,
- no new worker.

## Tests worth keeping pure

Prefer pure tests for:

- deterministic shepherd primary-weapon roll,
- generic threat-scoring shepherd responsibility bias if one is added,
- existing `senseOwnedFlockThreat()` ownership filtering.

Use `NpcAgent` integration tests to prove:

- flock danger interrupts ordinary work,
- defend starts existing combat with the supplied target handle,
- flee uses emergency locomotion,
- threat clear returns to normal work arbitration.

## Documentation follow-up

After implementation update:

- `docs/state/npc.md` — shepherd immediate flock-threat response and personal loadout,
- `docs/state/fauna.md` only if the shepherd-flock read-only contract itself changes materially.

## Manual verification boundary

AI implementation should run automated/type checks only. Browser gameplay verification is the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**