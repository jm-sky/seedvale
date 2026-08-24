# Implementation notes — 202 — God Files & Responsibility Boundaries

Analyzed and incrementally refactored all six files in scope. Work was split into three sequential passes (NPC/fauna, App/world, Gameplay) to keep each refactor focused and independently verified; each pass ran its own `tsc`/lint/build/test cycle and was committed/pushed before the next began.

---

## 1. Final assessment

| File | Result | Notes |
|---|---|---|
| `src/ai/NpcAgent.ts` (3065→2928 lines) | **partial** | Extracted three genuinely-owned, non-FSM responsibilities. Remaining ~2900 lines are coherent FSM/coordinator ownership (phase machine, combat tick orchestration, need-fulfillment decisions, movement/rescue glue), already delegating to ~13 sibling domain modules. |
| `src/fauna/AnimalAgent.ts` (2328→2287 lines) | **partial** | Shares both cross-file extractions below. Remainder is coherent predator/prey/livestock FSM ownership, already delegating to `AnimalLife.ts`, `faunaCombat.ts`, `predatorHumanDecision.ts`, `herdCohesion.ts`, `playerAwareness.ts`, `corpseDecayFx.ts`, `bloodSplat.ts`, `harvestedRemains.ts`. |
| `src/app/createApp.ts` (1246 lines, unchanged) | **kept** | Genuine composition-root/wiring layer, already delegating to ~10 sibling modules under `src/app/`. Two extraction candidates were considered (the `rebuildWorld` closure, the repeated "deferred hook" pattern) and rejected — both would relocate coupling or erase plan-specific documentation, not reduce complexity. |
| `src/app/worldBundle.ts` (679→718 lines) | **partial** | `createWorldBundle`/`rebuildWorldBundle` built the same 15 world systems in the same order twice; deduped into a private `buildWorldSystems()`. Public signatures and the `WorldBundle` field list are unchanged; the `ARCHITECTURE.md` rebuild/lifetime invariant (stable bundle identity, single owner of reassignment) is preserved. |
| `src/quests/QuestManager.ts` (543 lines, unchanged) | **kept** | Single coherent quest-state FSM, already NPC/fauna-agnostic via injected resolvers. Smallest of the six files and already at the right size — no separable concern found. |
| `src/player/PlayerController.ts` (920→905 lines) | **partial** | Hand-built the same floating name/bars label DOM tree the NPC/fauna extraction below already owns; switched to the shared helper. Everything else (movement, animation-clip FSM, pose/downed, jump, camera boom, held-tool visual, footsteps) is coherent controller ownership already delegating to ~10 sibling `src/player/` modules. |

---

## 2. Cross-file extractions

Two of the plan's Section 3 "shared helper" candidates turned out real, spanning three of the six files:

- **`terrain/slopeConstraint.ts`'s `stepWithSlopeAndCollision()`** — `NpcAgent.steerTo` and `AnimalAgent.steerToward` duplicated the identical slope-constrained-step + 3-tier collision fallback (full step → X-only → Z-only). Extended the existing slope-math module (already shared by player/NPC/animal) rather than adding a new file. `PlayerController.ts` was checked for the same duplication and correctly excluded: it uses `resolvePosition`'s continuous capsule-radius collision slide, a different mechanism for a directly-controlled body vs. AI path-following — forcing it into the same helper would have been a false equivalence.
- **`ui/agentStatusLabel.ts`** (new) — `createLabelBar`, `createAgentLabel`, `computeBarPercent`/`applyBarPercent`. `NpcAgent`, `AnimalAgent`, and `PlayerController` all hand-built the same floating CSS2D name+bars label with the same "only touch DOM on change" guards. Unified into one module reused by all three; no new `utils.ts`.

One NPC-only extraction was not cross-file but is worth noting: **`ai/npcVoiceLines.ts`** (new) — the Super Dialogue Audio Pack voice-actor/greeting/farewell/confirmation/reaction/quest-complete pools, pure data + pure pickers, previously living in `NpcAgent.ts` by history rather than ownership. `QuestManager.ts` and `ui-vue/store.ts` now import it directly instead of through `NpcAgent.ts`.

---

## 3. What stayed as KEEP, and why

Per the plan's explicit warning against forcing splits to shrink LOC, the following were analyzed and deliberately left alone:

- `createApp.ts`'s `rebuildWorld` closure — tightly entangled with createApp's own mutable session state (`collectedItemIds`, `removedCropIds`, `plantedTrees`, `plantedCrops`, `resourceDepletion`, `treeLifecycle`); extracting it would relocate the coupling, not reduce it.
- `createApp.ts`'s repeated "deferred hook" pattern (`let xTarget = null; const x = (...) => xTarget?.(...)`, 5 occurrences) — each carries distinct plan-specific documentation a generic helper would erase.
- `QuestManager.ts` in full — already a single coherent FSM at 543 lines, already resolver-injected to stay NPC/fauna-agnostic.
- The bulk of `NpcAgent.ts`/`AnimalAgent.ts`/`PlayerController.ts` — combat tick orchestration, need-fulfillment, movement/rescue, predator/prey decision glue, animation-clip state machines — all tightly coupled to each class's own private FSM/mesh state, not duplicated elsewhere, and already sitting downstream of ~10-13 already-extracted sibling domain modules per file.
- `worldBundle.ts`'s seven per-system `buildX` helpers and `disposeWorldBundle` — already correctly factored before this plan.

---

## 4. Architectural invariants preserved

- No new `EntityManager`, `BaseAgent`, or global manager was created.
- No authoritative state moved ownership; `NpcAuthoritativeState`, `HealthState`, `WorldBundle`'s rebuild/lifetime contract (stable bundle identity, single reassignment owner) are unchanged.
- `WorldBundle`'s public field list and `createWorldBundle`/`rebuildWorldBundle` signatures are byte-identical to before.
- No `SaveData`/persistence contract changes.
- No change to `NpcAgent`/`AnimalAgent`/`QuestManager` public method signatures. `NpcAgent.ts` re-exports for voice lines were moved to `npcVoiceLines.ts` (see loose end below) — the only public-surface change in the whole plan.

---

## 5. Verification

All three passes independently ran `npx tsc --noEmit`, `pnpm run lint:fix`/`lint`, `pnpm run build`, and `pnpm run test` before their commits landed; all passed. One pre-existing flaky test (`chunkVegetation.test.ts`, a timeout under full-suite load, passes in isolation) surfaced twice — unrelated to this plan, not investigated further.

Manual browser/gameplay verification is left to the user per the plan's own scope (Section 6).

---

## 6. Loose ends / notes

- `NpcAgent.ts` no longer exports `NpcVoiceActor`, `NPC_GREETING_SOUND_URLS`, `NPC_FAREWELL_SOUND_URLS`, `NPC_CONFIRMATION_SOUND_URLS`, `NPC_REACTION_SOUND_URLS`, `NPC_QUEST_COMPLETE_SOUND_URLS`, `pickNpcGreetingSound`, `pickNpcFarewellSound`, `pickNpcConfirmationSound` — these moved to `src/ai/npcVoiceLines.ts`. Both call sites that imported them (`QuestManager.ts`, `ui-vue/store.ts`) were updated; a repo-wide grep found no others, but worth a double-check if a future change imports from `NpcAgent.ts` expecting one of these.
- No new `LOOSE-ENDS.md` entries from this plan's actual work. One false entry (misattributing the user's own in-progress `docs/plans/README.md` edit to a "sync tool regression") was added and then removed by the orchestrating session after the mixup was caught — see that commit's message for the correction.
