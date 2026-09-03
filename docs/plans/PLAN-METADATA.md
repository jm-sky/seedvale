# Plan Metadata

**Status:** `reference`  
**Last audited:** 2026-09-03  
**Scope:** plan files in `docs/plans/`, planning documentation and plan-related generators/scripts.

This document is the audit of plan metadata: what fields exist, what values are allowed or recommended, why they exist, and which repository tooling consumes them.

The repository source code is authoritative. This document describes the current planning contract; it is not a substitute for code recon.

---

## 1. Current plan header

The canonical plan header is:

```md
# Plan: <name>

**Created:** YYYY-MM-DD
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** S
**Depends on:** ~~005~~ ~~008~~
**Domain:** `npc`
**Subdomains:** `behavior` `decision-making`
**Tags:** `gameplay` `combat`
**Roadmap:** `npc-ai.md`
```

Required metadata:

- `Created`
- `Status`
- `Type`
- `Priority`
- `Effort`
- `Depends on`
- `Domain`

Optional metadata:

- `Subdomains`
- `Tags`
- `Roadmap`
- `Implemented at`

---

## 2. Metadata contract

| Field | Required | Values | Primary purpose | Current consumers |
|---|---|---|---|---|
| `Created` | yes | `YYYY-MM-DD` | Plan creation date | Documentation-level in audited generators |
| `Status` | yes | `draft`, `planned`, `in progress`, `verification needed`, `done` | Lifecycle | `plans-sync.ts`, `plans-recommended-order.ts`, `plans-done.ts`, `planned-plans-without-notes.ts` |
| `Type` | yes | `feature`, `bug`, `fix`, `polish`, `optimization`, `refactor`, `infrastructure` | Kind of work | Planned future recommendation/filtering input |
| `Priority` | yes | `high`, `medium`, `low` | Relative planning priority | `plans-sync.ts`, `plans-recommended-order.ts` |
| `Effort` | yes | `XS`, `S`, `M`, `L`, `XL` | Approximate implementation cost | `plans-sync.ts`, `plans-recommended-order.ts` |
| `Depends on` | yes | plan IDs, `-` / `none` | Implementation prerequisites | `plans-sync.ts`, `plans-recommended-order.ts`, dependency graph |
| `Domain` | yes | canonical domain list | Primary ownership/navigation | `plans-sync.ts`; filename convention; planning docs |
| `Subdomains` | no | recommended per-domain values; extensible | More precise navigation/preflight hints | Planning/preflight context |
| `Tags` | no | recommended global values; extensible | Cross-cutting classification/navigation | Planning/preflight context |
| `Roadmap` | no | roadmap filename in `docs/roadmap/` | Strategic direction and grouping | Documentation/preflight context |
| `Implemented at` | no | `YYYY-MM-DD HH:mm` | Explicit implementation completion timestamp | Not yet consumed |

### Classification model

```
Type        = what kind of work is this?
Domain      = where does it primarily belong?
Subdomains  = which more specific areas does it concern?
Tags        = which cross-cutting concepts apply?
Roadmap     = which higher-level development direction does it support?
```

Do not use Tags as a replacement for Type, Domain, or Roadmap.

Do not turn derived concepts such as readiness, unlock potential, or quick-win status into manually maintained metadata.

---

## 3. Type

### Allowed values

`Type` is a required classification with this fixed vocabulary:

- `feature`
- `bug`
- `fix`
- `polish`
- `optimization`
- `refactor`
- `infrastructure`

### Semantics

| Type | Meaning |
|---|---|
| `feature` | New functionality, capability, or world/system behaviour |
| `bug` | Correction of behaviour that is objectively incorrect or broken |
| `fix` | Deliberate correction/improvement of an existing implementation that is not necessarily a bug |
| `polish` | Quality improvement such as UX, visual presentation, animation, audio, feedback, or feel |
| `optimization` | Performance/scalability/resource-cost improvement |
| `refactor` | Internal restructuring without intended behavioural change |
| `infrastructure` | Tooling, build, development infrastructure, scripts, CI, or other supporting infrastructure |

### `bug` vs `fix`

Use `bug` when the current behaviour is wrong.

Use `fix` when the current solution works but needs a deliberate correction or improvement.

`gameplay` is **not** a Type. It is a cross-cutting concept and belongs in Tags.

`research` is deliberately **not** a Type. Recon, investigation, and experiments should normally be represented by the plan itself, implementation notes, or an appropriate existing Type.

---

## 4. Status

### Allowed values

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
| `verification needed` | Implementation is complete enough to require meaningful browser/manual verification |
| `done` | Implementation and required verification are complete |

`verification needed` and `done` satisfy dependencies.

Only `planned` plans are currently ranked by the recommendation generator.

---

## 5. Priority

Allowed values:

- `high`
- `medium`
- `low`

Current recommendation weights:

| Priority | Weight |
|---|---:|
| high | 30 |
| medium | 20 |
| low | 10 |

Priority is a quantitative planning signal.

---

## 6. Effort

Allowed values:

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

This naturally supports future **Quick Wins** recommendations.

---

## 7. Depends on

`Depends on` contains implementation prerequisites represented by plan IDs.

Examples:

```md
**Depends on:** -
```

```md
**Depends on:** ~~015~~ ~~npc-014~~
```

Semantics:

- A dependency is a prerequisite, not thematic overlap.
- `done` and `verification needed` satisfy dependencies.
- Unknown dependencies are errors.
- Dependency cycles are detected.
- The reverse graph provides direct and transitive unlock information.

This is currently the strongest structural input to recommendation scoring.

---

## 8. Domain

### Canonical values

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

Domain is the primary ownership classification and a canonical grouping/filtering dimension.

New plans use:

```
<domain>-<id>-<title>.md
```

Filename and `Domain:` must agree.

---

## 9. Subdomains

Example:

```md
**Subdomains:** `household` `logistics`
```

### Value model

Subdomains are **recommended vocabulary, not a global enum**.

Recommended values should be documented per Domain and can be extended when the existing vocabulary does not describe the plan adequately.

Examples:

| Domain | Suggested Subdomains |
|---|---|
| `npc` | `behavior`, `needs`, `goals`, `decision-making`, `relationships`, `memory`, `lifecycle`, `work`, `combat`, `dialogue` |
| `fauna` | `predation`, `prey`, `habitat`, `reproduction`, `migration`, `lifecycle`, `population`, `domestication` |
| `settlements` | `buildings`, `population`, `resources`, `development`, `economy` |
| `settlements-npcs` | `household`, `schedules`, `economy`, `logistics`, `social` |
| `world` | `resources`, `places`, `time`, `weather`, `events`, `simulation` |
| `world-terrain` | `terrain`, `chunks`, `vegetation`, `roads`, `landmarks`, `rendering` |
| `items-player` | `inventory`, `items`, `tools`, `interaction`, `player-needs` |
| `quests-progression` | `quests`, `relationships`, `progression`, `rewards` |
| `persistence` | `save-data`, `serialization`, `storage`, `migration` |
| `ui-input` | `hud`, `menus`, `input`, `interaction`, `feedback` |
| `tools` | `debug`, `development`, `diagnostics`, `automation` |
| `ai` | `dialogue`, `characterisation`, `generation`, `agents` |

These are starting recommendations, not a closed schema.

---

## 10. Tags

Example:

```md
**Tags:** `gameplay` `economy`
```

Tags are **global recommended vocabulary with an extensible/open model**.

Recommended tags include:

- `gameplay`
- `bug`
- `combat`
- `economy`
- `persistence`
- `performance`
- `ui`
- `visual`
- `audio`
- `animation`
- `simulation`
- `multiplayer`
- `ai`
- `polish`
- `tooling`

Use a new tag when it represents a useful cross-cutting concept that cannot be expressed adequately by existing tags.

Avoid tags that merely duplicate:

- Type
- Domain
- Status
- Priority
- Effort
- Roadmap

---

## 11. Roadmap

Example:

```md
**Roadmap:** `npc-ai.md`
```

Roadmap is **optional**.

The value points to a file in `docs/roadmap/`.

### Semantics

Roadmap identifies the higher-level development direction or initiative to which the plan contributes.

It is also a useful **grouping/filtering dimension**:

- one Roadmap can contain plans from multiple Domains;
- one Domain can contain plans belonging to multiple Roadmaps;
- a plan should normally reference at most one Roadmap.

This creates two independent grouping axes:

```
Domain  = architectural/system area
Roadmap = strategic development direction
```

Roadmap is not another priority system.

---

## 12. Created

Format:

```
YYYY-MM-DD
```

Created is plan provenance. It is currently not a significant input to recommendation scoring.

---

## 13. Implemented at

**Accepted metadata field.**

Example:

```md
**Implemented at:** 2026-09-03 00:42
```

### Semantics

Record when the implementation work was completed and the plan reached the state where implementation is ready for or undergoing verification.

It is **not** the browser/manual verification timestamp.

Lifecycle:

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

### Format

Use:

```
YYYY-MM-DD HH:mm
```

The repository should standardize the timezone. Prefer UTC for an unambiguous machine-readable history, or explicitly document `Europe/Warsaw` if the project intentionally uses local project time.

### Relationship to Git history

`scripts/docs/plans-done.ts` currently derives lifecycle transition dates from Git history.

`Implemented at` is explicit plan metadata and does not replace Git-derived history.

Future uses may include:

- recent implementation context;
- implementation velocity;
- time-to-implementation analysis;
- recently implemented feature/fix lists;
- recommendation freshness.

---

## 14. Legacy plans

The repository contains legacy date/global-ID plan filenames such as:

```
2026-08-20--177--npc-combat.md
```

New plans use domain-local IDs such as:

```
npc-018-...
```

Do not migrate legacy plans solely to normalize metadata unless migration is explicitly planned.

---

## 15. Current script usage

### `scripts/docs/config.ts`

Central source for metadata regexes, Status/Priority/Effort types, plan paths, filename conventions, completed statuses, and priority icons.

### `scripts/docs/plans-sync.ts`

Uses:

- Status
- Priority
- Effort
- Depends on
- Domain

It validates domains, filename/domain agreement, and synchronizes plan indexes and implementation-note markers.

### `scripts/docs/plans-recommended-order.ts`

Uses:

- Status
- Priority
- Effort
- Depends on

Current score combines:

- priority;
- direct dependents;
- transitive dependents;
- dependency depth;
- effort penalty.

This is the natural foundation for future recommendation profiles.

### `scripts/docs/plans-done.ts`

Uses Status and Domain and Git history to reconstruct lifecycle transition dates.

### `scripts/docs/planned-plans-without-notes.ts`

Uses Status to select planned plans and checks implementation-note presence.

### `scripts/claude/pre-implementation.ts`

Planning metadata can provide navigation hints, especially Domain, Subdomains and Tags. It does not replace recon of the current codebase.

---

## 16. Derived values

Do not add manual fields for concepts that can be calculated:

| Concept | Derive from |
|---|---|
| Ready / blocked | Status + Depends on |
| Direct unlock count | Reverse dependency graph |
| Transitive unlock count | Dependency graph |
| Dependency depth | Dependency graph |
| Quick Win | Effort + Priority + readiness + impact |
| Foundation / unlocker | Downstream dependency count |
| Recently implemented | Implemented at / Git history |
| Implementation-note presence | Filesystem |
| Filename/domain consistency | Filename + Domain |
| Next plan ID | Existing plan filenames |
| Plan ordering | Recommendation algorithm |

---

## 17. Findings and direction

1. The core metadata should remain small and explicit.
2. `Type` is useful because it describes the kind of work and is not equivalent to Domain or Tags.
3. `Type` is a fixed vocabulary: `feature`, `bug`, `fix`, `polish`, `optimization`, `refactor`, `infrastructure`.
4. `research` is intentionally not a Type.
5. `Subdomains` should have recommended values per Domain, but remain extensible.
6. `Tags` should have a global recommended vocabulary, but remain extensible.
7. `Roadmap` is optional and should be treated as a strategic grouping/filtering dimension.
8. `Implemented at` should be an optional explicit timestamp.
9. Recommendation categories should be derived from metadata and dependency graph rather than stored as fields.

A future `plans-recommended-order.ts` can expose profiles such as:

- Overall
- Quick Wins
- Gameplay
- Bugs / Fixes
- Performance
- Polish
- Foundation / Unlockers
- Per Domain
- Per Roadmap

---

## 18. Maintenance rule

When adding or changing plan metadata:

1. Update this document.
2. Update `docs/plans/PLANNING.md` if the authoring contract changes.
3. Update `scripts/docs/config.ts` for controlled machine-readable values.
4. Update affected generators/validators.
5. Regenerate derived documents instead of editing generated output manually.
6. Prefer derived signals over additional manually maintained metadata.
