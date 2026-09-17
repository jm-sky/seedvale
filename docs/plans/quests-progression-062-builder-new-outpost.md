# Plan: Builder — New Outpost

**Created:** 2026-09-17
**Status:** `draft` 📝
**Priority:** high · **Effort:** L
**Depends on:** world-031, settlements-npcs-044
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `progression`
**Tags:** `builder` `outpost` `world-consequence` `construction`
**Roadmap:** `quests-professions-and-world-consequences.md`

## Cel

Dodać 3-etapowy quest Buildera, po którym niebezpieczne lub nieużywane miejsce zmienia się w trwały, funkcjonujący posterunek z realną budową i persistent NPC.

Plan jest draftem i wymaga reconu konkretnego threat source, site selection, quest staging i zależności od foundation plans.

## Etap 1 — Zabezpiecz teren

- wybrane authored miejsce przy lesie, drodze, resource area albo settlement edge;
- realne zagrożenie blokuje projekt;
- preferować istniejące threat concepts, np. wolf den, jeśli pasuje do lokalizacji;
- objective obserwuje realny threat/world state.

## Etap 2 — Budowa

- Builder uruchamia projekt;
- pojawiają się normalne construction targets;
- player pomaga przez materiały/pracę;
- NPC workers wykonują realną pracę przez istniejące seams;
- quest nie posiada własnego construction progress.

## Etap 3 — Aktywacja

- wymagane construction targets zostają ukończone;
- authored outpost consequence przechodzi do `active`;
- przypisani stable NPC obejmują miejsce;
- po quest completion outpost pozostaje normalnym world place.

## Persistent consequence

Minimalny V1 może zawierać:

- krótki odcinek palisady;
- ognisko i/lub standing torches;
- istniejący shelter/structure, jeśli recon wskaże odpowiedni owner;
- 1-2 persistent NPC.

## Do rozstrzygnięcia przy dopracowaniu planu

1. Jaki konkretny site/threat będzie pierwszym authored wariantem.
2. Czy wolf-den overlap z istniejącymi questami wymaga content cleanup zamiast nowego destroy-den objective.
3. Kto jest giverem i jak Builder identity jest dobierane.
4. Które construction targets składają się na minimalny outpost.
5. Jak quest reaguje na partial/off-screen construction.
6. Jakie NPC role i authored identities najlepiej pasują do pierwszego outpostu.

## Guardrails

- nie tworzyć nowej wolf-den simulation;
- nie tworzyć quest-only outpost prop;
- nie teleportować NPC jako tymczasowych quest actors;
- quest nie duplikuje state z `world-031` / `settlements-npcs-044`;
- po aktywacji QuestManager nie jest ownerem outpostu.

## Weryfikacja docelowa

- realne zagrożenie blokuje/warunkuje pierwszy etap;
- po rozwiązaniu problemu pojawia się construction site;
- realna praca kończy elementy outpostu;
- stable NPC zostają przypisani;
- outpost przetrwa save/load i pozostaje po quest completion;
- NPC wykonują zwykłe schedule/needs/threat behavior.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
