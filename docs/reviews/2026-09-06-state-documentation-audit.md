# State Documentation Audit

**Created:** 2026-09-06  
**Status:** planned  
**Scope:** `docs/STATE.md`, `docs/state/`, current codebase and cross-domain integrations

## Goal

Audit and reconcile Seedvale's current-state documentation against the actual codebase.

The audit should answer:

1. What is actually implemented now?
2. Which current-state documentation is outdated, incomplete or misleading?
3. Which important systems or ownership boundaries are missing from the documentation?
4. Where do systems from different domains integrate?
5. Does the documentation clearly describe those integration points and shared mechanisms?
6. Is information located at the appropriate documentation level?

This is primarily a **current architecture/state audit**, not an implementation-history review.

## Source of truth

Use the normal Seedvale truth hierarchy:

1. Current code
2. Tests/build configuration
3. Implementation notes/reviews
4. Plans
5. Roadmap/Vision

Never treat a plan as evidence that something is implemented.

Implementation notes may help locate relevant code, but findings must be verified against the current codebase.

## Audit baseline

Each audit pass must record:

- date,
- audited `main` commit SHA,
- model/agent used,
- scope inspected.

The repository may continue changing while the audit is running.

Findings therefore describe the codebase at the recorded SHA.

Before applying final documentation changes, reconcile important findings against the latest `main`.

## Documents in scope

Primary:

- `docs/STATE.md`
- `docs/state/README.md`
- `docs/state/*.md`

Secondary documents should be consulted when relevant, including:

- `CLAUDE.md`
- `docs/CODE_INDEX.md`
- `docs/VISION.md`
- architecture documentation
- domain-specific documentation
- `docs/plans/README.md`
- implementation notes
- existing reviews

The audit may recommend moving information between documents or creating/removing state documents where justified.

Do not create new state documents merely because a domain exists.

## Documentation responsibilities

### `docs/STATE.md`

Should remain a concise high-level snapshot of the implemented game and architecture.

It should:

- describe major implemented systems,
- expose important architectural ownership,
- highlight major cross-domain interactions,
- point to detailed state/domain documents.

It should not become:

- an implementation history,
- a list of completed plans,
- a detailed catalogue of every feature,
- a substitute for domain state documents.

### `docs/state/*.md`

These documents describe substantial current systems in greater depth.

They should focus on:

- current architecture,
- state ownership,
- important runtime flows,
- important types/modules,
- invariants,
- integration with other domains,
- important limitations or intentionally missing functionality.

They should not reconstruct implementation history.

### `docs/state/README.md`

Acts as the index and scope map for current-state documents.

Its descriptions must accurately explain what each document owns and covers.

## Audit dimensions

Every domain audit should check at least the following.

### 1. Current implementation

Identify the major systems that actually exist in code.

Compare them with the current documentation.

Classify findings as appropriate:

- accurate,
- outdated,
- incomplete,
- misleading,
- missing,
- unnecessarily detailed,
- implementation-history leakage.

### 2. State ownership

Identify where authoritative state lives.

Pay particular attention to:

- duplicated state,
- runtime vs persisted state,
- derived vs authoritative state,
- ownership across managers/agents/world systems,
- state carried across `WorldBundle` rebuilds.

The documentation should make important ownership boundaries understandable.

### 3. Runtime flows

Document important flows rather than isolated classes where useful.

Examples:

```text
pressure
→ decision
→ strategy/action
→ world interaction
→ state change
```

```text
resource
→ NPC work
→ carried item
→ household storage
→ settlement economy
```

### 4. Cross-domain integrations

Do not audit domains as isolated silos.

Every domain audit must identify integration seams it encounters. The dedicated cross-domain stage later synthesizes and verifies these findings; it is not the first time integrations should be considered.

Explicitly identify where one domain consumes or changes another domain's state.

Examples include:

```text
world/terrain ↔ settlements
world/terrain ↔ fauna
weather ↔ terrain
weather ↔ NPC decisions
weather ↔ player/world objects

fauna ↔ NPC hunting
fauna ↔ settlements
combat ↔ player/NPC/fauna

NPC ↔ household
household ↔ settlement economy
items ↔ player/NPC/household/economy

player ↔ world objects
player ↔ settlements/NPCs
quests/dialogue ↔ relationships/world state
```

These examples are starting points, not a fixed list.

The audit should discover integrations from the code.

### 5. Shared mechanisms

Look specifically for mechanisms reused across domains.

Prefer documenting the shared mechanism and its consumers rather than describing multiple apparently independent implementations.

Examples may include:

- inventories/items,
- combat mechanics,
- water/world queries,
- weather state,
- placement/world queries,
- actions,
- resource claims/transfers,
- persistence records,
- interaction primitives.

### 6. Documentation boundaries

Identify information that belongs somewhere else.

Examples:

- excessive implementation detail in `STATE.md`,
- historical plan narrative in a current-state document,
- architecture duplicated across several documents,
- cross-domain mechanism documented as if owned by only one consumer.

### 7. Documentation significance

A discovered dependency or call path is not automatically documentation-worthy.

Document an integration when understanding it materially helps explain ownership, runtime behaviour, invariants or future implementation work.

Do not turn state documentation into a dependency graph of every import or call.

## Cross-domain integration audit

After individual domain passes, perform a dedicated integration audit.

This pass should synthesize the integration seams discovered during domain audits and perform targeted code recon where those findings are incomplete, ambiguous or conflicting. It should not blindly rescan the entire repository.

Its purpose is to build a system-level picture of Seedvale:

```text
world
→ resources / places / environment
→ settlements / households / fauna
→ needs / pressures / economy
→ decisions / work / combat / interactions
→ world changes
→ persistence / relationships / history
→ player-visible consequences
```

For each important integration seam determine:

- producer/owner,
- consumers,
- authoritative state,
- data/control flow,
- whether the integration is documented,
- which document should own its explanation.

Pay particular attention to integrations involving three or more domains.

## Audit stages

### Stage 1 — Inventory and audit matrix

Map the existing state documentation and relevant code domains.

Identify obvious documentation gaps, overlap and scope problems.

Produce an audit matrix containing, at minimum:

```text
area → current docs → code roots → integrations → audit artifact → recommended model
```

Use this matrix to determine the final Stage 2 audit groups. The groups below are starting points rather than a fixed partition.

Do not rewrite the documentation yet.

### Stage 2 — Domain audits

Perform focused audits of the areas selected from the Stage 1 matrix.

Initial candidate groups:

1. world / terrain / water / environment,
2. settlements / households / economy,
3. NPC behaviour / work / relationships,
4. fauna / ecosystem,
5. player / items / survival / world objects,
6. combat across player / NPC / fauna,
7. persistence and authoritative runtime state,
8. quests / dialogue / progression,
9. runtime composition / UI / audio where architecturally relevant.

Merge, split or drop groups when Stage 1 shows that another boundary better matches the current codebase.

Each domain audit must record the integration seams it discovers.

### Stage 3 — Cross-domain integration audit

Review and synthesize integration seams from Stage 2.

Find:

- undocumented connections,
- duplicated concepts,
- unclear ownership,
- stale descriptions,
- important flows split across documents.

Use targeted code recon to resolve uncertain seams rather than repeating every domain audit.

### Stage 4 — Documentation reconciliation proposal

Produce a concrete proposal describing:

- changes required in `docs/STATE.md`,
- changes required in each `docs/state/*.md`,
- changes required in `docs/state/README.md`,
- content that should move elsewhere,
- justified new documents if necessary,
- obsolete/redundant content that should be removed.

Do not mechanically preserve the existing document structure if the audit demonstrates that it no longer represents the codebase well.

### Stage 5 — Documentation update

Apply the accepted reconciliation proposal.

Prefer concise current-state descriptions over accumulating additional prose.

### Stage 6 — Final verification

Against the latest `main`:

- verify important claims against code,
- verify cross-domain ownership,
- remove contradictions,
- check links and indexes,
- ensure `STATE.md` remains concise,
- update verification metadata.

## Agent/model strategy

### Claude Code — Sonnet

Default model for:

- repository exploration,
- focused domain recon,
- tracing symbols and call sites,
- comparing documentation with code,
- routine documentation updates.

Prefer several bounded audits over one repository-wide unstructured scan.

### Claude Code — Opus

Use selectively for:

- cross-domain integration analysis,
- difficult ownership questions,
- architecture inconsistencies,
- synthesis where several systems interact,
- reviewing ambiguous or conflicting domain findings.

Do not spend Opus on mechanical documentation scanning or straightforward edits.

### ChatGPT

Use for:

- audit orchestration,
- defining audit scopes,
- reviewing artifacts from different passes,
- identifying gaps between audits,
- deciding when an additional focused recon is needed,
- final documentation structure/reconciliation review.

## Audit artifacts

Do not mix temporary audit findings directly into current-state documentation.

Store audit artifacts under:

```text
docs/reviews/state-audit/
```

Recommended naming:

```text
docs/reviews/state-audit/
  01-inventory.md
  02-world-terrain-water.md
  03-settlements-economy.md
  04-npc.md
  05-fauna.md
  06-player-items.md
  07-combat.md
  08-persistence.md
  09-quests-dialogue-progression.md
  10-runtime-ui-audio.md
  20-cross-domain-integrations.md
  30-reconciliation-proposal.md
  40-final-verification.md
```

The exact domain split and filenames may change after the inventory pass.

Do not create empty placeholder artifacts in advance.

## Artifact format

Each audit artifact should begin with:

```markdown
# <Audit title>

**Date:** YYYY-MM-DD
**Baseline:** `<commit SHA>`
**Agent:** <agent/model>
**Scope:** <files/domains inspected>
```

Where useful, findings should reference concrete code files/types/functions.

Each artifact should distinguish:

### Confirmed current state

What the code demonstrably does.

### Documentation discrepancies

Claims that are stale, missing, misleading or located incorrectly.

### Integration seams discovered

Record meaningful cross-domain seams encountered during the audit.

Prefer a compact table where appropriate:

```markdown
| Producer / owner | Consumer | Mechanism | Documentation |
|---|---|---|---|
| `WeatherState` | NPC | weather pressure | incomplete |
| river geometry | settlements | placement query | missing |
```

Only include seams that materially help explain ownership, runtime behaviour, invariants or future implementation work.

### Recommended documentation changes

What should eventually change and where.

### Open questions

Only unresolved questions that require another audit or architectural decision.

## Working rules

- Do not modify gameplay code as part of this audit.
- Do not fix unrelated issues discovered during recon.
- Record important code/documentation discrepancies instead.
- Do not assume completed plans still describe current architecture.
- Do not duplicate implementation notes into state documentation.
- Prefer tracing actual ownership and runtime flows.
- Search narrowly first; expand only when necessary.
- Avoid repeatedly scanning unchanged parts of the repository.
- Do not run browser verification for documentation-only audit work.
- Keep artifacts useful for the next audit stage rather than exhaustive for their own sake.

## Expected result

After completion:

1. `docs/STATE.md` provides a trustworthy concise overview.
2. `docs/state/` accurately describes substantial current systems.
3. `docs/state/README.md` accurately maps those documents.
4. Important cross-domain integrations are explicitly documented.
5. State ownership and shared mechanisms are understandable.
6. Historical implementation detail remains in plans/implementation notes rather than leaking into current-state documentation.
7. Future implementation planning can use these documents as reliable context without reconstructing the architecture from old plans.
