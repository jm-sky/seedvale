# State Documentation Audit — Stage 4: Reconciliation Proposal

**Date:** 2026-09-06
**Baseline:** `48a4be144a082db3ae4e62e0edc11c1b9382ad77`
**Agent:** Claude Code — Sonnet 5
**Scope:** Synthesis over `docs/reviews/2026-09-06-state-documentation-audit.md` (controller), `docs/reviews/state-audit/01-inventory.md` through `20-cross-domain-integrations.md` (Stage 1–3 findings), plus a full read of the current-state documents in scope for reconciliation: `docs/STATE.md`, `docs/state/README.md`, `docs/state/{combat,player-systems,settlements,terrain-and-world-generation,water}.md`, `docs/architecture/ARCHITECTURE.md`, `CLAUDE.md`. No source code was read directly — every claim below traces to a Stage 1–3 finding or to the current-state documents themselves. No gameplay code or current-state documentation was modified. No subagents used; no repo-wide scan performed.

This document is a **specification for Stage 5**. It does not itself change `docs/STATE.md`, `docs/state/*.md`, `docs/architecture/ARCHITECTURE.md`, or `CLAUDE.md`.

---

## 1. Executive proposal

The audit series' central finding (Stage 3 §1) is that Seedvale's architecture is more coherent than its documentation: no duplicated authoritative state was found anywhere, no competing sources of truth for any `SaveData` field, and a consistent set of conventions applied independently across domains written months apart. **The problems are almost entirely documentation-side**, and they cluster into four failure modes:

1. **`docs/STATE.md` is internally self-contradictory.** Its Persistence section is accurate (v6, five migrations) but is directly contradicted, in the same file, by three stale claims elsewhere (`Household` "not in save data", fauna "no `AnimalAgent` runtime state is persisted, wild or livestock", `helperAssignment` "not yet part of `SaveData`") and by a dead version reference (`SettlementEconomy` "persisted since save v12"). This is the single highest-value fix in the whole series.
2. **Two large, high-churn domains — `src/ai/` (57 files, NPC behaviour) and `src/fauna/` (24 source files, ecosystem) — have zero dedicated current-state documentation.** Every plan's landing note was appended to `STATE.md` instead, which is the direct cause of `STATE.md`'s three largest sections being implementation-history changelogs rather than snapshots.
3. **`docs/architecture/ARCHITECTURE.md`'s "Save schema" section is severely stale** — it describes a pre-persistence-003 world (v1, "no migration story") against a codebase that has been at v6 with five real migrations, a write-integrity guard, and a four-way slot-status layer for some time. `CLAUDE.md` repeats the same stale number in the document an agent reads first.
4. **A handful of real, deliberate architecture facts are undocumented anywhere** — the buildable `contributeWork` seam (split across two `STATE.md` sections instead of owned once), the persistent worldgen cache, three stale-vs-current terrain/weather claims, land ownership/purchase, and several cross-domain seam contracts (fauna's threat accessors, the two independent "relationship" stores, the `@domain`/`@system` JSDoc convention itself).

The proposal below: create three new canonical docs (`npc.md`, `fauna.md`, `persistence.md`); rebuild `STATE.md` into a genuinely concise pointer-based snapshot; apply targeted, mostly small corrections to the five existing `docs/state/*.md` files (two of which — `combat.md`, most of `player-systems.md` — need almost nothing); rewrite `ARCHITECTURE.md`'s save-schema section and fix `CLAUDE.md`'s one stale number with a pointer instead of a restated value; give world locations/discovery/map an explicit (not deferred) documentation home; and confirm, explicitly, that no `runtime-ui-audio.md` is warranted.

None of this touches gameplay code. Six items are explicitly routed to the maintainer as judgment calls, not documentation decisions (§14).

---

## 2. Documentation ownership model

| Topic | Canonical document | Supporting/cross-link docs | Action | Reason |
|---|---|---|---|---|
| High-level project current state | `docs/STATE.md` | all domain docs (pointer targets) | condense | three sections are multi-thousand-word implementation-history changelogs; the file is internally self-contradictory on persistence |
| Terrain / world generation | `state/terrain-and-world-generation.md` | `water.md`, `STATE.md` §World/terrain | expand (small) | accurate but has real gaps (worker-split, stage-1 leveling, worldgen cache) and one stale line (weather coupling) |
| Water / hydrology | `state/water.md` | `terrain-and-world-generation.md`, `settlements.md` | condense (remove history) | largest concrete instance of implementation-history leakage in the whole series |
| Settlements (generation / households / economy) | `state/settlements.md` | `npc.md`, `water.md`, `fauna.md`, `persistence.md` | condense + correct + narrow scope | three stale `SaveData` claims; over-claims NPC-life scope it doesn't actually document |
| NPC behaviour / decisions / relationships | `state/npc.md` (**new**) | `settlements.md`, `fauna.md`, `combat.md`, `persistence.md` | create | 57-file, highest-churn, zero-documentation domain; its content is currently scattered across `STATE.md` prose |
| Fauna / ecosystem | `state/fauna.md` (**new**) | `settlements.md`, `npc.md`, `water.md`, `combat.md`, `persistence.md` | create | 24-source-file, zero-documentation domain, architecturally distinct from both NPC and settlements |
| Player systems / items | `state/player-systems.md`, `items/CATALOG.md`, `items/WEAPONS.md` | `npc.md` (work-contract pointer), `fauna.md` | condense + correct + add Work Contracts subsection | already accurate; one stale number (skill count), one genuinely missing canonical home (Work Contracts) |
| Combat (player / NPC / fauna) | `state/combat.md` | `npc.md`, `fauna.md` | cross-link additions only | best-aligned document in the whole series — no correctness fix needed |
| Persistence / authoritative runtime state | `state/persistence.md` (**new**) | `ARCHITECTURE.md`, `STATE.md`, every domain doc | create | `01-inventory.md` left this conditional on finding persistence-specific invariants beyond a field list; `08-persistence.md` found four, plus a full classification table |
| Work contracts (player-issues, NPC-fulfils, buildable-owns-progress) | `state/player-systems.md` (new subsection) | `state/npc.md` (short pointer) | create subsection | genuinely three-way but too small for its own file; currently described twice, in one file (`STATE.md`), with no cross-link |
| World locations / discovery / map | `state/world-locations.md` (**new, see §8**) | `terrain-and-world-generation.md` | create | ~15 undocumented files with real save fields and its own persistent-cache namespace; fell between every Stage 2 boundary |
| Species physical / SPEA design reference | `docs/world/species-physical-reference.md` (unchanged location) | `npc.md`, `fauna.md` (cross-link only) | leave unchanged + cross-link | authoritative design reference, not implemented; must not migrate into `docs/state/` |
| Runtime / UI / audio | none (**do not create**, see §9) | `ARCHITECTURE.md`, `GRAPHICS.md`, `performance-and-workers.md` | leave unchanged | no cross-domain seam surfaced in Stage 2/3 that requires a dedicated current-state doc |
| Architecture-level runtime composition / `WorldBundle` / lifecycle | `architecture/ARCHITECTURE.md` | `STATE.md` | correct (persistence section only) | everything except persistence is current; persistence needs a full rewrite |
| Item definitions / weapon numbers | `items/CATALOG.md`, `items/WEAPONS.md` | `combat.md`, `player-systems.md` | leave unchanged | confirmed accurate and correctly scoped by `06-player-items.md` |
| Agent-navigation rules | `CLAUDE.md` | `STATE.md`, `ARCHITECTURE.md`, `persistence.md` | correct (one line) | one stale persistence number; everything else is current and should stay a pointer, not a restatement |

---

## 3. `docs/STATE.md` reconciliation

Line ranges below are baseline-relative (this document's baseline SHA) and will drift as earlier edits land in Stage 5 — use them as an approximate map, not exact anchors, and re-locate each section by heading when executing.

| Current section | Action | Destination / replacement | Notes |
|---|---|---|---|
| Header, "Read this first," Source-of-truth rule (L1–18, 199–201) | **retain** | unchanged | exactly the right framing; no change |
| Runtime architecture (L19–23) | **retain** | unchanged | already correctly defers the `WorldBundle` field list to `ARCHITECTURE.md` |
| §World / terrain (L29–37) | **condense** | trim in place | the blood-traces paragraph (plan world-009) is a single plan's implementation note at snapshot-inappropriate detail; cut to 1–2 sentences (mechanism + non-persistence) plus the existing pointers |
| §Settlements / NPCs (L38–52) — the largest section | **move + remove** | NPC decision-architecture content (need-pressure arbitration, `decisionModifiers.ts`, weather/healing pressure, all four Work-Contract phases, the `NpcAgent` refactor lineage, npc-006 navigation/pathfinding bullet) → `state/npc.md`, rewritten as current-state facts with plan-ID narrative stripped. Refactor lineage and per-plan sequencing → **removed entirely** as implementation history (already covered by the 2026-09-03 review and the plans themselves). | Keep ~4–6 sentences: settlement generation/streaming pattern, settlement economy/household ownership, pointer to `settlements.md` and to `npc.md`. **Correct** the stale claim that helper assignment "is not yet part of `SaveData`" — it has persisted since plan persistence-001. Work Contracts content specifically moves to `player-systems.md`'s new subsection (§4 below), not to `npc.md` — `npc.md` gets only discovery/evaluation/execution. |
| §Fauna (L54–65) | **move + remove** | current-state facts → `state/fauna.md`; per-plan narrative and refactor sequencing → **removed** | **Correct** the false claim "no `AnimalAgent` runtime state is [persisted], wild or livestock" — livestock persists in full (`SaveData.livestock`), and this claim directly contradicts `STATE.md`'s own Persistence section in the same file. |
| §Items / player (L68–76) | **replace by pointer** | short snapshot (`Inventory`/`ItemKind`/`HeldTool` ownership, capability-flag system, the shared buildable construction-progress model, liquid containers, freshness) + pointers to `player-systems.md`/`CATALOG.md`/`WEAPONS.md` | nearly everything here is already documented better in `player-systems.md`/`CATALOG.md`; the palisade/torch construction-progress paragraph duplicates `player-systems.md` almost line for line |
| §Quests / progression (L77–79) | **retain** | unchanged, one addition | already appropriately short; add a one-line pointer to `npc.md`'s "two relationship stores" distinction (`NpcRelationships` vs. `QuestManager.relations`) once that section exists |
| §Persistence (L81–83) | **condense** | keep: v6, "a real migration pipeline exists," the write-integrity guard, the "not a full simulation snapshot" statement, + pointers to `persistence.md` and `ARCHITECTURE.md#save-schema` | genuinely current mechanism (not leakage) but denser than a snapshot needs; the five per-migration rationales move to `persistence.md` |
| §UI / input (L85–87) | **condense** | trim the per-screen enumeration; keep the hybrid-Vue architecture statement | Stage 3 flagged no runtime/UI/audio cross-domain seam requiring more than this |
| §Important shared concepts (L89–112) | **retain, with corrections** | fix three stale bullets: `Household` "not in save data" (false since persistence-001); `SettlementEconomy` "persisted since save v12" (a version scheme that no longer exists — replace with "persisted, see `persistence.md`"); `helperAssignment` "not yet part of `SaveData`" (false). **Add:** the buildable `contributeWork` seam, `worldgenCacheDb`, a one-line pointer to `persistence.md`'s classification table. | the most valuable section in the file and the one place its prose length is already justified — do not shorten the correct bullets |
| §Developer tooling (L114–121) | **retain** | unchanged | short, current, genuinely useful for routing |
| §Important code entry points (L123–171) | **condense** | trim to the ~10 true composition-root/shared-primitive entries; defer the rest to `CODE_INDEX.md` | overlaps `CODE_INDEX.md`, which the section already names as the broader lookup |
| §Current architectural seams / active refactors (L173–177) | **condense** | keep genuinely open architectural seams; drop per-plan verification status (that's `plans/README.md`'s job) | **Verify before cutting:** the NPC bullet's "NPC runtime continuity across an ordinary settlement unload/reload remains incomplete" needs re-checking against persistence-001 and the settlement-registry stream-out/in mechanism (`settlements.md`'s S7-adjacent content) — Stage 2/3 confirmed in-session unload/reload already reuses the same registries; this sentence may be describing something narrower (cross-*session* persistence gaps) that should be reworded precisely rather than dropped outright. |
| §Verification state (L179–183) | **retain** | unchanged | correct, short, states the right rule |
| §Not implemented / intentionally deferred (L185–197) | **retain, extend** | add the confirmed gaps: player HP not persisted (A3), non-player food freshness lost on save/load (A4), rats not persisted and not seed-derivable (A6), NPC death has no disposal path (A8), player melee/ranged does not damage NPCs (make explicit rather than only implied via the `combat.md` pointer) | one of the file's most valuable sections; these are exactly the kind of fact that prevents a future agent from re-discovering a limitation the hard way |
| Source of truth rule (L199–201) | **retain** | unchanged | — |

**Target shape after Stage 5:** every "Major systems" subsection is 3–6 sentences plus pointers; "Important shared concepts" and "Not implemented" are the two sections allowed to stay proportionally larger, because they are what actually prevents future mistakes; nothing anywhere names a plan ID as narrative.

---

## 4. Existing state-doc changes

### `combat.md` — minimal change; best-aligned doc in the series

- **Retain:** everything. `07-combat.md` verified every specific claim (mechanisms, function names, file paths) against code with zero discrepancies.
- **Add (two sentences, optional-but-recommended):**
  1. Under "Shared architecture," one sentence noting fauna's *outgoing* attack damage (`faunaCombat.ts`'s flat `DAMAGE_TABLE`/`HUMAN_DAMAGE`) is a structurally separate, older mechanism from the melee/ranged/critical pipeline described in the rest of the document — so the "unified damage entry point" claim isn't read as symmetric across all six attacker/target pairs.
  2. Once `npc.md` exists, add a pointer naming the exact combat→NPC-health handoff (`NpcAgent.takeDamage()`'s one-line `physicalInjury` write) — "combat's responsibility ends here; see `npc.md` for what consumes it."
- **No other changes.** Do not mechanically edit this file just because the audit ran.

### `player-systems.md` — one factual fix, one new subsection, small cross-links

- **Fix:** skill count ("five skills: sneak, survival, traps, defense, archery" → six, add `riding`; mention `ridingSpeedMultiplier`/`ridingStaminaDrainMultiplier`/`mountActions.ts` as its player-side consumers).
- **Add:** a "Work Contracts" subsection — the canonical home for the mechanism (player is employer, pays materials, and shares the `contributeWork` seam directly with NPC execution). Cover: contract lifecycle (`available → advertised → accepted → travelling → working → payment_due → completed`), the frozen commitment-vs.-target-progress split (`WorkContractRecord` never owns the target's actual progress), and the actor-neutral `contributeWork(id, amount)` seam shared by the player's own `[E]` bouts and NPC contract execution. Close with a one-line pointer to `npc.md`'s discovery/evaluation/execution section (own subsection there, not duplicated).
- **Add:** one sentence to "Carry capacity" noting a carried chest's weight (`PlacedContainers.carriedWeightKg()`) also counts toward encumbrance.
- **Add:** short one-line cross-links (not new prose) to `fauna/animalHarvest.ts` (corpse harvest, shared verbatim with Hunter NPCs) and to `world/foodSources.ts`'s NPC-consumption side (so a reader learns the player's own `harvestCrop` is a parallel, not identical, mechanism — see A13, §14).
- **No new document needed.** This is already one of the two best-scoped domain docs.

### `settlements.md` — three stale claims fixed, scope narrowed, content moved out

- **Fix (highest-value, lowest-risk):** three stale `SaveData` claims — S7 ("Runtime NPC ... nie jest w save"), §Gospodarstwa's closing bullet ("`Household`/`household.water` w `SaveData`" listed under "świadomie nie ma"), §Social's `npcRelationships` line ("nie jest jeszcze w `SaveData`"). All three are false since plan persistence-001. When fixing, name all seven persisted NPC fields (`health`/`stamina`/`vigor`/`needs`/`physicalInjury`/`helperAssignment`/`activePlan`), not just the four originally suspected.
- **Fix in parallel:** the two remaining stale per-field doc comments inside `src/settlement/npcState.ts` itself (already tracked in `docs/plans/LOOSE-ENDS.md`) — a source-comment change, not a docs-file change, but should land in the same pass so source and doc stop drifting apart again.
- **Narrow the header scope claim** — "źródło prawdy dla generacji osad i życia NPC *jak jest zaimplementowane*" over-claims relative to the ~11-line §NPC section it actually contains. Narrow to "settlement generation, households, and settlement/household economy," with an explicit forward pointer to `npc.md` for decision-making/needs/strategies/work/combat/social.
- **Move:** §NPC section's decision/schedule/dialogue-entry-point content → `npc.md`. Keep only what's genuinely settlement-owned (household/economy resource ownership, already covered in §Gospodarstwa) + a one-line pointer.
- **Move wholesale:** §Social (conversation/relationships, `ai/socialBehaviour.ts` content) → `npc.md`. It is NPC-behaviour content documented here only because it happened to land in this file when written, not because settlements own it.
- **Add:** a short land-ownership/purchase section (`landOwnership.ts`/`landPurchase.ts`, plan 129, `SaveData.ownedLandPlots`) — currently undocumented in any current-state doc despite being a real, save-persisted, player-facing mechanic.
- **Add:** the `economy/localExchange.ts` claim-seam description, moved here from `STATE.md` prose (it is genuinely settlement/economy-owned code, driven by but not owned by NPC decisions).
- **Add:** one-line cross-references to (a) `player-systems.md`'s lodging section, (b) `fauna.md`'s coverage of `rats.ts` draining household/economy food (once `fauna.md` exists), (c) `water.md`'s "Integracja rzek" section (already documents the river-overlap rejection at settlement site/plot placement — `settlements.md` currently has no pointer to it at all).
- **Do not fix in Stage 5, defer to maintainer (§14):** the Polish/English language inconsistency relative to `combat.md`/`player-systems.md`/`terrain-and-world-generation.md` (English) and `water.md` (Polish). A full rewrite carries real risk of introducing new errors for a purely cosmetic gain.

### `terrain-and-world-generation.md` — one stale line fixed, several real gaps closed

- **Fix (stale in the worst direction — causes future planning errors):** "Weather → NPC/fauna/resource coupling is not implemented" is false. Replace with one sentence naming the actual consumers (`ai/weatherPressure.ts`'s shelter pressure, garden hydration, sleeping-utility condition decay) and a pointer to `npc.md`/`water.md` for detail.
- **Add:** a short subsection (a few lines) on the tile-vs-mesh worker split now that it's real (plan world-terrain-004, commit `16ca5a3c`) — chunk mesh *data* generation runs in the worker pool; only `BufferGeometry`/`Mesh` assembly stays main-thread.
- **Add:** the settlement-driven stage-1 regional leveling (`applyRegionalSmoothing`) alongside the existing road/river stage descriptions — currently readers learn only about stages 2 and 3. Name `settlement/roadNetwork.ts` explicitly as the producer of the corridor waypoints stage 2 consumes (currently unnamed on both the terrain and settlement side).
- **Add:** a two-line pointer to `persistence/worldgenCacheDb.ts` and its one current namespace (`locations-coarse`) — this is exactly the mechanism `CLAUDE.md`'s Determinism rule governs, and it exists in code but in zero domain docs today.
- **Cross-link:** to `state/world-locations.md` once it exists (§8), for the terrain-sampling consumption relationship (`sampleContinentalnessAt`/`sampleFloorAt`/etc. feeding coarse location classification).
- **Related fix, outside this document's own scope but worth flagging for the same Stage 5 pass:** `architecture/GRAPHICS.md`'s G17 entry describes the chunk-mesh worker offload as "docelowy kierunek (niezaimplementowany)" — superseded ~39 minutes after it was written by the same commit that makes the fix above necessary. `GRAPHICS.md` is not in this proposal's primary scope (not listed in the Stage 4 brief's document list), but Stage 5 should apply this correction in the same pass since it's the identical staleness discovered by the same audit.

### `water.md` — remove implementation-history leakage; the rest is accurate

- **Remove:** the "Historia poprawek" section (dated entries 2026-08-07 through 2026-08-25 — issue numbers, phase completions, browser-verification status per entry). This is the single largest concrete instance of implementation-history leakage found in the whole audit series. The durable current-state content ("Standing decisions" W1–W13 table, "Stan obecny" tables, "Rzeki" prose) does not depend on it. Candidate destination: it substantially duplicates plan 098 and issues 001/002/003/009/022/028 already — replace with a short "see plan 098 / issues X/Y/Z for implementation history" pointer.
- **Remove:** the "Wizualny (2026-08-13)" screenshot-diagnosis table (a since-fixed dual-material-water bug diagnosis) — same treatment, smaller scope.
- **Remove:** the completed-work checklist portions of "Kolejność implementacji" (✅-marked phase-completion items referencing plan 098). **Keep** the one still-relevant forward-looking row (P2 §9, "SSR/refrakcja/caustics — nie").
- **Retain, optionally trim later (lower priority):** the "Rzeki" subsection's prose is genuinely current-state but denser than a current-architecture reference needs (e.g. `findBreachPath`'s exact cost-function tie-break ordering reads like an implementation note). Not required for Stage 5; a future trim pass could move algorithm-internal detail into the plan's own implementation notes while keeping the invariants/contracts here.
- **No content needs to move to another document** — `water.md`'s river-integration content is already correctly the canonical home the settlements/terrain docs should point at (see the settlements.md and terrain-and-world-generation.md entries above).
- **Do not fix in Stage 5, defer to maintainer (§14):** same Polish-language question as `settlements.md`.
- **Side effect to verify after the trim:** `docs/state/README.md`'s auto-generated "Covers" column is currently blank for `water.md` (and `settlements.md`) — likely a generator limitation triggered by exactly the prose this trim removes. Re-check after the trim; if still blank, fix the generator per `CLAUDE.md`'s own rule rather than hand-editing the index.

---

## 5. New state-doc specifications

### `docs/state/npc.md`

**Canonical scope:**
- Identity / physical profile (deterministic, unpersisted): `ai/characters.ts::CharacterDef`, `settlement/npcPhysicalProfile.ts::generatePhysicalProfile`, `settlement/families.ts::FamilyMember` as the sole producer of NPC identity data.
- Authoritative runtime state ownership (`NpcAuthoritativeState` in `NpcStateRegistry`) and its persistence status — name all seven fields (`health`/`stamina`/`vigor`/`needs`/`physicalInjury`/`helperAssignment`/`activePlan`) and what is deliberately excluded (`phase`/`pendingAction`/pathfinding/`combatIntent`/`carried`, reset on every reconstruction).
- The full decision pipeline: three independent pressure producers (`Needs.ts`, `weatherPressure.ts`, `healingPressure.ts`) → one `pickActionKind` arbitration → the fixed-priority sequencing table (`npcDecision.ts`) → strategy selection (`npcStrategies.ts`, "first-available-wins," explicitly not a scoring engine) → action construction → execution → state change. Include the deliberately-asymmetric interrupt precedence (`shouldInterruptAction`, "the two precedences ... are not meant to agree").
- The persistent Plan layer (`npcPlan.ts`) as a structurally separate, third composable layer (Goal/Plan vs. Strategy vs. Action — three types, three different lifetimes).
- Profession-work dispatch (`npcProfessionWork.ts`, per-`Role` pure planners).
- Work-contract **evaluation** only (`ai/npcWorkContract.ts`'s scoring, `NpcAgent`'s discovery/accept/drive state machine) — the commitment record itself is `player-systems.md`'s (§4 above); this section should open with a one-line pointer there.
- Combat/animal-threat glue (`npcAnimalThreat.ts`) and the combat→NPC-health handoff — name the exact seam (`NpcAgent.takeDamage()`'s one-line `physicalInjury` write) explicitly, matching the pointer added to `combat.md`.
- Social/conversation (`ai/socialBehaviour.ts`, moved here from `settlements.md`'s §Social) and the two-relationship-store distinction (`NpcRelationships`, NPC↔NPC by id pair, vs. `QuestManager.relations`, player↔NPC by name) — state plainly that these share only vocabulary, not implementation.
- A short "Dialogue, quests, and relationships" section: the three-way dialogue-content split (flavor lines / topic menu / quest overrides) and their priority order; a short quest-mechanics pointer to `QuestManager.ts`/`quests.ts` directly (quest *content* — the `QUESTS` array — is data, not architecture, and stays out of this doc).
- One worked example of the shared `simulation/{PlannedAction,ActionLifecycle,DecisionContext,ScoredAction}` contracts — this domain has the richest one (three independent pressure producers competing through `pickActionKind`); `fauna.md` cross-links rather than repeating it.
- Movement/pathfinding (moved from `STATE.md`'s current npc-006 bullet): `NpcAgent.steerTo()`'s straight-line-plus-skirt default, the bounded local-grid A* fallback on stuck/blocked, shared `navigation/navigation.ts` module. Note the reverse-direction exception where `fauna/AnimalAgent.ts` imports `ai/npcMovementWatchdog.ts` directly — the one confirmed break in the otherwise hooks-only cross-domain convention — with a cross-link from `fauna.md`.
- A short note on the `@domain`/`@system` JSDoc convention and its application (or current lack of it) to `settlement/npcState.ts`/`npcRelationships.ts`/`npcPhysicalProfile.ts` — these are authoritative NPC state physically hosted in `src/settlement/`, consumed near-exclusively by `src/ai/`.

**Explicitly not:** settlement generation, `Household`/`SettlementEconomy` internals (→ `settlements.md`), fauna hook *shapes* or `AnimalAgent` internals (→ `fauna.md`, this doc only covers *consumption*), combat resolver internals (→ `combat.md`), the work-contract commitment record (→ `player-systems.md`), quest content data itself.

### `docs/state/fauna.md`

**Canonical scope:**
- `AnimalDef`/`AnimalKind` species-data convention, including the "presence of the field is the capability" pattern (`mount`, `production`, `scavenging`, `diet`, `water`, `roaming`, `trips`).
- Individual runtime state ownership (`AnimalAgent` instance fields — no separate authoritative-state object the way NPC has `NpcAuthoritativeState`).
- The **four-tier** persistence picture, stated explicitly as four tiers, not three: (1) livestock — fully persisted, requires an explicit `capture()` step since no live object survives a settlement unload; (2) spawner FSM/lifecycle — persisted, thin (excludes anything deterministic); (3) wild fauna individuals — never persisted, population deterministically re-spawns, no individual history survives; (4) rats — neither persisted nor seed-derivable, a live formula reconciled from zero every load (this is the one category that fits none of the other three cleanly).
- Corpse/decay/rabies lifecycle (`fresh → rotting → bones → removed`, the two-vector rabies transmission, the deliberate `frenzied`/`rabid` independence).
- Livestock and rats as the two settlement-adjacent fauna categories, each with a one-line pointer to `settlements.md` for their settlement-side half (ownership, food-drain consumption).
- The two-tier behaviour pipeline (`FAUNA_BEHAVIOUR_PRIORITY` fixed-priority threat/social-override table on top; ad hoc hunger/thirst-seeking logic inside the `predator-normal`/`prey-normal` catch-alls underneath), with an explicit contrast against NPC's unified three-producer pressure competition — these are genuinely different shapes and should not be described as parallel without the distinction.
- What fauna **exposes** to other domains, as its own "surface for other domains" section: the three read-only threat accessors (`isThreateningHuman()`, `npcAttackTarget`, `isHuntingLive`), `SettlementHuntingHooks`' exact contract (including the seeded single-individual population-protection roll), `combatTargetForAnimal()`.
- The `ai/npcMovementWatchdog.ts` reverse-direction import — the one confirmed exception to the hooks-only cross-domain convention — as a deliberate-reuse callout, cross-linked from `npc.md`.
- Ecosystem consequences: `GrassForageService` (shared verbatim by wild fauna and livestock, atomic `consume()`), river/road spawn-clearance gating (reusing terrain/settlement geometry, no second representation), corpse→ecosystem effects (rot stamina drain, rabies corpse-vector).

**Cross-link, don't duplicate:** `water.md` for water-traversal ownership (`sampleLocalWater`, `waterTraversal.ts`'s classifier), `combat.md` for the shared damage/critical/defense pipeline (and the outgoing-damage asymmetry, cross-linked back), `npc.md` for how the Hunter/Farmer/threat-response *consumes* fauna's exposed surface, `settlements.md` for livestock/rats' settlement-side ownership.

**Explicitly not:** NPC decision-consumption logic, settlement economy internals, terrain-generation internals beyond the sampling surface fauna consumes.

### `docs/state/persistence.md`

**Canonical scope:**
- The five-way classification (persisted authoritative / persisted delta-over-deterministic-base / deterministic reconstruction / runtime authoritative / derived-cache) as **the** canonical reference other docs point at, with the full domain-by-domain table (`08-persistence.md` §3 is the ready-made source). This becomes the single place a future domain doc checks persistence status against, instead of each domain doc keeping its own driftable partial copy — precisely the failure mode that produced three stale `settlements.md` claims from one missed update.
- Restore-as-construction: no domain has a two-phase "construct, then apply save values" restore; every system's constructor accepts its restored state directly.
- The shared save/rebuild snapshot mechanism: `rebuildWorldBundle()` and `createWorldBundle()` share the same constructor-parameter shapes and the same `snapshot*` methods `buildSaveData()` itself calls — this is what structurally prevents "what survives a save" and "what survives a `WorldBundle` rebuild" from drifting apart.
- The migration pipeline's *contract*, not a per-migration changelog: one pure `(data) => data` step per source version, chained via `structuredClone`, fails closed on a missing/throwing step. The five current migrations may be listed by version/one-line-purpose (condensed from `STATE.md`'s current prose), but the plan-ID-narrated rationale for each stays in the plans, not here.
- Validate-on-write (not only read) and the write-time integrity guard (refuses to overwrite an existing slot whose current record fails to parse).
- The four-way slot-status model (`ok`/`invalid`/`migration-failed`/`unsupported-version`) and why simple callers collapse it to `[]`/`null` while lifecycle-decision callers use the result-typed variant.
- The worldgen-cache separation: `(seed, namespace, version, fingerprint) → payload`, a structurally distinct versioning concept from `SaveData.version`, never a correctness dependency, never referenced from `SaveData`'s type. State explicitly that this is the mechanism `CLAUDE.md`'s Determinism rule governs, and that today it applies to exactly one namespace (`locations-coarse`) — core terrain/hydrology generation itself has no persistent cache.
- The known gaps, stated as gaps (not silently fixed in prose): player HP unpersisted (A3), household/settlement-economy/chest food loses freshness batches on save/load (A4), rats neither persisted nor seed-derivable (A6, cross-linked from `fauna.md`'s four-tier picture).

**Ownership relationship (unchanged direction, corrected content):** `STATE.md` → short pointer (already the right shape, target content just needs fixing). `ARCHITECTURE.md#save-schema` → keeps the authoritative field list, gains a pointer to `persistence.md` for the taxonomy/invariants, loses the stale v1 narrative (§6). `persistence.md` → the third, deeper layer underneath both — the taxonomy and invariants, not a restated field list.

**Not:** a field-by-field `SaveData` schema dump (that stays `ARCHITECTURE.md`'s job); a per-plan migration history for its own sake.

---

## 6. `ARCHITECTURE.md` and `CLAUDE.md` reconciliation

### `ARCHITECTURE.md`

This is the single largest doc/code mismatch found in the entire audit series (Stage 2 §5 row 1, Stage 3 §12 finding 1).

- **Rewrite the "Persistence"/"Save schema" section.** Replace the "`SaveData` is a single-contract schema with no migration/compatibility story... Current schema version: v1" framing with the current picture: `CURRENT_SAVE_VERSION = 6`, a real five-step migration pipeline (plan persistence-003), the persistence-002 write-integrity guard, the persistence-004 slot-status layer. `STATE.md`'s own Persistence prose is accurate at this baseline and can be condensed/reused as the rewrite's source (after `STATE.md` itself is condensed per §3, coordinate so neither copy goes stale relative to the other — see the "single canonical field list" note below).
- **Add** `db.ts`/`seedDb.ts`/`seedRecord.ts`/`worldgenCacheDb.ts` to the persistence module list — currently only `saveState.ts`/`saveData.ts`/`saveDb.ts` are named, despite all four living in the same directory and sharing the same IndexedDB database. Note explicitly that `worldgenCacheDb.ts` and `seedDb.ts`/`seedRecord.ts` are structurally outside `SaveData` (never required to load a save; never a correctness dependency).
- **Verify before rewriting:** the "map schema v11" claim (§"Save schema") has no trace anywhere in current `src/world/map/*.ts` or in `saveData.ts`'s `SaveMap`/`SaveLocationKnowledge` types. Run `git log -p` on `SaveMap`/`mapConfig.ts` to distinguish stale-by-removal from never-accurate before finalizing the rewrite — do not silently drop the claim without checking which case it is (the finding itself belongs either way; the wording of the correction depends on the answer).
- **Ownership decision:** the detailed save-schema field list stays canonical in `ARCHITECTURE.md` (Stage 3's own analysis confirms the `STATE.md → ARCHITECTURE.md` pointer *direction* is already correct — only the target content is stale). The *taxonomy* (five-way classification, the four cross-domain invariants, the known gaps) moves to `persistence.md` as the deeper layer. `ARCHITECTURE.md`'s own prose should be trimmed to: a short mechanism summary + the field list + a pointer to `persistence.md` for "why," rather than narrating migration rationale inline the way it currently narrates v1's absence.
- **Minimize duplication of the version number itself** (per the audit brief's explicit instruction): `CURRENT_SAVE_VERSION`'s value should appear as a stated fact in exactly one place per document (`ARCHITECTURE.md` for the schema, `persistence.md` if it needs to restate it for the taxonomy) — never restate a specific number in `STATE.md` or `CLAUDE.md`; those should say "see `ARCHITECTURE.md#save-schema`" instead. This is precisely what let `CLAUDE.md`'s copy go stale independently.

### `CLAUDE.md`

The audit found exactly one stale line here (Stage 2 §5 row 3, Stage 3 §12 finding 1): "Architecture invariants" → "Persistence uses `CURRENT_SAVE_VERSION` (`src/persistence/saveData.ts`, currently `1`)...".

- **Minimal fix:** remove the restated number entirely. Replace with a pointer: *"Persistence uses `CURRENT_SAVE_VERSION` (`src/persistence/saveData.ts`) with a real migration pipeline — see `docs/state/persistence.md` for the taxonomy and `ARCHITECTURE.md#save-schema` for the field list. Bump the version and add a migration only when the persisted representation or semantics actually change."* This both fixes the immediate staleness and prevents the same drift from recurring, per the instruction "Jeżeli szczegół można zastąpić pointerem do canonical doc, preferuj pointer."
- **No other change needed.** `CLAUDE.md`'s job is helping an agent navigate the repository, not restating architecture — the rest of the file already does this correctly (it points to `STATE.md`/`ARCHITECTURE.md` rather than duplicating their content).

---

## 7. Implementation gaps vs. documentation gaps

Stage 5 documents the current state as it is. None of the rows below authorize a gameplay-code change; several explicitly route to a maintainer decision instead.

| Finding | Type | Documentation action | Gameplay follow-up |
|---|---|---|---|
| Player melee/ranged cannot damage an NPC (A1) | intentional current architecture | already correctly documented in `combat.md`'s "Not implemented" line — no change needed | none; any future player-vs-NPC combat plan must also resolve the NPC-corpse question (A8) first |
| Fauna outgoing attacks use a flat damage table, bypassing the shared critical/defense pipeline (A2) | likely implementation gap presenting as an older parallel mechanism | add one clarifying sentence to `combat.md` (§4 above); document the asymmetry explicitly in `fauna.md` | maintainer decision needed before any rebalancing plan: deliberate simplification (fauna has no `DefenseConfig`/carried items — the *defense* half is principled) or an unmigrated older system (the *critical-roll* half is not obviously principled) |
| Player HP is not persisted (A3) | likely implementation gap | state explicitly in `persistence.md` and in `STATE.md`'s "Not implemented" list | maintainer decision: persist it (one field, one migration) or add a comment declaring the choice deliberate, mirroring stamina's own "short-term, not worth persisting" comment |
| Household/settlement-economy/chest food loses freshness-batch anchors on save/load (A4) | likely implementation gap | state explicitly in `persistence.md` and `STATE.md`'s "Not implemented" list | maintainer decision: extend `foodBatchesToJSON()`-equivalent tracking to `Household`/`SettlementEconomy`/`PlacedContainerEntry`, or document the loss as accepted |
| Wild fauna individuals unpersisted, no reconstruction guarantee (A5) | accepted reconstruction model, documented as a limitation | document as the fourth of the four persistence tiers in `fauna.md`; cross-link from `persistence.md` | none required; note explicitly that `AnimalSaveState`/`snapshot()`/`hydrate()` already exist generically on the class — a future "persist a tracked quest animal" feature needs a call site, not new infrastructure |
| Rats neither persisted nor seed-derivable (A6) | intentional current architecture; documentation gap | document as a distinct fourth persistence shape in `fauna.md` (not a subset of "wild fauna unpersisted" — even the population count isn't reproducible from `(seed, elapsedDays)`) | none |
| NPC death has no disposal path (A8) | documented limitation, not a persistence omission (there is no well-defined runtime end-state to persist) | keep as a stated limitation in `npc.md`; cross-link from `combat.md` and from any future A1-adjacent work | flag as a prerequisite for any future feature touching NPC death (loot, funerals, population effects, "kill an NPC" quest objectives, or A1 itself) — no plan created here |
| Land ownership uses a flat top-level `SaveData` field instead of the `initial*`/`snapshot*` idiom every other settlement registry uses (A12) | architecture asymmetry, style-only (verified: no correctness or drift risk) | note as a stated inconsistency in `settlements.md`/`persistence.md` | low-priority future refactor question, not an audit action item |
| `ARCHITECTURE.md` says v1/no-migrations; code is v6 with five migrations | documentation gap (largest in the series) | fixed by §6 above | none |
| `CLAUDE.md` repeats the stale "currently `1`" | documentation gap | fixed by §6 above | none |
| Player's own crop-harvest path (`ChunkManager.harvestCrop`/`findNearestGarden`) duplicates only the yield math, not the target search NPCs use via `world/foodSources.ts` (A13) | unclear, requires investigation | document the duplication explicitly with a cross-link in `player-systems.md` and `npc.md` | maintainer decision: unify the search path, or confirm the duplication is correct given the player aims and an NPC searches |
| `Math.random()` in fauna movement-target search vs. deterministic hashed rolls elsewhere in the same class (A14) | unclear, requires investigation | document the current boundary and its rationale (safe because wild-fauna state is never persisted, per A5) explicitly in `fauna.md` | maintainer should state the policy explicitly ("only population-affecting or persisted-adjacent decisions need determinism") rather than leaving it implicit; revisit if A5 ever changes |
| `@domain`/`@system` JSDoc convention exists (`rats.ts`, `lodging.ts`) but is itself undocumented, and is missing from `settlement/npcState.ts`/`npcRelationships.ts`/`npcPhysicalProfile.ts` — the clearest untagged cases of "physical directory ≠ logical domain" in the repo | documentation gap + minor source-comment change | document the convention itself (in `npc.md` and/or `CLAUDE.md`); the three missing tags are a trivial, low-risk source-comment addition Stage 5 (or a fast follow-up) can apply alongside the doc work | none beyond the tag addition |
| Persistent worldgen cache absent from every domain doc and from `ARCHITECTURE.md`'s module list | documentation gap | fixed by §4 (terrain doc) and §6 (`ARCHITECTURE.md`) above | none |

---

## 8. World locations / discovery / map decision

**Decision: create a short, bounded `docs/state/world-locations.md` (option B from the audit brief).**

Reasoning:

- The domain is real and currently owned by no document: `WorldLocationCatalog`, `locationDiscovery.ts`, `locationKnowledge.ts`, `navigationTargets.ts` (`world/locations/`) and `MapData`/`MapDiscovery`/`MapProjection` (`world/map/`) — roughly 15 files, none covered beyond two one-line `STATE.md` bullets.
- It has genuine save-persisted state (`SaveData.map.{discoveredCells,discoveredLocations,targets}`) and its own dedicated persistent worldgen-cache namespace (`locations-coarse`, the only current namespace in `worldgenCacheDb.ts`) — this is exactly the kind of "real, substantial, current" content `docs/state/README.md`'s own admission bar asks for, and it meets the size threshold `state/README.md` implicitly sets by comparison (`combat.md` documents 14 files; this domain has ~15).
- It does **not**, however, belong inside `terrain-and-world-generation.md` as a subsection (option A): terrain generation is a pure, unpersisted deterministic layer, while location discovery/fog-of-war/travel targets are genuinely persisted player-progression state consuming terrain as an input — folding it into the terrain doc would misrepresent its ownership shape the same way `settlements.md` currently over-claims NPC-life scope.
- A bare `STATE.md` paragraph (option C) would recreate exactly the "undocumented 15-file domain leaks into `STATE.md` prose" failure mode this whole audit exists to fix, for a domain that (unlike runtime/UI/audio, §9) does have real ownership, real persisted state, and a real cache-versioning concern worth stating once.

**Canonical scope for `docs/state/world-locations.md`:**
- `WorldLocationCatalog` as the coarse-classification consumer of terrain sampling (`sampleContinentalnessAt`/`sampleFloorAt`/`sampleHeightAt`/`sampleMountainRidgeAt`, `terrainClassification.ts`) for lake/mountain-peak/cemetery-type siting — cross-linked from, not duplicated in, `terrain-and-world-generation.md`.
- The `locations-coarse` persistent worldgen-cache namespace and its version/fingerprint mechanism, as a concrete worked example of `persistence.md`'s worldgen-cache-separation section.
- `MapDiscovery`/Fog of War, `LocationKnowledge`/discovery state, `NavigationTargets`/active travel targets — the player-facing progression layer, and how it differs from `MapData`'s pure projection.
- Persistence status: `SaveData.map.{discoveredCells,discoveredLocations,targets}` (persisted authoritative knowledge) vs. deterministic position/name/weight of a location itself (always re-derived from `(world seed, location id)` — never persisted).

**Priority relative to the other two new docs:** lowest of the three creates. `npc.md`, `fauna.md`, and `persistence.md` fix demonstrably higher-consequence problems (self-contradiction, the two largest undocumented domains, the largest doc/code mismatch). This one closes a real gap but blocks nothing else — Stage 5 can defer it to a later pass without leaving any other fix half-done, as long as `terrain-and-world-generation.md`'s own new content doesn't silently claim ownership of it in the meantime (see §4's cross-link note, which points forward rather than absorbing the content).

---

## 9. Runtime / UI / audio decision

**Decision: do not create `09-runtime-ui-audio.md` or any `docs/state/runtime-ui-audio.md`.**

Stage 1 flagged this as optional/low-priority pending Stage 1 review; Stage 2 was never run for it; Stage 3's synthesis pass — which had visibility into every cross-domain seam discovered across all seven domain audits — found no seam that requires a dedicated current-state doc to explain. The existing architecture-level documents (`ARCHITECTURE.md`'s composition/lifecycle sections, `GRAPHICS.md`'s shader/visual contracts, `performance-and-workers.md`'s worker/perf model) already track this layer adequately for a "thin facade over every gameplay domain, by design" system. `STATE.md`'s existing §UI/input section (condensed per §3 above) is sufficient for the current-state-snapshot purpose.

This confirms Stage 3's own recommendation rather than re-deriving it — no additional recon was performed to reach this conclusion, per the audit brief's instruction not to do extra work solely to justify a non-decision.

---

## 10. Species physical reference treatment

`docs/world/species-physical-reference.md` (SPEA — strength/agility/perception/endurance) stays exactly where it is, in `docs/world/`, **not** `docs/state/`. Stage 3 verified directly: no `SPEA` identifier exists anywhere in `src/`, no `strength`/`agility`/`perception`/`endurance` field exists on `AnimalDef` or `PhysicalProfile`, and the document's own §7/§8/§11 already frame it correctly as a future-implementation design reference that must not be read as describing current `MAX_HP`/`DAMAGE_TABLE`/speed/detection-range values.

**How `npc.md` and `fauna.md` should reference it:** a single explicit sentence each, at the point where the doc discusses the implemented-today physical layer (`settlement/npcPhysicalProfile.ts`'s deterministic HP/stamina/vigor from sex + `LifeStage`, and `AnimalAgent`'s per-species `MAX_HP`/`DAMAGE_TABLE`/speed/detect-range tables) — something in the shape of *"a future SPEA layer (`docs/world/species-physical-reference.md`) is planned to extend this; it is a design reference, not implemented state, and must not be read as describing current values."* Do not describe SPEA's contents, fields, or design in either state doc — that would duplicate the reference document and risk the two drifting apart. The reference document's own existing pointer discipline (§11: reference first, then migrate consumers through focused plans) should not be second-guessed by the state docs.

---

## 11. Target documentation graph

```text
STATE.md  (concise snapshot — pointers only, no per-plan narrative)
  → state/README.md  (index; accurate scope per document)
      → state/terrain-and-world-generation.md
      → state/water.md
      → state/world-locations.md            [new, §8 — cross-links to terrain-and-world-generation.md]
      → state/settlements.md                [cross-links: npc.md, water.md, fauna.md, persistence.md]
      → state/npc.md                        [new, §5 — cross-links: settlements.md, fauna.md, combat.md, persistence.md]
      → state/fauna.md                      [new, §5 — cross-links: settlements.md, npc.md, water.md, combat.md, persistence.md]
      → state/player-systems.md             [gains: Work Contracts subsection — cross-link to npc.md]
      → state/combat.md                     [cross-links: npc.md (physicalInjury handoff), fauna.md (outgoing-damage asymmetry)]
      → state/persistence.md                [new, §5 — the canonical classification table every domain doc's persistence-status claim should point at instead of restating]

specialized canonical references (unchanged locations):
  → items/CATALOG.md
  → items/WEAPONS.md
  → world/species-physical-reference.md     [design reference only — cross-linked, not absorbed, from npc.md/fauna.md]
  → architecture/ARCHITECTURE.md            [save-schema field list stays here; taxonomy/invariants move to persistence.md]
  → architecture/GRAPHICS.md                [one stale G17 entry to fix alongside terrain-and-world-generation.md, §4]
  → architecture/performance-and-workers.md [unchanged]

CLAUDE.md — one corrected pointer (§6), otherwise unchanged; points into this graph, never restates it
```

The one deliberate cycle-avoidance rule this graph encodes: **`persistence.md` is the only place the five-way classification table is written out in full.** Every domain doc (`settlements.md`, `npc.md`, `fauna.md`, `player-systems.md`, `terrain-and-world-generation.md`) states its own domain's persistence status as a fact, cross-linked to `persistence.md` for the taxonomy — never restating the full classification model itself. This is the single change most directly aimed at preventing the exact failure mode Stage 2/3 found three separate times (three stale `settlements.md` claims traced to one missed persistence-001 update).

---

## 12. Stage 5 execution order

Ordered to minimize the window in which any document points at content that doesn't exist yet.

**1. Create the new canonical state docs** (no edits to existing docs yet — these can be written purely from Stage 2 findings + targeted code checks where a Stage 2 audit already did the verification):
   - `docs/state/npc.md`
   - `docs/state/fauna.md`
   - `docs/state/persistence.md`
   - `docs/state/world-locations.md` (lowest priority of the four — may slip to a later pass without blocking anything else, per §8)

**2. Update the existing deep state docs** — now that `npc.md`/`fauna.md`/`persistence.md` exist, these can move content into them and add real (non-dangling) cross-links:
   - `docs/state/settlements.md` — fix three stale persistence claims, narrow scope, move §NPC/§Social content out, add land-ownership section, add cross-links (§4)
   - `docs/state/water.md` — remove the three history sections (§4)
   - `docs/state/terrain-and-world-generation.md` — fix the stale weather line, add worker-split/stage-1-leveling/roadNetwork-producer/worldgen-cache content, cross-link to `world-locations.md` if it exists yet (§4)
   - `docs/state/player-systems.md` — fix skill count, add Work Contracts subsection, add small cross-links (§4)
   - `docs/state/combat.md` — add the two clarifying sentences, including the `npc.md` pointer (§4)
   - `docs/architecture/GRAPHICS.md` — fix the stale G17 entry (related fix, same pass as terrain doc)

**3. Persistence / architecture reconciliation:**
   - `git log -p` check on `SaveMap`/`mapConfig.ts` to resolve the "map schema v11" open question (§6)
   - Rewrite `docs/architecture/ARCHITECTURE.md`'s "Persistence"/"Save schema" section (§6)

**4. Rebuild `docs/STATE.md`** per the section-by-section table in §3 — done after steps 1–3 so every pointer it adds (to `npc.md`, `fauna.md`, `persistence.md`, the corrected `ARCHITECTURE.md` section) resolves to real, already-current content rather than a stub.

**5. Update `docs/state/README.md`** — add index rows for `npc.md`/`fauna.md`/`persistence.md`/`world-locations.md` with accurate scope descriptions; re-check whether the auto-generated "Covers" column now populates for `settlements.md`/`water.md` now that their prose is trimmed (§4's water.md note) — if still blank, fix the generator rather than hand-editing, per `CLAUDE.md`'s own rule.

**6. Minimal `CLAUDE.md` update** — replace the stale persistence-version line with the pointer described in §6.

**7. Final cross-link consistency pass** — read through every touched document and confirm: every new pointer resolves to a real heading; the save-version number appears in exactly one place (`ARCHITECTURE.md`); no domain doc restates the five-way persistence classification instead of pointing at `persistence.md`; `STATE.md` reads as a snapshot with no plan-ID narrative remaining anywhere in it. Do not run `pnpm docs:sync` — code-map generation is handled by the CI workflow, not this pass.

---

## 13. Acceptance criteria for Stage 5

Restated from the audit brief, confirmed unchanged by this proposal, plus the explicit decisions this document adds:

- `docs/STATE.md` reads as a concise, trustworthy current snapshot — no plan-by-plan implementation history anywhere in it.
- No known internal persistence contradictions remain (the `Household`/fauna/`helperAssignment`/`save v12` self-contradictions inside `STATE.md`, and the three matching stale claims in `settlements.md`, are all fixed).
- Canonical ownership exists for every important system named in §2's table — one canonical document per topic, short cross-links from consumers.
- `npc.md`, `fauna.md`, and `persistence.md` exist, scoped per §5, and do not duplicate settlements/player/combat content.
- `world-locations.md` exists (§8) with an explicit, non-deferred scope — or, if the maintainer overrides the §8 decision, an explicit alternative placement is recorded rather than the topic falling through the cracks again.
- No `runtime-ui-audio.md` is created (§9) — confirmed explicitly, not silently omitted.
- Existing accurate docs (`combat.md`, most of `player-systems.md`, most of `terrain-and-world-generation.md`, `water.md`'s "Stan obecny"/"Rzeki" content, `settlements.md`'s generation/economy/household content) are preserved rather than unnecessarily rewritten.
- Important cross-domain seams (the buildable `contributeWork` seam, the worldgen cache, the `physicalInjury` handoff, the two independent relationship stores, the fauna threat-accessor contract) are each documented once, with cross-links, not duplicated or left undocumented.
- Implementation gaps (§7's table) are documented as current limitations in the appropriate state doc — none of them is silently "fixed" in prose, and none triggers a gameplay-code change from this pass.
- Design references (`species-physical-reference.md`) are clearly separated from implemented state, per §10 — cross-linked, not absorbed or duplicated.
- `state/README.md` accurately indexes the final structure, including the three-or-four new documents.
- `CLAUDE.md` points to canonical truth (a pointer to `persistence.md`/`ARCHITECTURE.md`) instead of duplicating a volatile implementation detail (the save-schema version number) — confirmed as the specific, minimal fix in §6, not a broader `CLAUDE.md` rewrite.

---

## 14. Open questions

Routed to the maintainer rather than resolved here, per the audit brief's instruction not to mix documentation fixes with gameplay or architectural judgment calls:

- **A2 — is fauna's flat outgoing-damage table a deliberate simplification or an unmigrated older system?** Determines whether `combat.md` keeps its one clarifying sentence as the full treatment, or eventually gains a "known gap" entry pointing at a future rebalancing plan.
- **A3 — should player HP be persisted?** One field, one migration, if yes; otherwise a comment declaring the omission deliberate (mirroring stamina's own comment) is the minimum fix either way needs to not silently regress again.
- **A4 — should food-freshness batch persistence extend to `Household`/`SettlementEconomy`/placed containers?** Plan settlements-npcs-014 went to real trouble to preserve freshness batches through in-session transfers; a save/load currently discards exactly what that plan preserved. Worth a deliberate call, not silent divergence.
- **A13 — is the player's own `harvestCrop` duplication of `world/foodSources.ts`'s target-search logic correct** (the player aims, an NPC searches) or should it be unified?
- **A14 — should the `Math.random()`-vs-seeded-roll boundary in fauna movement be a stated policy** ("only population-affecting or persisted-adjacent decisions need determinism")? Currently internally consistent only because wild-fauna state is unpersisted (A5) — if A5 ever changes, this becomes a real determinism question rather than a documentation nicety.
- **Should `settlement/npcState.ts`, `npcRelationships.ts`, `npcPhysicalProfile.ts` (and, by the same logic, `livestock.ts`/`rats.ts`) move out of `src/settlement/` into their logically-owning directories**, or does adding the `@domain`/`@system` JSDoc tag (§7) make the physical location moot? Three separate Stage 2 audits raised this independently and each deferred it — recommend deciding it once, as one convention, rather than three one-off calls, and independently of the documentation work in this proposal.
- **Should `settlements.md` and `water.md` be translated to English** for consistency with `combat.md`/`player-systems.md`/`terrain-and-world-generation.md` and the three new docs this proposal creates (which should be English, matching the majority)? A full rewrite of two large, accurate, technically dense documents carries real risk of introducing new errors for a cosmetic gain — explicitly not part of this proposal's Stage 5 scope.
- **Is `AnimalAgent.ts` (4,861 lines) or `NpcAgent.ts` (4,654 lines, back up from ~4,315 after the 2026-09-03/04 refactor) due for another module-extraction pass?** Not a documentation question — flagged only because both Stage 2 audits independently noticed the trend and it would materially affect how `npc.md`/`fauna.md` describe "the coordination class" if a future refactor changes the shape.
- **Confirm the §8 decision to create `world-locations.md`** rather than folding the content into `terrain-and-world-generation.md` (option A) or leaving it as `STATE.md` bullets (option C) — this proposal makes an explicit call with reasoning, but it is the one new-document decision in this proposal not already independently supported by two Stage 2 audits the way `npc.md`/`fauna.md`/`persistence.md` are, so it is the most appropriate one to have the maintainer sanity-check before Stage 5 executes it.

---

Nothing above authorizes a gameplay-code change. Stage 5 begins only after this proposal (or a maintainer-adjusted version of it) is accepted.
