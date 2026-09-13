# Plan: Quest log information architecture

**Created:** 2026-09-13
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** quests-progression-031
**Domain:** `ui-input`
**Type:** `feature`
**Roadmap:** `quests-and-reputation.md`

## Goal

Przebudować Quest Log tak, aby pozostał czytelny po wzroście liczby authored i world-driven opportunities, bez przenoszenia logiki questów do Vue i bez tworzenia drugiego modelu stanu.

## Scope

- rozdzielić `offered`, `active`, `ready_to_report` i historię na czytelne kategorie;
- domyślnie eksponować bieżące zadania, nie pełną historię;
- nie pokazywać `not_offered`;
- zachować `QuestManager.list()` jako źródło prawdy;
- Vue nie interpretuje quest ids ani availability;
- ewentualne authored/world-driven metadata mają przychodzić jawnie w DTO;
- grupowanie powtarzalnych world-driven quests tylko po jawnym `groupKey` i tylko jeśli będzie potrzebne po `quests-progression-031`;
- bez HUD trackera, map-marker redesignu, nowej persistence i lore journal.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
