# Plan: Nonlinear stage objectives and transitions

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `branching` `objectives` `transitions`
**Roadmap:** `quests-and-reputation.md`

## Goal

Rozszerzyć obecny liniowy `QuestStage[]` o mały, deterministyczny mechanizm nieliniowego flow. Stage ma móc mieć kilka objectives z semantyką `all` albo `any`, a wynik etapu może kierować do innego stage albo terminalnego outcome.

Istniejące questy z jednym `objective` i liniowym przejściem muszą działać bez migracji treści.
