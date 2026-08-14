# Architecture Alignment Review

**Status:** `done`
**Date:** 2026-08-14
**Scope:** whole codebase, evaluated against `docs/roadmap/02-systems-fixed.md` (accepted Session 2 architecture decisions), `docs/VISION.md`, `docs/STATE.md`, `docs/plans/README.md`, `docs/research/README.md`, `CLAUDE.md`.
**Prompt:** [docs/prompts/2026-08-14--002--architecture-alignment-review.md](../prompts/2026-08-14--002--architecture-alignment-review.md)
**Method:** 7 parallel research passes (one per prompt section group), each reading the actual code (not just docs) and reporting A/Current, B/Target, C/Gap, D/Severity, E/Action per finding. This document synthesizes and deduplicates those passes.

---

## 1. Executive summary

**Seedvale is on the right architectural path.** No finding in this review reached 🔴 (architecture blocker). The codebase consistently follows the target's core discipline — small system-owned state, explicit dependencies, no central `WorldState`/`WorldEventManager`/`SimulationManager`, actions gating world mutation — even in places the target document doesn't require it yet.

The gaps found are real but narrow:

- **`WorldContext` doesn't exist as a type.** Its ingredients (seed, day/night, terrain sampling) are already small and singly-owned, but every new system threads them through long positional-parameter constructors and ad-hoc sampler-adapter objects instead of one shared object. Not urgent today; becomes worth fixing before the next system that needs terrain+time context (plan 069 is that system).
- **Persistence has a real, growing hole.** NPC runtime state, `SettlementEconomy` stock, and `ResourceDeposits` depletion all reset on reload. Nothing currently depends on that continuity, so it's not a blocker — but plan 069 (household resources) is about to put real player-visible stakes behind exactly this gap.
- **The shared NPC/fauna decision-scoring primitive (`pickHighestScore`/`ScoredAction`, plan 055) is only actually used by fauna.** NPC decisions still run a bespoke, parallel `pickNeed()`. This is an unfinished migration, not a bad decision — but it's the seam that will hurt once problems/goals are added to NPC decision-making.
- **A few isolated loops**: merchant trade (Kasia) never touches `SettlementEconomy`; farmer/fisher/miner production is an intentional empty-output placeholder; NPC↔NPC relationships don't exist yet (only player↔NPC quest standing and static family-role tags).

None of these require a redesign. All have a small, targeted fix, several of which are best sequenced immediately before or alongside plan 069.

## 2. Architecture target (summary of `02-systems-fixed.md`)

- Hybrid architecture: small shared `WorldContext` (time/environment/seed) + system-owned state, no God Object.
- No mandatory simulation unit — NPC, household, settlement, work group, wildlife population all valid depending on context; detail may vary with relevance/distance (hybrid simulation), never losing consequences silently.
- NPC owns individual state; Household/Family owns shared economic concerns; not every NPC needs a household; NPCs must not become mini-economies.
- Settlement is a full simulation system whose goals create *pressure/opportunity* for NPCs, not commands.
- Needs / problems / goals are conceptually distinct but may share a common pressure/priority evaluation mechanism.
- Economy: `actor → action → time+resource consumption → good → storage/transport → further use`; production should not appear from nothing.
- World changes should flow through actions, not ad-hoc direct mutation.
- Events: hybrid — direct dependencies + shared event contracts; no mandatory central event manager.
- Relationships start narrow (NPC↔NPC), history/memory is selective, not exhaustive.
- Environment/ecosystem feedback loops should be deliberate and meaningful, not universal; full ecology is explicitly not required.
- Time: different systems may run at different frequencies; no universal tick is mandated.
- Persistence should cover the continuing world, not only the player, once systems depend on that continuity.
- Player, NPC, quest and dialogue should share the same world primitives where practical.

## 3. Current architecture — system map and ownership

| System | Owns | Notes |
|---|---|---|
| `WorldBundle` (`src/app/worldBundle.ts`) | Lifecycle/rebuild boundary only | Groups `ChunkManager`, ocean, `SettlementsManager`, fauna, item spawners, deposits, dropped items, fires, tents, caves. Disposes/reassigns fields in place; never reaches into member internals. |
| `config: WorldConfig` / `dayNight: DayNightState` | Seed, terrain/sky config / time-of-day, elapsed days | Each has exactly one owner, no duplicated copies found anywhere in `src/`. Together these are the *ingredients* of a `WorldContext` that doesn't exist as a consolidated type yet. |
| `ChunkManager` | Terrain sampling, streaming, water/grass tick, dig/level overlay, colliders, roads | Large (~1300 lines, ~25 public members) but single-domain — broad surface, not mixed responsibility. |
| `SettlementsManager` / `Settlement` | Settlement streaming (load/unload by distance), per-settlement NPCs, economy, landmarks | Deliberately exposes read data (`npcs`, `landmarks`, `economy`, `fire?`) alongside behaviour — a designed shape, not an encapsulation leak. |
| `SettlementEconomy` (`src/economy/`) | Settlement-level bulk stock (wood/food/water), shortage/surplus, one development payment | Injected by reference into every `NpcAgent` of that settlement — never owned per-NPC. Not in save data yet. |
| `NpcAgent` | Individual needs, FSM/phase, personality/traits, stamina/vigor, dialogue-facing family data | One large `update()` (~350 lines) mixes decision FSM with UI/SFX/queue side effects. |
| `AnimalAgent` / `AnimalLife` | Fauna needs, predator/prey, corpses, forage | Predator/prey/scavenging are real-object based; herbivore foraging is habitat-noise based (see §5, Environment). |
| `src/simulation/` (plan 055) | `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `pickHighestScore`/`ScoredAction` | Real shared kernel, used by both NPC and fauna for action chaining/lifecycle — but the scoring primitive itself (`pickHighestScore`) is fauna-only in practice. |
| `Inventory` / `ItemKind` (player) vs `EconomicStock` / `EconomicKind` (settlement) | Two deliberately separate resource models | Documented decision (plan 071): don't make `ItemKind` the universal economy type; map explicitly only where a real interaction needs it. |
| `QuestManager` | Quest progress, EXP, **player↔NPC** relation score | Not an NPC↔NPC relationship system — a different concept with a similar name. |
| `TreeLifecycle` / `treeHarvest.ts` | Authoritative tree growth + chop stages | Single state machine driving both player chop and NPC woodcutting — the reference example of "same system, different interface." |
| `ResourceDeposits` | Finite per-instance ore/rock deposits | Real depletion, deliberately no in-session regen; player-only consumer today. |
| `HealthState` / `StaminaState` / `VigorState` (`src/shared/`) | Damage/death, physical effort, daily budget | Shared identically across player, NPC, fauna. |
| `src/persistence/` | Versioned `SaveData` (schema v11) | Quest/EXP/relations/inventory/held tool/dropped items/fires/tents/map discovery persist. NPC runtime state, `SettlementEconomy`, deposit depletion do not. |

No hidden God Object was found. No parallel mechanism was found solving the same problem twice by accident (the `Inventory`/`EconomicStock` split and the player-`busyAction`/NPC-`ActionLifecycle` split are both deliberate, documented distinctions, not accidental duplication).

## 4. Alignment matrix

| Area | Target | Current | Alignment | Severity |
|---|---|---|---|---|
| System boundaries | Small `WorldContext` + system-owned state, no God Object | No God Object found; `WorldBundle` stays a pure lifecycle boundary | 🟢 Aligned | — |
| WorldContext & dependencies | Small shared context object | Ingredients exist and are singly-owned, but never consolidated — threaded via long positional-parameter constructors + repeated bespoke sampler adapters | 🟠 Partial | 🟠 |
| Simulation model / hybrid LOD | Detail varies with relevance/distance; aggregation preserves consequences | Binary only: full-detail while loaded, deterministic reseed-from-scratch when a settlement unloads (no partial LOD) | 🟢 Acceptable now | 🟢 |
| NPC → Household → Settlement | NPC owns individual state; Household owns shared economy; settlement creates pressure, not commands | `SettlementEconomy` genuinely settlement-owned, injected into NPCs; shortage/surplus biases needs, doesn't command; Household doesn't exist yet but insertion point (family/home grouping) already exists | 🟢 Aligned, Household insertable with moderate work | 🟡 (for the eventual insertion) |
| Needs / Problems / Goals / Pressure | Needs/problems/goals distinct, share a pressure/priority mechanism | Needs exist; shared scoring primitive (`pickHighestScore`) exists but only fauna uses it; NPC still runs a separate `pickNeed()` | 🟡 Partial (unfinished migration) | 🟠 |
| Economy / resources / production / storage | `actor → action → resource → good → storage`, no goods from nothing | Wood: fully real (chop→deposit gated). Farm/fish/mine: intentional empty-output placeholder. No duplicated/fake resource state. | 🟡 Partial (by design) | 🟡 |
| Actions as world-change mechanism | World changes flow through actions | Both player (`busyAction`) and NPC/fauna (`ActionLifecycle`) gate mutation behind resolve-time callbacks — two independent but internally consistent mechanisms | 🟢 Aligned (duplication risk noted) | 🟡 |
| Events / relationships / history | Direct deps + event contracts, no god object; NPC↔NPC relationships narrow but present; selective history | No event system (correct, matches target); **no NPC↔NPC relationship model exists at all** (only player↔NPC quest standing + static family-role tags); no history/memory (correctly deferred, nothing produces events yet) | 🟡 Partial | 🟡 |
| Environment ↔ ecosystem ↔ settlement | Selected, deliberate feedback loops; full ecology not required | Wood: real feedback loop. Ore: real depletion, no regen (by design). Predator/prey/scavenging: real-object based. Herbivore foraging: virtual/habitat-noise based (deliberate simplification, answers the open STATE.md question). Farm/fish/mine economy: inert placeholder. | 🟡 Partial (mixed, mostly by design) | 🟡 |
| Time / scheduling frequency | Different frequencies per system, no forced global tick | Render-adjacent state already threshold/EMA-throttled; NPC/fauna/economy tick every frame at uniform frequency (cheap today, no distance LOD for fauna); time-skip catch-up is a working precedent for future aggregation | 🟢 Aligned | 🟢 |
| Persistence / world independence | Persistence covers the continuing world, not just the player | Quest/inventory/held tool/dropped items/fires/tents/map persist; NPC runtime state, `SettlementEconomy`, deposit depletion do not — no structural blocker, but growing risk | 🟠 High-risk tech debt | 🟠 |
| Player / quests / dialogue | Same world primitives, different interface | `HealthState`, `Inventory`, tree harvest genuinely shared. Dialogue reads real world state. Quest consequences use real `Inventory`/relation, but triggers are 100% authored (no emergent half yet). Trade (Kasia) isolated from `SettlementEconomy`. Mining is player-only (latent duplication risk if NPC mining is added carelessly). | 🟢 Mostly aligned | 🟡 / 🟠 (trade) |

## 5. Findings

Ordered by severity. File:line references point to the investigating agents' evidence; verify against current `HEAD` before acting, code moves fast in this repo.

### 🟠 High-risk technical debt

1. **No consolidated `WorldContext`.** `worldBundle.ts` constructors take up to 13 positional parameters; `ambientSamplers` (`createApp.ts:198-210`), the resource-deposit `env` object (`worldBundle.ts:228-244`), and `SettlementForestHooks` (`worldBundle.ts:265-269,347-351`) are three independently hand-built adapters that all re-expose the same `chunkManager.sample*`/`waterLevel`/`config.terrain.*` values in slightly different shapes. Not blocking today; every new system built this way adds another bespoke adapter, which is the direction *away* from the target.
   **Action:** introduce a small, data-only `WorldContext` (seed, sampleHeight/Floor, waterLevel, region, timeOfDay/dayFactor getters) before the next system that needs terrain+time context — that system is plan 069.

2. **`pickHighestScore`/`ScoredAction` (plan 055) is fauna-only in practice.** `DecisionContext` is built by both `NpcAgent.buildDecisionContext()` and `AnimalAgent.buildDecisionContext()`, but no NPC-side function actually consumes it as a parameter type — NPC decisions still run through the bespoke `pickNeed()` (`src/ai/Needs.ts:34-49`), which is structurally a hand-rolled max-of-4 scorer that never touches the shared primitive.
   **Action:** migrate `pickNeed` onto `ScoredAction`/`pickHighestScore` as a pure refactor (no behaviour change) before any plan adds problems/goals to NPC decisions — this is the natural on-ramp that avoids a second, parallel scoring vocabulary.

3. **Persistence gap: `SettlementEconomy`, NPC runtime state, `ResourceDeposits` depletion.** None survive an app reload (`docs/STATE.md:81,153,181,125` documents this explicitly). All three are structurally simple (flat fields / small maps keyed by stable ids) and match the sparse-diff pattern already used for `treeOverrides` — `SettlementEconomy` already has a `snapshot()` method. No structural blocker; this is missing wiring, not a redesign. **Important nuance:** NPC runtime state (needs/FSM/vigor) is not only lost on full reload — `SettlementsManager.unload()` (`src/settlement/SettlementsManager.ts:315-318`) disposes every `NpcAgent` on ordinary chunk stream-out, and `ensureLoaded()` (`:268-280`) reconstructs them from scratch on stream-in, so this reset happens continuously during normal walking, not only at save/load boundaries. `SettlementEconomy`, by contrast, *does* survive stream-out/in (it lives in a separate `EconomyRegistry` keyed by settlement id, outside `Settlement`'s own lifecycle) — only a full app reload resets it. The two systems currently sit on different sides of the stream/reload boundary, which is worth knowing explicitly rather than treating "persistence gap" as one uniform problem.
   **Action:** persist `SettlementEconomy` before or alongside plan 069 ships — household + village storage should not go live with real survival stakes without it, or NPCs will visibly "forget" hard-won stock every reload. NPC runtime state and deposit depletion can wait until something depends on cross-session *or* cross-streaming continuity — but note that "cross-streaming" is the more frequently-hit case in practice, so any future NPC memory/relationship work (finding 10) will need at least coarse state to survive stream-out before it can mean anything.

4. **Trade with Kasia is a closed loop, isolated from `SettlementEconomy`.** `src/items/trade.ts` operates purely against a static, infinite `MERCHANT_PRICES` table and the player's `Inventory`; it never reads or writes the one real settlement economy that exists. Not wrong today (no economy feature depends on it yet), but the gap widens every time `SettlementEconomy` gains capability.
   **Action:** no fix required now; flag for the plan that ties merchant stock to settlement production/surplus.

### 🟡 Medium

5. **`gameLoop.ts` reaches into `Settlement`'s full public surface** (`s.npcs`, `s.landmarks.houses`, `s.fire`) to assemble cross-cutting per-frame queries, rather than a narrow query API. Acceptable today since `Settlement`'s public fields are deliberately exposed, but it assumes `s.npcs` is flat and homogeneous — exactly the assumption a future Household layer would break.
   **Action:** leave now; revisit only when Household is introduced — don't build the API preemptively.

6. **`NpcAgent.update()` mixes FSM decision logic with UI/SFX/queue side effects** in one ~350-line method (`src/ai/NpcAgent.ts:713-959`). Not wrong per the project's single-frame-loop philosophy, but it will get harder to insert a goals/problems layer cleanly without further bloating this method.
   **Action:** extract presentation/queue-interaction helpers before (not instead of) adding a goals/planning layer.

7. **`SettlementEconomy.hasSurplus`/`.surplus()` is fully unused** outside its own unit test — a complete, tested API surface with zero callers. Not harmful, but unexplained dead surface.
   **Action:** wire it into a future consumer (merchant stock, trade) or note it as reserved-for-trade in a comment.

8. **Two independent action mechanisms**: player-side `busyAction.ts` (simple timer) vs NPC/fauna `simulation/ActionLifecycle` (state machine with chaining). Both correctly gate world mutation behind resolve, but they share no code — a duplicated concept that could drift.
   **Action:** leave; if a future feature needs the player and an NPC to share one action (e.g. joining an NPC's work), converge `busyAction` onto the `simulation/` lifecycle contracts rather than let two parallel implementations diverge further.

9. **Player mining has no NPC counterpart; `MINING_PRODUCTION` is an empty-output stub.** If NPC mining is implemented later as an abstract stock-tick (mirroring farming/fishing) without also draining the real `ResourceDeposits`, it will create a second, disconnected ore-yield mechanic — unlike woodcutting, which correctly routes both player and NPC through the same `TreeLifecycle`.
   **Action:** when NPC mining is planned, route it through `ResourceDeposits.mine()`, the same way woodcutting routes through `TreeLifecycle`.

10. **No NPC↔NPC relationship model exists.** `QuestManager`'s `relations` map is player↔NPC quest standing; `FamilyRelation` (`husband`/`wife`/`child`/`single`) is a static structural tag assigned at generation, not an evolving value. Neither is partial progress toward the target's "narrow NPC↔NPC relationships, evolving over time" — they are different concepts that happen to share vocabulary.
   **Action:** no fix needed now (target explicitly allows deferring this). When built, it can hang directly off `NpcAgent`/`FamilyMember` (a `Map<npcId, number>` evolved by direct interaction calls) without touching `QuestManager` or requiring an event bus.

11. **Farmer/fisher/miner production is a genuine no-op** (`FARMING_PRODUCTION`/`FISHING_PRODUCTION`/`MINING_PRODUCTION` all have `inputs: []`/`outputs: []`), correctly and explicitly labeled a placeholder in source. Real time is consumed; no goods are faked into existence. Should not be reported elsewhere as "environment-linked economy" without this caveat — wood is the only profession currently wired to a real resource.
    **Action:** fill in via plan 069 and mining/fishing follow-ups; the hook is already shaped to receive real inputs/outputs without further refactor.

12. **Quests are 100% authored; no emergent half of the target's hybrid quest model exists yet.** `woda-dla-marka`'s objective (`interact_well`) never actually checks Marek's real thirst state in `Needs` — narratively connected, mechanically not. This matches the target's allowance for authored content, but the "emergent from world problems" half is entirely unbuilt.
    **Action:** leave for the plan that introduces emergent/goal-driven quests; it should read `Needs`/`SettlementEconomy` shortage state rather than only static defs.

13. **Household insertion requires a new live object and a new stock type, not an upgrade of existing data.** `EconomicStock` is a single flat map (no per-family partition); `NpcAgent.familyMembers` is explicitly dialogue-facing, "not a live reference" (`NpcAgent.ts:350-354`). The `economy`-injection pattern used for `SettlementEconomy → NpcAgent` is a proven, cheap template to copy for `Household → NpcAgent`, and family/home grouping already exists geometrically as the natural Household boundary — but this is moderate, not zero, work.
    **Action:** plan 069 already anticipates this correctly; no separate action needed beyond following the existing `economy`-injection template.

14. **NPC need satisfaction is resolved against an unconstrained source, not a stock.** `NpcAgent.beginNeed()` (`src/ai/NpcAgent.ts:1142-1239`) sends the NPC to `landmarks.well`/`landmarks.garden`/a tree and reduces the NPC's own `NeedState` field directly in `onComplete` — no stock is read or decremented on the consumption side. Production (e.g. wood → `SettlementEconomy`) and consumption (eat/drink) are currently two disconnected halves; nothing yet models "there isn't enough food to go around." This is exactly plan 069's job, not scope creep, but it means 069 will need to *change* `beginNeed`'s direct `needs.hunger -=` pattern to check/spend a household or settlement stock, not just add a new object alongside the existing one unchanged.
    **Action:** leave until plan 069; flag explicitly in that plan's implementation notes that `beginNeed` needs modification, not just a Household object bolted on next to it.

15. **`woodDuty` is a settlement-level pressure wearing a biological-need shape.** `NeedState` (`src/ai/Needs.ts:3-7`) holds `thirst`/`hunger`/`woodDuty` side by side, and `pickNeed()` (`Needs.ts:34-49`) scores all three plus settlement-shortage bias (`PickNeedOptions.woodShortage`/`foodShortage`) in one function. `woodDuty` is really "this village needs wood," not an NPC biological need — it works today because only one settlement-level signal feeds in, but it sets a precedent: the next settlement/household problem (housing, a predator threat, a plan-093 world-problem quest) could naturally get added as another field on `NeedState`/`PickNeedOptions` instead of becoming its own concept, which is precisely the needs/problems/goals conflation the target document asks to avoid.
    **Action:** before adding a second problem/goal-flavored signal to `NeedState`, introduce it as a distinct input alongside needs (not a new field on the same struct) — this pairs naturally with finding 2's `pickNeed` → `pickHighestScore` migration, since a proper `ScoredAction` model is where problem/goal-flavored inputs belong. Not urgent; only one instance (`woodDuty`) exists today.

### 🟢 Low / acceptable (noted, no action needed)

- No fauna distance-based LOD — cheap at current spawner-capped populations; revisit only if wildlife caps grow significantly.
- Herbivore foraging is habitat-noise based, not tied to real vegetation instances (`sampleForestFactor`/`forestDensityAt`) — this **answers the open STATE.md question under plan 094** definitively: virtual/habitat, not real-object. A deliberate, explicitly-commented simplification consistent with "complete ecological simulation is not required." Recommend closing the open question in `docs/STATE.md` rather than leaving it flagged.
- Ore deposit depletion is real and per-instance; the decision not to regen mid-session is explicit and documented in code.
- No premature event bus / `WorldEventManager` anywhere — matches the target's hybrid model exactly.

## 6. Architectural strengths

Do not refactor these — they are working examples of the target model and should be used as templates for new work:

- **`WorldBundle` lifecycle discipline.** `rebuildWorldBundle()` only disposes/reassigns fields on the same object; every long-lived closure created before it (`ambientSamplers`, `digFeedback`, `forest`) is documented and verified (plan 054) to read through the live bundle reference rather than a stale capture.
- **Tree harvesting is the reference example of "same system, different interface."** `TreeLifecycle` is the sole authority; player (`advanceWorldTreeHarvest`) and NPC (`harvestWorldTreeFully`) are two front-ends onto the identical state machine, and wood is only minted into `SettlementEconomy` after a real chop completes (`commitWoodcutterDeposit`, guarded explicitly against "standing at a tree must not mint infinite wood").
- **`SettlementEconomy` is genuinely settlement-owned, injected by reference into `NpcAgent`** — never per-NPC state. Shortage/surplus feeds `pickNeed()` as a score bias, never a command, which is an exact match for "goals create pressure, not commands." This dependency-injection shape is the template to copy when Household is introduced.
- **`HealthState` is identically shared** across player, NPC, and fauna — no divergent damage math anywhere.
- **Predator/prey and scavenging use real `AnimalAgent`/carcass instances**, not abstracted counters.
- **Dialogue is genuinely data-driven** off live NPC role/family/schedule/settlement descriptors, not scripted strings.
- **Time-skip catch-up (`resolveTimeSkip`)** is a working precedent for batched, infrequent simulation — directly reusable as the template for future distant-settlement aggregation or save/load NPC-state continuity.
- **Versioned save-schema migration (`SaveDataV1`...`V11`)** already handles additive schema growth cleanly; adding NPC/economy/deposit persistence is pure additive work following an established pattern, not a redesign.
- **Seed and time-of-day each have exactly one owner** with no duplicated copies anywhere in `src/` — the precondition for a future `WorldContext` consolidation is already met.

## 7. Required corrections

Small, targeted, sequence before/alongside plan 069 (the next plan that stresses all three seams below):

1. Introduce a small, data-only `WorldContext` object consolidating seed/day-night/terrain-sampling access, replacing the repeated positional-parameter threading and bespoke sampler adapters. Read-access only — no behaviour, no system references, or it becomes the God Object the target rules out.
2. Add persistence for `SettlementEconomy` (it already has `snapshot()`) before household/village stock goes live with real gameplay stakes.
3. Migrate `pickNeed()` onto `pickHighestScore`/`ScoredAction` as a pure refactor, before any plan adds problems/goals to NPC decision-making.

## 8. Deferred corrections

Fine to leave until the referenced trigger:

- NPC runtime state (needs/vigor/FSM) persistence — until cross-session NPC continuity is an actual feature ask.
- `ResourceDeposits` depletion persistence — cheap opportunistic fix, reuse the `treeOverrides` sparse-diff pattern.
- Tie merchant (Kasia) stock to `SettlementEconomy` — when trade-vs-economy interaction becomes a design goal.
- Wire or delete `SettlementEconomy.hasSurplus`.
- Extract `NpcAgent.update()`'s UI/SFX/queue side effects from the decision FSM — before (not instead of) a goals/problems layer.
- Fauna distance-based LOD — before wildlife population caps increase meaningfully.
- `gameLoop.ts`'s direct reach into `Settlement.npcs` — narrow this only when Household is introduced.
- Route future NPC mining through `ResourceDeposits.mine()` rather than an abstract stock-tick, whenever NPC mining is implemented.
- Build NPC↔NPC relationships (currently nonexistent) whenever the target's narrow-scope relationship model is scheduled.

## 9. Plan impact

| Plan | Impact | Detail |
|---|---|---|
| `069` — npc-household-resources (todo) | **Requires dependency** | Should reuse the `economy`-injection DI pattern (proven for `SettlementEconomy → NpcAgent`) for `Household → NpcAgent`; needs a new live Household object + a new stock type (`EconomicStock` is flat, not per-family); should not ship with real survival stakes until `SettlementEconomy` persistence lands (§7.2). Must also modify `NpcAgent.beginNeed()` (finding 14) to gate consumption on household/settlement stock rather than resolving needs against an unconstrained source, and should keep `woodDuty`-style settlement pressure (finding 15) as an input distinct from `NeedState` rather than another field on it. Also the plan most likely to need the `WorldContext` consolidation (§7.1) if household resource gathering needs terrain/time sampling beyond what's already threaded in. |
| `092` — NPC stamina/vigor daily budget (verification needed) | No impact | No architectural issue found in this system; open questions in STATE.md (gender/age modifiers) are gameplay tuning, not architecture. |
| `094` — fauna food/water (verification needed) | No code impact, doc update | This review answers the open STATE.md question: herbivore foraging is virtual/habitat-based, not real-object based. Recommend updating `docs/STATE.md`'s plan-094 open-question note to reflect this as resolved rather than open. |
| `071` — settlement economy (done) | No impact, minor cleanup | Shortage→need-bias pattern is a strength. `hasSurplus`/`.surplus()` is dead code — low-priority cleanup, not a plan blocker. |
| `060` — NPC schedule/trait overlays (verification needed) | No impact | Trait/personality overlay pattern (continuous OCEAN → continuous params) is a good foundation for future pressure-weighting; no gap found. |
| Any future mining/fishing/farming production plan | **Requires dependency** | Should route through the real resource primitives (`ResourceDeposits` for mining) rather than the current empty-output placeholder in `production.ts`, following the wood/`TreeLifecycle` precedent. |
| Any future emergent-quest plan | **Requires dependency** | Should read `Needs`/`SettlementEconomy` shortage state as quest triggers, not only static definitions, to fill the currently-empty "emergent" half of the target's hybrid quest model. |
| Any future Household/family plan beyond 069 | No reordering needed | Nothing found blocks sequencing; family/home grouping already exists as the natural boundary. |

No plan needs reordering. The one sequencing recommendation is to land the three items in §7 immediately before or alongside plan 069, since 069 is the first plan that will meaningfully stress all three seams (terrain/time context for resource gathering, persistent stock, pressure-driven household/NPC decisions).

## 10. Architectural rules for future agents

```text
Before adding a new system:

[ ] Does it have a clear owner of state?
[ ] Does it reuse existing world primitives (WorldContext-to-be, Inventory/ItemKind vs EconomicStock/EconomicKind, HealthState, ActionLifecycle)?
[ ] Does it introduce duplicated state?
[ ] Does it bypass Actions (busyAction / PlannedAction+ActionLifecycle)?
[ ] Does it create a parallel economy/inventory?
[ ] Does it preserve NPC → Household → Settlement boundaries (pressure, not commands)?
[ ] Does it work without the player?
[ ] Does it support future aggregated simulation (or at least not block it)?
[ ] Does it fit the dependency model in 02-systems-fixed.md?
[ ] If it needs terrain/time context, does it wait for or contribute to a consolidated WorldContext instead of adding another positional-parameter thread?
[ ] If it's a new NPC decision input (problem/goal), does it route through pickHighestScore/ScoredAction rather than a new bespoke scorer?
[ ] If it holds gameplay-relevant state with real stakes, does it have a path to persistence before it ships?
```

---

## Final conclusion

**Seedvale can safely continue development in its current direction.** Twelve review areas were checked against the accepted target architecture; none produced an architecture blocker (🔴). The codebase repeatedly demonstrates the target's core discipline — system-owned state, explicit dependencies, actions gating world mutation, no premature event bus or central manager — often ahead of what the target document requires at this stage.

Three small, targeted corrections should land immediately before or alongside plan 069 (npc-household-resources), since that plan is the first to stress all three seams at once:

1. Consolidate `WorldContext` (seed/day-night/terrain sampling) into one small, data-only object.
2. Persist `SettlementEconomy` (already has `snapshot()`) before household/village stock carries real gameplay stakes.
3. Migrate NPC decision-making (`pickNeed`) onto the shared `pickHighestScore`/`ScoredAction` primitive already used by fauna, as a pure refactor, before problems/goals are added to NPC decisions.

Everything else identified in this review (§8, Deferred corrections) can wait for its specific triggering plan without risk of compounding into a harder refactor later.
