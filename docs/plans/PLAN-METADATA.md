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
| `ai` | `dialogue`, `characterisation`, `generation`, `agents` |
| `fauna` | `predation`, `prey`, `habitat`, `reproduction`, `migration`, `lifecycle`, `population`, `domestication` |
| `items-player` | `inventory`, `items`, `tools`, `interaction`, `player-needs` |
| `npc` | `behavior`, `needs`, `goals`, `decision-making`, `relationships`, `memory`, `lifecycle`, `work`, `combat`, `dialogue` |
| `persistence` | `save-data`, `serialization`, `storage`, `migration` |
| `quests-progression` | `quests`, `relationships`, `progression`, `rewards` |
| `settlements` | `buildings`, `population`, `resources`, `development`, `economy` |
| `settlements-npcs` | `household`, `schedules`, `economy`, `logistics`, `social` |
| `tools` | `debug`, `development`, `diagnostics`, `automation` |
| `ui-input` | `hud`, `menus`, `input`, `interaction`, `feedback` |
| `world` | `resources`, `places`, `time`, `weather`, `events`, `simulation` |
| `world-terrain` | `terrain`, `chunks`, `vegetation`, `roads`, `landmarks`, `rendering` |

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

### Currently available roadmaps

- `domain-debug-and-simulation-observability`
- `economy-goods-flow`
- `economy-production`
- `horse-and-riding`
- `npc-ai`
- `npc-professions-households-and-age`
- `physical-resource-storage-and-logistics`
- `player-construction`
- `textiles-and-herbal-medicine`
- `workforce-for-hire`

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

## 18. Metadata repair (self-healing)

**Status:** `implemented` (tools-011)

Missing, unnormalized or conflicting metadata is a data-quality problem, not a pipeline error — a plan generated with incomplete metadata (for example by ChatGPT) does not fail `pnpm plans:sync` / `pnpm docs:sync`. `repairPlanMetadata()` in `scripts/docs/plan-metadata.ts` is the single repair implementation, shared by `plans-sync.ts` (runs before any other metadata consumer) and `migrate-plan-metadata.ts` (`pnpm plans:migrate-metadata`, scoped to `Status: planned` plans, `--write` to apply). It parses the header, repairs in memory, writes the whole file back as one change when anything changed, and re-parses the result — never independent per-field writes.

It is deterministic and idempotent (`repair(repair(x)) === repair(x)`) and never throws for a metadata-quality issue — it fixes what it safely can and reports the rest via `repair.warnings` (kept as warnings on `console.warn`, not `console.error`/an exception). It only throws for an actual technical failure (a file read/write error, a generator bug) — that distinction is the point of this design.

Inference hierarchy for a missing value: explicit metadata → filename → title → safe default. Body content is never used as a signal — no semantic classifier.

| Field | Missing | Invalid/conflicting |
|---|---|---|
| `Domain` | inferred from filename (`<domain>-<id>-...md`) when the filename resolves to a canonical domain; otherwise left unset + warning | filename wins over a conflicting value; an invalid value with no filename signal is left unchanged + warning |
| `Type` | inferred from a narrow keyword list against title/filename (`fix`, `bug`fix, `optimization`/`performance`, `refactor`, `polish`, `infrastructure`), then the `tools` domain defaults to `infrastructure`, else `feature` — but only for a `planned` plan; a non-`planned` plan missing `Type` is left alone (matches `validatePlanHeader`, which doesn't require it there either) | replaced using the same inference, with a warning |
| `Status` | defaulted to `planned` + warning | unrecognized value (not a known status modulo case/whitespace) falls back to `planned` + warning; the icon after the value is fixed in place (missing, stale, or a similar-but-wrong emoji) without touching any trailing prose on the line |
| `Priority` | defaulted to `medium`, unless the plan is `done`/`verification needed` (matches `validatePlanHeader`) | case normalized silently; an unrecognized value defaults to `medium` + warning |
| `Effort` | defaulted to `S`, unless the plan is `done`/`verification needed` | case normalized silently; an unrecognized value defaults to `S` + warning |
| `Depends on` | defaulted to `-` + warning | see local dependency IDs below |
| `Created` / `Implemented at` | **never fabricated** — a missing `Created` is left unset + warning; an invalid format on either field is left unchanged + warning | same |
| `Roadmap` | not inferred | a value that doesn't match a file in `docs/roadmap/` is left unchanged + warning (checked only when the caller supplies `roadmapFiles`) |
| `Subdomains` / `Tags` | not inferred | reformatted to the canonical `` `a` `b` `` form when the current formatting (comma-separated, bracketed, ...) differs |

### Local dependency IDs

A plan's own domain (from its filename) makes `Depends on` IDs local: `Depends on: 001` on `npc-018-....md` means `npc-001`. `~~001~~`/`` `001` `` (struck-through/backtick-wrapped, i.e. already-satisfied) expand the same way; an explicit `npc-001` or `fauna-003` is left untouched; mixed lists normalize just the bare tokens.

This is deliberately conservative: the repository also has pre-domain legacy plans identified by a bare **global** numeric ID (e.g. `177`, resolved by `plans-recommended-order.ts` against `docs/plans/archive/`), so a bare 3-digit token is ambiguous between "local to this domain" and "legacy global ID" — nothing in the token itself disambiguates it. A bare ID is therefore only expanded when `<current-domain>-<id>` is an actual existing plan (`RepairPlanMetadataOptions.existingPlanIds`, built from every current non-legacy plan file); otherwise it's left exactly as written. Expanding an unresolved bare ID would silently point a real plan at a nonexistent one and break `plans-recommended-order.ts`'s dependency graph — this was caught during this feature's own real-repository verification pass, where several existing plans turned out to depend on legacy IDs, not local ones.

### What's a warning vs. a real error

A warning (`repair.warnings`, printed via `console.warn`) means: something couldn't be safely repaired or inferred, so it was left as-is — review it manually, but the pipeline still succeeds. A real error (an uncaught exception, `process.exitCode = 1`) means an actual technical failure: a file couldn't be read/written, or a generator hit a bug. Repair must never blur this line by swallowing a real error into a warning, or by throwing for a metadata-quality issue.

---

## 19. Maintenance rule

When adding or changing plan metadata:

1. Update this document.
2. Update `docs/plans/PLANNING.md` if the authoring contract changes.
3. Update `scripts/docs/config.ts` for controlled machine-readable values.
4. Update affected generators/validators.
5. Regenerate derived documents instead of editing generated output manually.
6. Prefer derived signals over additional manually maintained metadata.
