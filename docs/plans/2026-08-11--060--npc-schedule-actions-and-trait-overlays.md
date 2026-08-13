# Plan: NPC schedule actions and trait overlays

**Status:** `verification needed` 🔍
**Created:** 2026-08-11
**Priority:** 🟡 medium
**Effort:** L
**Depends on:** [020 — NPC Daily Routine & Place System](./2026-08-07--020--npc-2-daily-routine-and-place.md), [022 — NPC Character Depth](./2026-08-07--022--npc-character-depth.md)

## Cel

Domknąć codzienny rytm NPC tak, aby wpis harmonogramu był widoczną intencją wykonywaną przez FSM, a nie tylko etykietą. Dodać też małe, deterministyczne nakładki traits na harmonogram per NPC, bez tworzenia drugiego schedulera ani drugiego systemu osobowości.

## Stan wyjściowy

Plan 020 wprowadził `ScheduleTemplate`, `activityAt()` oraz przekazywanie `timeOfDay` do `NpcAgent`. Wykonywane przez harmonogram są obecnie tylko:

- `sleep` — NPC idzie do domu i śpi;
- `work` — bezczynny NPC idzie do przypisanego workplace i wykonuje akcję pracy.

`eat`, `home` i `wake` są obecnie odczytywane z harmonogramu, ale nie wywołują własnego działania. Jedzenie działa wyłącznie jako odpowiedź na pilną potrzebę głodu (`pickNeed()` → ogród).

## Zakres

### 1. Wykonywalne aktywności harmonogramu

- `eat`: gdy NPC nie ma pilniejszej potrzeby, idzie do właściwego miejsca jedzenia (na start istniejący garden/food place), wykonuje krótką akcję i odnawia głód w ograniczonym zakresie.
- `home`: gdy NPC nie ma pilniejszej potrzeby, wraca do domu i pozostaje w pobliżu zamiast losowo wędrować przy miejscu pracy.
- `wake`: jawne przejście z nocnego odpoczynku do dziennego idle/home; bez sztucznej, nowej akcji, jeśli nie wnosi widocznej wartości.
- `work` i `sleep`: zachować obecne działanie oraz priorytet pilnych potrzeb.

Każda aktywność ma używać istniejącego `goTo` → `execute` / `wander` FSM. Nie dodawać osobnych faz typu `goEatScheduled` lub `goHomeScheduled`.

### 2. Miejsca

- Rozszerzyć istniejące `Place`/mapowanie miejsc tylko tam, gdzie jest to potrzebne do działania `eat` i `home`.
- Nie wymagać nowej geometrii świata: garden, dom i obecne landmarki są wystarczające dla v1.
- Gdy miejsce nie istnieje, zastosować czytelny fallback (np. pozostanie przy domu), bez błędów i bez pętli prób na każdej klatce.

### 3. Nakładki traits na grafik

Wprowadzić czystą, deterministyczną transformację:

```text
role ScheduleTemplate + traits → effective schedule
```

Nie mutować globalnych `SCHEDULE_TEMPLATES` ani nie zapisywać runtime state w danych harmonogramu. Transformacja powinna być testowalna jako funkcja danych.

Początkowy, ograniczony zestaw:

| Trait | Wpływ na efektywny grafik |
|---|---|
| `night_owl` | przesunięcie snu/pracy później; zastępuje obecny specjalny wyjątek ignorujący sen |
| `hardworking` | umiarkowanie dłuższe bloki `work`, kosztem czasu `home`/idle |
| `sociable` | część czasu `home` zastępuje aktywnością `social`, gdy istnieje social place; w przeciwnym razie pozostaje `home` |

Przed implementacją rozstrzygnąć precyzyjne godziny i reguły łączenia wielu traits. Pozostałe traits (`fast_worker`, `energetic`) nadal wpływają na parametry wykonania, nie na grafik.

### 4. Arbitraż intencji

Kolejność decyzji pozostaje jednoznaczna:

```text
pilna potrzeba
  → aktywność efektywnego harmonogramu
  → bezpieczny fallback idle/wander
```

Nie dodawać przerywania trwającej akcji przez zwykłą zmianę godziny. Przerwania dla krytycznych potrzeb są osobnym przyszłym projektem.

## Poza zakresem

- ekonomia osady, produkcja i konsumpcja zapasów;
- relacje społeczne, rozmowy grupowe i career progression;
- nowy system pathfindingu;
- osobny system personality/traits;
- wspólna architektura symulacji z planu 055, poza zachowaniem zgodności z jej zasadami.

## Done when

- [x] `eat`, `home` i `wake` mają jawne, obserwowalne zachowanie lub udokumentowany brak działania, gdy to właściwe.
- [x] Pilne water/food/wood needs nadal wygrywają z harmonogramem.
- [x] Trait overlays tworzą deterministyczny effective schedule bez mutacji szablonów ról.
- [x] `night_owl`, `fast_worker` (zamiast nieistniejącego `hardworking`) i `sociable` mają testy jednostkowe dla harmonogramu, w tym przypadki przez północ i brak `social` place.
- [x] Brak regresji snu, pracy i dialogowego `getCurrentActivity()`.
- [ ] Ręczna weryfikacja: NPC je, wraca do domu, pracuje i śpi zgodnie z efektywnym grafikiem.

## Zaimplementowane (2026-08-13)

Czysta transformacja `effectiveScheduleFor(template, traits, options)` w `src/ai/schedule.ts`, liczona raz przy tworzeniu `NpcAgent`. Szablony ról nie są mutowane. `NpcAgent.schedule` to jedyne źródło runtime (decyzje + `getCurrentActivity` / `nextBoundary`).

**Aktywności**

- `eat` — ta sama akcja `eat` co need jedzenia (ogród, `FOOD_SATISFY_AMOUNT`); po posiłku NPC zostaje przy ogrodzie do końca bloku.
- `home` / `wake` — `wake` to granica decyzji (bez nowej akcji); oba zostają przy domu przez istniejący `wander`, bez przypadkowego `dockRoute`.
- `work` / `sleep` — bez zmian wykonania; sen nie omija już `night_owl` wyjątkiem — grafik jest przesunięty.
- `social` — nowa etykieta grafiku; w runtime nie ma social Place, więc overlay i FSM padają na `home`.

**Arbitraż w `choose()`:** `pickNeed()` → jeśli nie `idle`, need; dopiero potem `sleep` / pozostały grafik. Zwyczajna zmiana godziny nie przerywa trwającej akcji.

**Overlays (kolejność stała)**

1. `fast_worker` — opóźnia `home` następujące po `work` o 1 h (dłuższy blok pracy). Osobne od `FAST_WORKER_WAIT_MULT` (szybkość akcji). Plan nazywał to `hardworking`; w modelu postaci takiej cechy nie ma — nie dodano jej.
2. `night_owl` — przesuwa **wszystkie** wpisy o +2 h (mod 24), w tym grafik strażnika przez północ.
3. `sociable` — `home`→`social` tylko gdy `hasSocialPlace`; runtime podaje `false`.

**Technicznie zweryfikowane:** `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`. Rytm dnia wymaga sprawdzenia w przeglądarce.
