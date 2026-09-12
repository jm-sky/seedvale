# Plan: Work Contract actor capability gating

**Created:** 2026-09-12
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `npc`
**Subdomains:** `work` `decision-making`
**Tags:** `work-contracts` `capabilities` `tools` `inventory`

## Problem

Work Contracts currently allow NPCs to execute some work without respecting the same real-world capability requirements that apply to the Player.

The concrete current example is well construction:

- Player well work passes an actual capability provider backed by `Inventory.hasCapability(...)`.
- `wellStageCapabilities()` can require capabilities such as `rock_mining` for a deep well.
- NPC contract execution currently uses the same well construction seam with `capabilities: null`.
- This intentionally bypasses tool/capability gating for NPC work.

As a result, accepting a Work Contract can effectively grant an NPC an ability that the underlying world action says requires a concrete capability or tool.

## Goal

Make Work Contract execution respect the real capabilities of the NPC performing the work while preserving shared Player/NPC world mechanics.

A Work Contract provides an NPC with a reason and economic incentive to perform work. It must not grant the ability to perform that work.

Conceptually:

```text
world target
→ current work opportunity / stage
→ required capabilities
→ actor readiness
→ contract decision / continuation
→ real work
→ world mutation
```

The deep-well bypass is the first concrete integration proving the model.

## Core principles

### Work requirements belong to the work

Requirements must originate from the target/action being performed, not from Work Contracts.

For example:

```text
deep well pit
→ requires rock_mining
```

regardless of whether the actor is the Player, a hired NPC, a settlement worker or a future autonomous worker.

Work Contracts consume the target's current requirements rather than maintaining parallel contract-specific copies.

### Capabilities belong to actors and real resources

Resolve capabilities from authoritative actor/world state.

Reuse existing foundations:

- generic `Inventory`,
- NPC personal inventory on authoritative NPC state,
- `ITEM_CATALOG[kind].capabilities`,
- existing `Inventory.hasCapability(...)` behaviour.

Do not introduce a separate NPC-only capability catalogue where an existing item capability already expresses the requirement.

### Profession, capability, tool, skill and trait stay distinct

```text
Profession = normal occupation / work suitability
Capability = whether the actor can currently perform an operation
Tool       = a concrete item that may provide a capability
Skill      = how effectively the actor performs work
Trait      = behavioural or performance modifier
```

For this plan:

```text
capability → hard execution gate
profession → existing suitability score
trait      → existing/future score or performance modifier
skill      → outside scope
```

Profession must not substitute for a missing physical capability.

A miner without a suitable tool may be an excellent candidate for mining but cannot currently perform `rock_mining`. A farmer carrying a suitable tool may technically have that capability while remaining less suitable than a miner.

## Eligibility, provisionability and readiness

Keep these concepts separable even if v1 only needs a subset of them:

```text
qualified
= actor is fundamentally suitable/allowed to perform this kind of work

provisionable
= a missing requirement can be satisfied through an existing concrete resource path

ready
= actor currently possesses the required capabilities and can start the work
```

V1 should primarily enforce **readiness through existing item capabilities**.

Do not build a generic qualification or provisioning framework solely for this plan. Preserve a seam where these concepts can later be added without redefining Work Contracts.

## Contract lifecycle

### Posting

Allow contracts to exist even when no currently available NPC can perform them.

A shortage of capable workers or tools is meaningful world state. Do not prevent contract creation because no eligible worker currently exists.

### Discovery and scoring

NPCs may perceive contracts whose current work they cannot perform.

The existing deterministic Work Contract scorer should remain responsible for economic/suitability decisions such as profession, reward, travel, duration, schedule conflicts and provisions.

Hard missing capabilities must not become a small negative score that a sufficiently large reward can override.

### Acceptance

Do not require an NPC to possess every capability that any future stage of a multi-stage contract might eventually need.

Acceptance is based on the work opportunity that exists now. Future target stages may introduce new requirements.

This is important for dynamic world state and staged construction.

### Work start and resume

Resolve and revalidate the **current target/stage requirements** immediately before starting or resuming a meaningful work bout.

Do not treat contract acceptance as permanent authorization to bypass later requirements.

Do not recompute capability requirements every render/simulation frame. Revalidate at semantic work boundaries.

## Stage-specific requirements

Requirements must be derived from current target state rather than permanently snapshotted onto the contract.

Canonical deep-well scenario:

```text
NPC accepts well construction
→ current stage only needs ordinary digging capability
→ NPC performs valid work
→ well reaches a deeper stage
→ current stage now requires rock_mining
→ NPC does not have rock_mining
→ further progress stops
→ Work Contract does not magically grant rock_mining
```

This scenario is the primary architectural acceptance case for the plan.

The Work Contract itself remains valid unless normal lifecycle rules release/cancel it. Temporary inability belongs primarily to actor/world state rather than requiring well-specific contract states.

## Losing a capability during accepted work

If an NPC loses a required capability before the next meaningful work bout:

```text
accepted contract
→ requirement revalidation fails
→ no further work progress is committed
```

Do not automatically complete, bypass or mutate the target as though the capability still existed.

Future NPC behaviour may respond by acquiring a suitable tool, borrowing one, postponing work or eventually abandoning/releasing the assignment. Those strategies are not required by this plan.

## Tool sourcing direction

### V1: personal inventory

The NPC's authoritative personal inventory is the concrete capability source required by this plan.

If the NPC carries an item whose `ITEM_CATALOG` entry provides the required capability, the requirement is satisfied.

### Future: household/workplace/settlement provisioning

Preserve compatibility with a later systemic flow such as:

```text
NPC needs capability
→ personal inventory lacks suitable tool
→ household/workplace owns a suitable concrete item
→ NPC claims/withdraws it
→ item moves into NPC possession
→ NPC becomes ready
→ work proceeds
```

Do not create abstract contract or household capability pools that bypass concrete item ownership.

Concrete ownership should eventually allow real scarcity and contention, e.g. one household pickaxe cannot be simultaneously used by two workers.

Automatic borrowing, purchasing, claiming or workplace provisioning is outside this plan's initial scope.

## Shared Player/NPC execution

Player and NPC work should converge on the same actor-neutral target requirements.

Avoid parallel APIs such as:

```text
playerWellRequirements()
npcWellRequirements()
```

Prefer existing target-specific requirement seams such as `wellStageCapabilities(...)`, with each actor supplying its real capability source.

Do not introduce a broad generic `WorkRequirements` framework until multiple real consumers demonstrate that abstraction is needed.

The immediate model is intentionally small:

```text
target / current stage
→ required capabilities
→ actor.hasCapability(...)
→ work allowed or blocked
```

## Relationship with professions

Keep existing profession/role suitability in Work Contract scoring.

Profession is not a universal hard capability gate in this plan.

Do not introduce generic profession qualification requirements merely to solve the current well bypass. If future work such as blacksmithing demonstrates that specialist knowledge must be represented independently from tools, design that against the concrete use case and shared competence systems available at that time.

## Relationship with traits and skills

Current traits remain behavioural/performance modifiers and do not satisfy missing tool capabilities.

Do not create a full NPC skill system as part of this work.

Current Player skill evaluation is Player-specific. A future actor-neutral competence model may integrate with work eligibility/suitability, but that is a separate design problem.

## Generalization direction

The capability seam must not contain well-specific knowledge in generic Work Contract code.

The same pattern should be reusable by future work targets such as:

- mining,
- construction,
- repair,
- blacksmithing,
- farming.

Generalize only when those systems provide concrete additional requirements. Do not pre-build a universal work-requirement framework in this plan.

## State ownership

Preserve existing ownership boundaries:

- work target owns current stage/progress and its requirements,
- `WorkContracts` owns contract/assignment lifecycle,
- NPC authoritative state owns NPC personal inventory/state,
- item catalogue owns semantic item capabilities,
- household/settlement systems own their resources/items,
- NPC decision code evaluates opportunities but does not become authoritative owner of tools or work progress.

Do not duplicate requirements or tool ownership inside `WorkContractRecord`.

## Performance and determinism

Capability checks must remain deterministic for the same authoritative state.

Perform them at bounded lifecycle points such as opportunity/acceptance evaluation where relevant and immediately before meaningful work bouts or resumes.

Do not add per-frame inventory or settlement scans.

Keep requirement resolution independent of rendering/Three.js so the model remains suitable for remote/off-screen simulation.

## Scope

This plan establishes:

1. real NPC capability evaluation from authoritative personal inventory,
2. Work Contract execution gating against current target/stage capabilities,
3. revalidation before meaningful work bouts,
4. correct behaviour when a later stage introduces a new capability requirement,
5. correct behaviour when a capability is lost after acceptance,
6. shared Player/NPC use of existing target capability requirements,
7. an extension seam for future real tool provisioning without implementing that logistics system now.

## Non-goals

Do not include in the initial implementation:

- full NPC skill progression,
- generic qualification framework,
- universal profession redesign,
- household/workplace automatic tool borrowing,
- automatic tool purchasing,
- tool durability,
- tool crafting economy,
- generic job marketplace redesign,
- new Work Contract payment rules,
- new Player/NPC inventory system,
- abstract household/settlement capability pools,
- specialized well-only contract states,
- broad unrelated `NpcAgent` refactors,
- premature universal `WorkRequirements` abstraction.

## Expected initial integration

Use the existing deep-well path as the first concrete integration.

```text
deep well stage requires rock_mining

Player:
real inventory capability
→ existing behaviour remains unchanged

NPC with suitable item:
real NPC inventory capability
→ gated work can proceed

NPC without suitable item:
→ cannot progress the gated stage
→ contract cannot bypass the world requirement
```

The implementation should remove the current semantic bypass represented by NPC well work supplying no capability check while retaining the existing shared well construction path.

## Draft decisions to confirm before `planned`

1. Should capability eligibility affect initial Work Contract acceptance when the **current** stage already requires a missing capability, or is hard gating at work start sufficient for v1?
2. Should v1 explicitly expose a `ready` result/reason to NPC decision scoring/UI, or keep readiness enforcement inside work execution until a provisioning strategy exists?
3. If a contract becomes blocked at a later stage, should existing lifecycle behaviour leave it assigned indefinitely, or is a bounded generic release mechanism already necessary?
4. Does capability satisfaction require only possession in NPC inventory, or must the relevant tool also be actively equipped/held where the current item system supports that distinction?

Household/workplace provisioning and generic skill/qualification requirements are intentionally follow-up concerns rather than blockers for this draft.

## Verification

Automated verification should cover at minimum:

- deep-well capability requirement still blocks Player without `rock_mining`,
- existing Player well behaviour remains unchanged,
- NPC without `rock_mining` cannot bypass the gated deep-well stage,
- NPC with a capability-providing item can perform the gated work,
- profession suitability alone cannot substitute for a missing hard capability,
- losing the required capability before the next work bout prevents further progress,
- a well stage transition can introduce `rock_mining` and stop an NPC that was valid for the earlier stage,
- contract progress remains credited only for actual accepted target work,
- unrelated Work Contract target types continue to behave as before.

Manual browser verification is performed by the User, not the AI agent.

## Architectural guardrails

- Reuse `ITEM_CATALOG` capabilities as the item capability source of truth.
- Reuse generic `Inventory`; do not build a second NPC tool inventory.
- Keep target requirements actor-neutral.
- Keep Work Contract lifecycle independent from well-specific details.
- Keep profession suitability distinct from hard capabilities.
- Do not encode well knowledge in generic Work Contract code.
- Do not give NPCs fictional tools/capabilities because they accepted a contract.
- Do not duplicate tool state between NPC, household and contract.
- Preserve deterministic, bounded evaluation suitable for off-screen simulation.
- Add JSDoc to important architectural/public capability/eligibility seams where needed for preflight discovery; use `@domain npc` where appropriate.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
