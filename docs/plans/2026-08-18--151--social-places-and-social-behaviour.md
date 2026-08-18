# Plan: Social Places and Social Behaviour

**Created:** 2026-08-18  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~020~~

domain: settlements-npcs

tags: [relationships]

## Cel

Rozszerzyć istniejący system `Place → Schedule → FSM → action` o pierwsze rzeczywiste zachowanie społeczne NPC.

Pierwszym Social Place będzie istniejący **campfire należący do osady**. NPC mają przy nim faktycznie wchodzić w interakcje z innymi NPC, a rozmowy mają zmieniać ich wzajemną relację.

Nie tworzyć równoległego systemu social AI.

## Zakres ustalony

### Social Place

- Każdy istniejący `campfire` osady staje się `PlaceType: 'social'`.
- Nie tworzyć nowych campfire'ów ani osobnego generatora Social Places.
- NPC korzysta wyłącznie z campfire'a swojej własnej osady.
- Na tym etapie nie obsługiwać campfire'ów poza osadami ani innych typów Social Places.

### Schedule / FSM

- Wykorzystać istniejące `social` w Schedule oraz istniejącą obsługę `Place`/FSM.
- Social activity ma prowadzić NPC do campfire'a tak samo jak pozostałe aktywności prowadzą do swoich miejsc.
- Nie dodawać osobnego scheduler'a ani social managera.

### Social behaviour

Podczas pobytu przy campfire NPC:

1. pozostaje przy miejscu jako część zwykłej aktywności `social`;
2. okresowo próbuje znaleźć partnera spośród NPC obecnych przy tym samym campfire;
3. jeśli nikogo nie ma, pozostaje przy ognisku i odpoczywa;
4. jeśli znajdzie partnera, obaj rozpoczynają wspólną akcję `conversation`;
5. podczas rozmowy obaj są zajęci tą samą akcją przez określony czas;
6. po zakończeniu rozmowy wracają do pobytu przy campfire i później mogą ponownie spróbować interakcji.

Czas pojedynczej rozmowy: **2–5 minut czasu świata**.

### Partner selection

Pierwsza wersja wybiera partnera wyłącznie spośród NPC obecnych przy tym samym campfire.

W późniejszym rozszerzeniu wybór może być ważony przez personality, traits, profession/role, istniejącą relację, rodzinę oraz wspólne zainteresowania lub doświadczenia.

Nie implementować tego rozszerzenia w tym planie ponad minimalny mechanizm wyboru obecnego partnera.

### Conversation

Pierwsza wersja ma jeden typ interakcji: `conversation`.

- obaj uczestnicy są zajęci przez czas rozmowy;
- jeden NPC może mieć maksymalnie jedną aktywną rozmowę;
- rozpoczęcie rozmowy musi zarezerwować obu uczestników, aby trzeci NPC nie rozpoczął równoległej rozmowy z jednym z nich;
- rozmowy grupowe pozostają przyszłym rozszerzeniem.

### Relationship

Wynik rozmowy może być pozytywny albo negatywny:

- pozytywny → relacja NPC ↔ NPC rośnie;
- negatywny → relacja NPC ↔ NPC maleje.

Na tym etapie wynik może być prostym losowaniem w ramach ustalonych predyspozycji; szczegółowe wagi należy dobrać podczas implementacji na podstawie istniejącego modelu charakteru i relacji.

Zmiana jest **symetryczna** — ta sama rozmowa modyfikuje relację A ↔ B po obu stronach.

Nie rozszerzać w tym planie systemu memory o nowe wpisy związane z rozmową.

## Integracja z istniejącymi systemami

```text
existing settlement campfire
        ↓
Place(type: social)
        ↓
Schedule(activity: social)
        ↓
NpcAgent / existing FSM
        ↓
goTo(campfire)
        ↓
social activity
        ↓
find available NPC at same campfire
        ↓
shared conversation action
        ↓
relationship + / -
```

Potrzeby i ich priorytet pozostają nadrzędne wobec Schedule zgodnie z istniejącą architekturą. Social behaviour nie powinno omijać ani zastępować istniejącego mechanizmu potrzeb, presji ani FSM.

## Relationship architecture

Wykorzystać istniejący mechanizm relationships możliwie bez tworzenia drugiego, równoległego modelu. Obecny system relacji NPC ↔ player nie powinien być kopiowany bez potrzeby.

Jeżeli aktualny model nie obsługuje NPC ↔ NPC bezpiecznie, rozszerzenie powinno mieć wspólny, jasno nazwany model relacji zamiast tworzyć osobny `SocialRelationshipManager` tylko dla campfire.

Stan relacji musi mieć jednoznacznego właściciela i być kompatybilny z przyszłym rozszerzaniem social behaviour.

## Główne obszary implementacji

Dokładne nazwy i granice zmian należy potwierdzić przed implementacją na aktualnym codebase. Oczekiwane obszary:

- model `Place` / `PlaceType` i resolver miejsc;
- istniejąca settlement infrastructure dla campfire;
- `Schedule`, w szczególności aktywność `social`;
- `NpcAgent` i FSM/action execution;
- istniejący model relationships NPC;
- testy jednostkowe Place/Schedule/FSM/relationships oraz nowych reguł social interaction.

Nie tworzyć nowych globalnych managerów, jeśli istniejące właściciele stanu mogą zostać rozszerzeni.

## Czego nie obejmuje plan

- innych Social Places poza campfire osady;
- korzystania z campfire innych osad;
- rozmów grupowych;
- osobnych typów social interaction poza `conversation`;
- rozbudowanego partner matching o personality/role/traits jako pełnego rankera;
- nowych wpisów w NPC memory;
- dialogue UI/audio jako warunku wykonania rozmowy;
- LLM-driven social behaviour;
- osobnego social AI / social scheduler'a;
- nowych settlement campfire'ów.

## Verification

### Techniczna

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`

Testy powinny pokryć co najmniej:

- istniejący campfire jest rozpoznawany jako Social Place;
- NPC otrzymuje campfire swojej osady jako cel dla `social`;
- NPC bez partnera pozostaje przy campfire;
- partner jest wybierany tylko spośród NPC przy tym samym campfire;
- rozpoczęcie rozmowy rezerwuje obu uczestników;
- nie można rozpocząć drugiej rozmowy z zajętym NPC;
- conversation kończy się po swoim czasie;
- relacja zmienia się symetrycznie w górę lub dół;
- NPC może rozpocząć kolejną rozmowę podczas dalszego pobytu.

### Browser / gameplay

Sprawdzić w przeglądarce:

- NPC przychodzą do campfire zgodnie z Schedule;
- kilku NPC naturalnie gromadzi się przy ognisku;
- samotny NPC pozostaje i odpoczywa;
- dwie osoby prowadzą wspólną rozmowę bez jednoczesnego przejęcia przez trzecią osobę;
- po rozmowie NPC wracają do social activity i mogą ponownie wejść w interakcję;
- relacje faktycznie zmieniają się po rozmowach;
- potrzeby / przerwanie ważniejszą potrzebą nadal działa przez istniejący mechanizm.

Weryfikacja wizualna powinna potwierdzić, że zachowanie wykorzystuje istniejący FSM i nie wprowadza równoległej pętli social simulation.

## Przyszłe rozszerzenia

- preferencje partnera na podstawie personality/traits/role/relationship;
- różne typy interakcji;
- rozmowy grupowe;
- memory wynikające z ważnych interakcji;
- inne Social Places;
- wykorzystanie relacji społecznych do decyzji, problemów, questów i innych konsekwencji świata.

> **Zrób git commit i push do main, rebase jeżeli trzeba**