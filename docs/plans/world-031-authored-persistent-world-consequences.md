# Plan: Authored Persistent World Consequences

**Created:** 2026-09-17
**Status:** `draft` 📝
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `world`
**Type:** `infrastructure`
**Subdomains:** `places` `events` `simulation`
**Tags:** `quests` `persistent-world` `authored-content` `places`
**Roadmap:** `quests-professions-and-world-consequences.md`

## Cel

Dodać najmniejszy wspólny mechanizm pozwalający authored questom lub world events odblokować trwałą zmianę świata, reprezentowaną przez normalne world-domain objects zamiast quest-local fake state.

Plan jest draftem. Przed zmianą na `planned` wymaga focused reconu istniejących place/building/persistence seams, aby nie stworzyć równoległego registry.

## Target contract

```text
quest/world condition
→ consequence unlocked
→ persistent world/domain state exists
→ normal systems mogą go używać
```

Pierwsze przewidywane consumer'y:

- outpost;
- odbudowane małe gospodarstwo;
- road stop;
- odbudowana ruina;
- authored lokalna infrastruktura.

## Minimalny lifecycle

Tam, gdzie potrzebny:

```text
locked
→ construction
→ active
```

Nie każdy consequence musi posiadać wszystkie stany.

## Wymagania

- stable identity konsekwencji;
- deterministic reconstruction;
- persistence przez save/load i world rebuild;
- wynikowy obiekt/place pozostaje owned przez właściwy world/settlement domain;
- quest przechowuje tylko fakt/outcome potrzebny do odblokowania konsekwencji, nie kopię stanu budynków;
- consequence może istnieć i być używana niezależnie od aktywnego questa po jego zakończeniu;
- API powinno być wystarczająco małe dla konkretnych pierwszych consumerów.

## Do rozstrzygnięcia przy dopracowaniu planu

1. Czy istniejący `Place`, settlement structure registry, world flags lub inny persistence owner może bezpośrednio przejąć tę odpowiedzialność.
2. Jak reprezentować stable authored consequence ID bez tworzenia uniwersalnego event graphu.
3. Jak world rebuild materializuje aktywne authored places.
4. Jak oddzielić `unlocked fact` od actual domain state konkretnego obiektu.
5. Czy potrzebny jest jeden mały registry, czy wystarczą domain-owned records + wspólny unlock resolver.

## Guardrails

Nie tworzyć:

- generic quest scripting DSL;
- universal world-event engine;
- generic settlement transformation graph;
- drugiego settlement/building registry;
- quest-owned copies budynków, NPC lub resource state.

Mechanizm ma obsłużyć znane przypadki, nie hipotetyczne wszystkie przyszłe transformacje.

## Weryfikacja docelowa

- authored consequence może zostać odblokowana raz;
- save/load zachowuje jej stan;
- rebuild odtwarza właściwy world object/place;
- zakończenie/usunięcie questa nie usuwa consequence;
- normalne systemy świata mogą korzystać z aktywnego miejsca;
- brak duplicated state między QuestManager i domain ownerem.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
