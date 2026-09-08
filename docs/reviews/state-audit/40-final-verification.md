# State Documentation Audit — Stage 6: Final Verification

**Date:** 2026-09-08
**Baseline:** `62ad7761` at artifact commit (`docs: add npc-028 work contracts for multiple workers to recommended order`). Spot-checks were taken at `272b660819f4612e046bd05cdd153f3e954fa578`; three later commits were delta-checked (see §2).
**Agent:** Cursor Grok 4.6
**Scope:** Verification-only pass over the final current-state documentation set against current `main` and Stages 1–5 audit artifacts. No edits to `docs/STATE.md`, `docs/state/*.md`, `docs/architecture/ARCHITECTURE.md`, `CLAUDE.md`, or gameplay code.

This is a **verification pass**, not another documentation-edit phase. Findings below are recorded, not fixed.

---

## 1. Executive result

**Verdict: `PASS WITH MINOR CLEANUP`**

The Stage 5 reconciliation succeeded structurally. The nine canonical state docs exist, `STATE.md` is a pointer-based snapshot rather than a plan-by-plan changelog, the known Stage 2/3 persistence contradictions (households / NPC relationships / helper assignment / livestock / save v12 / schema v1 / no migrations) are gone from current-state docs, and the load-bearing limitations from Stage 3 (player→NPC damage, fauna outgoing damage, player HP, rats, wild-fauna identity, NPC death) are still stated as unsolved.

What remains is **bounded post-Stage-5 code drift** plus a handful of leftover wording/link issues. `main` moved substantially after Stage 5 Part 4 (`4e5a061a`, 2026-09-06). Several of those landings updated a domain doc but not every snapshot that restated the same fact. A single cleanup commit can restore currency without reopening the audit's ownership model.

No Critical findings. Four Important findings, all factual drift or one leftover ownership sentence. The audit may be treated as complete after that cleanup.

---

## 2. Final baseline and drift

### Working tree

- Branch: `main`, tracking `origin/main`.
- `git pull --rebase origin main`: already up to date.
- Working tree: clean at verification start.

### Stage 5 → Stage 6

Last Stage 5 documentation commit: `4e5a061ae8c271be11200ffa2d2f9ce1a1c54f73` (`docs: reconcile STATE.md and state/README.md (Stage 5 Part 4)`, 2026-09-06).

**Baseline drift is not zero.** Between `4e5a061a` and `272b6608`, `src/` and several current-state docs both changed. Relevant current-state doc commits in that window:

| SHA | What landed in current-state docs |
|---|---|
| `e460480e` | SPEA foundation + Strength melee → `combat.md`, `npc.md`, `player-systems.md` |
| `b8f6d734` | empty-save Start Screen path → `STATE.md` / persistence-adjacent |
| `9807b1a1` / `56d1f1b4` | reputation / grave-disturbance → `npc.md`, `STATE.md` |
| `3f8f18ca` | placement preview → `player-systems.md` |
| `3c1b4368` | food provenance / storage decay persist → `persistence.md`, `player-systems.md` (**not** `STATE.md`) |
| `1ea144bb` / `c18fbac3` | Cave V2 B2 ground query → `terrain-and-world-generation.md`, `STATE.md` |
| `0e933c11` / `dea40617` / `497db31d` | authored quests / prerequisites / `talk_to_npc_choice` → `STATE.md`, `player-systems.md`, `npc.md` |

Code that landed **without** a matching current-state-doc update, and that this pass therefore re-checked:

| SHA | Code | Why it matters |
|---|---|---|
| `ea772323` | `feat(world-017): contextual river water safety` | `WaterSource` / river quality claims |
| `71fa6e03` | npc-022 Agility-driven melee recovery | SPEA “no consumer yet” sentences |
| `3c1b4368` | household/economy/container `foodBatches` | Stage 3 A4 |
| fauna-017 steps | `animalDefs.ts`, `animalCorpse.ts`, `animalForaging.ts` | fauna architecture paragraph |
| `272b6608` | B3 recon notes only | Cave collision claim — B3 **not** implemented; docs still correct |

Verification did **not** repeat Stage 2. Only the affected claims above were re-opened.

During this pass, `main` advanced three more commits (`48a4ca2c` fauna-017 `animalRoaming.ts` extract, plus two plan/code-map doc commits). None of them touched current-state docs. The roaming extract only reinforces F12. Verdict unchanged.

`CURRENT_SAVE_VERSION` in code is `9` with migrations `1→2` … `8→9`. Current-state docs no longer restate that number (they point at `saveData.ts` / `ARCHITECTURE.md#save-schema`). That pointer discipline still holds.

---

## 3. Documentation structure verification

### `STATE.md`

It is a concise current snapshot. Major-system subsections are short and point at domain docs. There is no plan-by-plan implementation history, no save-v12 / schema-v1 claim, and no large duplication of `npc.md` / `fauna.md` / `persistence.md`. “Not implemented” still names the load-bearing gaps.

Residual snapshot issues (not structural failure):

- `WorldBundle` “18 fields” is a restated volatile count; the type currently has 24 fields (`workContracts`, `grassForage`, `riverWaterQuality`, and others the sentence does not enumerate). Canonical list remains `src/app/worldBundle.ts`.
- One history crumb: Households “since plan persistence-001”.
- Closing pointer names CLAUDE.md’s “Truth hierarchy”; the section is “Source of truth” (F7).
- Food-freshness bullet is stale against code and against `persistence.md` (F1).

### `docs/state/README.md`

Indexes all nine canonical files. Each “Covers” row states an ownership boundary against its neighbour. No `runtime-ui-audio.md`. Specialized references (`ARCHITECTURE.md`, item catalogs, species-physical-reference) are classified as supporting / design, not as extra state docs.

One Important stale sentence: SPEA “No such fields exist in the current codebase” (F3).

### Canonical ownership

| Topic | Expected home | Result |
|---|---|---|
| terrain/worldgen | `terrain-and-world-generation.md` | Pass. Water/locations explicitly deferred. |
| hydrology/water | `water.md` | Pass as home. W13 waterfall wording internally inconsistent (F6). |
| settlements/households/economy | `settlements.md` | Pass. NPC behaviour correctly forwarded to `npc.md`. |
| NPC state/behaviour | `npc.md` | Pass. |
| fauna/ecosystem | `fauna.md` | Pass. |
| player/work contracts | `player-systems.md` | Pass. NPC side is evaluation-only in `npc.md`. |
| combat | `combat.md` | Pass. |
| persistence/reconstruction | `persistence.md` | Pass. Schema field list stays in `ARCHITECTURE.md#save-schema`. |
| locations/discovery/map | `world-locations.md` | Pass. |

Supporting-doc competition: `ARCHITECTURE.md` “Source of truth” still describes `settlements.md` as “settlements and NPC life as implemented”, which was the pre-Stage-5 over-claim (F5). `combat.md`’s “NPC life/economy → settlements.md” header is a milder leftover of the same split.

---

## 4. Code-backed spot checks

Targeted against `272b6608`. New implementation detail is recorded only where it contradicts a current-state claim.

### NPC

| Claim | Code | Result |
|---|---|---|
| Authoritative shape is the seven `NpcAuthoritativeState` fields | `src/settlement/npcState.ts` | Pass |
| Those fields persist as `SaveData.npcStates`; relationships as `SaveData.npcRelationships` | `src/persistence/saveData.ts` | Pass |
| Phase / pending-action / pathfinding / combat-intent / carried inventory are runtime-only | `npcState.ts` module contract + `SaveData` | Pass |
| Decision pipeline is three pressure producers → arbitration → sequencing | `npc.md` vs `ai/` layout (`Needs`, `weatherPressure`, `healingPressure`) | Pass (structure; not a full re-audit of every strategy) |
| Player↔NPC relations ≠ NPC↔NPC store | `QuestManager` vs `npcRelationships.ts`; `SaveData.quests.relations` vs `npcRelationships` | Pass |
| Combat ends at `physicalInjury` write | `combat.md` / `npc.md` / `HealthState` | Pass |
| SPEA base rolls exist; Strength has a melee consumer | `npcPhysicalProfile.ts`, `meleeStrength.ts` | Pass |
| Agility “no consumer yet” | `resolveHumanAgilityProfile()` + `combat/meleeAgility.ts` (npc-022, `71fa6e03`) | **Stale** (F4) |

Source comments in `npcState.ts` still say `helperAssignment` / `activePlan` are “not part of `SaveData`”. Docs do **not** repeat that falsehood. Already tracked in `LOOSE-ENDS.md` (observation, not a current-state finding).

### Fauna

| Claim | Code | Result |
|---|---|---|
| One `AnimalAgent` class for wild / livestock / rats | `AnimalAgent.ts`, `livestock.ts`, `rats.ts` | Pass |
| Two-tier behaviour (priority table + ad hoc needs) | `fauna.md` vs `faunaDecision.ts` | Pass at the documented level |
| Livestock persisted per individual; spawners thin; wild unpersisted; rats neither persisted nor seed-derivable | `SaveData.livestock` / `removedLivestockIds`; no `rats` field | Pass |
| Outgoing damage is `DAMAGE_TABLE` / `HUMAN_DAMAGE` | `fauna/faunaCombat.ts` | Pass |
| Species data “owned by `AnimalAgent.ts`” | `animalDefs.ts` extracted (fauna-017 step 1), re-exported from `AnimalAgent.ts` | Architecture still AnimalAgent-centred; the “owner of most species data” sentence is slightly stale (observation) |
| Fauna SPEA runtime | no `PhysicalAttributes` on `AnimalDef` | Pass — still not implemented for fauna |

### Persistence

| Claim | Code | Result |
|---|---|---|
| `SaveData` is a serialization boundary | `saveData.ts` + `saveState.ts` | Pass |
| Versioned migration, fails closed, validate on write | `CURRENT_SAVE_VERSION = 9`, `SAVE_MIGRATIONS` 1..8, `migrateStoredSave` | Pass |
| Restore is construction | `ARCHITECTURE.md` + `createApp` / bundle constructors | Pass (spot-check of the stated contract) |
| Worldgen cache separate from `SaveData` | `worldgenCacheDb.ts`; not in `SaveData` type | Pass |
| Player HP not persisted | `SavePlayer` is pose + `mountedAnimalId`; `SavePlayerNeeds` has no HP | Pass |
| Food freshness only on the player inventory (Stage 3 A4) | `SaveFoodBatch` on player, dropped items, containers, household `items`, settlement food | **Stale in `STATE.md`** (F1). `persistence.md` was updated in `3c1b4368` and no longer lists A4. |

### Terrain / water

| Claim | Code | Result |
|---|---|---|
| Chunk mesh data generated in the worker pool | `chunkManager.ts` `requestChunkMeshData` / worker `'mesh'` job; GRAPHICS G17 now describes the live pipeline | Pass |
| Shaping order: regional smoothing → corridors → river channel | `chunkHeightmap.ts` / terrain doc | Pass |
| Weather consumers: NPC `seekShelter`, garden hydration, sleeping-utility decay | `weatherPressure.ts` + terrain doc | Pass |
| `sampleLocalWater()` is the shared physical-water answer | `terrain/waterSample.ts`, consumed by fauna / livestock / rats | Pass |
| `WaterSource` drink/fill abstraction | `src/world/WaterSource.ts` | Pass |
| River quality unconditionally `safe`; world-017 not started | `riverWaterQuality.ts` + `WorldBundle.riverWaterQuality`; `interactables.ts` `resolveRiverWaterQuality` | **Stale** (F2) |
| `CaveVolume` collision-only until B3 | B3 recon (`272b6608`) is a pre-implementation map; colliders still go `topologyToCaveDefinition` → `buildCaveWallColliders` | Pass — not drift |

### Player / combat

| Claim | Code | Result |
|---|---|---|
| Six skills | `SkillId` = sneak / survival / traps / defense / archery / riding | Pass |
| Work-contract commitment owned in `player-systems.md`; NPC evaluates/executes | `world/workContract.ts` vs `ai/npcWorkContract.ts` | Pass |
| Riding persists `SaveData.player.mountedAnimalId` (livestock id) | `SavePlayer.mountedAnimalId` | Pass |
| Player melee hit-test is animals only; `[E]` on NPC opens dialogue | `gameLoop.ts` melee candidate loop `kind !== 'animal' continue`; NPC branch opens `openNpcDialogueMenu` | Pass |
| Strength scales melee; Agility unused | `applyMeleeStrength` live; `resolveMeleeRecovery(weapon.melee.recovery, agility)` live | Strength pass; Agility **stale** (F4) |

### Locations

| Claim | Code | Result |
|---|---|---|
| Catalog is deterministic classification from terrain sampling | `src/world/locations/` | Pass at ownership level |
| Discovery / knowledge / targets persist; geometry does not | `SaveData.map` (as documented); geometry re-derived | Pass |
| Worldgen cache namespace is this catalog | `locationsCoarseCache.ts` + `persistence.md` | Pass |
| `src/world/map/` exists (`mapProjection.ts`, `mapDiscovery.ts`, …) | directory present | Pass |

`world-locations.md` still correctly warns it was not audited to Stage-2 depth. This pass did not expand that.

---

## 5. Cross-domain consistency

Preferred shape is **canonical description + useful cross-link**. That is how the final set is organized. No requirement that every seam be restated in every file.

| Seam | Canonical home | Cross-link status |
|---|---|---|
| terrain / hydrology / weather ↔ settlements / NPCs / fauna | terrain + `water.md` + `npc.md` weather pressure + `fauna.md` traversal | Pass |
| resources → work / production → storage → pressures | `settlements.md` + `npc.md` strategies | Pass |
| player ↔ work contracts ↔ NPC work | `player-systems.md` Work Contracts + `npc.md` evaluation | Pass |
| settlement food ↔ rats | `fauna.md` rats + `settlements.md` drain note | Pass |
| hunting ↔ fauna ↔ household food | `fauna.md` hunting hooks + `combat.md` hunter + `settlements.md` Gospodarstwa | Pass |
| combat → health / injury / death → domain consequences | `combat.md` + `npc.md` healing + `fauna.md` corpse | Pass |
| corpses ↔ player / NPC / fauna | fauna corpse lifecycle vs NPC “no disposal” | Pass |
| runtime → `SaveData` → restore/reconstruction | `persistence.md` | Pass |

The one seam that is **internally inconsistent across docs** after drift is river drink quality (`STATE.md` / `water.md` vs `WaterSource.ts` / world-017). That is F2, not a missing seam.

---

## 6. Known limitations verification

Stage 3 labels. Status is against **current code** and the **final docs together**.

| ID | Limitation | Docs | Status |
|---|---|---|---|
| A1 | Player → NPC damage not connected | `STATE.md` Not implemented; `combat.md` Not implemented; verified in `gameLoop.ts` | **Correctly documented** |
| A2 | Fauna flat outgoing damage table | `STATE.md`, `combat.md`, `fauna.md` | **Correctly documented** |
| A3 | Player HP not persisted | `STATE.md`, `persistence.md` Known limitations; `SavePlayerNeeds` has no HP | **Correctly documented** |
| A4 | Non-player food freshness batch anchors lost | `STATE.md` still lists it and points at `persistence.md#known-persistence-limitations`. `persistence.md` no longer lists it. Code persists `foodBatches` on households, settlement food, containers, dropped items (`3c1b4368`). | **Misleading in `STATE.md`** (presents a solved gap as open). Canonical persistence doc is current. |
| A5 | Wild-fauna individual identity not persisted | `fauna.md` Persistence classes; `STATE.md`; `persistence.md` | **Correctly documented** |
| A6 | Rats unpersisted and not seed-derivable | `fauna.md`, `persistence.md`, `STATE.md` | **Correctly documented** |
| A8 | NPC death / disposal | `npc.md` Limitations; `STATE.md` | **Correctly documented** |

No limitation from this list is presented as solved except the inverse error on A4.

---

## 7. Link / anchor verification

Checked every relative Markdown link in `docs/STATE.md`, `docs/state/README.md`, the nine canonical state docs, persistence-related sections of `ARCHITECTURE.md`, and CLAUDE.md persistence pointers.

GitHub-style slugs for headings that contain `/` (`Hydrology / rivers`, `Player / riding`) are `hydrology--rivers` / `player--riding`. Those links resolve.

| Location | Link | Result |
|---|---|---|
| `STATE.md` → `ARCHITECTURE.md#save-schema` | heading `### Save schema` | Resolves |
| `STATE.md` → `persistence.md#known-persistence-limitations` | file+heading exist | Resolves as a link; **semantic miss** for A4 (section no longer mentions food freshness) |
| `STATE.md` → `../CLAUDE.md` | file exists | Resolves; quoted section name is wrong (F7) |
| `npc.md` → `#species-physical-reference-not-implemented` | heading renamed to “(partially implemented)” | **Broken** (F8) |
| `ARCHITECTURE.md` → `./CODE_INDEX.md` | resolves to `docs/architecture/CODE_INDEX.md` | **Missing file**; correct relative path is `../CODE_INDEX.md` (F9) |
| CLAUDE.md `ARCHITECTURE.md#save-schema` | backtick path, heading exists | Pointer is valid |

`docs/world/human-strength-calibration.md` (linked from `npc.md`) exists.

---

## 8. History / duplication verification

### History leakage

`STATE.md` is no longer a plan-by-plan changelog. The remaining “since plan persistence-001” is one phrase.

Older domain docs still carry plan-ID texture that Stage 5 did not fully strip (and Stage 4 did not require a full rewrite of):

- `settlements.md` still opens with “Historia zakresu” and archived plan links.
- `water.md` standing-decision table still marks “faza 2 ✅”; the river section still narrates plan 181/189/011/013 sequences and a dated waterfall completion.
- `combat.md` / `player-systems.md` headings still embed plan numbers (`plan npc-019`, `plan 177`, `plan 168`, …).

This is **not** the original `STATE.md` failure mode (appending every landing note into the snapshot). It is leftover domain-doc history. Classified as Minor (F11), not a reason to fail the snapshot criterion.

`implemented in` / `added in` / `since plan` did not reappear as a changelog voice in `STATE.md` except that one Household bullet.

### Duplication / contradiction

Meaningful duplication/contradiction found:

- `STATE.md` vs `persistence.md` on A4 (F1).
- `STATE.md` + `water.md` vs code on river `WaterQuality` (F2).
- `water.md` W13 vs later waterfall paragraph / terrain doc (F6).
- SPEA “not in the codebase” (README) vs `npc.md` “partially implemented” vs code (F3, F4).

Ordinary cross-domain summaries (work contracts, hunting, `contributeWork`, weather threading) are pointers, not competing authority.

---

## 9. Findings

| ID | Severity | Document | Finding | Evidence | Recommended action |
|---|---|---|---|---|---|
| F1 | Important | `docs/STATE.md` | Stage 3 A4 is still listed as unimplemented. Households, settlement economy, and placed containers now persist `foodBatches`. `persistence.md` was updated in `3c1b4368` and no longer lists this gap; the snapshot was not. | `SavePlacedContainer.foodBatches`, `household.ts` / `settlementEconomy.ts` `foodBatchesToJSON()`; `STATE.md` “Not implemented” bullet pointing at `persistence.md#known-persistence-limitations` | Delete the `STATE.md` bullet (or rewrite it as solved). Do not re-add A4 to `persistence.md`. |
| F2 | Important | `docs/state/water.md`, `docs/STATE.md` | River drink quality is described as unconditionally `safe` and world-017 as “nie rozpoczęty”. Contextual classification is live. | `ea772323`; `src/world/riverWaterQuality.ts`; `WorldBundle.riverWaterQuality`; `interactables.ts` `resolveRiverWaterQuality` defaults fail-closed to `unsafe` | Replace the blanket-safe claim with: well/ocean static; river quality from `riverWaterQualityResolver`; lake still `unsafe`. Keep `WaterSource` as the drink/fill contract. |
| F3 | Important | `docs/state/README.md` | Specialized-reference blurb says SPEA fields do not exist in the codebase. | `src/shared/PhysicalAttributes.ts`; `npcPhysicalProfile.ts`; `PlayerController.attributes`; npc-019 | Reword: design reference remains authoritative; runtime SPEA exists for humans (partial consumers); fauna still has no SPEA fields. |
| F4 | Important | `docs/state/npc.md`, `docs/state/combat.md`, `docs/state/player-systems.md` | Perception/Endurance/Agility (or “Strength is the only consumer”) are described as data-only. Agility now drives melee recovery. | `71fa6e03`; `resolveHumanAgilityProfile`; `combat/meleeAgility.ts`; `playerMelee.requestAttack(..., agility)` | Name Agility’s recovery consumer. Leave Perception/Endurance as unimplemented. Fix the stale self-anchor in `npc.md` (F8) in the same pass. |
| F5 | Important | `docs/architecture/ARCHITECTURE.md` | “Source of truth” still lists `settlements.md` as the document for “settlements and NPC life”. | `ARCHITECTURE.md` L11 vs `docs/state/README.md` / `npc.md` ownership | Point NPC life at `npc.md`; keep `settlements.md` for generation/households/economy. |
| F6 | Minor | `docs/state/water.md` | W13 says waterfalls are deferred; the river section and `terrain-and-world-generation.md` describe implemented per-vertex waterfall rendering. Full shader parity / hydrology worker offload remain deferred. | W13 vs water.md L156 / terrain L34 | Narrow W13: waterfalls exist as a ribbon rendering signal; lake/ocean shader parity and hydrology worker offload stay deferred. |
| F7 | Minor | `docs/STATE.md` | Closing sentence points at CLAUDE.md’s “Truth hierarchy”. | CLAUDE.md heading is `## Source of truth` | Rename the quoted section. File link `../CLAUDE.md` is fine. |
| F8 | Minor | `docs/state/npc.md` | In-page link `#species-physical-reference-not-implemented` does not match the renamed heading. | Heading is `### Species physical reference (partially implemented)` | Point at `#species-physical-reference-partially-implemented`. |
| F9 | Minor | `docs/architecture/ARCHITECTURE.md` | `./CODE_INDEX.md` does not exist beside this file. | `docs/CODE_INDEX.md` is one level up | Change to `../CODE_INDEX.md`. |
| F10 | Minor | `docs/STATE.md` | Restated `WorldBundle` field count (18) and one “since plan …” crumb. | `worldBundle.ts` `WorldBundle` has 24 fields | Drop the number; keep “see ARCHITECTURE.md / `worldBundle.ts`”. Drop the plan-id phrase. |
| F11 | Minor | `settlements.md`, `water.md`, `combat.md`, `player-systems.md` | Plan-ID / dated-history texture remains in older domain docs. | `settlements.md` “Historia zakresu”; water standing-decision ✅ phase marks; combat/player heading plan numbers | Optional follow-up trim. Not required to trust the snapshot. Do not treat as a second Stage 5 rewrite. |
| F12 | Observation | `docs/state/fauna.md` | Last verified 2026-09-06. fauna-017 extracted species data / corpse / foraging / roaming modules. No fauna SPEA fields (still true). | `animalDefs.ts` / `animalCorpse.ts` / `animalForaging.ts` / `animalRoaming.ts` (`48a4ca2c`) re-exported or composed from `AnimalAgent.ts` | Optional: note the extracted modules. Do not invent a fauna SPEA section. |
| F13 | Observation | `src/settlement/npcState.ts` (source, not a state doc) | Per-field comments still deny `SaveData` membership for helper assignment / active plan. | Comments vs `NpcStateSnapshot` / `SaveData.npcStates`; already in `LOOSE-ENDS.md` | Out of this verification’s edit scope. Source-comment cleanup remains a loose end. |

SPEA / species-physical-reference (Stage 6 §9): the design document is still an authoritative **design** reference. Runtime SPEA **has** landed for humans since Stage 3 (`PhysicalAttributes`, NPC rolls, Strength damage, Agility recovery). Fauna still has no SPEA fields. `npc.md` already says “partially implemented”; `README.md` has not caught up. That is F3, not a claim that SPEA is a finished gameplay layer.

---

## 10. Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | `STATE.md` is a concise trustworthy current snapshot | **PASS WITH MINOR FINDINGS** — structure is right; A4, field-count, and the CLAUDE heading are leftover/drift |
| 2 | No known plan-by-plan history leakage in current-state docs | **PASS WITH MINOR FINDINGS** — `STATE.md` is clean; older domain docs still have plan texture (F11) |
| 3 | No known stale persistence contradictions remain | **PASS WITH MINOR FINDINGS** — Stage 2 stale claims (households, relationships, helper assignment, livestock, v12, v1, no migrations) are gone. The only remaining contradiction is A4 in `STATE.md` vs `persistence.md`/code |
| 4 | Canonical ownership is clear | **PASS WITH MINOR FINDINGS** — nine homes are correct; `ARCHITECTURE.md` L11 still over-claims NPC life |
| 5 | NPC current state has a canonical home | **PASS** |
| 6 | Fauna current state has a canonical home | **PASS** |
| 7 | Persistence/reconstruction has a canonical home | **PASS** |
| 8 | World locations/discovery/map has a canonical home | **PASS** |
| 9 | Important cross-domain seams are documented | **PASS** — river-quality sentence is the drift exception (F2) |
| 10 | Known implementation limitations are not presented as solved | **PASS WITH MINOR FINDINGS** — A1/A2/A3/A5/A6/A8 correct; A4 presented as unsolved after it was implemented |
| 11 | SPEA/design reference is not presented as implemented | **PASS WITH MINOR FINDINGS** — design reference is not treated as a full runtime feature; README overshoots the other way now that a partial human runtime exists |
| 12 | ARCHITECTURE/CLAUDE do not duplicate volatile save-version details | **PASS** — they point at `CURRENT_SAVE_VERSION` / `saveData.ts` |
| 13 | Current-state documentation links resolve | **PASS WITH MINOR FINDINGS** — F7 (name), F8 (anchor), F9 (path) |
| 14 | No unnecessary `runtime-ui-audio` state doc | **PASS** |

None of these is a FAIL of the ownership/reconciliation work. The Important rows are post-Stage-5 currency, not a collapsed model.

---

## 11. Recommended cleanup

One bounded commit, documentation only. Do not reopen ownership. Do not rewrite `settlements.md` / `water.md` into a new voice unless touching the specific stale sentences.

**Should edit:**

1. `docs/STATE.md` — F1, F2 (river quality one-liner), F7, F10.
2. `docs/state/README.md` — F3.
3. `docs/state/water.md` — F2, F6.
4. `docs/state/npc.md` — F4, F8.
5. `docs/state/combat.md` — F4.
6. `docs/state/player-systems.md` — F4 (Strength-only sentence).
7. `docs/architecture/ARCHITECTURE.md` — F5, F9.

**Optional / not required for audit close:** F11 history trim, F12 fauna last-verified / `animalDefs.ts` sentence, F13 source comments.

Do not bump or restate `CURRENT_SAVE_VERSION`. Do not add a `runtime-ui-audio.md`. Do not run `pnpm docs:sync` for this cleanup unless generated maps are already dirty for another reason.

---

## 12. Final conclusion

### `PASS WITH MINOR CLEANUP`

Documentation is trustworthy as an architecture map. Canonical homes, persistence taxonomy, and the Stage 3 limitations that are still true in code are in the right places.

A small bounded cleanup commit is recommended so the snapshot does not keep advertising three facts the code has already moved past (food-freshness persistence, contextual river quality, human Agility consumption) and so SPEA/README + `ARCHITECTURE.md` ownership wording match Stage 5.

After that commit, the audit can be considered complete. No Critical findings. This Stage 6 pass does not itself perform that cleanup.
