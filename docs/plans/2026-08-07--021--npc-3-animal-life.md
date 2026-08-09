# Plan: Animal Life Simulation

**Status:** `verification needed` — v1 (needs → wander bias, sekcja „Projekt techniczny v1” niżej) zaimplementowane 2026-08-09, zielone na `tsc`/`lint`/`build`/`test`; brak jeszcze wizualnej weryfikacji w przeglądarce (patrz „Do przetestowania” na końcu pliku).
**Scope:** [src/fauna/AnimalAgent.ts](../../src/fauna/AnimalAgent.ts) (rozszerzenie, nie nowy plik na FSM), współdzieli `HealthState`-owy wzorzec fatigue/rest z [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md) (`src/shared/HealthState.ts`) tylko jako inspirację API-kształtu — `AnimalLifeState` to osobny, nowy typ (hunger/thirst/energy to nie HP).

> Draft from ChatGPT without repository files access. Review before implementation!

## Review (2026-08-07, Claude) — vs. realia kodu

- **Duża część już istnieje** w zaimplementowanym (status `done`) [predator-prey-system.md](./2026-08-07--010--predator-prey-system.md):
  - „Territory / Home Range" (§5) → już jest: `AnimalAgent.home` + `ROAM_RADIUS = 50` ([AnimalAgent.ts:26,405-416](../../src/fauna/AnimalAgent.ts)), zwierzę nie oddala się poza promień od miejsca spawnu.
  - „Daily Schedule" (§2, dzień/noc różne zachowania) → częściowo już jest: `isNight` zmienia prędkość prey (`NIGHT_PREY_WALK_MULT`/`NIGHT_PREY_SPRINT_MULT`, [AnimalAgent.ts:261-274](../../src/fauna/AnimalAgent.ts)), liczone z `skyParamsFromTime` w `createFauna`.
  - Plan nie odnosi się do żadnego z tych mechanizmów — czyta się jak zaprojektowany od zera, nie jako rozszerzenie istniejącego `AnimalAgent`/`HealthState`/`AnimalSpawner`.
- **Hunger/thirst/energy jako needs-driven behavior** to sensowne rozszerzenie, ale wymaga nowych zapytań środowiskowych, których dziś nie ma — fauna nie ma odpowiednika `landmarks.well/garden` (te są NPC/settlement-specific, [props.ts](../../src/settlement/props.ts)). To realny nowy zakres pracy (world content + query API), nie tylko logika stanu, czego plan nie sygnalizuje.
- **Save/Persistence (§7) proponuje inny kierunek niż obecna architektura.** Plan chce agregować do poziomu populacji (`AnimalPopulation: gatunek/liczba/region`), ale dzisiejszy system jest per-agent (`AnimalSpawner.ts`, indywidualny `HealthState` na sztukę) — i **`SaveData` w ogóle nie zapisuje dziś stanu fauny/NPC** (potwierdzone w [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md), sekcja „Poza zakresem v1"). Aggregate-population save to inny model danych niż obecny per-agent — wymaga decyzji projektowej, nie tylko dopisania sekcji do planu.
- **Bez zastrzeżeń:** warstwowanie tick (60fps ruch / co kilka sekund decyzje / co kilka minut aging-populacja, §6) jest spójne z etosem projektu (worker pool, perf-conscious chunk streaming).

Otwarte decyzje do ustalenia z użytkownikiem przed implementacją — patrz wiadomość w wątku review (2026-08-07).

## Decyzje (2026-08-07) — przycięcie zakresu po review

Zdecydowano ograniczyć v1 do warstwy **needs → wander bias** na istniejącym `AnimalAgent` ([AnimalAgent.ts](../../src/fauna/AnimalAgent.ts)).

**W zakresie v1:**
- §1 Animal State — tylko `hunger`, `thirst`, `energy` (bez `age`/`mood`/`currentActivity` — nie mają dziś żadnego konsumenta, dodać gdy pojawi się realna potrzeba).
- §3 Needs → Behavior — `hunger`/`thirst`/`energy` tickują w czasie (analogicznie do `NeedState` u NPC, [Needs.ts](../../src/ai/Needs.ts)) i wpływają na `wander()`/`pickWanderTarget()` w `AnimalAgent.ts` — np. wysoki `hunger` → częstszy/szerszy promień wander („grazing”), niska `energy` → dłuższe `idle` zamiast wander. **Bez** nowych lokacji jedzenia/wody — fauna nie ma dziś odpowiednika `landmarks.well/garden` ([props.ts](../../src/settlement/props.ts)), a dodanie go to osobny, większy zakres pracy (world content + query API). To sygnał behawioralny (bias istniejącego wander), nie nawigacja do konkretnego miejsca.

**Odłożone (nie w v1, zostają w planie jako przyszłość):**
- §2 Daily Schedule — częściowo już pokryte istniejącym `isNight` (prędkość prey w dzień/noc, patrz Review); pełny wzorzec pór dnia per gatunek odłożony.
- §4 Animal Memory — odłożone, brak dziś jakiejkolwiek pamięci lokalnej u fauny.
- §5 Territory/Home Range — `home` + `ROAM_RADIUS` już istnieje ([AnimalAgent.ts:26,405-416](../../src/fauna/AnimalAgent.ts)), nic dodatkowego do zrobienia w v1.
- §7 Save/Persistence — obecny `SaveData` nie zapisuje fauny w ogóle (patrz Review); aggregate-population model to osobna decyzja projektowa na później, po ustaleniu czy w ogóle chcemy persystować faunę.
- §8 Przyszłość — bez zmian, pozostaje jako lista pomysłów na potem.

## Projekt techniczny v1 (2026-08-08, gotowy do implementacji)

Konkretyzacja „needs → wander bias” z decyzji wyżej, oparta na strukturze `AnimalAgent` faktycznie dziś w kodzie (`src/fauna/AnimalAgent.ts`) — cytowane linie/nazwy do zweryfikowania przy starcie, kod mógł się przesunąć.

### 1. `AnimalLifeState` — nowy plik, wzorzec `Needs.ts`, nie `HealthState.ts`

```ts
// src/fauna/AnimalLife.ts (nowy)
export type AnimalLifeState = {
  hunger: number  // 0-1, rośnie w czasie
  thirst: number  // 0-1, rośnie w czasie
  energy: number  // 0-1, spada podczas sprintu, regeneruje się poza nim
}

export function createAnimalLifeState(offset = 0): AnimalLifeState {
  // offset (0-1, per-instancja) rozbija fazę jak `createNeedState`'s offset u NPC —
  // bez tego wszystkie zwierzęta danego gatunku tickowałyby w idealnym unisono.
  return { hunger: 0.2 + offset * 0.3, thirst: 0.2 + ((offset + 0.4) % 1) * 0.3, energy: 1 }
}

export function tickAnimalLife(life: AnimalLifeState, dt: number, sprinting: boolean): void {
  life.hunger = Math.min(1, life.hunger + dt * HUNGER_RATE)
  life.thirst = Math.min(1, life.thirst + dt * THIRST_RATE)
  life.energy = sprinting
    ? Math.max(0, life.energy - dt * ENERGY_DRAIN_RATE)
    : Math.min(1, life.energy + dt * ENERGY_REGEN_RATE)
}
```

- **`energy` napędzana istniejącą flagą `sprinting`**, nie nową maszyną stanów — `AnimalAgent.update()` już ustawia `this.sprinting = true` podczas pościgu/ucieczki (`updatePredator`/`updatePrey`, dziś ok. linii 254-331) i `false` na starcie każdego `update()`. To dokładnie ten sam wzorzec co `FATIGUE_PHASES`/`REST_PHASES` u `NpcAgent` ([NpcAgent.ts:114-125](../../src/ai/NpcAgent.ts)) — drenaż podczas wysiłku, regeneracja poza nim — tylko podpięty pod flagę, która już istnieje, zamiast pod listę faz (fauna nie ma dyskretnych faz jak NPC).
- **`hunger`/`thirst` rosną monotonicznie i „rozładowują się” przy okazji ukończonego cyklu wander**, nie przez nawigację do jedzenia/wody (decyzja wyżej wyklucza nowe lokacje). Konkretnie: gdy `pickWanderTarget()` wybiera nowy cel *podczas gdy `hunger`/`thirst` jest podwyższony*, po dotarciu do tego celu (`arrived()` zwraca true w `wander()`) odejmij stały kawałek `hunger`/`thirst` — abstrakcja „coś po drodze skubnął/napił się”, bez realnego obiektu w scenie. Bez tego licznik nasyca się do 1 i tam zostaje, co czyni sygnał bezużytecznym po paru minutach sesji.

### 2. Wpięcie w `AnimalAgent`

- Nowe pole `private readonly life: AnimalLifeState`, tworzone w konstruktorze obok `this.health = createHealthState(...)` (dziś [AnimalAgent.ts:144](../../src/fauna/AnimalAgent.ts)) — `createAnimalLifeState(Math.random())` albo per-instancja offset przekazany podobnie jak `needOffset` u `NpcAgent.create()`, do ustalenia przy implementacji.
- `update()` (dziś [AnimalAgent.ts:242-268](../../src/fauna/AnimalAgent.ts)): wywołać `tickAnimalLife(this.life, dt, this.sprinting)` **po** ustawieniu `this.sprinting` w `updatePredator`/`updatePrey`, nie przed — inaczej tick użyje wartości `sprinting` sprzed tej klatki. Najprościej: przenieść tick na koniec `update()`, tuż przed `this.mixer?.update(dt)`.
- `wander()`/`pickWanderTarget()` (dziś [AnimalAgent.ts:333-355](../../src/fauna/AnimalAgent.ts)) — bias:
  - **Szerszy promień + częstszy retarget przy wysokim `hunger`/`thirst`** — w `pickWanderTarget()`, przeskalować `r = 6 + Math.random() * 10` i `this.wanderTimer = 3 + Math.random() * 4` o `1 + (hunger+thirst)/2 * BIAS_STRENGTH`-owy mnożnik (szerszy promień = „szuka pożywienia dalej”, krótszy timer = częściej zmienia cel = bardziej niespokojne krążenie). Jedna stała `BIAS_STRENGTH`, nie osobna dla hunger i thirst — decyzja wyżej nie rozróżnia ich zachowania, tylko nazwę licznika.
  - **Dłuższe „idle” przy niskiej `energy`** — najmniejsza zmiana: w `wander()`, jeśli `this.life.energy < ENERGY_REST_THRESHOLD`, z pewnym prawdopodobieństwem *nie* wołaj `pickWanderTarget()` po wygaśnięciu `wanderTimer`, tylko przedłuż go bez ruchu (zwierzę stoi, `updateAnim()` już gra `idleAction` gdy `this.moving` zostaje `false` tej klatki — nic więcej nie trzeba dopisywać po stronie animacji).
  - **Rozładowanie przy przybyciu** (patrz punkt 1) — w gałęzi `if (this.wanderTimer <= 0 || this.arrived(this.target, 1.2))`, przed `this.pickWanderTarget()`, odejmij `hunger`/`thirst` jeśli były podwyższone.
- **Predator/prey podczas pościgu/ucieczki bez zmian** — `updatePredator`/`updatePrey` nie sprawdzają `life` w v1 (np. głodny wilk nie poluje agresywniej) — to by rozszerzało zakres poza „wander bias”, odłożone jako możliwy krok 2.

### 3. Stałe (do wytuningowania w przeglądarce, nie zgadywać na sztywno)

```
HUNGER_RATE, THIRST_RATE      # jednostki/sek — start: podobny rząd wielkości co NPC (Needs.ts: 0.028-0.04/sek)
ENERGY_DRAIN_RATE             # podczas sprintu — szybciej niż regen, żeby dłuższy pościg był odczuwalny
ENERGY_REGEN_RATE             # poza sprintem
ENERGY_REST_THRESHOLD         # próg poniżej którego rośnie szansa na "dłuższe idle"
BIAS_STRENGTH                 # mnożnik promienia/retargetu wander przy wysokim hunger/thirst
```

### 4. Poza zakresem tej sekcji (bez zmian względem „Decyzje” wyżej)

- Żadnego UI — `hunger`/`thirst`/`energy` nie trafiają do etykiety/villagers-screen w v1 (fauna nie ma dziś odpowiednika `createVillagersScreen.ts`); czysto behawioralne.
- Zero wpływu na combat/HP (`HealthState`) — `energy` to osobny licznik, nie modyfikuje `damageFor`/`takeDamage`.

## Cel

Nadać zwierzętom własny rytm życia. Zwierzę nie jest tylko encją reagującą
na gracza lub pobliskie obiekty — ma potrzeby, stan i cykl dobowy.

"Animals exist before the player sees them."

---

## 1. Animal State (podstawa)

Dodać trwały stan zwierzęcia:

AnimalLifeState:
- age
- hunger
- thirst
- energy
- health (istniejące HealthState)
- mood/stress
- currentActivity

Przykład:

Wolf:
- energy ↓ podczas polowania
- hunger ↑ z czasem
- rest przy niskiej energii

Deer:
- hunger → szukanie roślinności
- thirst → szukanie wody
- stress → ucieczka

---

## 2. Daily Schedule

Nie sztywny kalendarz, tylko wzorce aktywności zależne od pory dnia.

AnimalSchedule:

Morning:
- deer → grazing
- wolf → hunting/rest

Day:
- deer → feeding/wandering
- wolf → resting

Night:
- wolf → hunting
- deer → sleeping/hidden

Schedule powinien generować "preferencję zachowania",
nie wymuszać waypointów.

---

## 3. Animal Needs → Behavior

Podobnie jak NPC:

Needs
 ↓
Decision
 ↓
Behavior State

Przykład:

Hunger high
 ↓
FindFood
 ↓
Graze

Energy low
 ↓
FindSafePlace
 ↓
Rest

Threat detected
 ↓
Flee

---

## 4. Animal Memory

Lekka pamięć lokalna:

- ostatnie miejsce jedzenia
- ostatnie zagrożenie
- ulubione miejsce odpoczynku
- terytorium

Nie AI/LLM.

---

## 5. Territory / Home Range

Każde zwierzę ma obszar życia:

Deer:
- kilka km²
- punkty wodne
- miejsca żerowania

Wolf:
- terytorium
- polowania w grupie (później)

To pozwoli uniknąć przypadkowego chodzenia.

---

## 6. Simulation Tick

Nie wszystko musi działać co klatkę.

Animal simulation:

60 FPS:
- ruch
- animacja
- proximity

Co kilka sekund:
- decyzje
- potrzeby

Co kilka minut:
- starzenie
- populacja
- migracja

---

## 7. Save / Persistence

Docelowo zapisywać:

AnimalPopulation:
- gatunek
- liczba osobników
- region
- stan populacji

Nie każdy królik jako osobny obiekt.

---

## 8. Przyszłość

Możliwe rozszerzenia:

- rozmnażanie
- stada
- migracje sezonowe
- choroby
- relacje predator/prey bardziej biologiczne
- wpływ pogody

## Szkic zmian (pliki)

```
src/fauna/AnimalLife.ts     # nowy: AnimalLifeState, createAnimalLifeState, tickAnimalLife
src/fauna/AnimalAgent.ts    # + pole `life`, tick w update(), bias w wander()/pickWanderTarget()
```

## Done when

- [x] `hunger`/`thirst`/`energy` tickują per-zwierzę (offsetowane, nie w unisono) — `src/fauna/AnimalLife.ts`
- [x] `energy` spada podczas sprintu (pościg/ucieczka), regeneruje się poza nim
- [x] Wysoki `hunger`/`thirst` widocznie zmienia wander (szerszy promień i/lub częstszy retarget) — `needWanderBias()` w `AnimalAgent.ts`, do potwierdzenia w przeglądarce
- [x] Niska `energy` widocznie wydłuża okresy stania w miejscu (idle) między wanderami — `EXTENDED_IDLE_CHANCE` w `wander()`, do potwierdzenia w przeglądarce
- [x] `hunger`/`thirst` nie nasyca się trwale do 1 w dłuższej sesji (rozładowanie przy przybyciu do celu wander) — `relieveElevatedNeeds()`
- [x] Zero regresji chase/flee/HP (`predator-prey-system.md`) — `life` nie wpływa na combat w v1 (predator/prey ścieżki update() bez zmian, tick `life` na końcu `update()`)
- [x] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`

## Do przetestowania (http://localhost:5577/)

1. Obserwuj jedno zwierzę dłuższą chwilę (kilka minut) — powinno mieć widocznie zmienne tempo/promień wędrówki, nie identyczny wzorzec cały czas.
2. Sprowokuj pościg (podejdź tak, by wilk/lis zaczął gonić sarnę/jelenia) — po dłuższym sprincie zwierzę powinno częściej/dłużej stać w miejscu zanim znów zacznie wędrować (niska `energy`).
3. Sanity check regresji fauny: chase/flee/kontakt/HP/respawn w spawnerze — działa jak przed zmianą.
