# Plan: Expedition shared work and activities

**Created:** 2026-09-11
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** npc-029, npc-032, items-player-028
**Domain:** `npc`
**Subdomains:** `work` `behavior` `decision-making`
**Tags:** `companions` `expedition` `work` `construction` `activities`
**Roadmap:** `companions.md`

> **Draft note:** recon pokazuje, że pełny roadmapowy zakres „shared activities” jest obecnie zbyt szeroki na jeden spójny implementation slice. Construction ma już prawdziwy actor-neutral contribution seam używany przez Playera i NPC Work Contracts i dlatego jest właściwym V1. Cultivation, gathering, transport, hunting, fishing i camp work mają użyteczne wspólne fundamenty, ale ich obecne end-to-end execution flows nadal zawierają istotne Player-only, NPC-only, household/profession albo settlement-specific ownership. Nie generalizować ich wszystkich w tym planie.

## Goal

Pozwolić zwykłemu NPC posiadającemu aktywny tymczasowy `accompany/follow commitment` wykonywać użyteczną pracę podczas wyprawy bez tworzenia osobnej Companion AI ani companion-specific wersji istniejących aktywności.

Docelowy model:

```text
ordinary NPC
+
active accompany commitment
+
real world work/activity opportunity
        ↓
normal NPC decision / idle-duty arbitration
        ↓
shared actor-neutral world action
        ↓
authoritative resource consumption / contribution
        ↓
real world state changes
        ↓
activity complete / interrupted / no longer viable
        ↓
normal accompany follow resumes
```

Nie tworzyć:

- `CompanionBuild`,
- `CompanionFarm`,
- `CompanionGather`,
- `CompanionTransport`,
- `CompanionFishing`,
- `CompanionHunting`,
- `CompanionCampWorker`,
- osobnego inventory/work ledger,
- osobnego companion task managera,
- drugiego construction/cultivation/logistics systemu.

## Core invariants

### Work authority is not resource permission

Muszą pozostać rozdzielone:

```text
reason / authority to perform work
!=
item ownership
!=
player-storage access permission
!=
resource availability
!=
NPC decision to perform the work now
!=
physical item transfer
!=
authoritative world action
```

Przykład:

```text
NPC may access beams in player chest
```

oznacza wyłącznie:

```text
NPC may withdraw beams
IF a valid action actually requires them
```

a nie:

```text
NPC should start building
```

Analogicznie player-given tool oznacza ownership/capability, nie polecenie pracy.

### Accompaniment and work remain separate intents

`npc-029` owns:

- temporary accompany commitment,
- follow/stay,
- interruption/resumption,
- separation recovery,
- travel continuity,
- return to normal life.

Ten plan owns only the ability to temporarily perform a useful work activity while that commitment remains active.

Work activity must not replace, duplicate or become another form of accompany commitment.

### Existing needs and danger remain higher priority

Shared work is discretionary duty/work.

It must remain interruptible by ordinary:

- hunger,
- thirst,
- fatigue/vigor collapse,
- injury/healing,
- weather response,
- combat,
- fleeing,
- other higher-priority decisions established by the NPC pipeline.

An interruption does not automatically cancel either the work activity intent or the accompany commitment.

## Activity recon summary

| Activity | Current shared seam | Current coupling / gap | V1 |
|---|---|---|---|
| Construction | Actor-neutral `contributeWork` / `addWork` on real world targets | NPC orchestration currently coupled to Work Contract accounting | **Yes** |
| Cultivation | Shared `CultivationAnchor`, crop lifecycle and `foodSources` world mutations | Farmer planner assumes profession, household seeds and household/economy output | Later |
| Gathering | Some shared live harvest/claim seams | No single general collect → concrete output → explicit owner activity | Later |
| Carrying / transport | Shared claim → carry → deposit pattern, `TransportOrder` foundation | Current endpoints/persistence remain settlement/logistics-oriented | Later, except bounded local construction fetch |
| Hunting | Shared combat execution | High-level hunt is Hunter + food-pressure + household-delivery specific | Later |
| Fishing | Shared deterministic spot/catch rules | Player and Fisher wrappers still own different targeting/output flows | Later |
| Camp work | Shared fire/cooking/repair domain pieces | End-to-end orchestration is mostly Player-facing | Later |

## Current architecture and reuse

### Construction is already actor-neutral at the mutation boundary

Current buildables expose real world-owned contribution seams such as:

```text
contributeWork(id, amount)
addWork(...)
```

Current examples include:

- player wells,
- standing torches,
- palisades,
- terrain preparations,
- residential buildings,
- player troughs.

The same persistent construction object can already receive work from both:

```text
Player constructionWorkSession
        ↓
target.contributeWork(...)
```

and:

```text
NPC Work Contract execution
        ↓
NpcAgent
        ↓
target.contributeWork(...)
```

Target progress therefore already has the correct ownership. Do not add another companion-specific progress field.

### Existing NPC construction execution contains reusable logic but economic ownership is separate

The current Work Contract path already knows how to:

- resolve a construction target,
- travel to it,
- revalidate it,
- execute a work bout,
- call the target contribution seam,
- observe accepted work/completion.

But Work Contract additionally owns:

- offer/assignment lifecycle,
- contract work accounting,
- reward/wage claim,
- payment lifecycle.

Expedition shared work must reuse/extract only the construction execution part. It must not require a fake or zero-price Work Contract.

### Player storage permission is already planned as an independent authority

`items-player-028` deliberately separates:

```text
item ownership
!= storage access permission
!= NPC reason to use item
!= work authority
```

This plan should consume its final policy-aware access seam for concrete construction materials where appropriate.

Do not implement companion-specific chest permissions here.

### Personal belongings and task cargo remain distinct

Durable personal belongings/tools belong to `NpcAuthoritativeState.personalInventory`.

Temporary work/logistics cargo currently belongs to the task/logistics path (`NpcAgent.carried` in existing flows).

Construction material fetching must preserve that distinction. Do not turn temporary beams/stones for the active target into permanent personal belongings solely because an NPC carried them.

## V1 scope — construction assistance

The first implementation should prove shared expedition work with one real activity family: **construction**.

Conceptual flow:

```text
player + accompanying NPC are in expedition locality
        ↓
player selects an existing unfinished construction target
        ↓
request / establish a real work opportunity
        ↓
NPC accepts/holds semantic work intent
        ↓
normal NPC arbitration
        ↓
higher-priority survival/danger?
    ├─ yes → ordinary action
    └─ no  → pursue construction activity
                  ↓
          target work-ready?
              ├─ yes → contribute work
              └─ needs material
                        ↓
               authorized local player storage available?
                   ├─ yes → fetch exact required material
                   └─ no → blocked / stop according to current state
                  ↓
            target complete
                  ↓
          clear work activity
                  ↓
        normal accompany follow resumes
```

### Supported targets

Use the existing buildable target adapters/seams already supported by shared Player/NPC construction at implementation time.

A target is eligible because it provides the shared construction contract, not because it appears in a `COMPANION_BUILDABLES` list.

## Architectural decisions

### 1. Shared work request/opportunity is source-neutral

Do not model the feature as:

```text
player presses command
→ companion-specific action starts immediately
```

Prefer:

```text
work opportunity/request
→ NPC accepts/holds work intent
→ ordinary arbitration
→ shared executor
```

The initial Player interaction is one source of that work opportunity, but the execution seam must not depend on companion UI.

This leaves room for future ordinary-NPC sources such as settlement problems, quests or autonomous decisions without creating another execution path.

### 2. Do not introduce `NpcWorkActivity` mechanically

A new semantic `NpcWorkActivity`-style record is acceptable only if the implemented dependency chain still lacks an existing source-neutral commitment/assignment owner capable of representing temporary non-economic work.

Implementation must first verify the final APIs from `npc-029`, `npc-032` and adjacent work/assignment code.

If a small reusable existing commitment seam can represent the intent without importing Work Contract economics, extend it instead.

If not, introduce the smallest semantic state necessary, conceptually containing only:

```text
activity kind
stable target ref
authority/source ref
minimal lifecycle/blocker state where required
```

Do not persist:

- paths,
- animation state,
- busy timers,
- current destination snapshots,
- cached permission results,
- cached material quantities.

Do not build a generic job framework for hypothetical future activities.

### 3. One active shared work activity per NPC in V1

Do not introduce:

- work queues,
- task boards,
- multiple concurrent duties,
- party job scheduling.

One NPC may have at most one temporary shared-work intent in this slice.

### 4. Shared work integrates at the existing low-priority duty boundary

Shared work is not a `NeedId` and not a new top-level physiological pressure.

Conceptually after dependency implementation:

```text
critical needs / safety / healing / combat
        ↓
normal higher-priority decisions
        ↓
active shared work?
        ↓
accompany follow/stay execution
        ↓
ordinary idle fallback
```

Exact ordering must adapt to the final `npc-029` / `npc-032` idle-duty contract rather than creating another independent first-wins chain.

### 5. Work pauses follow execution, not the accompany commitment

During construction:

```text
accompany commitment = still active
follow executor       = temporarily not executing
work activity         = executing
```

After completion/cancellation/invalidation, normal accompany execution becomes eligible again.

No second follow lifecycle.

### 6. `npc-032` remains the survival/locality authority

This plan deliberately depends on `npc-032` to establish ordering and avoid independently redefining expedition survival/locality rules.

Shared work must consume its final semantics for:

- survival interruption,
- expedition-local sleep/rest behavior,
- continuation/abandonment,
- interaction between temporary expedition duty and ordinary home/schedule duties.

Do not duplicate those rules here.

### 7. Materially leaving the local work context ends or yields V1 work

V1 does not make an accompanying NPC remain kilometres behind indefinitely to finish a construction project.

If final accompany recovery/locality semantics determine that following the expedition must take precedence, shared construction yields/ends cleanly and accompany recovery resumes.

Do not add a companion-specific off-screen construction worker engine.

### 8. Extract neutral construction execution from Work Contract economics

The target mutation/execution portion should be reusable by both:

```text
paid construction assignment
        ↓
shared construction executor
        ↓
target.contributeWork(...)
```

and:

```text
expedition shared work
        ↓
same construction executor
        ↓
target.contributeWork(...)
```

Prefer neutral naming around NPC/world work, not `expeditionConstructionExecutor` or `companionBuild`.

The neutral seam should only need to reason about concepts such as:

- target resolution,
- remaining/completed state,
- accepted work,
- current blocker/material requirement.

It must not own:

- wage calculation,
- contract credit,
- notice-board state,
- employer identity,
- payment claims.

### 9. Work Contract accounting remains independent

If an expedition NPC and a hired NPC both contribute to the same target:

```text
target progress
= all accepted actor-neutral work
```

but:

```text
Work Contract assignment credit
= only work accepted from that assignment
```

Shared expedition work must never accidentally earn wage progress on somebody else's Work Contract merely because the same target changed.

### 10. World target remains authoritative

The construction target owns:

- remaining work,
- stages,
- required materials,
- completion,
- final world mutation.

Temporary NPC work intent must not duplicate those fields.

Always re-resolve/revalidate the target immediately before mutation.

### 11. V1a — construction contribution is the required core

The required first slice is:

```text
known unfinished target
→ NPC reaches it
→ existing real requirements are already satisfiable through current target/material seam
→ NPC contributes work through actor-neutral target API
→ completion/resume accompany
```

This proves the architectural goal of shared work without making player-storage logistics the blocker for the feature.

### 12. V1b — local player-storage material fetching only if the final seam is clean

After `items-player-028` is implemented, include automatic local material fetching in this plan only if its final public seam supports this without creating new storage-discovery/logistics architecture.

Allowed shape:

```text
active construction action determines exact missing material
        ↓
real work authority is passed to storage access
        ↓
policy/reserve/current state revalidated
        ↓
exact real material transferred to task cargo
        ↓
NPC returns to the known target
```

If implementation recon shows this still requires broad new endpoint discovery, persistent hauling, reservation or storage-knowledge systems, leave V1b out and record it as a dependency/follow-up rather than expanding the plan.

### 13. Permission never creates work

Never:

```text
NPC sees allowed chest
→ takes possibly useful construction materials
→ decides to build something
```

Instead:

```text
existing valid work intent
→ concrete target requires material
→ permission may allow obtaining that material
```

### 14. Storage permission is revalidated at commit time

Example:

```text
NPC plans to fetch 2 beams
→ starts walking
→ player changes Materials: allowed → forbidden
→ NPC reaches storage
→ withdrawal fails
```

Also revalidate:

- reserve,
- current stock,
- target still active,
- work authority still active,
- destination capacity,
- container still exists.

Do not cache planning-time permission as authority.

### 15. No implicit global player-storage discovery

Do not scan all player containers in the world.

Use only a bounded/reachable/explicit storage source exposed by the final storage-access architecture.

If no neutral discovery seam exists, prefer an explicit selected/known storage source for V1b instead of inventing global NPC knowledge.

### 16. Local construction fetch is not automatically a `TransportOrder`

A nearby transfer for one active target may reuse ordinary action chaining/logistics primitives.

Do not create a persistent transport order merely to move a few materials from a nearby authorized chest unless the final logistics architecture has intentionally made that the universal mechanism.

General hauling remains deferred.

### 17. Tools use existing ownership and capabilities

If an existing construction action genuinely requires a tool/capability, resolve it through normal inventory/catalog rules.

Player→NPC item transfer from `items-player-027` may be used where available, but `items-player-027` is not a hard dependency of this plan because V1 must not invent or require new tool semantics solely for companion work.

Do not add:

- `companionTool`,
- `activityTool`,
- persistent expedition equipment slots.

Giving a tool still does not create a work intent.

### 18. Do not invent tool requirements

Some existing construction actions are capability-neutral.

Do not add hammer/axe/shovel requirements just because a companion is now helping.

Use only requirements already owned by the general action/domain.

If a general action already claims to require a capability but NPC execution currently bypasses it, fix the general action seam rather than adding a companion-specific check.

### 19. Player interaction stays contextual and small

V1 should expose a contextual request on a real unfinished construction target, conceptually:

```text
Poproś o pomoc
```

when an appropriate accompanying NPC is locally available.

Do not create a Party Tasks screen.

The interaction establishes the work opportunity/intent; it must not directly mutate construction progress.

NPC execution continues through the normal decision/action loop.

### 20. Work intent is not unconditional AI possession

Holding a work intent does not bypass:

- critical survival,
- combat/flee,
- death/incapacity,
- unavailable target,
- unavailable required materials,
- final expedition continuation rules.

Do not add companion-specific willingness/personality scoring in this V1 unless a dependency has already introduced a reusable ordinary-NPC work acceptance seam.

### 21. Completion and cancellation are explicit

End/clear the temporary work intent when:

- target completes,
- target is removed/invalidated,
- player explicitly cancels/replaces the request,
- required work can no longer be meaningfully performed,
- local expedition context moves away and accompany recovery takes precedence,
- NPC dies,
- accompany lifecycle terminates in a way that invalidates local expedition work.

Ordinary hunger/rest/combat interruption alone does not clear it.

### 22. No new per-frame scans

Resolve:

- the known target,
- bounded local resource sources only when required.

Do not scan every construction, container or gatherable resource per NPC tick.

## Deferred activities

### Cultivation

Current world mutation is already shared, but `planFarmWork()` still assumes Farmer profession, household seed ownership and household/economy output.

Revisit after the active cultivation thread stabilizes, especially:

- `settlements-npcs-030`,
- `world-023`,
- `settlements-npcs-031`.

Future integration should reuse `CultivationAnchor`, crop/food-source mutations and normal inventories while extracting settlement-household assumptions only where necessary.

### Gathering

A later slice should establish a reusable:

```text
world resource
→ live claim/revalidation
→ concrete output
→ explicit inventory owner
```

seam instead of treating NPC hunger gathering as generic work.

### Carrying / transport

General expedition hauling should consume the final persistent/off-screen transport architecture and stable endpoint/cargo ownership rules.

Do not create `ExpeditionTransport`.

### Hunting

Current high-level hunt remains Hunter + food-pressure + household-delivery specific even though combat execution is reusable.

A later slice should neutralize hunt intent/target/yield ownership while preserving normal combat execution.

`npc-033` cooperative combat is related infrastructure, not a generic hunting system.

### Fishing

`src/world/fishing.ts` already owns shared deterministic catch semantics.

A later slice should neutralize target/location, attempt execution and output ownership rather than duplicating Player/Fisher wrappers.

### Camp work

Revisit after `npc-032` establishes final expedition-local survival/rest semantics.

Then recon fire/fuel, cooking, camp infrastructure and repair mutations individually and extend general seams where justified.

## Dependencies and related plans

### `npc-029-npc-accompany-follow-commitment`

Hard dependency.

Provides persistent accompany/follow commitment, follow/stay execution, interruption/resume, separation and return lifecycle.

This plan must consume it rather than creating a work-specific follower mode.

### `npc-032-expedition-needs-and-survival`

Hard dependency, intentionally retained to establish implementation order.

Owns expedition survival/locality and continuation semantics that shared work must operate beneath.

### `items-player-028-npc-player-storage-access-policies`

Hard dependency for the full material-permission integration.

Provides authorization, purpose, reserve and authoritative withdrawal semantics for player-owned storage.

V1a construction contribution should remain implementable even if the final V1b storage-fetch seam proves too broad and is deferred during implementation recon.

### `items-player-027-player-to-npc-item-transfer-and-equipment`

Related, not a hard dependency.

Provides ordinary Player→NPC ownership transfer useful for future tool/equipment scenarios. Giving an item remains separate from work authority.

### `npc-030-paid-expedition-escort-work-contracts`

Related, not a hard dependency.

Paid and voluntary accompany sources should consume the same shared-work execution once an accompany commitment exists.

Do not make shared work conditional on how accompaniment began.

### `npc-031-voluntary-expedition-joining`

Related, not a hard dependency.

Voluntary joining must not be modeled as a zero-price Work Contract merely to unlock shared work.

### `npc-033-companion-combat-cooperation`

Related.

Owns cooperative combat/protection, not shared construction or hunting task ownership.

### `settlements-npcs-018` / `settlements-npcs-019`

Architectural alignment for physical goods transport and detailed/off-screen continuity.

Do not fork their cargo/travel mechanisms for expedition work.

## Expected integration points

Verify against current `main` after dependencies are implemented.

Likely primary seams:

- `src/ai/NpcAgent.ts`
  - low-priority duty integration,
  - current Work Contract construction execution,
  - interruption/resume,
  - diagnostics;

- `src/settlement/npcState.ts`
  - only if a new minimal persistent semantic work intent is still necessary after recon;

- focused neutral NPC construction-work helper extracted from current Work Contract execution where justified;

- `src/world/workContract.ts`
- `src/world/createWorkContracts.ts`
  - preserve economic assignment/accounting ownership;

- current buildable owners exposing actor-neutral contribution APIs, including applicable:
  - `src/world/createPlayerWells.ts`,
  - `src/world/createStandingTorches.ts`,
  - `src/world/createPalisades.ts`,
  - `src/world/createTerrainPreparations.ts`,
  - `src/world/createResidentialBuildings.ts`,
  - other targets using the same contract at implementation time;

- `src/items/constructionMaterials.ts`
  - current construction-material rules;

- final policy-aware player-storage seam from `items-player-028`;

- `src/items/Inventory.ts`
- `src/items/inventoryTransfer.ts`
  - real item ownership mutation;

- existing contextual inspection/action surface for requesting help;

- existing NPC trace/inspection diagnostics.

Do not bind implementation to stale symbol names if dependencies refactor these seams before this plan starts.

Important architectural/public helpers introduced by this plan should receive concise JSDoc where useful for preflight discovery, including `@domain npc`.

## Implementation order

1. Implement/finalize the dependency chain and verify the actual APIs of `npc-029`, `npc-032` and `items-player-028`.
2. Recon current Work Contract construction execution again and identify the smallest reusable target/work-bout portion independent of wages/contracts.
3. Verify whether an existing source-neutral commitment/assignment seam can own temporary shared work; introduce a minimal semantic work-intent record only if necessary.
4. Extract/reuse neutral construction target execution without changing target authority or Work Contract economics.
5. Integrate shared work into the final low-priority NPC duty sequencing.
6. Add construction request/start/cancel/completion and handoff back to accompany execution.
7. Complete **V1a**: shared construction contribution with existing target/material semantics.
8. Evaluate **V1b** against the implemented `items-player-028` seam; add bounded local material fetching only if it remains a small integration rather than a new logistics subsystem.
9. Extend existing NPC trace/inspection with active work target/source/blocker information.
10. Add focused automated regression coverage and update state documentation to describe the implemented shared-work seam.

## Verification

### Automated — construction authority

Verify Player construction, normal NPC Work Contract construction and expedition shared construction mutate the same authoritative target progress.

Example:

```text
remaining work = 10
Player contributes 3
expedition NPC contributes 4
Work Contract NPC contributes 3
→ exactly complete
```

No duplicate progress ledger.

### Automated — Work Contract accounting isolation

Shared expedition work on a target with an unrelated Work Contract must:

- advance the real target,
- not increment another assignment's work credit,
- not create a wage claim,
- allow Work Contract lifecycle to react normally if external work completes the target.

### Automated — decision integration

With active shared work:

- critical survival still wins,
- combat/flee can interrupt,
- temporary work intent survives ordinary interruption where still valid,
- work resumes after re-arbitration,
- ordinary NPCs without shared work behave as before.

### Automated — accompany integration

Verify:

```text
follow
→ accepted construction work
→ work
→ target complete
→ same accompany commitment resumes
```

without destroying/recreating accompaniment.

Verify moving materially away from the local work context returns authority to final accompany recovery/locality semantics rather than leaving the NPC indefinitely behind.

### Automated — persistence / reconstruction

If a persistent work-intent record is necessary, verify semantic state survives:

- `NpcAgent` reconstruction,
- save/load,

without persisting:

- navigation/path state,
- timers,
- cached material availability,
- cached permissions.

Target and permission must be resolved fresh after restore.

If final architecture can reconstruct shared work entirely from another existing persistent owner, do not add redundant persistence solely to satisfy this section.

### Automated — V1b materials / permissions

If V1b is included, verify:

- permission alone never creates work,
- work without permission cannot withdraw protected material,
- reserve remains preserved,
- `assigned_only`/work-purpose semantics accept only the real active work authority,
- policy changes while travelling are respected at commit,
- concurrent stock use is handled by live revalidation,
- destination capacity is respected,
- failures never duplicate/delete items.

### Automated — item/tool distinction

Where `items-player-027` is implemented, verify:

```text
give NPC tool
→ NPC owns tool
→ no work intent created
```

and:

```text
create work intent
→ no required tool/resource magically appears
```

### Automated — stale target

If another actor completes/removes the target before arrival:

- no unnecessary resource is consumed,
- no extra work is credited,
- temporary work ends cleanly,
- accompany resumes.

### Automated — regressions

Existing semantics must remain intact for:

- Player construction,
- Work Contract construction,
- ordinary schedules,
- NPC needs,
- NPC logistics,
- storage permissions,
- inventory transfer.

### Manual browser verification — User

AI does not perform browser verification.

User should verify at least:

1. Accompanying NPC can be asked to help with a real unfinished construction.
2. NPC walks to the real target and contributes to the same progress as the Player.
3. Hunger/rest/combat can interrupt work and the NPC later resumes it when still appropriate.
4. After construction completes, NPC resumes following normally.
5. Work performed by the expedition NPC does not create wages on an unrelated Work Contract.
6. Moving the expedition away from the project causes the NPC to recover accompaniment rather than remain indefinitely behind.
7. Save/load/reconstruction during shared work does not duplicate target progress or work intent.
8. Ordinary hired construction workers still behave and receive payment as before.
9. If V1b is included: missing material can be fetched from explicitly permitted local player storage and policy revocation before pickup is respected.
10. Merely granting storage access or giving the NPC a tool does not itself make the NPC start construction.

## Completion criteria

V1 is complete when an ordinary accompanying NPC can temporarily participate in real construction through the same world mechanisms already used by Player and ordinary NPC workers:

```text
accompany commitment
→ real work request/opportunity
→ ordinary NPC arbitration
→ physical travel
→ existing actor-neutral construction contribution
→ persistent world progress
→ interruption/resume
→ completion/cancel
→ same accompany commitment resumes
```

and, only where the final storage seam keeps the integration small:

```text
active construction requirement
→ policy-safe local material acquisition
→ real task cargo
→ same construction executor
```

with no:

```text
CompanionBuild
CompanionInventory
CompanionStoragePermission
fake Work Contract
duplicate construction progress
generic speculative JobSystem
```

The remaining roadmap activities stay explicitly deferred until their own actor-neutral action/ownership seams are mature enough to extend without companion-specific shortcuts.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
