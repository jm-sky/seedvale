# Plan: Abandoned gold mine → mining colony

**Created:** 2026-09-07
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** XL
**Depends on:** world-terrain-008, quests-progression-002, quests-progression-003
**Domain:** `quests-progression`
**Subdomains:** `quests` `rewards` `progression`
**Tags:** `gold-mine` `colony` `cave` `construction` `expedition` `profit-share`
**Roadmap:** -

## Goal

Add a substantial authored questline in which the Player discovers an abandoned gold mine in the mountains, reports the discovery to a sponsoring settlement, prepares minimum infrastructure for reopening it, and causes a real mining expedition to establish a small persistent colony at the site.

The quest should bootstrap a new world situation and then hand ownership back to normal simulation systems:

```text
mountain cave + real gold deposits
→ discovery / information
→ sponsor decision
→ Player prepares site
→ expedition travels to mine
→ provisional camp / colony starts
→ miners use normal needs, work and economy
→ later quests can develop the colony further
```

The mine and gold must exist independently of quest progression. The Player may discover the mine without first obtaining the intended map/information.

Do not build a parallel quest economy, quest mine, quest workers or quest settlement simulation. The quest owns progression and authored transitions; world, settlement, NPC, resource and economy systems own the resulting state.

## Dependencies

### `world-terrain-008` — Underground Caves V2

Treat a production-ready Cave V2 architecture as a hard dependency for the mine interior.

The abandoned mine must use a real walk-in cave in the shared cave system. Do not create a separate `MineInterior`, quest scene, teleport-only underground area or second underground representation.

The dependency must provide enough production functionality for this plan to bind a stable cave/world-location identity, place/query real world content inside it, enter/traverse it normally, collide with it correctly, and stream/rebuild it without quest-owned geometry state.

A key integration requirement for this plan is:

```text
Cave V2 spatial representation
+ stable cave identity
→ ordinary ResourceDeposit placement/query inside the cave
→ ordinary NPC/player mining against those deposits
```

If Cave V2 does not yet expose a coherent way to host real `ResourceDeposit` instances and normal mining interactions underground, that missing seam is a real blocker to the underground deposits. Extend the shared cave/world-resource integration rather than implementing quest-local deposits.

### `quests-progression-002` — quest outcomes, rewards and consequences

Use the shared quest outcome/reward/consequence model for authored stage resolution and irreversible outcomes. Do not add a mine-specific quest state machine beside the normal quest system.

### `quests-progression-003` — paid quests and Player income

Use the shared coin reward path for the sponsor's one-time payments. Coins remain ordinary inventory/economy items; do not add a quest wallet.

The continuing V1 profit share described below is a new persistent entitlement driven by production from this mine, not a replacement for the normal paid-quest reward mechanism.

## World setup and mine siting

### Mountain requirement

The abandoned mine must be a real cave **in mountainous terrain**. A random nearby cave outside the mountains is not an acceptable substitute.

Selection/generation must use the current post-`world-terrain-008` terrain and cave data rather than visual mesh heuristics where a semantic terrain/cave signal exists.

Required conceptual constraints:

```text
candidate cave
+ mountainous terrain / mountain region
+ suitable relation to the regional settlements
→ abandoned gold mine candidate
```

Before implementation, reconfirm the actual mountain/massif ownership and Cave V2 placement APIs. Prefer extending deterministic worldgen/siting constraints so the required world feature exists coherently.

If a generated region can legitimately contain no suitable mountain+cave candidate, do not silently degrade to a flatland mine. Implementation must resolve this at the worldgen/siting layer — for example by deterministically ensuring a suitable candidate in the relevant regional generation context — using the smallest extension compatible with the current terrain architecture.

Do not generate a cave only when the quest starts.

### Mine exists before the quest

The cave, mine identity and gold deposits are world content. They are generated/bound independently of whether the Player has received information about them.

The Player can therefore encounter the mine through ordinary exploration before any quest stage points there.

## Gold deposits

The mine uses ordinary world/resource-owned gold deposits and the existing mining/depletion path.

Target authored layout is approximately **five real gold deposits**:

- **1–2** near the cave entrance / immediately outside it,
- **2–3** inside the cave.

The exact count may be selected deterministically within those ranges if the shared placement architecture supports it cleanly. The important invariant is that both the exterior clue and richer underground continuation exist.

Reuse `ResourceDeposit`, `src/world/depositMining.ts` and the current post-dependency resource placement/lookup mechanisms. `gold` remains an ordinary mineable/economic resource.

Required behaviour:

- Player mining uses normal mining actions and depletion,
- NPC miners use normal miner work against the same deposits,
- depletion is real world state, not quest progress,
- extracted gold enters the ordinary settlement economy/storage flow,
- quest completion never refills a deposit,
- save/load follows the shared resource/depletion persistence contract.

Do not introduce `QuestGoldDeposit`, a quest counter representing remaining ore, or a second mining implementation.

## Regional settlement roles

The questline uses two settlement roles.

### Home settlement

The Player's starting/home settlement should be deliberately **small**, rather than receiving an arbitrary generated size that can make the regional progression nonsensical.

Use the existing settlement size model and worldgen constraints. Do not create a quest-only settlement-size field.

### Mother / sponsoring settlement

A nearby **medium or large** settlement acts as the regional centre that can sponsor reopening the mine and send workers.

The small home settlement may contain the NPC who first knows of the old map/mine story and refers the Player to the larger settlement. The sponsor/administrator in the larger settlement owns the reopening decision and expedition dialogue.

The mine colony should retain a stable relationship to this settlement, conceptually:

```text
mining colony → parent / sponsoring settlement id
```

Use an existing settlement relationship field if one exists by implementation time. Otherwise add the smallest semantically reusable settlement-level relationship required by this scenario; do not create a politics/faction hierarchy subsystem solely for the quest.

Generation should establish a coherent regional arrangement rather than searching the whole world at quest runtime.

## Quest flow

### 1. Information / map entry

An authored NPC in or associated with the small home settlement can provide information leading toward the abandoned mine and/or refer the Player to the larger regional settlement.

The map/information may remain quest knowledge in V1; it does not need to become a physical inventory item unless the current authored-quest architecture makes that useful.

The map reveals an existing mine. It never creates the cave, deposits or mine state.

### 2. Independent discovery shortcut

The Player may find the mine before receiving the map/information.

Discovering the authored mine through ordinary exploration persists a stable discovery fact. That discovery makes the relevant NPC immediately actionable — in UI terms, the normal quest-availability `!` should appear as though the Player already had the information needed to start/advance this questline.

This is deliberately a V1 convergence shortcut:

```text
normal information path ─┐
                         ├→ report / sponsor path
independent discovery ───┘
```

Do not build a second full quest branch for accidental discovery. Do not duplicate the mine discovery into an inventory map item merely to satisfy prerequisites.

### 3. Explore and confirm gold

The Player travels to the real cave and confirms that it contains gold.

The exterior 1–2 deposits allow the mine to be recognised without requiring the Player to exhaustively clear/explore the interior. The 2–3 interior deposits make the cave itself materially valuable.

Use a stable mine/cave discovery or authored world-interaction fact rather than checking camera position every frame. If the current quest objective vocabulary cannot express discovery/inspection of this world feature, extend the generic quest/world objective seam with the smallest reusable objective/ref instead of hard-coding the cave in `QuestManager`.

The objective is discovery/confirmation, not mining N units of gold.

### 4. Report to the sponsoring settlement

The Player reports the discovery to the sponsor/administrator in the medium/large settlement.

The sponsor agrees to reopen the mine if minimum infrastructure is prepared first. This is the authored transition from discovery into site preparation; it must not directly spawn a completed colony.

### 5. Prepare minimum infrastructure

Before an expedition is dispatched, require real world infrastructure at the mine site. V1 minimum:

- **1–2 prepared terrain plots**, using the existing terrain preparation mechanism,
- **one Player-built well** that resolves to a usable `WaterSource`,
- **one garden / basic food-growing area** using the normal garden/farming representation.

The exact geometry/count thresholds should be explicit and deterministic in implementation and should validate authoritative world objects within the mine/colony site, not quest-owned booleans such as `wellBuilt = true`.

Reuse existing `TerrainPreparationRecord`, construction/shared-work seams, Player well stages/groundwater resolution, `WaterSource`, and garden/farmer systems.

If garden creation is currently settlement-generation-only rather than a reusable runtime construction/placement operation, extend the shared settlement/garden mechanism minimally so this site can own a real garden. Do not create `QuestGarden`.

The prepared plots are intended to support the initial camp and later buildings. Do not require a complete permanent village before the expedition arrives.

### 6. Infrastructure hand-in and payment

Once the authoritative infrastructure requirements are satisfied, the Player reports back to the sponsor.

The sponsor:

1. recognises the real completed infrastructure,
2. pays the authored one-time preparation reward through the normal quest reward/coin path,
3. commits to sending the expedition.

The reward must resolve exactly once across save/load.

### 7. Expedition departs

The sponsor sends an initial expedition of approximately **three miners**.

These must be real NPCs, not quest markers or temporary cinematic actors. The intended experience is that they physically travel from the sponsoring settlement toward the mine using normal NPC movement/pathfinding where practical.

V1 may use a narrow deterministic expedition/relocation orchestration hook because the current simulation does not provide a generic runtime migration/job-market/settlement-founding mechanism.

That hook may decide **who moves and when**, but after assignment the NPCs must continue to use normal authoritative NPC state for:

- movement,
- needs,
- schedules/routines,
- health and lifecycle,
- profession/work,
- inventory,
- save/load.

Do not implement generic migration, a labor market or a new NPC controller solely for this quest.

### 8. Provisional mining camp

On arrival, the miners establish a provisional camp on/near the prepared site and begin living there.

The first visible colony should be intentionally small. V1 target:

- about three miners,
- tents rather than instantly generated permanent houses,
- access to the prepared well,
- access to the garden/basic food infrastructure,
- normal mining work at the real gold deposits.

Before implementation, inspect the current tent/camp/placement ownership. If an existing reusable camp/tent representation can become NPC home/shelter, use it. Otherwise add the smallest persistent **provisional settlement camp** mechanism required to give these NPCs real shelter/home anchors; do not encode tents as quest-stage decoration.

The quest may author the initial placement/assignment of the camp. Once established, the camp's world objects and NPC state are normal persistent simulation state.

### 9. Colony activation

The site becomes an actual small mining colony once the expedition has arrived and its minimum camp state is established.

There is currently no verified generic runtime flow for:

```text
world location
→ found settlement
→ attach households/NPCs
→ begin autonomous settlement simulation
```

V1 may therefore use a narrow deterministic **colony bootstrap** integration that creates/registers the minimum settlement identity and assigns the expedition to it.

This bootstrap is intentionally bounded. It must reuse the normal settlement representation, economy, households/NPC ownership and simulation after creation rather than introducing `MiningColonyManager` or a quest-owned mini-settlement.

The colony should persist independently of the Player/camera after activation.

### 10. Autonomous mining

After activation, miners perform the existing miner profession work:

```text
needs / schedule
→ travel to ordinary gold ResourceDeposit
→ mine through normal depositMining
→ carry/deposit output
→ SettlementEconomy gold stock
```

The mine is world/resource-owned; miners do not need a household-owned mine building. Storage and economy should follow current communal settlement mechanisms.

The quest must not increment production on a timer, simulate miners while the normal NPC system is active, or grant gold merely because the Player is away.

Normal adaptive/off-screen simulation should continue to own remote activity where supported.

### 11. Later colony-development quests

Permanent houses, expanded storage, additional workers, improved food infrastructure, roads and other development are deliberately **not prerequisites for the initial reopening**.

The initial questline should end with a viable provisional colony that can operate. Later authored/systemic quests can ask the Player to help turn it into a more permanent settlement.

Those later quests should operate on the same real colony and world state rather than replacing the provisional site with a scripted final village.

## Profit share V1

At the relevant reward decision, the Player may choose between:

- a larger one-time buyout/payment, or
- a continuing **share in profits V1**.

V1 does not introduce full enterprise accounting, investors, wages, operating expenses or a generic business system.

Technically, the continuing share should be a **production royalty derived from real gold produced by this specific mine/colony**, presented narratively as a share in profits.

Do not calculate the Player's share from current `SettlementEconomy.gold` stock. Settlement stock can be consumed, transferred or loaded from save data and is not a reliable production ledger.

Required conceptual seam:

```text
confirmed gold production/deposit
+ source = this mine / its deposits
+ Player entitlement
→ accrue claimable coin value exactly once
```

Prefer a narrow reusable source-aware production/economic event at the authoritative miner deposit/production boundary if the current code still lacks one. Do not couple `SettlementEconomy.add('gold')` directly to a quest id.

Persist the entitlement and its accrual/claim state, conceptually equivalent to:

```text
reward mode: buyout | profit_share
mine/colony identity
accrued claimable value
last accounted production identity/cursor where required
```

The exact schema must follow the current quest outcome and save architecture at implementation time.

The royalty must be driven by real future mine production, including simulation that occurs without the Player standing at the mine. It must not require the quest giver to be loaded for accrual.

Claiming/paying the accrued coins should reuse the normal coin grant/inventory path. A simple sponsor/administrator interaction for collecting accrued share is sufficient for V1.

## State ownership

Keep authoritative state in its owning domain:

| State | Owner |
|---|---|
| quest stage / resolved reward choice | quest system |
| mine discovery knowledge | shared world/quest discovery integration |
| cave identity/topology/interior | Cave V2 / world-terrain |
| mountain classification | terrain/worldgen |
| gold deposit identity/content/depletion | world resources |
| terrain preparation | existing terrain preparation system |
| well construction and water availability | player well / water systems |
| garden/crops | settlement/farming systems |
| expedition NPC identity, needs, movement, inventory | NPC system |
| provisional tents/camp objects | shared world/settlement/camp representation |
| colony identity / parent settlement relation | settlement system |
| gold stock and normal economic flow | `SettlementEconomy` |
| profit-share entitlement/accrual | quest/reward integration, persisted |
| Player coins | normal item/inventory system |

Quest state may reference stable ids and record irreversible authored decisions. Do not copy live simulation values into quest state for convenience.

## Persistence

Save/load must preserve the world transition without duplicating rewards, NPCs, deposits or settlement creation.

At minimum verify persistence/restore for:

- mine discovery and quest stage,
- reward choice and one-time payout resolution,
- cave/mine stable binding where not deterministic from worldgen,
- gold deposit depletion through the shared resource contract,
- terrain preparation,
- well construction and water availability,
- garden/crop state through its owning system,
- expedition dispatched/not-dispatched transition,
- identities of the three expedition NPCs,
- travel/arrival state where required by normal NPC persistence,
- provisional camp/tents,
- colony identity and parent/sponsor relationship,
- households/settlement membership after bootstrap,
- settlement economy after activation,
- profit-share entitlement and accrued/claimed value.

Colony bootstrap must be idempotent. Loading a save after dispatch/arrival must never create a second expedition, duplicate settlement or regenerate five fresh gold deposits.

Derived deterministic worldgen state should remain derived where existing systems already guarantee stable reconstruction.

## Reuse / extension targets

Implementation should reconfirm and reuse the current equivalents of:

- `src/quests/QuestManager.ts` and quest definitions — stages, objectives, outcomes and persistent quest progress,
- `src/world/depositMining.ts` — normal ore mining/depletion including `gold`,
- `ResourceDeposit` ownership/placement/lookup — exterior and cave-interior deposits,
- `SettlementEconomy` — normal colony gold stock/flow,
- miner profession work and its authoritative deposit-to-settlement path,
- `TerrainPreparationRecord` and existing shared terrain-work/construction integration,
- `src/world/playerWell.ts` / `createPlayerWells.ts` and `WaterSource`,
- existing settlement garden/farmer/crop mechanisms,
- existing Work Contracts/shared construction where infrastructure work can reuse them,
- NPC pathfinding/movement, profession, schedules, needs and persistence,
- households and settlement membership,
- settlement generation/registration/runtime ownership,
- current tent/camp/shelter mechanisms,
- post-`world-terrain-008` Cave V2 spatial/location APIs,
- save schema and rebuild/restore paths for every new authoritative field.

If current code has moved these responsibilities by implementation time, follow current ownership rather than preserving obsolete file names from this draft.

## Explicit V1 integration hooks

The following bounded hooks are acceptable because no generic current mechanism was verified during planning:

### Colony bootstrap

A deterministic transition that registers a real small settlement/colony at the prepared mine site and attaches the expedition to it.

After bootstrap, ordinary settlement/NPC/economy systems take over.

### Initial expedition assignment / relocation

A deterministic authored assignment of roughly three miners from the mother settlement and their destination. It is not a generic migration system.

### Provisional camp establishment

A bounded integration for miners to establish persistent tents/home anchors if the current shared camp representation cannot already do this directly.

### Source-aware production royalty

A narrow production attribution seam sufficient to accrue the Player's persisted V1 share from real gold produced by this mine.

These hooks should be designed so future generic migration, settlement founding, enterprise/accounting or colony-development systems can replace the authored trigger without replacing the resulting world state.

## Architecture constraints

- The mine is real world content and exists before quest discovery.
- The mine must be in mountainous terrain.
- The mine uses Cave V2; no parallel underground system.
- Gold uses real `ResourceDeposit` instances and normal depletion.
- Exterior and interior deposits are part of one mine feature.
- The map/information reveals the mine; it does not create it.
- Independent exploration converges into the same questline and enables the relevant NPC `!`.
- Infrastructure completion is determined from real world objects/state.
- The expedition consists of real NPCs.
- NPCs physically travel where normal pathfinding/lifecycle makes this practical; do not teleport merely because the Player is not observing them unless the normal adaptive simulation resolves remote travel that way.
- Tents/camp must be persistent world/shelter state, not decorative quest props.
- After bootstrap, the colony uses normal settlement/NPC/economy simulation and operates without the Player.
- Profit share is based on attributed production, not current stock.
- Prefer stable ids over runtime object references for all authored bindings.
- Do not keep the mine/colony at high simulation fidelity solely because a quest references it.
- Add JSDoc for important new shared/public architectural APIs; use `@domain quests-progression` and the owning domain tag where useful for preflight discovery.

## Non-goals

Do not implement in this plan:

- a generic dynamic settlement-founding UI,
- a generic migration or immigration simulation,
- a runtime labor market,
- a generic company/business/investment/shareholder system,
- full profit-and-loss accounting,
- wages, taxes or operating-cost simulation solely for profit share,
- a separate mine economy,
- a separate mine-interior renderer or scene,
- procedural generation of arbitrary mining quests,
- a complete settlement hierarchy/politics model,
- permanent build-out of the mining colony,
- every later colony-development quest,
- multiplayer synchronization.

## Performance

The quest should add negligible continuous quest bookkeeping.

- Resolve discovery, construction completion, expedition transitions and production attribution through events/action boundaries or bounded low-frequency checks, not per-frame global scans.
- Cave lifecycle follows Cave V2 streaming; quest references must not pin the interior loaded.
- Do not keep expedition NPCs or colony residents in near/full-fidelity simulation solely because they are quest-related.
- Use normal adaptive/off-screen NPC and settlement simulation after activation.
- Production royalty accounting should happen at authoritative production/deposit events, not by repeatedly scanning settlement inventories.
- Do not add a worker solely for quest/royalty bookkeeping.

## Verification

Automated verification should cover, where practical:

- the authored mine satisfies the mountain+cave siting contract,
- the same mine/deposits exist before and after quest activation,
- approximately five ordinary gold deposits are bound as intended: 1–2 exterior and 2–3 interior,
- deposits use normal mining/depletion and cannot be refilled by quest transitions,
- independent mine discovery persists and enables the same relevant NPC availability path as prior information,
- the map/information path and independent-discovery path converge without duplicate stages/rewards,
- infrastructure gating reads authoritative terrain/well/garden state,
- incomplete infrastructure cannot dispatch the expedition,
- completing infrastructure pays the preparation reward exactly once,
- expedition dispatch is idempotent across save/load,
- roughly three real miner NPCs are assigned and reach the site through the intended movement/off-screen travel contract,
- provisional camp objects and NPC home/shelter state persist,
- colony bootstrap creates/registers one real settlement identity exactly once,
- expedition NPCs become members/residents of that colony without losing normal needs/schedules/inventory state,
- miners use ordinary gold deposits and deposit output through the normal economy path,
- colony mining continues independently of Player/camera under the normal simulation contract,
- buyout and profit-share reward choices are mutually exclusive and persistent,
- profit-share accrues only from attributable real production from this mine,
- save/load cannot double-account production or duplicate claimable coins,
- claiming accrued share uses normal coins and cannot claim the same accrual twice,
- existing cave, terrain, construction, well, garden, NPC, mining, settlement, economy, quest and persistence tests remain green.

## Manual verification

Manual browser verification is performed by the User.

Verify at least:

1. normal information/map path from the small settlement through the sponsoring settlement to the mine;
2. discovering the mine first through exploration and seeing the relevant NPC become available with `!`;
3. exterior gold visible/usable and interior gold reachable through the real Cave V2 interior;
4. infrastructure cannot be completed with unrelated distant terrain/well/garden objects;
5. preparing 1–2 plots, a working well and garden unlocks the sponsor hand-in;
6. sponsor pays once and sends the expedition;
7. the three miners visibly travel/arrive, establish tents and begin living at the site;
8. miners satisfy needs and mine/deposit gold without Player scripting;
9. leave the region, return later and confirm the colony continued coherently;
10. save/reload before discovery, during infrastructure preparation, after expedition dispatch, during travel, after camp establishment and after colony activation;
11. both reward modes: one-time buyout and V1 profit share;
12. with profit share selected, allow real mining to occur off-screen, return to the sponsor and collect only the correctly accrued amount.

## Completion criteria

- A deterministic abandoned gold mine exists as a real mountain Cave V2 world feature independently of quest progression.
- It contains ordinary gold deposits using the shared mining/depletion system, with 1–2 near the entrance and 2–3 inside.
- The small home settlement and medium/large sponsoring settlement form a coherent regional quest setup.
- The Player can reach the sponsor path either through authored information/map knowledge or by independently discovering the mine.
- Real terrain preparation, a working well and a real garden gate expedition dispatch.
- Completing minimum infrastructure produces a one-time normal quest payment and sends approximately three real miners.
- The miners travel to the site, establish a persistent provisional tent camp and continue as normal NPCs.
- Colony bootstrap creates one real small settlement identity linked to its sponsoring settlement and hands subsequent operation to ordinary settlement/NPC systems.
- Miners autonomously extract real gold and feed it into normal `SettlementEconomy` flow.
- The colony continues operating independently of Player/camera according to the normal adaptive simulation model.
- The Player can choose a one-time buyout or persistent V1 profit share; the latter accrues from attributable real production rather than settlement stock snapshots.
- Save/load cannot duplicate the mine, deposits, infrastructure completion, expedition, colony, rewards or profit-share accrual.
- Later quests can extend the same colony rather than replacing it with a scripted final state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
