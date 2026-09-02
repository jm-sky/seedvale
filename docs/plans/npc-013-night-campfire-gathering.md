# Plan: NPC night campfire gathering

**Created:** 2026-09-01
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** S
**Depends on:** ~~151~~
**Domain:** `npc`

## Cel

Sprawić, aby NPC mogli naturalnie zbierać się przy aktywnym settlement campfire w godzinach nocnych, gdy nie mają istotniejszych powodów do działania.

Campfire jest low-pressure night leisure/social opportunity, a nie nowym Need ani obowiązkowym elementem schedule.

Mechanizm wykorzystuje istniejące social schedule, personality, Social Place, settlement campfire, movement oraz NPC social pairing/dialogue.

Nie tworzyć osobnego systemu campfire behaviour.

## Zasada zachowania

```
night
  +
campfire exists & lit
  +
low competing pressure
  +
reasonable travel / nearby opportunity
        ↓
campfire becomes an attractive leisure/social option
        ↓
existing Social Place / social behaviour
```

NPC nie powinien iść do ogniska wyłącznie dlatego, że jest noc.

Campfire powinno być preferowaną możliwością, a nie obowiązkiem. Część NPC może pozostać w domu lub wybrać inne dostępne zachowanie.

## Scope

### 1. Night-time campfire opportunity

Rozszerzyć istniejący mechanizm wyboru social/leisure opportunity tak, aby aktywne settlement campfire mogło być preferowanym miejscem nocnej aktywności przy niskim competing pressure.

Nie dodawać campfire do ScheduleActivity.

### 2. Pressure gating

NPC może wybrać campfire tylko wtedy, gdy nie ma istotniejszego pressure.

Przykładowo:

```
hunger high
    → eat

wood duty high
    → work

water high
    → water

no meaningful pressure
    → campfire/social opportunity
```

Campfire nie powinno obchodzić istniejącego pressure arbitration.

### 3. Social / personality

Nie uzależniać campfire od sociable jako twardego warunku.

Istniejąca personality i sociable może wpływać na preferencję social activity, ale nie powinna uniemożliwiać NPC skorzystania z campfire.

Nie dodawać nowych traitów typu likesCampfire lub nightSocial.

### 4. Campfire availability

Campfire może być celem tylko gdy settlement posiada campfire, campfire jest aktywne/lit, Social Place jest dostępne, a lokalizacja jest rozsądnie osiągalna dla NPC.

NPC nie powinien przemierzać całego świata wyłącznie po to, aby usiąść przy ognisku.

Dokładne znaczenie nearby / reasonable travel powinno wykorzystać istniejący model distance/path/travel, bez tworzenia nowego systemu proximity.

### 5. Existing Social Place

Wykorzystać istniejący Social Place:

```
Social Place
    ↓
goTo
    ↓
arrival
    ↓
existing social behaviour
```

Nie tworzyć osobnego campfire destination system.

### 6. Gathering

Kilku NPC powinno móc wybrać ten sam campfire.

Wykorzystać istniejące social pairing, NPC↔NPC interaction oraz dialogue.

Nie tworzyć CampfireGatheringManager, CampfireGroup ani CampfireConversationSystem.

### 7. Leaving campfire

NPC powinien opuścić campfire, gdy pojawi się istotniejszy pressure, schedule przejdzie do kolejnej aktywności, nadejdzie pora snu albo campfire przestanie być dostępne.

Powrót do normalnego decision flow powinien odbywać się przez istniejące mechanizmy.

### 8. Weather integration

Plan nie implementuje reakcji pogodowej.

Campfire ma jedynie respektować wynik istniejącego decision system.

Jeżeli npc-012 weather reaction & shelter zostanie wcześniej zaimplementowany, strong weather / shelter pressure powinno naturalnie wygrać z campfire leisure.

Campfire nie powinno omijać weather/shelter pressure.

### 9. Schedule

Nie tworzyć osobnego harmonogramu campfire.

Istniejący schedule nadal kontroluje podstawowy rytm, a campfire jest miejscem realizacji odpowiedniej aktywności, a nie nową aktywnością schedule.

### 10. Off-screen simulation

Zachowanie musi działać niezależnie od kamery, render distance i obecności gracza.

Nie dodawać per-frame campfire gathering logic.

### 11. Performance

Wykorzystać istniejący NPC decision cadence oraz Social Place.

Nie wykonywać co frame wyszukiwania wszystkich NPC znajdujących się przy campfire.

### 12. JSDoc

Dla ważnych nowych publicznych funkcji i klas dodać JSDoc, gdy jest to potrzebne do późniejszego preflight/discovery. Przy nowych architektonicznych funkcjach warto użyć @domain npc.

## Relevant systems / files

Przed implementacją potwierdzić aktualny kod i symbole w:

- src/ai/NpcAgent.ts — decision flow, schedule handling, social behaviour, movement/action lifecycle.
- src/ai/schedule.ts — social, effectiveScheduleFor(), activityAt().
- src/settlement/places.ts — socialPlaceFor().
- src/settlement/ — campfire lifecycle / VillageFire.
- istniejący system social pairing/dialogue.

Nie tworzyć równoległego systemu wyszukiwania miejsc, proximity ani grupowania NPC.

## Verification

### Basic

- NPC z dostępnym campfire może wybrać je jako nocną low-pressure opportunity.
- NPC kieruje się do istniejącego Social Place campfire.
- NPC może spotkać tam innych NPC.
- Istniejące social pairing/dialogue działa bez zmian.
- NPC nie musi być sociable, aby campfire było możliwą opcją.

### Pressure

- wysoki hunger blokuje campfire,
- wysoki thirst blokuje campfire,
- wysoki duty/work pressure blokuje campfire,
- brak istotnego pressure pozwala na campfire opportunity,
- ważniejszy pressure może przerwać pobyt przy campfire.

### Campfire state

- brak campfire → brak próby dotarcia do niego,
- zgaszone campfire → brak próby dotarcia do niego,
- aktywne campfire → może być celem,
- odległe campfire nie powoduje nieuzasadnionej dalekiej podróży.

### Schedule

- campfire nie wymaga nowego ScheduleActivity,
- NPC opuszcza campfire zgodnie z istniejącym schedule/decision flow,
- przejście do sleep nadal działa,
- istniejący fallback pozostaje bezpieczny, gdy Social Place nie jest dostępne.

### Weather integration

- silny shelter pressure ma pierwszeństwo przed campfire,
- campfire nie obchodzi mechanizmu weather/shelter,
- oba zachowania korzystają z tego samego decision arbitration.

### Simulation

- działa bez gracza,
- działa poza kamerą,
- brak per-frame campfire gathering logic.

## Acceptance criteria

1. NPC mogą spontanicznie zbierać się przy aktywnym campfire w nocy.
2. Campfire jest wykorzystywane jako istniejący Social Place.
3. Campfire jest dostępne jako low-pressure opportunity, a nie obowiązkowe zachowanie.
4. Niski competing pressure jest wymagany do wyboru campfire.
5. Istniejące potrzeby i pilniejsze działania zachowują priorytet.
6. Kilku NPC może spotkać się przy jednym campfire.
7. Istniejący social pairing/dialogue działa bez tworzenia nowego systemu.
8. sociable wpływa na zachowanie social, ale nie jest twardym prerequisite dla campfire.
9. Zgaszone lub nieistniejące campfire nie staje się celem.
10. NPC nie wykonuje nieuzasadnionej dalekiej podróży do campfire.
11. Schedule i sleep lifecycle nadal działają.
12. Zachowanie działa bez udziału gracza i kamery.
13. Nie powstaje osobny CampfireGatheringManager, parallel social system ani per-frame gathering system.

## Out of scope

- weather reaction,
- shelter,
- warmth/temperature,
- nowe Needs,
- nowe traits,
- nowe dialogi specyficzne dla ogniska,
- specjalne animacje przy ognisku,
- campfire cooking,
- campfire fuel management,
- grupowy system rozmów,
- persistent campfire gatherings,
- nowe ScheduleActivity.

**Zrób git commit i push do main, rebase jeżeli trzeba**
