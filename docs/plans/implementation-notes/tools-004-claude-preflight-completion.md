# Implementation Notes: Claude Preflight Completion

**Plan:** `tools-004-claude-preflight-completion.md`
**Status:** `planned` 📋
**Reviewed:** 2026-08-29

## Review summary

The plan is correctly scoped around the remaining gap observed in preflight v8: the tool can discover important architectural symbols and documented internal methods, but it can still stop one level above the concrete API/lifecycle boundary that Claude needs to modify.

The three reference cases establish the current baseline:

- `npc-002` — v7/v8 successfully expose decision/action and incoming-damage internal methods.
- `items-player-001` — v8 exposes the instance model and persistence-related symbols, but owner-aware discovery can still improve the path from `Inventory` to concrete serialization/creation APIs and from liquid-container instances to their rule definitions.
- `world-005` — large composition-root classes remain protected from internal-method dumps.

The implementation should therefore be incremental on top of v8.

## Source-of-truth files

Primary implementation:

- `scripts/claude/pre-implementation.ts`
- `scripts/docs/utils.ts`

Reference outputs:

- `docs/tmp/npc-002-claude-preflight-v8.md`
- `docs/tmp/items-player-001-claude-preflight-v8.md`
- `docs/tmp/world-005-claude-preflight-v8.md`

The current codebase remains authoritative over plan wording and previous generated output.

## Current v8 architecture

V8 already provides:

1. AST-based exported symbol discovery.
2. AST-based documented internal-symbol discovery.
3. Architectural metadata extraction through the existing helpers.
4. Qualified reference recognition such as `Owner.method()`.
5. Dependency-map integration using the existing Markdown dependency data.
6. Bounded key-symbol and implementation-anchor output.
7. Targeted source snippets rather than complete files/classes.

Do not replace these mechanisms.

## Required v9 behaviour

### Explicit references

Plan and implementation-notes references to concrete symbols/methods must have the highest relevance.

Examples:

```text
Inventory.instancesToJSON()
NpcAgent.applyIncomingCombatDamage()
```

The implementation must recognize these even when the symbol is an internal method.

Do not hard-code these examples.

### Owner-aware API discovery

When a selected symbol represents an owner such as a class/module, inspect its direct members for implementation boundaries relevant to the plan.

Relevant evidence may come from:

- explicit plan/notes references,
- qualified references,
- architectural tags,
- direct AST call/reference relationships,
- lifecycle/serialization/construction semantics,
- relationships already available from the selected symbol.

Keep expansion bounded to a small local neighbourhood.

Do not recursively traverse the entire call graph or dependency graph.

### API categories

The selection should favour concrete boundaries such as:

- construction/creation,
- cloning,
- add/remove/update,
- serialization/deserialization,
- migration,
- lifecycle transitions,
- integration points.

These are semantic categories, not a hard-coded method-name list.

A method should not be selected merely because its name looks similar to a plan term.

## Selection and scoring

Maintain the v8 global limits:

- max 12 key symbols,
- max 8 implementation anchors.

Do not increase these limits to solve discovery problems.

Use a relevance ordering equivalent to:

```text
explicit plan/notes implementation reference
    >
direct owner/API/lifecycle relation
    >
strong architectural relation
    >
qualified call/reference relation
    >
broad concept/dependency relevance
```

The exact implementation may use the existing scoring structure, but high-confidence candidates must not be discarded solely because another low-confidence candidate from the same file was selected first.

## Per-file cap

Review the existing `maxSymbolsPerFile` behaviour.

A per-file cap is useful for preventing method dumps, but it must not suppress several high-confidence implementation points from the same central class.

Recommended semantics:

- explicit references: exempt from the broad-discovery cap;
- direct implementation/lifecycle points: strongly preferred and allowed within the global budget;
- broad metadata matches: subject to the normal per-file cap.

Do not remove the cap globally.

## JSDoc policy

Do not add JSDoc as a workaround for weak symbol selection.

Only add or extend a doc block when:

1. the symbol is genuinely an architectural/integration boundary,
2. existing AST information is insufficient,
3. the metadata describes a true relationship in the current code.

Prefer existing tags:

```text
@domain
@system
@role
@owns
@uses
@produces
@consumes
@simulation
@performance
@lifecycle
@integration
```

Keep existing prose intact when possible.

## Expected reference paths

### npc-002

The result should retain the v8-level visibility of:

```text
need/pressure
  ↓
decision/update
  ↓
beginNeed()
  ↓
startAction()
  ↓
NpcPlannedAction / ActionLifecycle
```

and:

```text
combat damage
  ↓
applyIncomingCombatDamage()
  ↓
takeDamage()
  ↓
HealthState
```

No additional hard-coded rules for this plan.

### items-player-001

The result should make the implementation path discoverable:

```text
ItemInstance
  ↓
Inventory
  ├── creation/cloning
  ├── serialization
  └── deserialization
  ↓
SaveData
```

and:

```text
LiquidContainerItemInstance
  ↓
liquid-container definition/rules
  ↓
capacity / allowed-liquid
```

Concrete method names should only appear if they exist in the current code.

## Output constraints

The preflight is a context-reduction tool.

Do not add:

- complete classes,
- complete files,
- complete dependency graphs,
- redundant sections,
- a generic list of every method in a selected class.

Implementation anchors should remain short enough to let Claude decide which source ranges require further reading.

The output should become more useful, not merely longer.

## Verification matrix

Use these three plans as regression tests:

| Plan | Purpose |
|---|---|
| `npc-002` | internal lifecycle/decision/damage discovery |
| `items-player-001` | owner-aware API + persistence discovery |
| `world-005` | protection against broad internal-method noise |

Generate fresh outputs and compare with v8.

Acceptance:

- npc-002 retains its useful v8 context.
- items-player-001 gains the missing direct API path where the current code supports it.
- world-005 remains compact and does not become a method dump.
- no plan-specific hard-coded symbol names are introduced.
- no second AST parser/index is introduced.
- no uncontrolled repository-wide rescanning is introduced.
- global output limits remain bounded.
- redirected output remains clean.

## Verification commands

```bash
pnpm --silent claude:preflight npc-002 > docs/tmp/npc-002-claude-preflight-v9.md
pnpm --silent claude:preflight items-player-001 > docs/tmp/items-player-001-claude-preflight-v9.md
pnpm --silent claude:preflight world-005 > docs/tmp/world-005-claude-preflight-v9.md
```

Run focused lint/typecheck/tests applicable to the changed scripts only. Avoid unrelated expensive suites.

## Review findings translated into implementation constraints

1. **Do not solve missing context by increasing output limits.**
2. **Do not solve missing context by adding JSDoc everywhere.**
3. **Do not special-case `Inventory`, `NpcAgent`, or `createApp`.**
4. **Prefer relationships already available from the AST and existing metadata.**
5. **Keep discovery local and bounded.**
6. **Keep v8 as the baseline; this is an incremental completion, not a rewrite.**

## Completion

The plan is complete when a real Claude Code implementation can use preflight to identify the small set of likely implementation boundaries for the three reference plans without opening large central files merely to discover where to start.

**Zrób git commit i push do main, rebase jeżeli trzeba**
