# Plan Metadata

**Status:** `reference`  
**Last audited:** 2026-09-03  
**Scope:** plan files in `docs/plans/`, planning documentation and plan-related generators/scripts.

This document is the audit of plan metadata: what fields exist, what values are allowed or observed, why they exist, and which repository tooling consumes them.

The repository source code is authoritative. This document describes the current planning contract; it is not a substitute for code recon.

---

## 1. Current plan header

The canonical required header is defined in `docs/plans/PLANNING.md`:

```md
# Plan: <name>

**Created:** YYYY-MM-DD
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** ~~005~~ ~~008~~
**Domain:** `npc`
```

Required metadata:

- `Created`
- `Status`
- `Priority`
- `Effort`
- `Depends on`
- `Domain`

Optional metadata currently documented:

- `Subdomains`
- `Tags`
- `Roadmap`

---

## 2. Metadata contract

| Field | Required | Current value model | Primary purpose | Current consumers |
|---|---|---|---|---|
| `Created` | yes | `YYYY-MM-DD` | Human-readable plan creation date | Currently documentation-level; no dedicated parser found in audited plan generators |
| `Status` | yes | `draft`, `planned`, `in progress`, `verification needed`, `done` | Plan lifecycle | `plans-sync.ts`, `plans-recommended-order.ts`, `plans-done.ts`, `planned-plans-without-notes.ts` |
| `Priority` | yes | `high`, `medium`, `low` | Relative planning priority | `plans-sync.ts`, `plans-recommended-order.ts` |
| `Effort` | yes | `XS`, `S`, `M`, `L`, `XL` | Approximate implementation cost | `plans-sync.ts`, `plans-recommended-order.ts` |
| `Depends on` | yes | plan IDs, or `-` / `none` | Implementation prerequisites | `plans-sync.ts`, `plans-recommended-order.ts`, dependency graph |
| `Domain` | yes | canonical domain list | Primary ownership/navigation | `plans-sync.ts`; filename convention; planning docs |
| `Subdomains` | no | free-form short values | More precise navigation/preflight hints | Documented for AI preflight; no controlled vocabulary currently defined |
| `Tags` | no | free-form short values | Secondary navigation/preflight hints | Documented for AI preflight; no controlled vocabulary currently defined |
| `Roadmap` | no | filename in `docs/roadmap/` | Links plan to roadmap item | Documentation/preflight context; not a planning score |

### Important distinction

`Domain` is the canonical primary classification.

`Subdomains` and `Tags` are deliberately lightweight hints. `PLANNING.md` says they are not a replacement for code recon.

Do not turn every useful derived concept into manual metadata. Recommendation-oriented values such as readiness, number of dependents, unlock potential, or quick-win status should normally be calculated by generators.

---

## 3. Status

### Allowed values

Defined in `scripts/docs/config.ts`:

- `draft`
- `planned`
- `in progress`
- `verification needed`
- `done`

### Lifecycle semantics

| Status | Meaning |
|---|---|
| `draft` | Plan exists but is not yet committed to the implementation backlog |
| `planned` | Ready for implementation; participates in planned ordering |
| `in progress` | Implementation currently underway |
| `verification needed` | Automated implementation checks passed; meaningful browser/manual verification remains |
| `done` | Implementation and required verification are complete |

`verification needed` and `done` are treated as completed dependencies by `plans-recommended-order.ts`.

Only `planned` plans are ranked by the current recommendation generator.

---

## 4. Priority

### Allowed values

Defined in `scripts/docs/config.ts`:

- `high`
- `medium`
- `low`

Human-facing icons:

- `high` → 🔴
- `medium` → 🟡
- `low` → ⚪

Current recommendation weights in `plans-recommended-order.ts`:

| Priority | Weight |
|---|---:|
| high | 30 |
| medium | 20 |
| low | 10 |

Priority is therefore already a quantitative planning signal.

---

## 5. Effort

### Allowed values

Defined in `scripts/docs/config.ts`:

- `XS` — minutes
- `S` — ~15–30 min
- `M` — ~30–90 min
- `L` — ~1–3 h
- `XL` — several sessions

Current recommendation penalty:

| Effort | Penalty |
|---|---:|
| XS | 0 |
| S | 1 |
| M | 3 |
| L | 6 |
| XL | 10 |

This makes Effort suitable for future profiles such as **Quick Wins** without adding another manual field.

---

## 6. Depends on

`Depends on` contains **implementation prerequisites**, represented by plan IDs.

Examples:

```md
**Depends on:** -
```

```md
**Depends on:** ~~015~~ ~~npc-014~~
```

The current parser accepts whitespace-separated references and strips presentation markers such as `~~`, backticks and punctuation.

### Semantics

- A dependency is a prerequisite, not thematic overlap.
- `done` and `verification needed` satisfy dependencies.
- Unknown dependencies are errors in `plans-recommended-order.ts`.
- Dependency cycles are detected.
- The reverse graph is used to calculate direct and transitive unlocks.

This is currently the strongest structural input for recommendation ranking.

---

## 7. Domain

### Canonical values

The canonical domain list is maintained by `scripts/docs/plans-sync.ts` and documented in `README.md` / `PLANNING.md`:

- `ai`
- `fauna`
- `items-player`
- `npc`
- `persistence`
- `quests-progression`
- `settlements`
- `settlements-npcs`
- `tools`
- `ui-input`
- `world`
- `world-terrain`

### Semantics

Domain answers:

> Where should an AI/developer look first?

It is the **primary ownership classification**, not a list of every system touched by the plan.

New plans use the domain as the filename prefix:

```
<domain>-<id>-<title>.md
```

`plans-sync.ts` validates that the filename domain and `Domain:` metadata agree.

---

## 8. Subdomains

Current documented shape:

```md
**Subdomains:** `household` `logistics`
```

### Audit finding

There is currently **no canonical list of allowed Subdomain values** in `PLANNING.md`, `config.ts`, or the audited plan generators.

This appears intentional: the planning guide describes Subdomains as short navigation/preflight hints.

### Recommendation

Keep `Subdomains` as an open vocabulary for now.

Do not introduce a global enum unless real usage demonstrates that a stable controlled vocabulary is needed.

If standardization becomes useful, prefer a documented **recommended vocabulary per Domain** rather than one global list.

---

## 9. Tags

Current documented shape:

```md
**Tags:** `delivery` `inventory`
```

### Audit finding

There is currently **no canonical list of allowed Tags**.

Tags are documented as optional navigation/preflight hints and are intentionally short and relevant.

### Recommendation

Keep Tags open-ended.

Tags are the best existing place for cross-cutting concepts such as:

- `gameplay`
- `economy`
- `combat`
- `persistence`
- `performance`
- `polish`
- `bug`

However, these should only be introduced where they provide real navigation or recommendation value. Avoid using Tags as a duplicate of Domain or as a manually maintained score.

A future recommendation generator can use Tags as **signals**, while keeping the scoring rules in code.

---

## 10. Roadmap

Current documented shape:

```md
**Roadmap:** `npc-ai.md`
```

The value should point to a file in `docs/roadmap/`.

Purpose:

- connect implementation planning to higher-level roadmap intent;
- provide context to AI agents;
- avoid copying roadmap text into individual plans.

It should not become another priority system.

---

## 11. Created

Current documented format:

```
YYYY-MM-DD
```

### Audit finding

The field is part of the documented metadata contract, but the audited plan generators do not currently use it for synchronization or recommendation scoring.

It remains useful as human-facing provenance.

---

## 12. Proposed: Implemented at

Suggested field:

```md
**Implemented at:** 2026-09-03 00:42
```

### Purpose

Record when implementation of the plan was completed.

This should mean:

> The implementation work reached the point represented by `verification needed` or `done`.

It should **not** mean browser/manual verification time.

Recommended lifecycle:

```
Created
  ↓
planned
  ↓
in progress
  ↓
Implemented at
  ↓
verification needed
  ↓
done
```

### Important distinction from existing tooling

`scripts/docs/plans-done.ts` currently derives lifecycle transition dates from Git history rather than reading an `Implemented at` field.

Therefore adding the field should not initially duplicate or replace that historical mechanism without a deliberate design decision.

Potential future uses:

- recent implementation context;
- plan history;
- planning velocity;
- time-to-implementation analysis;
- recently implemented features/fixes;
- recommendation freshness signals.

### Format

Use a single repository convention. Recommended:

```
YYYY-MM-DD HH:mm
```

The timezone should be explicitly standardized before the field is widely adopted. Europe/Warsaw is practical for this project, but UTC is preferable if repository activity may become geographically distributed.

---

## 13. Legacy plans

The repository still contains legacy date/global-ID plan filenames, for example:

```
2026-08-20--177--npc-combat.md
```

The current generators explicitly account for these files.

New plans use domain-local IDs:

```
npc-018-...
```

Do not introduce new metadata rules solely to make legacy plans identical unless migration is explicitly planned.

---

## 14. Current script usage

### `scripts/docs/config.ts`

Central source for:

- metadata regexes;
- Status type and allowed values;
- Priority type;
- Effort type;
- canonical plan paths;
- plan filename conventions;
- completed statuses;
- priority icons.

Notably, it currently defines a `PLAN_DOMAIN_RE`, but Domain validation is additionally enforced by `plans-sync.ts`.

### `scripts/docs/plans-sync.ts`

Uses:

- Status
- Priority
- Effort
- Depends on
- Domain

Responsibilities include:

- validating plan domains;
- validating filename/domain agreement;
- synchronizing planned-plan index rows;
- synchronizing implementation-note markers;
- maintaining next plan IDs.

It does not currently consume Subdomains, Tags, Roadmap, Created, or Implemented at.

### `scripts/docs/plans-recommended-order.ts`

Uses:

- Status
- Priority
- Effort
- Depends on

Current score:

```
priority
+ direct dependents × 4
+ transitive dependents × 10
+ dependency depth × 2
- effort penalty
```

This is important for future work: the recommendation system already has a scoring model and dependency-derived signals.

### `scripts/docs/plans-done.ts`

Uses Status and Domain directly.

It also uses Git history to reconstruct lifecycle transition dates, including the first transition to `verification needed` and `done`.

### `scripts/docs/planned-plans-without-notes.ts`

Uses Status to select currently planned plans and checks implementation-note presence.

### `scripts/claude/pre-implementation.ts`

The planning documentation says that Domain, Subdomains and Tags may improve AI preflight relevance.

The preflight itself primarily derives navigation from plan text, explicit files, symbols, dependencies and implementation notes. Metadata should therefore remain concise and navigational rather than becoming a second implementation specification.

---

## 15. What should remain derived

The following should generally **not** become manually maintained plan fields:

| Concept | Derive from |
|---|---|
| Ready / blocked | Status + Depends on |
| Direct unlock count | Reverse dependency graph |
| Transitive unlock count | Dependency graph |
| Dependency depth | Dependency graph |
| Quick Win | Effort + Priority + readiness + impact |
| Foundation / unblocker | Downstream dependency count |
| Recently implemented | Implemented at or Git history |
| Implementation-note presence | Filesystem |
| Filename/domain consistency | Filename + Domain |
| Next plan ID | Existing plan filenames |
| Plan ordering | Recommendation algorithm |

This keeps plan metadata small and prevents duplicated state.

---

## 16. Findings and recommended direction

### Findings

1. The current metadata model is already sufficient for a first-generation recommendation engine.
2. `Priority`, `Effort` and `Depends on` already form a useful quantitative basis.
3. `Domain` is controlled and validated.
4. `Subdomains` and `Tags` are intentionally open-ended and currently lack controlled vocabularies.
5. `Created` is documented but currently has little machine use.
6. Lifecycle timing is already recoverable from Git history.
7. `Implemented at` could provide a simpler explicit lifecycle timestamp, but should not duplicate existing history semantics accidentally.
8. The current `plans-recommended-order.ts` is already doing graph-based scoring, so expanding it should build on that mechanism rather than introducing a separate planner.

### Recommended metadata direction

Keep the core schema small:

```
Required:
  Created
  Status
  Priority
  Effort
  Depends on
  Domain

Optional:
  Subdomains
  Tags
  Roadmap
  Implemented at
```

Do **not** add a generic `Type: feature | bug | fix | gameplay` field yet.

Instead, use Tags for genuinely cross-cutting classification where needed, and derive recommendation categories from existing metadata plus dependency information.

The next logical step is to evolve `plans-recommended-order.ts` into multiple recommendation profiles, for example:

- Overall
- Quick Wins
- Gameplay
- Bugs / Fixes
- Performance
- Foundation / Unlockers

The scoring rules should remain in the generator, not in individual plan files.

---

## 17. Maintenance rule

When adding or changing plan metadata:

1. Update this document.
2. Update `docs/plans/PLANNING.md` if the authoring contract changes.
3. Update `scripts/docs/config.ts` if the field has a machine-readable controlled vocabulary.
4. Update affected generators/validators.
5. Regenerate derived documents instead of editing generated output manually.
6. Prefer derived signals over additional manually maintained metadata.

