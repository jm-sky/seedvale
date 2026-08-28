# Implementation Notes: Horse Riding

**Plan:** `fauna-003-horse-riding.md`
**Status:** `verification needed` 🔍
**Created:** 2026-08-28
**Purpose:** implementation guide for Claude Code; based on current `main` recon.

## 1. Current Code Facts

- `AnimalAgent` is the central runtime fauna entity.
- `AnimalKind` already contains `horse` and `donkey`.
- Fauna already has animal lifecycle, movement, needs, stamina, follow and threat/flee systems.
- Player already has movement/input, `PlayerNeeds` (including stamina/vigor), health/damage and skills.
- No mounted/riding state currently exists.
- No `Riding` skill currently exists.
- Mobile input already uses `createTouchControls`.
- `saddlebags` already exists as an item kind, but cargo/inventory functionality is out of scope.
- Horse/donkey assets are already wired; do not add model/asset work unless code inspection finds a concrete gap.

## 2. Reuse Existing Systems

Before coding, inspect the actual implementations of:

- `AnimalAgent` and animal definitions/types
- animal movement + stamina/needs
- player state + movement
- player input + `createTouchControls`
- interaction/action system
- camera
- animation/model attachment
- health/damage
- persistence/entity lifecycle
- game loop/world update

Use existing ownership, state and update paths. Do not create parallel systems.

## 3. Core Implementation

Implement the smallest shared **mountable** mechanism.

Required concepts:

- player mounted state with authoritative mount entity reference;
- animal mountable capability/configuration;
- mount/dismount actions;
- mounted movement using existing animal movement;
- configurable mount point;
- mounted player visual attachment;
- speed modes;
- mount stamina consumption;
- reduced player stamina consumption;
- mounted camera behaviour;
- Dismount UI for desktop/mobile;
- fall/stability and fall damage using existing health/damage.

Do not create:

- `HorseManager`
- `HorseAI`
- `HorseRidingSystem`
- `DonkeyRidingSystem`
- duplicate stamina/needs/health systems.

## 4. Mount State & Lifecycle

Player and animal remain separate logical entities.

Mounted state must have one authoritative owner and reference the mount by entity ID.

Handle at minimum:

- mount,
- dismount,
- mount death/removal,
- unavailable entity,
- world/entity lifecycle changes,
- save/load if current persistence supports the relevant state.

If the mount disappears, safely dismount and clear the reference.

Do not duplicate mounted state in UI, camera or animal state.

## 5. Animal Simulation

Mounted animal remains an `AnimalAgent`.

While mounted:

- player input controls movement;
- autonomous movement must not fight player control;
- needs, stamina, lifecycle and relevant world simulation continue;
- after dismount, normal animal behaviour resumes.

Reuse existing movement/AI code. Do not disable the complete animal update while mounted.

Threat/flee behaviour must remain compatible with mounted state; do not introduce a horse-specific threat system.

## 6. Horse / Donkey

Both `horse` and `donkey` already exist.

The implementation must be species-agnostic at the riding layer.

Animal-specific data may define:

- max speed,
- acceleration,
- stamina cost/regeneration,
- mount point,
- animation configuration.

Do not branch riding logic on animal kind when configuration/capability is sufficient.

Acceptance test:

> The existing `donkey` can use the same riding mechanism without copying or creating another riding system.

Cargo/saddlebags remain out of scope.

## 7. Movement & Stamina

Use existing animal movement and stamina.

Minimum:

```
walk → run
```

A third gait is optional only if the current movement system supports it without unnecessary complexity.

Speed and stamina costs must be configuration/data, not horse-specific constants in the controller.

Player stamina uses existing `PlayerNeeds`; riding consumes it more slowly than normal running.

Do not add new stamina resources.

## 8. Mount Point / Rendering / Animation

Use the existing Three.js/model attachment conventions.

Mount point must support per-model/per-animal position and rotation; do not assume one global offset.

Minimum animation target:

- mounted idle,
- mounted movement.

If riding animations are unavailable, use the simplest compatible seated-pose fallback.

Do not introduce a new animation framework.

## 9. Dismount

Use existing interaction/input mechanisms.

Dismount must:

1. find a safe position beside the mount using existing terrain/collision utilities;
2. detach player visual;
3. clear mounted state;
4. restore normal player movement/camera/UI.

Do not use an arbitrary fixed world-space offset if existing placement/collision helpers are available.

## 10. Stability / Fall

There is currently no Riding skill.

Do not create a parallel skill/progression system.

Implement the minimum stability model from the plan using available state, primarily:

- mount stamina,
- speed,
- terrain,
- mount condition.

If Riding skill is later added, integrate through the existing skill system.

Fall must:

- detach player,
- clear mounted state,
- restore normal movement,
- apply existing player damage/health,
- leave the animal as an independent entity.

## 11. UI / Mobile / Camera

Extend existing systems only.

Mobile:

- reuse `createTouchControls`;
- add/show Dismount only while mounted;
- avoid joystick/camera overlap.

Camera:

- reuse existing camera controller;
- adjust target/height/distance only as needed;
- verify mount/dismount transition and jitter.

## 12. Performance

Do not add a global per-frame riding manager or scans over all animals.

Riding logic should operate on the current player/mount relationship.

Mounted animals remain in the normal fauna update pipeline.

Avoid duplicate pathfinding, duplicate simulation and unnecessary allocations.

## 13. Expected Code Changes

First inspect the current files and record the exact integration points before editing.

Expected areas:

| Area | Purpose |
|---|---|
| AnimalAgent / animal definitions | mountable capability + control |
| Player state | mounted state |
| Player movement/input | mounted control |
| Interaction/action | mount/dismount |
| Camera | mounted camera |
| UI/touch controls | Dismount |
| Model/animation attachment | rider ↔ mount |
| Health/damage | fall damage |
| Persistence | lifecycle/save-load if required |

Do not assume filenames or APIs from these notes.

## 14. Implementation Order

1. Read `CLAUDE.md`, `docs/STATE.md`, plan and these notes.
2. Inspect the systems listed in §2 and identify exact existing APIs/owners.
3. Implement authoritative mounted state.
4. Implement mount/dismount through existing interaction mechanisms.
5. Integrate player-controlled animal movement.
6. Add mount point + player visual attachment.
7. Add stamina/speed handling.
8. Add camera/UI/mobile integration.
9. Add stability/fall/damage.
10. Verify donkey compatibility without duplicated riding logic.
11. Run automated checks.
12. Perform browser/manual verification.
13. Update these notes with actual files, decisions, limitations and results.

If the code differs from these notes, **code is the source of truth**. Adapt the implementation; do not force the documented structure onto the repository.

## 15. Verification

### Automated

Run the repository-standard:

- tests,
- lint,
- typecheck,
- build.

Record exact results.

### Browser/manual

Verify:

- mount/dismount;
- correct rider position;
- movement and speed modes;
- mount stamina;
- player stamina;
- animal needs/lifecycle;
- normal AI after dismount;
- threat/flee compatibility;
- fall + damage;
- camera;
- desktop input;
- mobile input;
- no terrain clipping/jitter;
- no regression in normal player/animal movement.

### Architecture

Confirm:

- one authoritative mounted state;
- player and animal remain separate entities;
- no duplicated animal/player needs, stamina or health;
- no global riding manager;
- no horse-only riding implementation;
- donkey can use the same mechanism;
- no unnecessary per-frame global scans.

## 16. Post-Implementation Update

After implementation, replace/update the TBD sections with:

- exact changed files;
- final state/type/API names;
- final architecture decisions;
- animation solution;
- persistence/lifecycle handling;
- known limitations;
- automated verification results;
- browser/manual verification results;
- donkey compatibility result.

Clearly distinguish:

- implemented,
- technically verified,
- browser/manual verified.

**Zrób git commit i push do main, rebase jeżeli trzeba**

## 17. Implementation Result (2026-08-28)

### Exact changed/added files

- `src/fauna/AnimalAgent.ts` — `MountPointConfig` type; `AnimalDef.mount?` (presence = the `mountable` capability); `horse`/`donkey` `mount` configs; `AnimalAgent.mounted` field + `isMountable()`, `isMounted()`, `isSprinting()`, `setMounted()`, `mountSeatTransform()`, `driveMounted(dt, wishX, wishZ, sprintRequested)`; `update()` early-returns while `mounted`.
- `src/player/PlayerController.ts` — `mounted` field + `setMounted()`, `isMounted()`, `setMountedTransform(x,y,z,yaw)`; `update()` gains a mounted early-return branch (same shape as the existing `downed`/non-`stand` branches) that keeps `syncCamera()`/`syncHpBar()`/mixer running but skips WASD/gravity/collision.
- `src/player/PlayerNeeds.ts` — `tickRidingStamina()` (flat 3/sec drain while the mount moves, vs. sprint's 20/sec; regens at the walk-idle rate otherwise).
- `src/player/PlayerSkills.ts` — new 6th skill `riding` (`SkillId`, `createPlayerSkills()`), `SKILL_XP_AWARD.ridingDistance`, `RIDING_XP_DISTANCE_M`, `accumulateRidingUse()` (mirrors `accumulateSneakUse`).
- `src/player/ridingStability.ts` (new) — pure `fallRiskPerSecond()`/`rollFall()`/`fallDamage()`, species-agnostic (mount stamina/gait/terrain-slope/HP-condition + riding skill).
- `src/app/actions/mountActions.ts` (new) — `createMountActions(ctx, resolveAnimal): MountActions` — the single "shared riding system": `tryMount`/`dismount`/`update`/`restoreMountedAnimalId`/`isMounted`/`mountedAnimalId`. Owns the authoritative mounted state (an `AnimalAgent` reference + the saved `animalId`), drives the mount from keyboard/mouse-look input, syncs the player's seat transform every frame, ticks riding stamina/XP, and rolls stability.
- `src/app/interactables.ts` — `animalPromptLabel()` returns `Dosiądź: <label>` for any `AnimalKind` whose `ANIMAL_DEFS[kind].mount` is set (when no weapon is held), replacing `Obserwuj`.
- `src/app/gameLoop.ts` — `GameLoopDeps.mount: MountActions`; `mount.update(dt)` runs right before `player.update()`; gaze `target` is forced to `null` while mounted (disables the entire `[E]`/`[R]` dispatch chain in one place — the Dismount button is the only mounted-state action); the `animal` branch's non-combat fallback now calls `mount.tryMount()` when the target is mountable.
- `src/app/createApp.ts` — constructs `mount` via `createMountActions(actionCtx, resolveMountAnimal)`; `resolveMountAnimal` looks a livestock `animalId` up across `settlementsManager.getLoaded()[].livestock` then `bundle.fauna.getAgents()`; restores a persisted `mountedAnimalId` (deferred/retried, since livestock loads async); threads `mount` into `createGameLoop()` and into `createSaveState()`'s `getMountedAnimalId`.
- `src/app/saveState.ts` / `src/persistence/saveData.ts` — `SavePlayer.mountedAnimalId?: string`; `skills.riding` in the save skills block; `riding` is optional in `isSkillsField`'s validator specifically so pre-existing v1 saves (written before this skill existed) keep loading — `restorePersistedSkills` already defaults a missing skill's xp to 0.
- `src/ui/createHud.ts`, `src/ui-vue/store.ts`, `src/ui-vue/mount.ts`, `src/ui-vue/screens/HudScreen.vue` — `Hud.setMounted(mounted, animalLabel, onDismount)` → `ui.hud.mounted` → a bottom-center, always-visible (desktop + mobile) "Zejdź z wierzchowca" button, clear of the joystick/action-button clusters.
- `src/ui-vue/screens/SkillsScreen.vue` — a 6th "Jeździectwo" passive-skill card, same shape as Obrona/Łucznictwo.
- `src/persistence/saveData.test.ts` — `validSave` fixture gained `skills.riding`.

### Architecture decisions

- **No reparenting.** `PlayerController.mesh` stays a flat child of `scene`, exactly like today; while mounted, `mountActions.update()` copies the mount's seat world transform onto it every frame (`setMountedTransform`). Every other system that reads `player.mesh.position` in world space (camera, gaze/interactables, chunk streaming, NPC/fauna `observerPos`) keeps working completely unmodified — this was the single biggest scope reducer.
- **`AnimalAgent.update()` is the single per-frame entry point for every animal, mounted or not** (`Fauna`'s and `Settlement`'s existing loops call it unconditionally either way) — it just early-returns while `mounted`, because `driveMounted()` (called once by `mountActions.update()`, before those loops run this same frame) already did the frame's movement/needs/animation work. No animal is special-cased by kind anywhere in this path.
- **Mountable is pure data.** `AnimalDef.mount?: MountPointConfig` — its mere presence is the capability; horse and donkey both set it, nothing else does. Adding a third mountable species is exactly "add a `mount` block to its `AnimalDef`," confirmed by donkey reusing 100% of the riding code with zero kind-branches.
- **Riding stamina/gait reuse the existing per-kind `walkSpeed`/`sprintSpeed` and the existing shared `tickAnimalLife()` stamina drain (sprint-only, matching every other animal's flee/chase stamina cost) — no new mount-specific stamina model was added for the animal side**, only for the *player* (`tickRidingStamina`, since a rider's own stamina cost is a new concept the plan explicitly asked for).
- **`driveMounted()` intentionally skips `clampBounds()`** — the AI branch's home-wander-radius clamp would otherwise snap a ridden horse back toward its owning house the moment the player rides it away.
- **A single riding skill (`riding`), not a new progression framework** — extends the existing 5-skill `PlayerSkills` infrastructure exactly the way plan §12 asked for when that infrastructure exists.
- **Interact dispatch is disabled while mounted by nulling `target` in one place** (`gameLoop.ts`) rather than wrapping the ~250-line `[E]`/`[R]` branch chain — every existing branch already gates on `target?.kind === …`, so this is a single low-risk choke point instead of a large risky diff.

### Animation solution

No riding clip exists on the Adventurer player rig (confirmed from its clip list — Idle/Walk/Run/Sword_Slash/Gun_*/Roll/Kick/Punch/Wave, no sit/ride). Implemented the plan's explicitly-allowed fallback: **`PlayerController.setMounted(true)` keeps `idleAction` playing** (no walk/run leg-cycling) for the whole ride, correctly positioned via `mountSeatTransform()` and moving with the mount every frame. This is a known visual limitation, not a bug — a real seated pose needs a new clip or IK, out of scope here. The mount's own `Walk`/`Gallop` clips already exist and play normally via the untouched `updateAnim()`/`gallopAction` path.

### Persistence / lifecycle

- `SavePlayer.mountedAnimalId?: string`, optional, no save-version bump (v1 has no migration story; a missing field just means "not mounted" — same convention as other optional save fields).
- Restore is deferred: `createApp.ts` calls `mount.restoreMountedAnimalId(id)` once at boot; `mountActions.update()` retries `resolveAnimal(id)` every frame until found (livestock spawns asynchronously) or found-but-dead (gives up immediately). Only livestock kinds have a deterministic `animalId` (`LIVESTOCK_KINDS`), and only livestock kinds can carry a `mount` config today, so this never tries to reattach to a wild-fauna id that can't safely round-trip.
- Mount death, the player entering `downed` (from *any* cause — a stray predator bite, starvation, a riding fall), or the animal becoming otherwise unresolvable all funnel through the same `exit(reason)` — one authoritative dismount path, never duplicated in UI/camera/animal state.

### Known limitations / deferred (see also `docs/plans/LOOSE-ENDS.md`)

- **"Koń może podążać za graczem" (plan §4) is NOT implemented.** Recon confirmed there is no existing "follow the player" AI anywhere in `src/fauna` — only herd/mother-follow *among animals*. Building this would be a genuinely new AI behavior (and sits in tension with plan §17's explicit "no taming/ownership" exclusion — what would make an untamed horse choose to follow one specific player?), not a small extension, so it was left out rather than bolted on half-built. Logged in `docs/plans/LOOSE-ENDS.md`.
- Fauna has no `vigor` stat at all (`VigorState` is NPC/player-only per `docs/STATE.md`) — plan §3's "koń ma wysoką stamina/vigor" is read as "stamina," the only pool that actually exists for animals; no parallel vigor system was invented for fauna.
- While mounted, a wolf (or anything else) directly attacking the *player* still works via the normal fauna→player damage path and is treated the same as any other cause of `downed` (forces a dismount next tick) — but the mount itself doesn't get a bespoke "defend the rider" reaction; `updatePredator`'s existing prey search doesn't target `livestock`-role animals anyway, so this rarely comes up in practice.
- Held-tool visuals (weapon on the hand socket) aren't hidden while mounted; harmless since mounted combat is out of scope and the melee/ranged interact branches are unreachable while mounted regardless.
- Starting a rest/time-skip while mounted (not gated — only *mounting* itself checks `isActionBlocked`) freezes the mount in place for the skip's duration rather than forcing a dismount; logically odd, not damaging.

### Automated verification

- `npx tsc --noEmit` — pass.
- `pnpm run lint:fix` — pass on every file this plan touched (one pre-existing, unrelated `docs-code-index.ts` lint error predates this change and was left alone).
- `pnpm run build` — pass.
- `pnpm run test` — 207 files / 1988 tests pass (no new tests were added for this plan — the new pure logic in `ridingStability.ts` is straightforward and small; consider adding unit tests as a follow-up if this area sees more change).

### Browser/manual verification

**Not performed** (per this repo's rule: no headless browser automation for gameplay/visual verification). See the user-facing summary for concrete manual steps to run: mount/dismount (desktop + mobile), 3D seating fit, camera behaviour, stamina/stability/fall, and confirming a donkey mounts identically to a horse.

### Donkey compatibility result

Confirmed structurally: `donkey`'s `AnimalDef.mount` is the only donkey-specific code added anywhere in this plan (a `MountPointConfig` value, `src/fauna/AnimalAgent.ts`). Every other file in this plan is written against `AnimalAgent`/`AnimalDef` generically — no `if (kind === 'horse')`/`'donkey'` branch exists anywhere in the new riding code. Not yet browser-confirmed.

## 18. Follow-up (2026-08-28): merchant wagon horse

The Kupiec wagon's horse (`settlement/props.ts`) was still a decorative `Object3D` (GLB or `createHorseModel()` procedural fallback), never an `AnimalAgent` — so it couldn't be mounted despite `horse` already being `mountable`. Fixed by making it a real livestock agent, reusing the existing spawn path instead of adding a second one:

- `settlement/props.ts` — no longer builds a horse mesh at all; `SettlementLandmarks.merchantHorse?: THREE.Vector3` (a static-prop position) became `merchantHorseSpawn?: { x, z, yaw }` (a spawn point/facing for `spawnLivestock()` to use).
- `settlement/livestock.ts` — `spawnLivestock()` gained one more optional parameter, `merchantHorseSpawn`; when present, it constructs exactly one extra `AnimalAgent(ANIMAL_DEFS.horse, 'merchant-horse-<settlementId>', …)` through the same construction path as house-owned livestock (same `visualFor('horse')` template/animations, same `LIVESTOCK_WANDER_RADIUS`), with no `ownerHouseId`/`household` (it isn't owned by a specific house). Appended to the same returned `AnimalAgent[]` that becomes `settlement.livestock`.
- `settlement/createSettlement.ts` — one new argument at the existing `spawnLivestock(...)` call site: `landmarks.merchantHorseSpawn`.
- `settlement/settlementPropColliders.ts` (+ its test) — removed the now-dead `merchantHorse` static-collider branch/field; a live wandering `AnimalAgent` needs no synthetic collider, same as every other livestock animal (none of them have one either).

No changes to `mountActions.ts`, `interactables.ts`, `PlayerController.ts`, riding UI/camera/stamina/stability, or donkey riding — the merchant horse automatically gets `Dosiądź: koń`, mount/dismount, movement, needs, and lifecycle for free, because it's now just another entry in `settlement.livestock`, which every one of those systems already iterates generically.

**Verification:** `npx tsc --noEmit`, `pnpm run lint`, `pnpm run build` all pass; `pnpm run test` — 207 files / 1988 tests pass (same counts as before this follow-up — no regressions, no new tests added since the change is a straightforward spawn-path rewire with no new branching logic). Browser/manual verification not performed (same rule as above) — check in the running dev server: exactly one horse mesh stands by the Kupiec wagon, gazing at it shows `Dosiądź: koń`, `[E]` mounts it, it can be ridden/dismounted exactly like a house-owned horse, and normal (non-merchant) livestock spawns/behaves unchanged.
