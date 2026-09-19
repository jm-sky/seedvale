# Plan: Frenzy source-target claim cleanup

**Created:** 2026-09-19
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** ~~fauna-036~~, ~~fauna-017~~
**Domain:** `fauna`
**Type:** `bug`
**Roadmap:** -

## Goal

Ensure a predator that abandons feeding because frenzy redirects it to an NPC or settlement does not keep a stale `foodClaimedBy` reservation on the carcass.

Reuse the existing source-target cancellation/claim-release lifecycle. Do not add a new corpse reservation system.

## Confirmed defect

`AnimalAgent` currently deliberately omits `cancelSourceTarget()` in:

- `npc-attack-frenzied`;
- `frenzy-beeline`.

A predator may therefore:

1. select and claim a carcass;
2. transition into a frenzy attack/beeline that no longer executes the forage action;
3. leave the corpse's `foodClaimedBy` pointing at itself;
4. block other scavengers until the original claimant eventually revisits/invalidates the source or the corpse disappears.

Death-side claim cleanup is already handled; this plan is only about live behaviour transitions.

## Scope

### 1. Define the transition invariant

Any branch that **abandons** the current source action must call the existing `cancelSourceTarget()` path exactly once.

A branch that intentionally continues normal predator needs/feeding may retain it.

Do not infer cleanup from action labels; encode it at the same behaviour execution boundary that already owns other threat-interrupt cleanup.

### 2. Fix frenzy branches

Make both frenzy paths release the prior source target before executing the incompatible chase/beeline.

Preserve all other frenzy state:

- `threateningHuman`;
- NPC target commitment;
- strategic village destination;
- aggression/fear semantics;
- source target may be reacquired normally after frenzy no longer overrides needs.

### 3. Avoid duplicate claim logic

Do not mutate `corpse.claimedBy` directly from the decision switch.

Use `cancelSourceTarget()` → existing `releaseFoodClaim()`/source cleanup.

If the two branches share identical transition cleanup, factor only the smallest helper that improves consistency; do not refactor the decision architecture.

## Relevant files / symbols

- `src/fauna/AnimalAgent.ts` behaviour execution switch
- `src/fauna/AnimalAgent.ts::cancelSourceTarget`
- `src/fauna/animalForaging.ts`
- `src/fauna/animalCorpse.ts`
- fauna decision/feeding tests.

## Tests

Add focused tests proving:

1. a carcass claimed immediately before `npc-attack-frenzied` is released when the branch takes over;
2. the same is true for `frenzy-beeline`;
3. a second eligible scavenger can claim the corpse after that transition;
4. normal uninterrupted feeding keeps its claim until completion/cancellation;
5. ignore branches that intentionally continue normal predator execution do not spuriously cancel feeding;
6. death cleanup remains exact-once and unchanged.

## Guardrails

- no new corpse manager;
- no new claim field;
- no frenzy rebalance;
- no persistence change;
- no unrelated `AnimalAgent` refactor;
- no browser verification by the implementing agent.

## Verification

Run focused fauna feeding/decision tests plus technical checks. User performs browser gameplay verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
