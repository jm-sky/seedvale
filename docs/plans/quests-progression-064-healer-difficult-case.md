# Plan: Healer — Difficult Case

**Created:** 2026-09-17
**Status:** `draft` 📝
**Priority:** medium · **Effort:** M
**Depends on:** quests-progression-063
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `relationships`
**Tags:** `healer` `diagnosis` `treatment` `medicine`
**Roadmap:** `quests-professions-and-world-consequences.md`

## Cel

Dodać 2-3 etapowy quest Healer oparty na realnym stanie medycznym NPC: rozpoznanie problemu, zdobycie właściwego zasobu i skuteczne leczenie.

Plan jest draftem i przed zmianą na `planned` wymaga reconu diagnosis/treatment seams, istniejących medicine items i sposobu wiązania objective z realnym NPC condition state.

## Proponowany flow

```text
diagnosis
→ identify treatment requirement
→ obtain appropriate resource
→ perform/enable treatment
→ real recovery outcome
```

Opcjonalny finalny etap rozmowy może potwierdzać poprawę stanu, ale nie może być źródłem samego leczenia.

## Zakres draftu

- pacjent to persistent normal NPC;
- stan wymagający leczenia pochodzi z istniejącego injury/condition domain;
- etap diagnozy expose'uje właściwą potrzebę leczenia zamiast wymyślać quest-only receptę;
- preferować istniejące items, np. `herb`, `mint`, `yarrow`, `bandage`, `dressing`;
- item consumption/treatment przechodzi przez normalny domain path;
- completion wymaga realnej poprawy/recovery;
- narrative może wyjaśniać przypadek, ale nie zastępuje systemowego stanu.

## Do rozstrzygnięcia przy dopracowaniu planu

1. Jaki konkretny injury/condition jest najlepszym pierwszym authored case.
2. Czy diagnosis jest istniejącą interakcją/kompetencją, czy quest stage opartym na rozmowie Healer + odczycie authoritative state.
3. Jak obsłużyć przypadek, gdy potrzebny item jest już w lokalnym household/settlement stocku.
4. Jak natural recovery, inne NPC lub player treatment wpływa na quest stages.
5. Czy przypadek powinien mieć alternatywne leczenie zależne od dostępnych items.
6. Jak nie wejść w scope existing injured cow/dog threads.

## Guardrails

- brak quest-only diagnosis meter;
- brak quest-only disease/injury state;
- brak hardcoded recipe, jeśli treatment domain już definiuje wymagania;
- nie tworzyć osobnego Healer AI;
- nie dodawać nowych medicine items bez konkretnej luki potwierdzonej reconem.

## Weryfikacja docelowa

- diagnosis odpowiada rzeczywistemu patient state;
- właściwy treatment resource jest wymagany przez realny system;
- użycie treatment zmienia authoritative state;
- quest poprawnie reaguje na alternatywne rozwiązanie problemu przez istniejące mechanizmy;
- patient state i quest stages pozostają spójne po save/load;
- NPC wraca do normalnego lifecycle po recovery.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
