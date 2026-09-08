# Seedvale — NPC Behaviour, Decisions & Relationships

**Purpose:** current-state reference for how an NPC decides what to do — authoritative state ownership, the pressure/decision pipeline, work/profession dispatch, and social/relationship state.

**Not:** settlement generation, `Household`/`SettlementEconomy` internals (that's [SETTLEMENTS.md](./settlements.md)), fauna's own behaviour pipeline or `AnimalAgent` internals (that's [fauna.md](./fauna.md) — this doc only covers how NPCs *consume* what fauna exposes), combat resolver internals ([combat.md](./combat.md) owns those; this doc covers only where combat hands off into NPC state), the work-contract commitment record itself ([player-systems.md](./player-systems.md)'s Work Contracts section owns that; this doc covers only the NPC-side evaluation/execution), or a plan/changelog.

**Last verified:** 2026-09-08

When this file and the code disagree, the code wins — update this file.

---

## Where NPC code lives

`src/ai/` (the decision/behaviour core, ~27 non-test modules besides `NpcAgent.ts`) and three-plus files physically hosted in `src/settlement/` that hold authoritative NPC state (`npcState.ts`, `npcRelationships.ts`, `npcPhysicalProfile.ts`) plus one that produces NPC identity data (`families.ts`). `NpcAgent.ts` is the coordination point — FSM (`Phase`), the `choose()` sequencing described below, movement execution, combat entry, social/contract drive, time-skip, and the public inspection API — but it delegates domain logic out to the other `ai/` modules rather than containing it. `src/quests/` (`QuestManager.ts`, `quests.ts`) is small and covered here rather than as its own document; its own internals (quest content, objective resolution) are quest data, not architecture, and aren't duplicated below.

## NPC authoritative state

**Identity / physical profile — deterministic, not persisted, regenerated every session:**
- `settlement/families.ts` generates family/household composition (name, lastName, relation, age, scale) from a settlement seed; it is the sole producer of the identity data `ai/characters.ts` (role, Big Five personality, traits) and `ai/nameCultures.ts` (names) fold into before `NpcAgent` construction. It stays settlement-owned (family/household composition is a generation concern), even though its only real consumer is NPC identity.
- `settlement/npcPhysicalProfile.ts` deterministically derives max HP/vigor from sex + a 9-stage age curve, plus base SPEA (`PhysicalAttributes` — Strength/Perception/Endurance/Agility, plan npc-019): four independent deterministic truncated-normal rolls centred on `0.5`, sex/age-agnostic. `resolveHumanStrengthProfile()` and `resolveHumanAgilityProfile()` resolve the melee-facing human Strength/Agility profiles from base rolls plus sex/age curves (independent from the generic HP/Vigor age multiplier above). `resolveHumanEnduranceProfile()` (plan npc-021) resolves human Endurance from the base roll plus sex shift and legacy age/`staminaVariation` inputs migrated upstream; `maxStamina` is then derived only through `resolveMaxStaminaFromEndurance()` — no second downstream sex/age/variation multiplier on final Stamina. Resolved Strength also feeds real physical work (ore mining duration, plan npc-020) via the same `resolveHumanStrengthProfile()` value `NpcAgent` already caches for melee — never raw `profile.attributes.strength`. `NpcAgent` composes Endurance recovery with its existing rest rate and the independent `energetic` trait modifier; activity fatigue drain rates and ratio-based exhaustion resume (`0.35`) are unchanged. Perception remains data-only. Build/appearance are still out of scope — see [Species physical reference](#species-physical-reference-partially-implemented) below.

**Authoritative runtime entity state — `settlement/npcState.ts`'s `NpcAuthoritativeState`, keyed by stable NPC id, owned by a registry living on `SettlementsManager` (the same shape as the settlement economy/household registries — see [settlements.md](./settlements.md)):**
- `health`, `stamina`, `vigor`, `needs` (thirst/wood duty/water duty/hunger).
- `physicalInjury` — outstanding healable HP loss, deliberately *not* derived from `maxHp − currentHp` so a future non-physical damage source (starvation, dehydration) can never conflate with it.
- `helperAssignment` — a player-configured delivery target (`{targetContainerId, resourceKind, enabled}`, set from the Villagers UI).
- `activePlan` — the persistent Plan described below (`{goal, strategy, state, progress, currentStep}`).
- `postDeath` — corpse/lifecycle record after the alive→dead edge (`null` while alive). Holds death position/yaw, a world-days death-time anchor, persisted loadout loot, and `active`/`claimed`/`terminal` status so a corpse can age during stream-out/time-skip and not rematerialize after natural cleanup. Burial (`npc-011`) can `claimed`-lock cleanup without a parallel corpse registry.

`NpcAgent` holds **direct references** into this state, not a copy — disposing/recreating the `NpcAgent` instance (settlement unload/reload, an in-session `WorldBundle` rebuild) re-hydrates from the same object. **All eight fields above are persisted** as part of `SaveData.npcStates` — see [Persistence](#persistence).

**Deliberately excluded from authoritative state — owned by `NpcAgent` itself, reset on every reconstruction:** `phase`, `pendingAction`, pathfinding/watchdog state, `combatIntent`, the carried `Inventory` (except loadout items moved onto `postDeath.loot` at death). These are transient presentation/execution state, not entity identity, and are never persisted.

**NPC death** is that `postDeath` record, not a second HP system and not an `NpcAgent`-lifetime mesh (`settlement/npcPostDeath.ts`). The alive→dead edge writes death transform, a world-days time anchor, and classified loadout loot once; `die()`/`die(true)` only handle runtime presentation and must not mint a second corpse. Natural decay is `fresh → rotting → bones → removed` from `nowDays - deathAtDays`. Terminal cleanup drops remaining loot as world items and prevents rematerialization; a burial claim blocks that cleanup for `npc-011`. Legacy saves of already-dead NPCs migrate to terminal/no-active-corpse rather than inventing a home-position body or loadout.

## Decision architecture

`NpcAgent.choose()` is a pipeline of three independent pressure producers feeding one arbitration, then a fixed-priority sequencing table, then strategy selection, then execution:

```text
1. PRESSURE GENERATION — three independent producers, one scoring domain
   a. Needs        physiological + duty meters (water/wood/waterDuty/food/idle),
                    re-ranked (never added/removed) by personality/role modifiers
   b. Weather       a single 'seekShelter' candidate, scored from current weather
   c. Healing       a single 'heal' candidate, scored from physicalInjury + a
                    held health consumable

2. ARBITRATION      one winner: a real need | 'seekShelter' | 'heal' | 'idle'

3. SEQUENCING       fixed priority table (gaps of 10 for future inserts):
                    collapseSleep(100) > seekShelter(90) > need/heal(80,
                    mutually exclusive by construction) > scheduledSleep(70)
                    > idle(60)

4. DISPATCH         per decision kind: beginSeekShelter / beginHeal /
                    ensurePlanForNeed→beginNeed / beginGoSleep / beginIdle

5. STRATEGY         (need only) "first available candidate wins" — deliberately
                    not a scoring engine. E.g. food:
                    playerStorageDelivery → householdFood → economyWithdraw →
                    householdExchange → hunt (hunters only) → nearbyFoodSource
                    → gardenGather

6. ACTION           a planned action (destination + duration + onComplete,
                    optional chain) — the shared simulation contract, below

7. EXECUTION        goTo/execute FSM drives movement + wait, then onComplete

8. STATE CHANGE     onComplete mutates a shared intermediate (Household,
                    SettlementEconomy, a combat target, the NPC's own carried
                    inventory) — never another NPC's authoritative state directly
```

This is the domain's central extensibility point: a fourth pressure producer needs no change to the other three or to the arbitration call site, only a new candidate pushed into the same array.

**A persistent Plan layer sits beside, not inside, this pipeline.** A `Plan` (`{goal, strategy, state, progress, currentStep}`, part of `activePlan` above) records intent and progress against a `NeedId`-derived goal (secure food/water, obtain wood, fulfil a work duty) — it is "what I want and where I am," never a queued action list; `beginNeed()` alone resolves the concrete next action. A Plan survives interruption (marked `interrupted`, never cleared) and resumes once `choose()` re-derives the same need on a later tick. This is genuinely three composable layers with three different lifetimes — Goal/Plan (persists across interruption and reconstruction), Strategy (re-selected every `beginNeed()` call), Action (single-use) — easy to collapse mentally into "the decision system," but not the same thing.

**Interrupt/revalidation is a deliberately different precedence from step 3.** A throttled check (once/second, only while movement/execution is in flight) can pre-empt an in-flight action: vigor collapse always interrupts; otherwise only when the NPC's current activity is genuinely idle (a real need in progress is never pre-empted by a *different* need or by weather) does a stricter critical-need threshold or severe weather interrupt. An interrupt cancels the in-flight action, marks any active Plan `interrupted`, and returns to full re-arbitration on the next tick — there is no "resume exactly where I left off" fast path. This asymmetry between arbitration order and interrupt order is deliberate, not an oversight.

**Movement:** `NpcAgent.steerTo()` does straight-line steering plus a per-frame single-obstacle skirt by default; a shared bounded local-grid A* fallback (`navigation/navigation.ts`) only runs on a genuine stuck/blocked condition, never on ordinary follow. Repath never changes the destination/committed target. The same watchdog module that triggers this fallback is also imported directly by fauna (`fauna/AnimalAgent.ts`) — see [Cross-domain integrations](#cross-domain-integrations).

## Work and routines

**Profession work** (dispatched by role) is a pure-function-per-profession table, not a shared scoring engine: miner (ore gathering, skips `Household` entirely — ore carries straight to `SettlementEconomy` in the NPC's own inventory; the extraction step uses the shared Strength physical-work duration rule, the chained stockpile `deposit` travel step does not), hunter (arrow crafting during the `work` block; the hunt expedition itself is pressure-driven off the `food` need, not profession work), farmer (harvest before plant, plant only from a real household-held seed), fisher (a real dock, the same deterministic catch rule the player uses), guard (a fixed patrol route, always succeeds), trader (own-household surplus → economy first, falling back to physically collecting surplus from another household in the same settlement), blacksmith (gated on a household-held whetstone — confirmed currently dormant, since nothing yet supplies one). Strength is not applied globally to `rollWorkDurationSec()` — harvesting, fishing, patrol, trading, arrow crafting and generic workplace stands stay Strength-neutral. A planner returning nothing falls back to a generic idle-at-workplace stand: profession is a preference, not the only way to act.

**Local resource exchange** (the `economyWithdraw`/`householdExchange` strategies) is the shared claim→carry→deposit pattern behind every economy/exchange/delivery flow: claim atomically and re-validate live at pickup time (never trust the availability check made at decision time), carry the claim through the NPC's own inventory between legs (an interrupted trip after claim genuinely loses the goods — an accepted tradeoff, same as the ore mine→deposit chain), deposit at the resolved destination. See [settlements.md](./settlements.md) for the economy/household side of this seam.

**Helper resource delivery** is a fifth, player-configured logistics flow: a `helperAssignment` (above) is read as the `food` need's highest-priority strategy candidate when active, but only once the NPC's own real hunger is checked and found satisfied — the one strategy list where NPC self-need is a precondition for a duty-shaped candidate, rather than the reverse.

**Work contracts (evaluation only).** The commitment record itself (lifecycle, employer, committed work) is owned by the world/player side — see [player-systems.md](./player-systems.md)'s Work Contracts section for the full mechanism. The NPC side is: a pure evaluator scores a contract opportunity (reward + role suitability − travel cost − work-duration cost − schedule-conflict penalty, compared against zero) only from an NPC's own idle branch (never pre-empting a real need); once accepted, `NpcAgent` drives discovery → accept → travel → work-bout state through to completion, resolving its own commitment fresh every decision cycle rather than keeping a second copy of the record. Work bouts against a buildable target go through that buildable's own actor-neutral work-contribution seam — the same one the player's own busy-channel work calls — so player and NPC labour on the same target are never tracked as two separate progress fields.

## Relationships, social, and dialogue

**Three entirely separate "social standing" stores exist — they share only vocabulary, not implementation:**
- **NPC↔NPC** — a symmetric pair store (get/adjust by id pair), one instance per settlement manager, persisted. Consumed today only by conversation outcomes (below).
- **Player↔NPC relation** — a scalar per NPC name, owned by `QuestManager`, used for quest availability gates and read by the player-interaction resolvers below. Relation deltas come only from authored quest outcome consequences, never from an implicit giver/talk-target bump. A structurally unrelated model (single scalar keyed by name vs. a symmetric pair store keyed by id) — a future reader should not assume one derives from the other.
- **Player↔settlement reputation/renown** (plan quests-progression-001) — owned by `src/reputation/ReputationManager.ts`, keyed by settlement id, independent of `QuestManager` and of any one NPC. Five `-100..100` reputation dimensions (how the settlement judges the player's social qualities) plus a `0..100` renown (how widely known the player is there); reputation and renown change only through an explicit, already-resolved `SocialConsequence` a caller applies (quest completion via `QuestManager`'s `applySocialConsequence` seam, and an exposed first-time cemetery grave disturbance via `groundActions` + `socialExposure.ts`) — the manager never inspects world/NPC/quest state itself. Persisted as its own top-level, sparse `SaveData.reputation` field (absent settlement = neutral).

**Social/conversation** runs over a settlement's own campfire as a shared social place. Partner selection is deliberately unranked (same place, available, not self, deterministic tie-break) — personality only changes retry frequency, never candidate choice. Pairing is atomic per settlement per tick: both participants are reserved and one shared outcome is generated before either side's conversation begins, so a third NPC can never be offered either mid-pairing. The outcome is a small deterministic roll (agreeableness + existing relationship value) that adjusts the symmetric NPC↔NPC store by a small delta.

**Dialogue** has no single owner file — it is split three ways, each independent: need-flavor lines (personality/need-keyed, plus the player-approach pause reaction), a topic-menu generator (role/family/village-flavor sentences, deliberately free of side effects — callers own data-fetching and mutation), and quest-driven overrides (`QuestManager.onInteract()`, which take priority over flavor dialogue whenever a quest is relevant to the interaction).

**Quests** (`src/quests/`) are genuinely quest-agnostic of NPC internals — `QuestManager` never reaches into `NpcAgent` state, only a name-based lookup; world bindings (fauna kill/find targets, landmarks) are resolved through injected resolver functions, never a direct import of `ai/`/`fauna/`. An active `talk_to_npc_choice` stage also uses that name-based `onInteract()` path: talking to one of the authored NPCs selects a terminal outcome immediately (the giver may themselves be a choice target, so this dispatch runs before the giver reminder). Two more small, independent one-shot resolvers read player↔NPC/player↔settlement social state without touching quests otherwise: an ambient "does this NPC notice the player" reaction chance (relation level + local settlement renown — reputation's five dimensions are deliberately not consulted here), and a synchronous "will you give me food/water" assistance resolver (relation level + `QuestManager.getPlayerStanding()`, a relation-average signal kept deliberately separate from settlement reputation/renown). Neither is routed through the pressure/decision pipeline above — both are one-shot social decisions triggered by player action, structurally parallel to it but never contesting it. Both reach the settlement-aware `PlayerSocialLookup` (`ai/reactionChance.ts`) threaded down from `createApp.ts` through `worldBundle.ts` → `SettlementsManager.ts` → `createSettlement.ts`, which closes over each NPC's own settlement id before handing `NpcAgent` a narrower per-name lookup — `NpcAgent` itself never resolves or imports a settlement id.

## Health, injury, and healing

```text
combat damage
→ NpcAgent.takeDamage() — the single NPC damage entry point
  → HealthState (shared primitive, see combat.md)
  → physicalInjury written in exactly one line (never derived from
    maxHp − currentHp)
→ healing pressure scores physicalInjury + a held health consumable
  → competes as the 'heal' decision-arbitration candidate (step 1c above)
→ beginHeal(): walk home, revalidate alive/injured/still-holding-a-consumable,
  consume the best-relief-first consumable, apply the HP restore
→ physicalInjury drops by the actually-restored HP
```

Combat's responsibility ends at the one-line `physicalInjury` write; combat never reads it back. Healing never auto-fires from combat and is never wired into the critical-interrupt path — it only ever wins at a natural arbitration tick. Combat mechanics themselves (the damage pipeline, critical hits, defense) are canonical in [combat.md](./combat.md).

## Inventory/items

NPCs carry a generic `Inventory` — the same class and capability-flag catalog the player uses, with its own carry-weight cap (`NPC_CARRY_MAX_WEIGHT = 5 kg`). That cap is a **temporary logistics/task carrier** for gathering, hunt yield, profession transfers and household/economy flow — not the NPC's biological human carrying capacity. Plan npc-020 does not replace it with the player's Strength body-carry resolver; NPC physical carrying/encumbrance is deferred. No NPC-specific item catalog or container type exists; see [player-systems.md](./player-systems.md) and [items/CATALOG.md](../items/CATALOG.md) for the shared mechanism. An NPC's carried inventory is not persisted — see below.

## Persistence

The eight `NpcAuthoritativeState` fields (health/stamina/vigor/needs/physicalInjury/helperAssignment/activePlan/postDeath) persist as part of `SaveData.npcStates`; NPC↔NPC relationships persist as a sparse (non-zero-pair-only) `SaveData` field. Phase/pending-action/pathfinding/watchdog/combat-intent/carried inventory never persist and reset fresh on every reconstruction — an interrupted delivery genuinely loses whatever was mid-transit (loadout belongings that crossed the alive→dead edge live on `postDeath.loot` instead). Identity/physical profile is deterministic and never persisted. See [persistence.md](./persistence.md) for the full classification and the shared save/rebuild mechanism that keeps a save and an in-session `WorldBundle` rebuild from drifting apart.

## Cross-domain integrations

- **Settlements/households/economy:** `Household`/`SettlementEconomy` are the only channel through which one NPC's work reaches another NPC — no NPC ever mutates another NPC's authoritative state directly. See [settlements.md](./settlements.md).
- **Player/work contracts:** see [Work and routines](#work-and-routines) above and [player-systems.md](./player-systems.md).
- **Combat:** see [Health, injury, and healing](#health-injury-and-healing) above and [combat.md](./combat.md).
- **Fauna:** two narrow seams, both fauna-owned and read-only from the NPC side — a hunting-target query/harvest hook (used by a hunter's `food`-need branch) and three read-only threat accessors an NPC's own animal-threat response reads to decide defend/flee. NPCs never import fauna's decision logic directly. The one confirmed exception to this "hooks, not imports" convention runs the other way: `fauna/AnimalAgent.ts` imports the NPC-owned movement watchdog module directly, for its own chase/flee stuck detection — a deliberate reuse, not a boundary violation. See [fauna.md](./fauna.md) for the fauna-side detail of both seams.
- **Weather/environment:** current weather is threaded live, once per frame, from the game loop through the settlements layer into every NPC's decision tick (never recomputed per NPC) and competes as the `seekShelter` pressure candidate above.
- **Persistence:** see [Persistence](#persistence) above.

### Species physical reference (partially implemented)

`docs/world/species-physical-reference.md` and `docs/world/human-strength-calibration.md` are the authoritative SPEA design references. Plan npc-019 implements base SPEA (`PhysicalProfile.attributes`) and human Strength profile resolution (`resolveHumanStrengthProfile()`); plan npc-022 adds human Agility profile resolution (`resolveHumanAgilityProfile()`); plan npc-021 adds human Endurance profile resolution (`resolveHumanEnduranceProfile()`) and the shared Endurance→Stamina capability resolvers in `src/shared/enduranceStamina.ts`. Strength consumers today are melee damage ([combat.md](./combat.md#melee)) and NPC ore-mining duration (`player/physicalWorkStrength.ts` via `npcProfessionWork.ts`); Agility has the melee-recovery consumer; Endurance owns max Stamina and Stamina recovery (activity drain rates stay with each consumer). Player human body carry capacity is a Player-only Strength consumer — see [player-systems.md](./player-systems.md#carry-capacity-plan-186--npc-020). Plan npc-023 adds the first Perception consumer: a pure `src/simulation/observation.ts` resolver (`none`/`basic`/`assessed`/`detailed`) driven by the Player's `attributes.perception` and target distance, wired into the shared `AgentStatusLabelController` for NPC and fauna labels (gaze stays opacity-only; debug `Full label info` bypasses information gating). The design documents otherwise remain forward-looking rather than a description of every current value.

## Limitations

- Burial decisions, graves, and household mourning remain `npc-011` — this plan only leaves a `claimed` handoff on the corpse record.
- Blacksmith and farmer-planting profession work is wired but currently dormant in a normal playthrough — nothing yet supplies the household-held item (whetstone, seed) either path requires.
- An NPC's carried inventory is never persisted; an interrupted claim/delivery after the claim step genuinely loses the goods.
- The two "relationship" stores (NPC↔NPC and player↔NPC) are easy to conflate by name but are structurally unrelated — see [Relationships, social, and dialogue](#relationships-social-and-dialogue).

## Entry points

```text
src/ai/NpcAgent.ts
src/ai/Needs.ts
src/ai/decisionModifiers.ts
src/ai/npcDecision.ts
src/ai/npcStrategies.ts
src/ai/npcPlan.ts
src/ai/npcLogistics.ts
src/ai/npcProfessionWork.ts
src/ai/npcWorkContract.ts
src/ai/weatherPressure.ts
src/ai/healingPressure.ts
src/ai/npcAnimalThreat.ts
src/ai/npcCombat.ts
src/ai/socialBehaviour.ts
src/ai/dialogue.ts
src/ai/dialogueTemplates.ts
src/ai/helperAssignment.ts
src/ai/characters.ts
src/ai/nameCultures.ts
src/settlement/npcState.ts
src/settlement/npcPostDeath.ts
src/settlement/npcRelationships.ts
src/settlement/npcPhysicalProfile.ts
src/settlement/families.ts
src/quests/QuestManager.ts
src/quests/quests.ts
src/reputation/ReputationManager.ts
src/simulation/types.ts
src/simulation/scoreActions.ts
```
