# State Documentation Audit — Combat (Player / NPC / Fauna)

**Date:** 2026-09-06
**Baseline:** `5071a9948631f272a1a8c7340fc8f3efa683c0fc`
**Agent:** Claude Code — Sonnet 5
**Scope:** `src/combat/*` (14 files, full read of `combatIntent.ts`/`criticalHit.ts`/`defenseResolver.ts`, targeted read of `meleeAttack.ts`/`rangedLifecycle.ts`/`projectile.ts`/`rangedAttack.ts` headers already covered by `docs/state/combat.md`), `src/ai/npcCombat.ts` (full), `src/fauna/faunaCombat.ts` (full), targeted reads of `src/ai/NpcAgent.ts` (`takeDamage`/`applyIncomingCombatDamage`/`beginCombat`/combat `Phase` dispatch, lines ~1600-1780/2390-2410/2715-2775), `src/ai/healingPressure.ts` (full, npc-002 seam), `src/app/gameLoop.ts` (targeted: melee hit resolution ~L920-990, `target.kind === 'npc'` interaction ~L1515-1540, fauna→player/fauna→NPC damage callbacks ~L1900-1975). Compared against `docs/state/combat.md` (full), `docs/items/WEAPONS.md` (full), `docs/STATE.md`'s "Settlements / NPCs" §, "Important shared concepts" §, and "Not implemented" § (grep + targeted read). Read in full: `docs/reviews/2026-09-06-state-documentation-audit.md`, `docs/reviews/state-audit/01-inventory.md`, `04-npc.md`, `05-fauna.md`, `06-player-items.md` — reused their recon of `NpcAgent.ts`'s decision pipeline, `physicalInjury`/`healingPressure` ownership, `AnimalAgent`/`faunaCombat.ts` state, and weapon/inventory ownership rather than repeating it. This is a light currency + integration check per the audit brief, not a full domain recon — `src/items/*`, `src/player/*` internals, and NPC/fauna decision internals beyond their combat entry points are out of scope (owned by `04`/`05`/`06`).

This is a recon pass per the audit brief. No current-state documentation or gameplay code was changed.

---

## Confirmed current state

`docs/state/combat.md` is **accurate and current** against this baseline. Every specific claim checked — the shared melee/ranged state machines, the `CombatTargetHandle`/`CombatIntent` seam, NPC weapon/defense resolution reading straight from `carried` with no separate equipment system, the critical-hit/defense-resolver formulas, the "player-vs-NPC melee damage is not wired" gap, and the plan-177/178/179/186/npc-009 feature list — matches the code exactly, including function names and file paths. This is the best-aligned domain document found across the whole audit (Stage 1 already flagged it as such; this pass confirms it directly rather than by inference).

### Combat ownership

- **Shared mechanism (`src/combat/*`, `@domain shared`-equivalent though not all files carry the tag):** the melee (`meleeAttack.ts`) and ranged (`rangedLifecycle.ts`) state machines, `combatIntent.ts`'s `CombatTargetHandle`/`CombatIntent` data-only seam, `criticalHit.ts`'s deterministic critical roll (shared baseline for melee, per-weapon `RangedConfig` for bows), `defenseResolver.ts`'s block/partial-reduction resolver (`@domain shared @system defense-resolver` — one of the few combat files with an explicit tag), `projectile.ts`/`rangedAttack.ts` (aim-deviation cone + swept-segment hit test). None of these files know about the player, NPC or fauna concretely — they take `CombatTargetHandle`/`MeleeConfig`/`RangedConfig`/ids as parameters.
- **Player-owned:** `player/playerMelee.ts`/`player/playerRanged.ts`/`player/playerCombat.ts` (input, camera-facing, stamina gating, soft-lock/aim-yaw commitment) and `app/gameLoop.ts`'s hit resolution loop (`resolveMeleeHits`, the fired-projectile tick). The player never goes through `NpcAgent`'s `combat` `Phase`.
- **NPC-owned:** `ai/npcCombat.ts` (resolves the NPC's own carried weapon/defense/ammo, applies the shared critical/defense resolvers — owns no state itself), `NpcAgent`'s `combat` `Phase` (`beginCombat()`/`cancelCombat()`/`endCombat()`, driven from the agent's own `update()` cadence, confirmed no second `NpcCombatManager`), `NpcAgent.takeDamage()`/`applyIncomingCombatDamage()` (the single NPC damage entry point for animal→NPC, NPC→NPC and player→NPC — confirmed unreachable from any other path), `ai/npcAnimalThreat.ts` (defend/flee decision feeding `beginCombat`), `ai/npcLoadout.ts` (role-based starting weapon).
- **Fauna-owned:** `fauna/faunaCombat.ts` (per-species `MAX_HP`/`DAMAGE_TABLE`/`HUMAN_DAMAGE` lookup tables, `combatTargetForAnimal()` building the `CombatTargetHandle` an NPC attack resolves against, `isMeleeTool()` type guard for the player's `[E]` animal-attack path), `AnimalAgent.takeDamage()`/`collapse()` (fauna's own HP/death/corpse-decay entry point, confirmed in `05-fauna.md`), `fauna/predatorHumanDecision.ts` (predator vs. human attack/flee/ignore intent feeding `faunaDecision.ts`).
- **Authoritative health/damage/death state:** `HealthState` (`src/shared/HealthState.ts`) is the single shared primitive for player, NPC and fauna HP/death — confirmed no domain has its own parallel HP field. Death consequences are entity-owned and diverge immediately after the shared `HealthState.dead` flag flips: `NpcAgent.die()` (no disposal — corpse stays in `settlement.npcs` permanently, per `04-npc.md`), `AnimalAgent.collapse()` (starts the `fresh→rotting→bones→removed` corpse-decay timeline, per `05-fauna.md`), the player's own downed/respawn flow (out of this audit's scope, owned by `player/`).

### Runtime flows

**Player attack → validation/weapon → hit/damage → target health → death/consequence:**

```text
[E] over gazed animal, isMeleeTool(held), !player.isDowned()
→ playerMelee.requestAttack(config, stamina, vigor, ...) (stamina-gated)
→ windUp → hitWindow (gameLoop.ts's meleeTick.hitReady)
→ resolveMeleeHits(pos, yaw, config, meleeCandidates) — geometric range+arc test,
  ANIMAL candidates only (meleeAnimalById, built from active AnimalAgents)
→ resolveCriticalHit(damage * sharpnessModifier, MELEE_CRITICAL_CHANCE, ...)
→ animal.takeDamage(critResult.damage, 'player')       [fauna-owned HealthState mutation]
→ animal.isDead() → corpse-decay timeline (fauna-owned, per 05-fauna.md)
```

Ranged mirrors this exactly (`playerRanged` draw→release→`Projectile` spawn→`sweptProjectileHit`→same critical roll→`animal.takeDamage(..., 'player')`), confirmed at the fired-projectile resolution site. **Player melee/ranged damage against an `NpcAgent` target is confirmed not wired today** — `target.kind === 'npc'` in `gameLoop.ts` only opens the dialogue menu (`vueUi.openNpcDialogueMenu`); `resolveMeleeHits`/the projectile hit-test only ever iterate animal candidates. `docs/state/combat.md`'s own "Not implemented" line states this precisely; confirmed accurate against this baseline, not stale.

**NPC decision/action → combat → damage → target state → post-combat consequence:**

```text
external decision system (ai/npcAnimalThreat.ts::decideAnimalThreatResponse, OR
  NpcAgent.beginHuntExpedition()/attemptHuntKill() for Hunter role)
→ NpcAgent.beginCombat({ target: CombatTargetHandle, mode: 'melee'|'ranged', onKill? })
→ phase = 'combat'; ai/npcCombat.ts resolves carried weapon/ammo (resolveNpcMeleeWeapon /
  resolveNpcRangedWeapon / resolveNpcAmmoKind) — no fallback if nothing carried
→ applyNpcMeleeHit()/applyNpcRangedHit() → resolveCriticalHit() → target.applyDamage(amount)
→ target is an AnimalAgent (combatTargetForAnimal): animal.takeDamage(amount, 'npc')
  target is another NpcAgent: applyIncomingCombatDamage() → resolveIncomingNpcDamage()
  (defense roll against carried defense item) → takeDamage(finalDamage)
→ endCombat('complete') on target death → intent.onKill?() (e.g. Hunter's post-kill
  harvestAnimalIntoInventory(), confirmed shared with the player's own knife-harvest,
  per 05-fauna.md/06-player-items.md)
```

`NpcAgent` never picks its own target/weapon-mode/reason to fight — `CombatIntent` is always supplied externally (confirmed: `npcAnimalThreat.ts` and `beginHuntExpedition()` are the only two live callers today, matching `combat.md`'s own claim that bandit AI has no decision framework yet).

**Fauna behaviour → attack/flee/combat → damage → death/corpse:**

```text
decideFaunaBehaviour() (fixed-priority table, gated ahead by dead/mounted/rabid,
  per 05-fauna.md) → predator-normal / npc-attack / player-attack branch
→ AnimalAgent's own attack resolution → damageFor(predator, prey) or damageVsHuman(predator)
  [faunaCombat.ts's flat lookup tables — NOT the shared MeleeConfig/criticalHit.ts pipeline]
→ target.takeDamage(...): AnimalAgent (prey), or via gameLoop.ts's fauna-update callback:
  player (applyPlayerDamage) or NpcAgent (applyIncomingCombatDamage)
→ death → corpse decay (fauna target) / downed (player) / physicalInjury+die() (NPC target)
```

**Confirmed asymmetry worth stating explicitly (not in `combat.md` today):** fauna's *outgoing* attacks (predator biting prey/human/NPC) use `faunaCombat.ts`'s flat `DAMAGE_TABLE`/`HUMAN_DAMAGE` lookup — a different, older mechanism from the shared `MeleeConfig`/`criticalHit.ts`/`defenseResolver.ts` pipeline the player and NPCs use for their own attacks. Fauna's *incoming* damage (an attack landing on an `AnimalAgent`) always goes through the shared critical-hit resolver via whichever attacker fired it (player's `resolveCriticalHit` call in `gameLoop.ts`, or `ai/npcCombat.ts`'s `applyNpcMeleeHit`/`applyNpcRangedHit`) before reaching `animal.takeDamage()`. So: **animal→anything** damage is flat-table, no critical/defense resolution; **anything→animal** and **anything→NPC** damage goes through critical-hit (and, for NPC targets, defense) resolution. `combat.md`'s "Shared architecture" section states the unified damage-entry-point claim correctly for the *receiving* side (`HealthState` shared by all three, `NpcAgent.applyIncomingCombatDamage()` the single NPC-incoming path) but doesn't call out that fauna's own outgoing attack math is a structurally separate, older system from the melee/ranged/critical pipeline — worth one clarifying sentence (see Recommended documentation changes).

### Healing/injury seam (npc-002) — combat → NPC health boundary

Confirmed exactly where `04-npc.md` left it, re-verified at the actual call sites:

```text
NpcAgent.applyIncomingCombatDamage() → takeDamage(amount)
  → damageHealth(this.health, amount)   [HealthState mutation — combat's own responsibility ends here]
  → actualHpLoss = hpBefore - health.currentHp
  → this.npcState.physicalInjury = increaseInjuryFromDamage(physicalInjury, actualHpLoss)
       [NpcAgent.ts:1631-1632 — combat's one write into NPC-health-owned state]
  → (later, choose()) healingPressure(physicalInjury, maxHp, hasHealthConsumable)
       competes as the 'heal' NpcDecisionTarget alongside Needs/weather pressures
  → beginHeal() → heal action's onComplete → decreaseInjuryFromHeal(physicalInjury, actualHpRestored)
```

**Combat's responsibility ends exactly at `takeDamage()`'s `HealthState` mutation and the one-line `physicalInjury` bookkeeping call.** Everything downstream — pressure generation, arbitration, strategy/action to actually heal — is entirely NPC-health/needs-owned (`ai/healingPressure.ts`, `ai/Needs.ts`'s arbitration, `NpcAgent.beginHeal()`), not combat code. `physicalInjury` is deliberately never derived from `maxHp - currentHp` (so it can't conflate with a future non-physical damage source) — the comment at `NpcAgent.ts:1624-1630` states this is safe *today* only because `applyIncomingCombatDamage` is currently the sole caller of `takeDamage()`; a future non-physical NPC damage source would have to bypass `takeDamage()` entirely rather than reuse it. This is a real invariant a future feature must respect, not just documentation color. `docs/state/combat.md` does not mention `physicalInjury`/`healingPressure` at all today — this is a defensible scope boundary (health/healing is `04-npc.md`'s/a future `npc.md`'s domain, matching combat.md's own "Not: NPC life/economy outside of combat" scope note) rather than a gap, but the exact handoff point (`takeDamage()`'s single `physicalInjury` write) is not named anywhere as *the* seam — see Recommended documentation changes.

---

## Documentation discrepancies

| # | Claim (location) | Classification | Finding |
|---|---|---|---|
| 1 | `docs/state/combat.md` overall | **Accurate** | Every specific mechanism/function/file-path claim checked against the current baseline matched exactly — the best-aligned domain doc in the whole audit series. No stale claims found. |
| 2 | `docs/items/WEAPONS.md` overall | **Accurate** | Numbers table and its "sources of truth" pointers to `itemCatalog.ts`/`items.ts`/`tradeCatalog.ts` checked structurally (not re-diffed number-by-number, out of this pass's scope) — consistent with `combat.md`'s own references to the same file for weapon numbers. |
| 3 | `docs/state/combat.md`'s "Shared architecture" section states damage entry points are unified via `HealthState`/`applyIncomingCombatDamage()` | **Accurate but incomplete** | True for the *receiving* side of every attacker→target pair. Does not mention that fauna's own *outgoing* attack damage (`faunaCombat.ts`'s flat `DAMAGE_TABLE`/`HUMAN_DAMAGE`) is a structurally separate, older mechanism from the melee/ranged/critical-hit pipeline player and NPC attacks use — a reader could reasonably assume "one damage pipeline" applies symmetrically to all six attacker/target pairs. Not misleading on any single claim, just short one clarifying sentence of the asymmetry (see recommendation). |
| 4 | `docs/state/combat.md` does not mention the `physicalInjury`/`healingPressure` handoff at all | **Acceptable scope boundary, not a gap** | Consistent with the doc's own stated scope ("Not: NPC life/economy outside of combat... that's SETTLEMENTS.md" — soon to be `npc.md` per `04-npc.md`'s recommendation). No fix needed in `combat.md` itself, but the *exact* seam (one line in `NpcAgent.takeDamage()`) should be named on the NPC-health-doc side once `npc.md` exists, so a reader of either doc can find the boundary — see Recommended documentation changes item 2. |
| 5 | `docs/STATE.md` — no dedicated "Combat" top-level section | **Correct as-is, confirmed not a gap** | `STATE.md`'s "Not implemented" section already points to `state/combat.md` precisely ("Full combat system for the player — see state/combat.md for exactly what exists vs. what's missing"), and combat content that does appear in `STATE.md` (NPC combat phase, role weapons, animal-attack/defense) is folded into the "Settlements / NPCs" prose alongside other npc-XXX-plan history — the same implementation-history-leakage pattern `01`/`04`/`05`/`06` already flagged for that section generally. This audit adds no new finding here beyond confirming combat-related sentences inside that section are factually accurate (not stale), just mixed into prose that should eventually be trimmed per the prior audits' recommendation. |

No outdated, misleading, or missing findings beyond the above were found. `docs/state/combat.md`'s own "Entry points" file list (14 combat files + 6 domain-glue files) was cross-checked against the actual `src/combat/` directory listing and is complete and correct at this baseline.

---

## Integration seams discovered

Only seams materially adding to or refining what `04-npc.md`/`05-fauna.md`/`06-player-items.md` already recorded.

| Producer / owner | Consumer | Mechanism | Documentation |
|---|---|---|---|
| `combat/combatIntent.ts` (`CombatTargetHandle`, `CombatIntent`) | `ai/npcAnimalThreat.ts`, `NpcAgent.beginHuntExpedition()`, `fauna/faunaCombat.ts::combatTargetForAnimal()` | Small data-only seam; combat never holds a reference to the concrete entity, only the handle | `combat.md` — accurate |
| `NpcAgent.takeDamage()` (one-line `physicalInjury` write) | `ai/healingPressure.ts` (pressure), `NpcAgent.beginHeal()` (resolution) | The exact combat→NPC-health handoff point; combat's responsibility ends at this line | Undocumented as a named seam on either side today (combat.md by design; a future npc.md should name it — see recommendation) |
| `fauna/faunaCombat.ts` (`DAMAGE_TABLE`/`HUMAN_DAMAGE`, flat lookup) | `AnimalAgent`'s own outgoing-attack resolution | Older, separate damage mechanism from `combat/criticalHit.ts`/`defenseResolver.ts` — asymmetric with the shared pipeline used for incoming damage | Not called out as an asymmetry in `combat.md`; each side (fauna's own table, the shared pipeline) is separately documented but never contrasted |
| `items/weaponMaintenance.ts` (sharpness) | `gameLoop.ts`'s player melee resolution, applied before `resolveCriticalHit` | Sharpness modifies damage pre-critical-roll; wear applied once per resolved hit, never on miss | `combat.md` states this correctly ("sharpness reduces melee damage before the critical roll, wear applies once per resolved hit") — confirmed at the exact call site |
| `app/actions/restActions.ts::interruptRestForDamage()` | Any combat or starvation/dehydration damage source | Shared interrupt path — combat damage is one of two triggers, not a combat-only mechanism | `combat.md` documents this correctly under "Combat interruption (plan 186)" |
| `persistence` | Combat state | **Combat itself has no persisted state** — confirmed no `SaveData` field for in-flight `CombatIntent`/attack phase/projectile; only downstream consequences (`HealthState`, `physicalInjury`, corpse/death state) persist, each owned by its own domain | Correctly implied by omission in `combat.md`; worth a one-line explicit note for a future `08-persistence.md` cross-check (see Open questions) |

---

## Shared mechanisms / invariants

- **One melee state machine, one ranged state machine, reused by every attacker.** Confirmed no second parallel implementation exists for NPCs — `ai/npcCombat.ts` is pure glue (weapon/defense/ammo resolution + calling the same `resolveCriticalHit`), never a re-implementation of the windUp/hitWindow/recovery or draw/release/recovery timers.
- **Deterministic hashed rolls, not `Math.random()`, for every combat-outcome-affecting decision.** `criticalHit.ts::criticalRoll()` and `defenseResolver.ts::defenseBlockRoll()` share the identical hash shape (same constants, same `(id, key, attempt)` input triple) — confirmed a deliberate shared pattern, not independently invented twice. This is the same discipline `05-fauna.md` found in `huntingHooks.ts`'s population-protection roll and `rats.ts`'s eat roll, extended here to the combat layer itself.
- **`CombatTargetHandle` is the sole seam an attack resolves against** — never a direct reference to the concrete `AnimalAgent`/`NpcAgent`. This is what lets `ai/npcCombat.ts` stay entity-agnostic and lets `combatIntent.ts` remain in `src/combat/` with zero fauna/NPC imports.
- **Defense is symmetric in mechanism, asymmetric in who has it.** `resolveDefense()`/`isAttackFromDefensibleDirection()` are the same functions for player-incoming and NPC-incoming damage (`ai/npcCombat.ts::resolveIncomingNpcDamage()` wraps the identical resolver player damage handling uses, per `combat.md`'s own claim) — fauna targets have no defense step at all (`animal.takeDamage()` applies damage directly, no `resolveDefense` call in the fauna-as-target path), which is consistent with fauna having no `DefenseConfig`/carried items to block with.
- **`physicalInjury` is a one-way combat→health handoff, never read back by combat.** Confirmed no combat code reads `npcState.physicalInjury` — it flows strictly outward from `takeDamage()` into NPC-health/healing territory, never influences how combat itself resolves (e.g. no "wounded NPCs fight worse" mechanic exists today).

---

## Recommended documentation changes

1. **No changes required to `docs/state/combat.md`'s accuracy** — it is current and should not be mechanically edited just because this audit ran. Two small optional additions would raise its completeness (not correctness):
   - One sentence under "Shared architecture" noting that fauna's own *outgoing* attack damage (`faunaCombat.ts`'s flat tables) is a separate, older mechanism from the melee/ranged/critical pipeline described in the rest of the document — so a reader doesn't assume the "unified damage entry point" claim implies a unified *outgoing* mechanism too.
   - One sentence (or a pointer) naming the exact combat→NPC-health handoff line (`NpcAgent.takeDamage()`'s `physicalInjury` write) — even just "`physicalInjury` bookkeeping happens here; see `npc.md`/`04-npc.md` for what consumes it" — so the boundary this audit had to reconstruct from source is written down somewhere findable.
2. **Once `docs/state/npc.md` is created** (per `04-npc.md`'s recommendation #1), it should name the same handoff from the other side: "combat damage becomes `physicalInjury` via one line in `NpcAgent.takeDamage()`; healing pressure/strategy/action are entirely NPC-owned from there" — giving both documents a matching, findable seam description instead of leaving it implicit in code comments only.
3. **No change needed to `docs/items/WEAPONS.md`** — confirmed current and correctly scoped (numbers only, pointing to code for the authoritative source).
4. **No change needed to `docs/STATE.md`'s combat-related sentences** beyond what `01-inventory.md`/`04-npc.md` already recommended (trim "Settlements / NPCs" prose generally) — this audit found no combat-specific inaccuracy inside that prose, only the same general implementation-history-leakage pattern already flagged.

---

## Open questions

- Should `docs/state/combat.md` gain a short "persistence" line stating explicitly that combat itself has no persisted state (only its downstream consequences do), for symmetry with how thoroughly `05-fauna.md`/`06-player-items.md` documented persistence tiers in their own domains? Recommend leaving this to a future `08-persistence.md` cross-domain pass rather than editing `combat.md` now — combat's "nothing persists here" is a negative fact more naturally stated once, from the persistence-audit side, than repeated in every domain doc.
- `ArcherAI`/bandit combat-decision framework remains unbuilt (confirmed still true, matching `combat.md`'s own "Not implemented" list) — no new information this audit adds beyond reconfirming the claim is still accurate at this baseline.
