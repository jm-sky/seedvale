# Research: NPC Animal Threat Forwarding Bug

**Date:** 2026-09-01  
**Status:** resolved

## Summary

An NPC could be attacked by a nearby frenzied wolf while failing to react to the animal threat.

The combat damage path worked, but NPC threat detection received an empty `nearbyAnimalThreats` array.

The root cause was a runtime monkey-patch of `NpcAgent.prototype.update` in `src/app/dialogueTimeControl.ts`. The wrapper had been written for the previous six-argument signature of `NpcAgent.update()` and did not forward the seventh argument, `nearbyAnimalThreats`.

As a result, every call passing animal threats through the wrapper silently dropped that argument. The original method therefore used its default empty array.

This was independent of dialogue engagement state because both wrapper branches forwarded only six arguments.

## Observed behaviour

During reproduction:

- `gameLoop.ts` reported `wolf-0` in `threateningAnimals`.
- `SettlementsManager.update()` received `nearbyAnimalThreats.length=1`.
- `Settlement.update()` received the same array.
- Marek's `NpcAgent.update()` executed with `frozen=false` and `dead=false`, but received `nearbyAnimalThreats.length=0` and `hasWolf0=false`.
- Meanwhile the wolf directly damaged NPC HP.

Example symptom:

    wolf=wolf-0 ... npc=0_0:npc:2/Marek/guard npcHp=108→96 ... canFight=true damage=12.0
    npcCurrentAnimalThreat=null npcLastThreatResponse=never

## Diagnostic progression

### 1. Candidate-selection investigation

`combatTargetForAnimal()` and the animal threat candidate logic were inspected for stale closures or outdated state.

No stale-state/closure problem was found. `isAlive()` evaluated the current `AnimalAgent` state.

The initial candidate-level logging did not fire. This was initially ambiguous because an empty candidate array means the candidate loop has zero iterations.

### 2. Forwarding-chain instrumentation

Temporary logs established that `wolf-0` was not lost at the upper forwarding layers:

    gameLoop
      → SettlementsManager.update: length=1
      → Settlement.update: length=1

All settlements received the array.

The per-agent loop in `Settlement.update()` was also checked and found to call `agent.update()` unconditionally; there was no skip branch explaining the loss.

### 3. NpcAgent entry instrumentation

A temporary, throttled log was added specifically for Marek.

It showed:

    NpcAgent.update entry ... frozen=false dead=false nearbyAnimalThreats.length=0 hasWolf0=false

Therefore:

- Marek's `update()` was definitely running.
- He was neither frozen nor dead.
- The array was already empty at the entry to `NpcAgent.update()`.

### 4. Runtime monkey-patch discovery

The decisive recon found that `NpcAgent.prototype.update` was replaced at runtime in `src/app/dialogueTimeControl.ts`.

The wrapper declared six parameters and called `originalNpcUpdate.call()` with six arguments, while the current `NpcAgent.update()` had a seventh parameter:

    nearbyAnimalThreats: readonly ThreateningAnimalCandidate[] = []

The seventh argument supplied by `Settlement.update()` was therefore never forwarded.

Consequently the real implementation received no seventh argument and fell back to its default empty array.

## Root cause

**Stale runtime wrapper signature.**

A later change added `nearbyAnimalThreats` to `NpcAgent.update()`, but the independent monkey-patch in `dialogueTimeControl.ts` was not updated.

This was not a positional shift between the normal `Settlement.update()` call site and the class declaration. Both looked correct in isolation.

The hidden third layer was:

    Settlement.update()
      ↓
    agent.update(...)
      ↓
    NpcAgent.prototype.update  ← runtime monkey-patch
      ↓
    originalNpcUpdate.call(...)  ← only 6 args
      ↓
    NpcAgent.update()
      ↓
    nearbyAnimalThreats = []

## Why static inspection missed it

The normal call site and method declaration matched.

The runtime method dispatch was altered elsewhere by:

    NpcAgent.prototype.update = function (...)

That replacement was imported for side effects from `src/main.ts`.

Therefore a straightforward search following the normal TypeScript call chain did not reveal that `agent.update()` actually invoked a different function at runtime.

Important lesson:

> When a method's arguments appear to be lost despite correct static forwarding, search for runtime reassignment/monkey-patching of the method or prototype.

Useful searches for similar future problems:

    .prototype.update =
    prototype.<method> =
    Object.assign(...prototype...)

and side-effect imports that install runtime wrappers.

## Fix

Update the wrapper in `src/app/dialogueTimeControl.ts` so that it:

1. declares `nearbyAnimalThreats` as the seventh parameter;
2. forwards it to `originalNpcUpdate.call()` in the dialogue-engaged branch;
3. forwards it in the normal branch.

No changes to animal combat targeting, threat radius, candidate selection, settlement forwarding, or NPC threat logic are required for this bug.

## Verification

The diagnostic run established the complete discrepancy:

    Settlement.update: nearbyAnimalThreats.length=1, wolf-0 present
    NpcAgent.update: nearbyAnimalThreats.length=0, wolf-0 absent

After applying the wrapper fix, the expected behaviour is that the NPC receives the threatening animal candidate and can react through the existing animal-threat system.

Temporary diagnostic logging used to isolate the problem should be removed after verification. Existing, pre-existing NPC combat diagnostics should remain untouched.

## Broader engineering note

This incident exposes a maintenance hazard in monkey-patching class methods: TypeScript does not protect an independently declared runtime wrapper from later changes to the original method's signature.

Where practical, wrappers should be designed to minimize signature drift or document the coupling near the patch.

No broader refactor is implied by this research; the immediate bug is the missing seventh argument.
