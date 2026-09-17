# Plan: Healer — Injured Resident

**Created:** 2026-09-17
**Status:** `draft` 📝
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `relationships`
**Tags:** `healer` `injury` `treatment` `npc`
**Roadmap:** `quests-professions-and-world-consequences.md`

## Cel

Dodać krótki quest profesyjny Healer, w którym realny settlement NPC posiada rzeczywisty injury state, a pomoc gracza prowadzi do normalnego leczenia i powrotu NPC do codziennej pracy.

Plan jest draftem i wymaga reconu current injury/treatment API, healer identity, quest materialization oraz relacji z istniejącymi injured cow/dog threads.

## Scenariusz

```text
real NPC injury
→ Healer recognizes treatment need
→ player provides required help/item
→ existing treatment mechanism resolves injury
→ NPC returns toward normal routine/work
```

## Zakres draftu

- pacjent jest normalnym stable NPC, nie quest-only actor;
- objective opiera się na rzeczywistym injury severity/treatment requirement;
- używać istniejących medicine items i treatment path;
- możliwe zadanie: dostarczenie `bandage`, `dressing`, `yarrow` lub innego realnie wymaganego itemu;
- completion wynika z realnego treatment/recovery state;
- quest może zmienić relation/reputation przez normalne quest consequences;
- po zakończeniu pacjent pozostaje zwykłym NPC.

## Do rozstrzygnięcia przy dopracowaniu planu

1. Jak znaleźć lub authored-create pacjenta z injury bez destabilizowania zwykłego damage lifecycle.
2. Czy quest wymaga konkretnego injury severity, czy wybiera spośród istniejących treatable injuries.
3. Czy Healer sam wykonuje leczenie po dostarczeniu zasobu, czy player inicjuje existing treatment interaction.
4. Jak uniknąć sytuacji, w której natural recovery rozwiąże quest zanim player zadziała.
5. Jak quest zachowuje się po śmierci pacjenta lub zmianie jego stanu z innych przyczyn.

## Guardrails

- brak quest-only HP/injury;
- brak osobnego healer health system;
- brak kopiowania treatment requirements do quest state;
- nie dublować injured cow/dog content;
- objective obserwuje realny NPC state.

## Weryfikacja docelowa

- pacjent ma realny injury state;
- wymagany treatment wynika z istniejących reguł;
- pomoc gracza wpływa na rzeczywisty stan NPC;
- completion nie może nastąpić bez rzeczywistego treatment/recovery outcome;
- NPC po leczeniu wraca do zwykłego lifecycle;
- save/load zachowuje spójność quest/patient state.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
