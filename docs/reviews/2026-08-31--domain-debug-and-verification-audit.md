# Domain Debug & Verification Audit

**Date:** 2026-08-31  
**Status:** `audit`  
**Scope:** domain simulation, NPCs, animals, settlements, world systems  
**Excluded:** performance and graphics debugging

## Purpose

Audit the current runtime debugging and verification capabilities for Seedvale's domain systems.

The goal is to answer:

- What can currently be inspected?
- What can be traced?
- What can be triggered or manipulated?
- Which capabilities require a query parameter?
- Which capabilities have a UI/menu switch?
- How granular is each debug mechanism?
- Can a specific domain behaviour be isolated, or does one flag enable everything?
- What can be verified deterministically?
- Which important systems currently have no practical runtime debugging/verification?
- Does enabling the developer debug surface introduce meaningful runtime/startup overhead?

This document is an audit of the current implementation, not an implementation plan.

## 1. Current Debug Architecture

Seedvale currently has several layers of developer tooling:

```
Query parameters
      ↓
debug mode / developer capabilities
      ↓
window.seedvale.debug
      ↓
domain inspectors / triggers / controls
      ↓
debug GUI / NPC inspector
      ↓
runtime simulation + traces
```

The strongest existing implementation is the NPC simulation inspector and trace system introduced through the NPC simulation debugging work.

The current architecture is therefore not a single unified debug system. It is a collection of domain-specific tools exposed through a common developer/debug entry point.

## 2. Query Parameters

### Domain-relevant parameters

| Parameter | Purpose | UI/menu toggle | Granularity |
|---|---|---:|---|
| `?debug` | Enables developer/debug capabilities | Partial | Broad |
| `?admin` | Enables developer/admin capabilities | Partial | Broad |
| `?modelTest` | Model/content test mode | No | Dedicated mode |
| `?houseTest` | House/content test mode | No | Dedicated mode |
| `timeOfDay` URL override | Controls initial time-of-day testing | Debug tooling/context | Specific |

There are additional query parameters related to rendering, camera and performance. They are intentionally excluded from this audit.

### Observation

The main domain debugging switch is currently broad:

```
?debug
```

It does not provide independent query-level switches for:

```
NPC
animals
settlements
economy
quests
relationships
world simulation
```

This is acceptable for the current size of the developer tooling, but it limits targeted debugging when multiple systems are active.

## 3. `window.seedvale.debug`

The developer API is the main programmatic runtime debugging surface.

The current API provides capabilities in several categories.

### NPC

The NPC debug API provides:

```
debug.npc(id)
debug.npcs(filter)
```

An individual NPC can expose:

```
state()
history()
why()
freeze()
unfreeze()
reevaluate()
```

This gives access to both current state and causal information.

The API can therefore be used to investigate situations such as:

```
Why is this NPC not working?
Why did this NPC select this need?
Why was this strategy selected?
Why is this NPC waiting?
Why is this action failing?
Why did this NPC change behaviour?
```

### NPC trace

The trace records semantic simulation events rather than frame-level information.

Relevant event categories include:

- needs selection
- strategy selection
- action planning
- action completion
- action failure
- phase changes
- queue participation
- queue service
- movement rescue
- combat events
- persistent-plan events
- debug control events

This is currently the strongest domain debugging facility in the project.

## 4. NPC Debugging Capability

| Capability | Available | Granularity |
|---|---:|---|
| Inspect individual NPC | Yes | Individual |
| Inspect multiple NPCs | Yes | Filter/query |
| Inspect current state | Yes | Individual |
| Inspect recent history | Yes | Individual |
| Explain current decision | Yes | Individual |
| Inspect selected strategy | Yes | Individual |
| Inspect planned action | Yes | Individual |
| Inspect action outcome | Yes | Individual |
| Inspect queues | Yes | Individual/system |
| Inspect persistent plans | Yes | Individual |
| Inspect movement failures | Yes | Individual/event |
| Freeze NPC | Yes | Individual |
| Unfreeze NPC | Yes | Individual |
| Force reevaluation | Yes | Individual |
| Trace simulation decisions | Yes | Individual |
| Trigger arbitrary NPC behaviour | Limited | Specific mechanisms |

### Assessment

**Strong.**

The current tooling supports a useful causal debugging chain:

```
state
  ↓
need / pressure
  ↓
decision
  ↓
strategy
  ↓
plan
  ↓
action
  ↓
execution
  ↓
outcome
```

This is aligned well with the intended Seedvale AI architecture.

## 5. NPC Inspector

The NPC inspector provides a runtime UI for investigating an individual NPC.

It complements the console API rather than replacing it.

The current approach allows a developer to:

1. select an NPC,
2. inspect current simulation state,
3. inspect decision reasoning,
4. inspect recent trace history,
5. freeze/unfreeze the NPC,
6. request reevaluation.

This is sufficient for many manual browser verification scenarios.

### Important limitation

The inspector is primarily **NPC-centric**.

It does not automatically provide equivalent visibility into the systems that caused the NPC's state:

```
resource system
household
settlement economy
storage
production
world resource availability
relationships
quest generation
```

Consequently, an NPC can often tell us *what it decided*, while the underlying world system may still be difficult to diagnose.

## 6. Settlement Debugging

Current settlement-related debug capabilities include inspection of villages/settlements and access to selected settlement planning/location information.

The debug GUI and API also expose settlement-related information such as village plans and locations.

### Assessment

**Medium.**

Settlement debugging exists, but it does not yet reach the same level of observability as NPC debugging.

Missing or limited areas include:

- settlement-wide state history,
- population changes,
- resource flow,
- production/consumption,
- shortages/surpluses,
- household/storage logistics,
- settlement-level decisions,
- development decisions,
- causal explanation for settlement decisions.

## 7. Animal Debugging

Animals currently have significantly less runtime observability than NPCs.

There are domain-specific developer controls, including the ability to force wolf frenzy behaviour.

This is useful for testing specific combat/infection behaviour.

However, there is no equivalent general-purpose animal inspector/trace surface comparable to:

```
debug.npc(id)
```

### Missing equivalent capabilities

There is currently no general:

```
debug.animal(id)
debug.animals(filter)
```

with equivalent:

```
state()
history()
why()
freeze()
unfreeze()
reevaluate()
```

### Assessment

**Weak compared with NPC tooling.**

This is particularly significant because animal behaviour already contains meaningful simulation state:

```
hunger
thirst
food targeting
water targeting
predator/prey behaviour
fleeing
target commitment
herd behaviour
mother/following behaviour
combat
frenzy
infection
lifecycle
```

The absence of a general animal inspector makes many of these behaviours difficult to diagnose from runtime behaviour alone.

## 8. Animal Combat

Animal/NPC combat has some targeted developer support.

The wolf frenzy trigger is useful for forcing a known state and reproducing combat/infection-related scenarios.

Existing combat traces also improve observability of combat events.

### Assessment

**Partial but useful.**

The system has:

```
trigger
+
event trace
```

but lacks:

```
full state inspector
+
decision explanation
+
target-selection explanation
```

## 9. World and Location Debugging

The developer API exposes useful world queries and navigation helpers.

Examples include locating/teleporting to important world features such as:

- forests,
- mountains,
- rivers,
- villages,
- ocean,
- other domain-relevant locations.

This is valuable for reproducing world-state scenarios.

### Assessment

**Good for navigation/reproduction.**

However, location discovery is not equivalent to world-system observability.

The tooling can help answer:

> Where is the relevant thing?

but less reliably:

> Why did the world system produce this state?

## 10. Time and Weather

Time and weather have dedicated developer controls.

The debug GUI provides controls for time/day-night behaviour and weather testing.

There are also URL-level mechanisms for controlling initial time-of-day scenarios.

### Assessment

**Good.**

These systems have useful direct controls because deterministic environmental conditions are important for verification.

Examples:

```
night
day
specific time
rain
snow
other forced weather conditions
```

This is a good model for future domain verification tooling:

```
observe
+
control
+
repeatable scenario
```

## 11. Hidden Finds / Treasure

The hidden-find/treasure system has dedicated developer capabilities.

The debug API can expose and manipulate hidden-find related state and locations.

### Assessment

**Good for a feature-specific system.**

This is an example of targeted debug tooling rather than a generic inspector.

It demonstrates that domain-specific triggers can be useful when a feature has difficult-to-reproduce world conditions.

## 12. Economy and Resource Flow

The economy is conceptually important:

```
resources
  ↓
work / production
  ↓
goods
  ↓
storage / consumption
  ↓
surplus / shortage
  ↓
trade
```

However, there is currently no equally strong runtime debugging surface for following this flow.

### Current limitation

There is no general-purpose developer interface for answering:

```
Where did this resource come from?
Where was it stored?
Who consumed it?
Why is this household short of it?
Why did production not happen?
Why did an NPC fail to obtain it?
Why is a settlement experiencing a shortage?
```

### Assessment

**Weak.**

This is one of the more important observability gaps because NPC decisions increasingly depend on resource state.

## 13. Households and Storage

Household state can be observed indirectly through NPC/settlement systems.

The project also contains dedicated household/storage/logistics work.

However, there is no unified household inspector comparable to the NPC inspector.

Important missing views include:

```
household members
household needs
household inventory
incoming deliveries
outgoing consumption
storage destinations
pending logistics
resource shortages
```

### Assessment

**Partial.**

NPC inspection can reveal symptoms, but not always the complete household-level cause.

## 14. Relationships and Social Systems

Relationship state is partially visible through NPC state.

However, there is no general-purpose relationship inspector/trace surface covering:

```
relationship changes
relationship causes
social interactions
reputation changes
relationship consequences
```

### Assessment

**Partial / weak.**

This becomes more important as relationships increasingly affect decisions, dialogue and quests.

## 15. Quests and Progression

Quest systems currently do not have a debug surface comparable to NPC simulation.

The audit found no equivalent general-purpose runtime API for:

```
quest(id)
quests()
whyGenerated()
state()
history()
complete()
fail()
```

### Assessment

**Weak.**

This is particularly relevant for future emergent quests because debugging will eventually require tracing:

```
world problem
  ↓
NPC / household / settlement state
  ↓
quest generation
  ↓
quest selection
  ↓
player/NPC action
  ↓
world consequence
```

## 16. Verification vs Debugging

The current tooling should be understood as two related but different capabilities.

### Debugging

Answers:

> What is happening and why?

Examples:

```
NPC inspector
NPC trace
decision explanation
animal state
world queries
```

### Verification

Answers:

> Does the system behave according to its intended contract?

Examples:

```
forced weather
forced animal state
freeze NPC
reevaluate NPC
deterministic time
specific world locations
automated tests
```

The current project has stronger **debugging** support for NPCs than general **verification** support for the wider simulation.

## 17. Debug Granularity

Current granularity is uneven.

### Strong

NPC:

```
world
  → settlement
    → NPC
      → decision
        → strategy
          → plan
            → action
```

### Medium

Settlements:

```
world
  → settlement
    → selected state / plan
```

### Weak

Animals:

```
world
  → animal
    → observed behaviour
```

### Weak

Economy:

```
world
  → resources / goods
```

without a complete causal runtime trace.

### Main observation

`?debug` currently acts primarily as a **developer capability gate**, rather than a set of independently selectable domain debug modes.

This is adequate today, but future tooling should avoid turning `?debug` into a single switch controlling an increasingly expensive collection of diagnostics.

## 18. Runtime Cost of `window.seedvale.debug`

The developer API itself is not expected to be a major runtime cost.

Installation primarily creates the debug API and its closures. It does not continuously scan the world simply because:

```
window.seedvale.debug
```

exists.

Most expensive operations are performed when explicitly requested, for example:

```
debug.npcs(...)
debug.npc(id).state()
debug.npc(id).history()
debug.npc(id).why()
```

These operations can inspect or construct snapshots of simulation state.

### NPC trace cost

NPC traces use bounded history rather than unlimited logging.

The current design stores a limited number of semantic events per NPC.

This avoids unbounded memory growth and is substantially safer than per-frame logging.

### Important distinction

The following should not be treated as the same thing:

```
debug API installed
```

vs.

```
debug inspector open
```

vs.

```
large trace history actively queried
```

vs.

```
large-scale debug data collection
```

The first is expected to be cheap.

The latter cases can have measurable costs depending on population and query frequency.

### Current conclusion

There is **no code-level evidence that merely exposing `window.seedvale.debug` should substantially increase startup time**.

If startup is noticeably slower with `?debug`, the cause should be measured rather than assumed.

Recommended verification:

```
normal startup
?debug startup
?debug + inspector
?debug + large NPC population
```

Compare boot markers and initialization timings.

## 19. Main Observability Gaps

### Priority 1

#### Animal simulation inspector

Create an equivalent conceptual surface to NPC debugging:

```
animal(id)
animals(filter)

state()
history()
why()

freeze()
unfreeze()
reevaluate()
```

The exact API should follow existing animal architecture rather than blindly copying NPC implementation.

#### Domain-level causal tracing

Important simulation systems should eventually expose enough information to answer:

```
what happened?
why?
what changed?
what caused it?
```

### Priority 2

#### Settlement inspector

Expose:

```
population
households
resources
production
consumption
shortages
storage
plans
problems
pressures
```

#### Household/storage inspector

Expose resource flow and logistics.

#### Economy/resource tracing

Trace important state transitions rather than logging every update.

#### Relationship/social tracing

Expose significant relationship changes and their causes.

### Priority 3

#### Quest/progression inspector

Provide runtime inspection and controlled verification of emergent quests and progression.

#### Scenario controls

Develop a common mechanism for creating reproducible domain scenarios:

```
set time
set weather
spawn/modify entity
force condition
freeze entity
advance simulation
inspect result
```

## 20. Recommended Future Debug Model

The existing NPC inspector should become the conceptual reference for domain tooling.

A mature system could expose:

```
Inspect
Trace
Explain
Control
Trigger
Verify
```

for each important domain.

Example:

```
NPC
 ├─ inspect
 ├─ explain decision
 ├─ trace
 ├─ freeze
 └─ reevaluate

Animal
 ├─ inspect
 ├─ explain behaviour
 ├─ trace
 ├─ freeze
 └─ reevaluate

Settlement
 ├─ inspect
 ├─ trace changes
 └─ trigger scenario

Economy
 ├─ inspect resource flow
 ├─ trace production/consumption
 └─ verify balances

Quest
 ├─ inspect
 ├─ explain generation
 ├─ trace
 └─ trigger/verify
```

The implementation should remain domain-owned. A single God-object debug manager should be avoided.

## 21. Overall Assessment

| Domain | Debugging | Verification | Main gap |
|---|---|---|---|
| NPC | **Strong** | **Strong** | More cross-domain visibility |
| Animals | **Weak** | **Partial** | General inspector/trace |
| Combat | **Medium** | **Medium** | Decision/target reasoning |
| Settlements | **Medium** | **Partial** | Settlement-wide state |
| Households | **Partial** | **Weak** | Resource/logistics view |
| Economy | **Weak** | **Weak** | Resource-flow observability |
| Resources | **Weak** | **Weak** | Provenance/consumption tracing |
| Relationships | **Partial** | **Weak** | Causal social trace |
| Quests | **Weak** | **Weak** | Generation/state inspection |
| Time | **Strong** | **Strong** | — |
| Weather | **Strong** | **Strong** | — |
| World locations | **Strong** | **Medium** | Causal world-state debugging |
| Hidden finds | **Strong** | **Strong** | Feature-specific only |

### Final conclusion

Seedvale already has a **solid NPC debugging foundation**, but domain observability is currently uneven.

The biggest structural gap is:

```
NPC debugging
████████████████████

Animal debugging
██████

Settlement / household
███████

Economy / resources
████

Relationships / quests
████
```

The next step should therefore not be to add random debug buttons.

The better direction is to define a consistent **domain debugging and verification model**, using the existing NPC inspector/trace as the reference and extending observability to animals, settlements, resources, economy, relationships and emergent quests where the simulation requires it.

This audit should serve as the baseline for future implementation plans.
