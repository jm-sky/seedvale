# Review 014: AI Agent Workflow & Repository Audit

**Status:** `done`
**Date:** 2026-08-15
**Scope:** Repository audit for AI-agent (Claude Code + Cursor Agent) context/cost optimization — orientation speed, documentation duplication, plan domains, automation, skills, MCP, Claude-vs-Cursor split, multi-agent git workflow. Read-only: repo files, `git log`, `docs/`, `.claude/`, package/tooling config.
**Not in scope:** implementation of the recommendations below; no code changes in this review.
**Method:** read `CLAUDE.md`, `README.md`, `docs/{STATE,VISION,ROADMAP,ARCHITECTURE}.md`, `docs/plans/README.md` + a sample plan, `docs/{reviews,research,issues,archive}/README.md`, `docs/roadmap/`, `docs/prompts/`, `.claude/`, package.json/eslint/CI config, `git log --oneline -50`. No browser session; no code execution beyond `ls`/`grep`/`wc`.

---

## 0. Prior work check

No prior audit of AI-agent workflow / context optimization exists in this repo. Grepped `context optim`, `ai readiness`, `agent workflow`, `token budget`, `context budget`, `context window` across `docs/` + `CLAUDE.md` + `README.md`: the only hit is `docs/VISION.md` §3 ("The world is the AI system"), which is about in-game NPC intelligence, not agent tooling — a false positive, not prior art. Reviews 002/005/012/013 cover performance/architecture, a different scope. Nothing here duplicates existing work.

`.claude/` contains only `settings.local.json` (a 5-entry Bash permission allowlist) — no skills, agents, or commands. No `.cursor/` directory or `.cursorrules` anywhere in the repo. No references to "agent-browser" anywhere in the repo (docs, package.json, scripts). No `.github/workflows` — there is no CI.

---

## A. What already works well — do not change

1. **`CLAUDE.md` (159 lines)** already has the target shape: a "Read order" list, a compact doc table, an explicit 9-step "Plan execution rules" section, and a "Truth hierarchy" (code > tests/build > implementation notes/reviews > plan > roadmap/vision). This is close to the model the audit brief asks for.
2. **`docs/STATE.md`** is the best-designed document in the repo for agent orientation: an explicit "read this first" order, an explicit "source of truth rule" (code wins over docs), a list of shared concepts to check before adding a new abstraction, and an explicit "not implemented / intentionally deferred" list. It is domain-organized (World/terrain, Settlements/NPCs, Fauna, Items/player, Quests, Persistence, UI) in a single 191-line file.
3. **`docs/plans/README.md`** is a disciplined single-file plan index with a declared invariant ("every `docs/plans/*.md` file appears in exactly one section") and per-row implementation-status prose (e.g. *"zaimplementowane, techniczna weryfikacja zielona; brak testu w przeglądarce"*). An agent can usually decide relevance from the index row alone, without opening the plan file.
4. **Naming convention** `YYYY-MM-DD--NNN--slug.md` is consistently applied across `plans/`, `reviews/`, `issues/`, and `research/` — cheap, greppable, chronological + stable ID.
5. **`docs/issues/README.md`** is a clean single-table index with a `Next ID` field, cheap to append to correctly.
6. **Domain groupings already exist organically.** `docs/plans/README.md`'s "Done" snapshot and `docs/plans/archive/README.md`'s grouping (Osady/wioski, Las/narzędzia/zbieractwo, Fauna/jaskinie, Fizyka, UI/audio/rest, NPC) already match `STATE.md`'s section headers and `ARCHITECTURE.md`'s `WorldBundle` member list. Domains do not need to be invented — they need to be named.
7. **`docs/plans/archive/`** (114 files) is correctly kept out of the default navigation flow — `STATE.md`/`CLAUDE.md` never route an agent there directly, so its size doesn't cost anything unless a domain doc (`SETTLEMENTS.md`/`WATER.md`/`GRAPHICS.md`) links into it for history.

---

## B. Problems

### 🔴 High

1. **Root `README.md` is stale and internally contradictory.** Lines 1–148 are an English essay duplicating `VISION.md`'s content conceptually. Lines 150–203 are a *different, older* Polish document describing the project as `v0.1 w toku — teren + chodzenie` (terrain-and-walking spike), with a roadmap table showing v0.2/v0.3/v0.4 as `todo` — while `STATE.md` shows settlements, quests, fauna herds, house construction and much more already implemented. `git log` shows only `Initialize...` → `Update README.md` → one archive-related commit; it was never revised alongside the rest of the docs. It isn't in `CLAUDE.md`'s read order (which correctly starts at `STATE.md`), so an agent following the rules is safe — but README is the default first-contact file for a human, a fresh Cursor session with no rules loaded, or any generic "check the README" behavior, and it actively misdescribes project maturity.
2. **The `WorldBundle`-rebuild invariant is stated independently in three files.** `CLAUDE.md` ("Important architecture"), `docs/STATE.md` ("Runtime architecture"), and `docs/ARCHITECTURE.md` ("World lifecycle" + "Rebuild / lifetime invariants") each restate, in different words, "don't capture a replaceable bundle field in a stale closure." If the invariant changes, three places need edits, and drift is not hypothetical — see #3.
3. **`CLAUDE.md`'s "Important entry points" file list is already stale relative to `STATE.md`'s.** `STATE.md`'s equivalent list has grown to include `houseBuilder.ts`, `props.ts`, `constructionCatalog.ts`, `economy/`, `campfireCooking.ts`, `PlayerNeeds.ts`, `WaterSource.ts`, `dayNight.ts`, `treeLifecycle.ts`; `CLAUDE.md`'s list is the older, shorter subset. Two copies of "the same information" have measurably diverged.
4. **`docs/roadmap/` (lowercase, 4 files: `00-current-state.md`, `01-vision.md`, `02-systems.md`, `02-systems-fixed.md`, dated 2026-08-12–14) is a full parallel VISION/ROADMAP/STATE rewrite that is invisible from `docs/README.md`'s navigation hub** — it is not listed anywhere in the doc index. It is not dead, though: `docs/reviews/2026-08-14--006--architecture-alignment.md` and its prompt (`docs/prompts/002`) were scoped directly against `docs/roadmap/02-systems-fixed.md` as "the main architectural target." Meanwhile `docs/ROADMAP.md` is dated **2026-08-10 — older than the `roadmap/` session it should presumably supersede or be reconciled with** — and the two are never cross-linked. An agent has two same-concept "roadmap" artifacts with no stated precedence.
5. **No CI.** Nothing runs `tsc`/`lint`/`build`/`test` automatically on push or PR. All four verification steps `CLAUDE.md` prescribes rely entirely on whichever agent/human last touched the branch having actually run them locally. With two agents (Claude Code + Cursor) editing concurrently, there is no shared automatic gate against a broken `main`.

### 🟡 Medium

6. **Zero repo-scoped Cursor configuration** — no `.cursor/`, no `.cursorrules`. Cursor Agent has nothing analogous to `CLAUDE.md`'s read order/plan rules/truth hierarchy unless it happens to open `CLAUDE.md` on its own. Given the user runs both agents against this repo, this is a functional gap, not a preference.
7. **No machine-parseable metadata on plans/reviews/issues** — no `domain:`/`tags:` frontmatter, status lives only as prose in the index tables. The domain groupings noted in §A.6 are reproduced by hand each time (`plans/README.md`'s snapshot, `plans/archive/README.md`'s grouping) rather than derived.
8. **`docs/prompts/2026-08-06--000--docs-structure.md`, the original meta-doc defining the filename convention, is itself stale.** It states only `issues/` gets an `NNN` id and that `reviews`/`research`/`plans` use `YYYY-MM-DD-slug.md` (no `NNN`) — but actual practice (confirmed: `plans/`, `reviews/`, and `research/` all use `NNN` today) and `CLAUDE.md`'s current, correct convention both contradict it. The correct rule lives in `CLAUDE.md`; the stale one was never updated or removed.
9. **Automation exists but is unwired/absent.** `scripts/audit-megakit.mjs` has no `npm run` entry — discoverable only via `ls scripts/`. There is no link-checker, no plan-index-completeness checker (despite `plans/README.md` declaring that invariant as a rule), and no filename/ID-format or uniqueness checker for `plans/`/`reviews/`/`issues/`/`research/`.
10. **Inconsistent commit hygiene.** Some commits are short imperative one-liners; others (e.g. `c4f7ed1`) put a multi-sentence implementation summary directly on the subject line with no body. Not harmful individually, but it degrades `git log --oneline` — the cheapest "what happened recently" signal an agent has.

### 🟢 Low

11. **`docs/features/`, `docs/examples/`, `docs/testing/` are empty stub directories** with template tables and no real entries. `docs/README.md` already self-flags `features/` as "Nieużywane" (unused) — correct self-awareness — but the directory still exists and its `FEATURE-NNN-slug.md` naming convention was never actually adopted anywhere, making it a second, contradicting, unused convention next to the real one.
12. **`docs/architecture/` (a subdirectory, currently one file: `performance-and-workers.md`) sits next to `docs/ARCHITECTURE.md`** (near-identical name, different path/casing). Not confusing today with only one file present, but it's the same naming shape that produced the `ROADMAP.md`/`roadmap/` collision in #4, and would repeat it if a second file lands there carelessly.

---

## C. Context & cost

- **Root `README.md` (202 lines) is pure waste for an agent following `CLAUDE.md`'s read order** (never referenced there) — but real cost isn't tokens spent reading it, it's the wrong prior belief about project maturity for anyone who *does* open it first (new contributor, Cursor with no rules, generic "check README" habit).
- **The prescribed read order itself is not the bottleneck.** `CLAUDE.md` (159) + `STATE.md` (191) + `VISION.md` (201, only needed for new-feature proposals) + `plans/README.md` (~135) is roughly 480–680 lines / ~7–10k tokens before touching code — reasonable for orientation on a project this size.
- **The real cost is drift risk and maintenance burden, not per-task token count.** Three copies of the `WorldBundle`-rebuild rule and two copies of the entry-points list (§B.2–3) mean an agent that reads only `CLAUDE.md` gets a *stale* entry-points list; the authoritative copy is only reached because the read order also prescribes `STATE.md` — currently non-fatal, but fragile, and has already drifted once.
- **`plans/README.md`'s per-row status prose is a good compression pattern** and lets an agent skip opening most plan files. It isn't mirrored in `reviews/README.md`/`issues/README.md`, which is fine — those are simpler, non-sequential artifacts that don't need the same detail.
- **`docs/plans/archive/`'s 114 files are correctly kept out of the default path** — an agent only pays for that content when a domain doc explicitly links into it.

---

## D. Plan domains

**Current domains** (recovered from `plans/README.md`'s snapshot + `plans/archive/README.md`'s grouping, both hand-maintained today): `terrain/world`, `settlements/village`, `npc`, `fauna`, `items/tools/gathering`, `physics`, `ui/audio`, `quests`, `persistence/app`, `performance`. These already match `STATE.md`'s section headers and `ARCHITECTURE.md`'s `WorldBundle` member list — not ad hoc, just unformalized.

**A plan can legitimately span two domains** — e.g. plan 093 (quests-v3) touches both `quests` and `fauna` via the wolf-den/dangerous-wolf mechanics; plan 069 (household resources) touches both `npc` and `settlements`. A single required `domain:` (primary, "where to look first") plus an optional `tags:` (secondary domains) avoids forcing a lossy single choice while keeping the common case a one-line frontmatter add.

**Recommendation:** add `domain:`/`tags:` frontmatter to **new plans only** — do not retrofit the 33 live + 114 archived files. `plans/README.md`'s table can gain an optional Domain column populated going forward; old rows stay blank.

**Domain state files (`docs/state/terrain.md`, `npc.md`, …): not recommended.** `STATE.md` (191 lines) is already organized by exactly these headings, so splitting it doesn't reduce what a cross-cutting task reads (most plans touch 2+ domains, per the point above) — it adds a second index to keep in sync, a second place to restate the "source of truth" rule and "last verified" date, and a second surface where the §B.2/§B.3-style duplication could recur, once per domain file instead of once. Revisit only if `STATE.md` exceeds roughly 350–400 lines or a task is measurably slowed by reading it whole — neither is true today.

---

## E. Automation

| Czynność | Rozwiązanie | Oszczędność | Priorytet |
|---|---|---|---|
| `tsc`/lint/build/test on every push/PR | CI (GitHub Actions) | Removes reliance on every agent remembering all 4 commands; catches multi-agent breakage immediately | 🔴 |
| `plans/README.md`'s "every plan file in exactly one section" rule | small script, `validate:plans`, run in CI + optionally before an agent finishes plan work | Replaces manual eyeballing of a rule that's declared but currently unenforced | 🔴 |
| Doc cross-links (`STATE.md`/`ARCHITECTURE.md`/plans → other docs) | link-checker script, `validate:docs` | Would have caught the `docs/roadmap/` orphan-directory case (§B.4) automatically | 🟡 |
| Filename convention + ID uniqueness across `plans/`/`reviews/`/`issues/`/`research/` | one script covering all four dirs | Prevents ID collisions/format drift, e.g. the stale `docs/prompts/000` convention (§B.8) | 🟡 |
| `scripts/audit-megakit.mjs` and future asset scripts | wire into `package.json` as `npm run assets:*` | Discoverability; near-zero cost | 🟢 |
| GLB/audio conversion/validation pipeline | not evaluated — no such tooling found beyond `audit-megakit.mjs` in this pass | — | out of scope this round; revisit if/when the asset pipeline grows |

---

## F. Skills

`.claude/skills/` is currently empty. Proposing only what maps to a workflow already repeated in git history or `docs/prompts/`:

| Skill | Problem it solves | Trigger | Saves |
|---|---|---|---|
| `implement-plan` | `CLAUDE.md`'s 9-step "Plan execution rules" are prose an agent must remember and follow by hand each time | Starting work on a `docs/plans/*.md` file | Enforces plan → notes → linked review → code order before edits; guards the exact "implemented from title alone" failure mode `CLAUDE.md` already calls out |
| `architecture-review` | `docs/prompts/002` is a real, ~500-line review prompt already hand-run at least twice (reviews 006, 013) | User requests an architecture/perf audit | Turns a large one-off pasted prompt into one invocation |
| `plan-status-sync` | Marking a plan done/verification-needed and updating `plans/README.md`'s index is manual, against a strict declared invariant | After finishing a plan's implementation | Small, mechanical, currently free-hand each time |

**Not recommended right now:** a generic code-review or browser-verification skill — `CLAUDE.md` already gives short, clear instructions for both (including "do not launch headless browser yourself, ask the user"), and Claude Code's built-in `/code-review` already covers the review case; a Seedvale-specific version would duplicate, not add. Don't build skills for workflows that only ran once or twice historically (asset-browser discovery, NPC-locomotion debugging) — not repeatable enough yet to justify upkeep.

---

## G. MCP

- **Filesystem/Bash/grep** — current tools already cover the observed workflow fully (markdown docs, TS code, no external system of record). **Not worth adding.**
- **GitHub issues/PRs** — issues live in `docs/issues/` (repo's own convention), not GitHub Issues; PRs exist and `gh` CLI already covers creation/review. **Not worth adding** unless the user wants PR-comment-level automation beyond `gh`.
- **Browser (agent-browser)** — the one candidate with real potential: the user explicitly installs it for autonomous visual verification, and `STATE.md`/`plans/README.md` are full of "brak testu w przeglądarce" rows. But `CLAUDE.md` currently explicitly tells agents *not* to launch headless browser verification themselves and to ask the user instead — wiring a browser MCP/tool changes nothing about actual agent behavior until that policy is revisited. **Can be reconsidered**, contingent on that policy.
- **Docs/filesystem MCP** — plain file tools already do this. **Not worth adding.**

---

## H. Claude vs Cursor

| Zadanie | Agent | Powód |
|---|---|---|
| Plan implementation (multi-file, needs `CLAUDE.md`'s read-order + `STATE.md` context) | Claude Code | Already wired to the full doc-reading discipline via `CLAUDE.md`; Cursor has zero repo-scoped rules today (§B.6) |
| Architecture/perf audits (`docs/prompts`-style large reviews) | Claude Code | Demonstrated pattern already in reviews 006/012/013; large-context multi-file synthesis |
| Quick, localized fix in a file already open/in view | Cursor | Faster in-editor loop for a change scoped to what's on screen; doesn't need the full doc read-order |
| Visual/browser verification (agent-browser) | Unassigned today | Not currently configured for either agent; resolve §G's policy question first |
| Git/PR workflow, multi-file cross-cutting refactors | Claude Code | `CLAUDE.md`'s plan/verification/commit discipline is the stronger fit |
| Implement → review split | Claude Code implements → a second pass (Cursor, or a fresh Claude session) reviews before commit | Reuses the already-proven review-doc pattern rather than inventing a new one |

Directional, not enforced — nothing blocks either agent from doing either kind of task. What actually needs to happen before this split can be trusted in practice is giving Cursor rules to follow at all (§B.6), not choosing a winner.

---

## I. Agent workflow

```
task
  → CLAUDE.md (read order)
  → docs/STATE.md (current state, already domain-organized)
  → relevant plan via docs/plans/README.md (status/domain already inline)
  → plan's implementation notes / linked review, if any
  → code (named entry points)
  → implement
  → npx tsc --noEmit && npm run lint && npm run build && npm run test
  → browser verification only if visual/gameplay — ask the user, per existing CLAUDE.md rule
  → git status
  → git commit
  → git pull --rebase origin main
  → resolve conflicts (never overwrite another agent's work; merge if safely combinable)
  → git push origin main
```

This is already what `CLAUDE.md` prescribes for reading and verification. The one behavioral gap: `CLAUDE.md` is currently silent on git workflow entirely — commit → rebase → push as part of "done," and the multi-agent conflict-handling rules the audit brief specifies, aren't stated anywhere in the repo today.

---

## J. Rollout plan

**🔴 Now**

1. Rewrite root `README.md` — short, accurate "what is Seedvale / current state / how to run," pointing to `STATE.md` and `ROADMAP.md`; remove the stale Polish v0.1 block and the `VISION.md`-duplicating essay (replace with a one-line pointer to `VISION.md`).
2. Collapse the `WorldBundle`-rebuild rule (§B.2) to one authoritative copy in `ARCHITECTURE.md`; replace the `CLAUDE.md` and `STATE.md` copies with a pointer. Same treatment for the entry-points list (§B.3): make `STATE.md`'s the canonical one, `CLAUDE.md` points to it.
3. Resolve `docs/roadmap/`'s status (§B.4): either fold its conclusions into `docs/ROADMAP.md` and delete the directory, or add it to `docs/README.md`'s nav table with an explicit note on its relationship to `ROADMAP.md`.
4. Add a minimal CI workflow (`tsc`/lint/build/test on PR) — highest-leverage single change given concurrent multi-agent editing.
5. Add an explicit git-workflow section to `CLAUDE.md` (commit → `pull --rebase` → push is part of "done"; never force-push/`reset --hard`; merge concurrent changes rather than blocking on them) per the audit brief — currently unstated.

**🟡 Next**

6. Add `domain:`/`tags:` frontmatter to new plans going forward (no retrofit).
7. Add a `validate:plans` script (index-completeness + ID/date-format check across `plans/`/`reviews/`/`issues/`/`research/`) and wire `scripts/audit-megakit.mjs` into `npm run`.
8. Fix or delete `docs/prompts/000` (stale naming convention, §B.8).
9. Give Cursor a minimal repo-scoped rules file — even a short one pointing at `CLAUDE.md`'s core rules, if Cursor's rule format supports an include, otherwise a trimmed copy.

**🟢 Later / optional**

10. Delete `docs/features/`/`docs/examples/`/`docs/testing/` if still empty after several more months — low cost either way today.
11. Revisit agent-browser + browser MCP once the "don't launch browser yourself" policy in `CLAUDE.md` is deliberately revisited.
12. Build the `implement-plan`/`architecture-review` skills (§F) only after the doc cleanup in items 1–3 lands — a skill referencing a still-duplicated/orphaned doc set launders the problem instead of fixing it.

**Not recommended:** `docs/state/*.md` domain-split (§D); retrofitting frontmatter onto the 147 existing plan files; any MCP server beyond the contingent browser case in §G; any skill beyond the three in §F; splitting `CLAUDE.md` further than its current 159 lines.
