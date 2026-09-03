# Plan: plan metadata contract, migration and documentation generation

**Created:** 2026-09-03
**Status:** `planned` 📋
**Type:** infrastructure
**Priority:** high · **Effort:** L
**Depends on:** -
**Domain:** `tools`
**Subdomains:** `development` `automation` `diagnostics`
**Tags:** `tooling` `documentation`
**Roadmap:** `tools.md`

## Goal

Make plan metadata consistent, machine-validated and maintainable from one TypeScript source of truth.

The work covers:

1. extending `scripts/docs/config.ts` with the canonical plan metadata vocabulary;
2. validating the expanded metadata contract;
3. migrating existing `planned` plans;
4. generating metadata documentation from the configuration;
5. keeping generated documentation sections compact and human-readable;
6. preparing the metadata for richer recommendation profiles in `plans-recommended-order.ts`.

## Scope

### 1. Canonical metadata configuration

Extend `scripts/docs/config.ts` so it is the single machine-readable source of truth for:

- `Status` values;
- `Type` values;
- `Priority` values;
- `Effort` values;
- canonical `Domain` values;
- Domain summaries;
- recommended Subdomains per Domain;
- recommended global Tags;
- metadata parsing/validation patterns where appropriate.

Closed vocabularies:

- Type: `feature`, `bug`, `fix`, `polish`, `optimization`, `refactor`, `infrastructure`;
- Status: `draft`, `planned`, `in progress`, `verification needed`, `done`;
- Priority: `high`, `medium`, `low`;
- Effort: `XS`, `S`, `M`, `L`, `XL`;
- Domain: the existing 12 canonical domains.

Open/recommended vocabularies:

- Subdomains;
- Tags.

`Roadmap` remains optional and is validated against roadmap files rather than a closed enum.

`Implemented at` is optional and uses `YYYY-MM-DD HH:mm`.

### 2. Metadata validation

Update `scripts/docs/plans-sync.ts` and related parsing/configuration code so the plan contract is enforced.

Required:

- Created;
- Status;
- Type;
- Priority;
- Effort;
- Depends on;
- Domain.

Optional:

- Subdomains;
- Tags;
- Roadmap;
- Implemented at.

Validation must reject missing/invalid closed-vocabulary values and invalid metadata formats. It must preserve existing dependency, filename/domain and index consistency checks.

Subdomains and Tags should remain extensible; unknown values should not be treated as invalid closed-enum values.

### 3. Existing-plan migration

Create a focused migration script, e.g. `scripts/docs/migrate-plan-metadata.ts`.

The migration targets existing plans with `Status: planned`.

It should:

- discover plans through the existing plan discovery/configuration mechanisms;
- identify missing metadata;
- infer/propose `Type` from the actual plan content;
- propose Subdomains and Tags where useful;
- distinguish confident classifications from cases requiring review;
- provide a dry-run/report mode before writing;
- avoid silently inventing classifications;
- preserve existing content and formatting outside the metadata block;
- allow the final migration to be rerun safely without duplicating fields.

`Implemented at` must not be fabricated during migration.

The migration must leave all planned plans valid according to the updated validator.

### 4. Documentation generator

Create a documentation generator, e.g. `scripts/docs/generate-plan-docs.ts`.

It must derive documentation from `scripts/docs/config.ts` and update only designated sections identified by their Markdown headings.

Do not use `BEGIN GENERATED` / `END GENERATED` markers.

Initial generated sections:

- `docs/plans/README.md`
  - status/priority/effort/type reference;
  - `## Plan domains` table with Domain, Summary and Subdomains;
- `docs/plans/PLANNING.md`
  - compact metadata contract;
  - available metadata values;
  - `Domain / Summary / Subdomains` table;
- `docs/plans/PLAN-METADATA.md`
  - detailed metadata contract;
  - closed vocabularies;
  - recommended Subdomains/Tags;
  - Roadmap and Implemented-at semantics.

The generator must use stable section headings and replace the content belonging to the selected heading without disturbing surrounding hand-written documentation.

### 5. Documentation contract

Update the four plan documents to reflect the new contract:

- `docs/plans/README.md`;
- `docs/plans/PLANNING.md`;
- `docs/plans/PLAN-METADATA.md`;
- `docs/plans/DEPENDENCIES.md`.

README and PLANNING must remain compact enough for agents to consume directly without reading the full metadata reference.

DEPENDENCIES remains a generated recommendation/dependency output. It should not become a second metadata source of truth. Only make changes needed to accommodate the expanded recommendation/documentation contract.

## 6. Plan metadata cleanup and migration tooling

The documentation tooling should include a dedicated cleanup/migration script for correcting plan metadata inconsistencies that cannot be safely handled by the normal synchronization flow.

### Duplicate plan IDs

The cleanup script must detect duplicate plan IDs within the same domain.

When a duplicate is found:

* preserve the ID of the existing/older canonical plan,
* assign the next available ID from the same domain to the duplicate plan,
* rename the plan file accordingly,
* update the plan's metadata if the ID is represented there,
* update references to the renamed plan where they are part of the managed documentation,
* preserve the original plan content apart from the required ID/path changes,
* never silently overwrite an existing plan.

The script must determine the replacement ID from the actual plan files rather than relying only on `docs/plans/README.md`.

The operation should be deterministic and should report every rename, for example:

```text
Duplicate ID detected: fauna-003
  existing: fauna-003-wolf-settlement-entry.md
  duplicate: fauna-003-horse-riding.md
  reassigned: fauna-004-horse-riding.md
```

If the script cannot determine which file should retain the original ID safely, it must fail rather than make an arbitrary choice.

### Implementation-notes path normalization

Implementation notes belong exclusively in:

```text
docs/plans/implementation-notes/
```

The cleanup script must detect implementation-notes files incorrectly placed directly in:

```text
docs/plans/
```

and move them to the canonical directory.

For example:

```text
docs/plans/fauna-003-horse-riding-implementation-notes.md
```

must become:

```text
docs/plans/implementation-notes/fauna-003-horse-riding-implementation-notes.md
```

The script must:

* detect misplaced implementation-notes files,
* create the canonical directory if necessary,
* move the file without modifying its contents,
* refuse to overwrite an existing file with the same destination path,
* report every migration,
* ensure subsequent documentation-generation scripts use only the canonical location.

### Safety and idempotency

The cleanup script must be safe to run repeatedly.

After a successful run:

* no duplicate plan IDs remain within a domain,
* no implementation-notes files remain directly under `docs/plans/`,
* running the script again produces no further changes,
* conflicts cause an explicit failure instead of destructive behaviour.

The cleanup operation should be separate from the normal README synchronization so that metadata repair is an explicit maintenance operation rather than an implicit side effect of documentation generation.

### 7. Verification and integration

Add/update tests or script-level checks for:

- every closed metadata value;
- missing required Type;
- invalid Type;
- invalid Domain;
- optional Subdomains/Tags;
- optional Roadmap;
- valid/invalid Implemented-at format;
- migration idempotence;
- Markdown section replacement;
- generated Domain/Subdomain documentation matching config;
- planned-plan completeness after migration.

Run the existing documentation validation/generation workflow and confirm generated files are stable on a second run.

## Non-goals

- Do not redesign the plan recommendation algorithm in this plan.
- Do not add a second metadata configuration file if the existing `config.ts` can cleanly own the contract.
- Do not make Subdomains or Tags closed enums.
- Do not require Roadmap.
- Do not fabricate historical `Implemented at` timestamps.
- Do not rename legacy plan files solely for metadata normalization.
- Do not introduce generated HTML markers into Markdown.
- Do not perform unrelated documentation or repository-wide refactors.

## Dependencies and integration points

Primary existing systems:

- `scripts/docs/config.ts`
- `scripts/docs/plans-sync.ts`
- `scripts/docs/plans-recommended-order.ts`
- `scripts/docs/plans-done.ts`
- `scripts/docs/planned-plans-without-notes.ts`
- `scripts/claude/pre-implementation.ts`
- `docs/plans/README.md`
- `docs/plans/PLANNING.md`
- `docs/plans/PLAN-METADATA.md`
- `docs/plans/DEPENDENCIES.md`

The existing plan parser/discovery logic should be reused rather than creating a parallel plan scanner.

## Implementation order

1. Recon existing config/parser/test helpers and identify reusable utilities.
2. Extend `config.ts` with the canonical metadata configuration.
3. Update metadata parsing and validation.
4. Add focused tests/checks for the new contract.
5. Implement the documentation section generator.
6. Regenerate/update README, PLANNING and PLAN-METADATA.
7. Implement the migration report/dry-run mode.
8. Review proposed Type/Subdomain/Tag values for all `planned` plans.
9. Execute the migration.
10. Run full documentation synchronization/validation.
11. Confirm generated documentation is idempotent.
12. Leave `plans-recommended-order.ts` ready for a separate follow-up that uses Type/Tags/Roadmap for recommendation profiles.

## Verification

Success criteria:

- every `planned` plan contains a valid Type;
- every plan has a valid required Domain;
- closed metadata values have exactly one machine-readable source of truth;
- generated Domain documentation matches `config.ts`;
- README/PLANNING contain all values an implementation agent needs without requiring PLAN-METADATA.md;
- PLAN-METADATA remains the detailed reference/audit;
- rerunning the documentation generator produces no diff;
- rerunning the migration produces no duplicate or changed metadata;
- existing dependency/index generation remains correct;
- no legacy plan is renamed or semantically altered outside the intended metadata migration.

**Zrób git commit i push do main, rebase jeżeli trzeba**
