# Plan: NPC Daily Routine & Place System

**Status:** `verification needed` — v1 (formalizacja `home` jako `Place`) done. **v2 stage 1** (dane: `PlaceType` `workplace`/`food`/`social`, `workplaceFor()` hybryda, `Schedule Template` per rola, `landmarks.market` dla tradera) done. **v2 stage 2** (generyczny FSM `goTo/execute/return` zastępujący `goWell/goGarden/goTree/goStock` + realna konsumpcja `schedule`: sleep gate i `work`→`workplace` routing) zaimplementowane 2026-08-09, zielone na `tsc`/`lint`/`build`/`test` — patrz „Stan implementacji (v2 stage 2)” niżej. Traits-modyfikacja harmonogramu nadal świadomie odłożona (patrz „Decyzje (2026-08-09)”). Brak jeszcze wizualnej weryfikacji w przeglądarce.

**Zweryfikowane 2026-08-08 wobec kodu — pełna lista braków (dla przyszłego planu domykającego):**
Z sześciu punktów „Zakres pierwszego etapu” (patrz sekcja niżej) zrobione są tylko 1.5/6:
1. System `Place` — **częściowo**: `src/settlement/places.ts` istnieje, ale `PlaceType` to dziś tylko `'home'` (potwierdzone w kodzie: `export type PlaceType = 'home'`). `workplace`/`food`/`social` nie istnieją nawet jako typ.
2. Automatyczne przypisanie domów — **done** (już działało przed planem, teraz formalnie przez `Place`, `createSettlement.ts:107-123`).
3. `Schedule Template` zależny od roli — **0%**, brak jakiegokolwiek kodu (`grep -rn “Schedule” src/ai src/settlement` nie zwraca żadnej implementacji, tylko komentarze odsyłające do tego planu).
4. Generowanie osobistego harmonogramu NPC — **0%**, zależne od punktu 3.
5. Modyfikacja harmonogramu przez traits — **0%**, zależne od punktu 3.
6. Integracja harmonogramu z FSM (generyczny `goTo(location) → execute(action)`) — **0%**; dzisiejszy `Phase` w `NpcAgent.ts` jest wciąż zasobowo-specyficzny (`goWell/goGarden/goTree/goStock`), zero generycznej warstwy.

Dodatkowo: `role` (z `npc-character-depth.md`) istnieje w `NpcAgent.ts:233` (`this.role = character.role`), ale to czyste dane — zero konsumenta/zachowania gdziekolwiek w kodzie (potwierdzone: brak `.role` poza tym jednym przypisaniem). Zegar dnia/nocy (`src/world/dayNight.ts`) nadal nie ma żadnego wiring do NPC-schedule.

Part 2 of ChatGPT plans.

> Draft from ChatGPT without repository files access. Review before implementation!

## Review (2026-08-07, Claude) — vs. realia kodu

- **Zależy od `role`** z [npc-1-identity.md](./2026-08-07--019--npc-1-identity.md) — nierozstrzygnięty, patrz review tamtego planu.
- **„Home Assignment" częściowo już istnieje.** Plan opisuje to jako brakujący system do zbudowania, ale `createSettlement.ts:36-39` już trywialnie przypisuje dom każdemu NPC przy tworzeniu osady (`landmarks.homes[i % landmarks.homes.length]`). Brakuje tylko formalnego typu `Place` — sama funkcjonalność (dom przypisany automatycznie, nie ręcznie) już działa.
- **`workplace: Place` per rola zakłada nowy world content, którego dziś nie ma.** `SettlementLandmarks` ma dziś **jeden wspólny** well/garden/stockpile dla całej osady ([props.ts:5-9](../../src/settlement/props.ts)) — nie ma per-rola workplace (farma, posterunek strażnika, stoisko handlarza). Zrobienie tego wymaga nowej generacji zawartości świata (nowe propsy/lokacje per rola), nie tylko logiki FSM/schedule — plan to zaniża, opisując jako „dodajemy Schedule Template + Place system".
- **Obecny FSM jest zasobowo-specyficzny, nie generyczny.** `Phase` w `NpcAgent.ts` to `goWell/goGarden/goTree/goStock/chop/deposit/drink/eat/wander/...` — zaszyte 1:1 z konkretnymi needs (woda/jedzenie/drewno). Plan zakłada generyczny `goTo(location) → execute(action) → return`, czego dziś nie ma — integracja „Schedule → FSM" to refaktor fazowego automatu, nie tylko nakładka nad nim.
- **Nawiązanie do zegara dnia/nocy jest wykonalne, ale plan go nie wspomina.** `src/world/dayNight.ts` już istnieje z `timeMultiplier`/`dayLengthSec` — harmonogram 07:00/12:00/18:00/22:00 mógłby się z nim spiąć, ale wymaga jawnego wiring, którego plan nie opisuje.

Otwarte decyzje do ustalenia z użytkownikiem przed implementacją — patrz wiadomość w wątku review (2026-08-07).

## Decyzje (2026-08-07) — przycięcie zakresu po review

**W zakresie v1:** tylko formalizacja `home` jako `Place`. `createSettlement.ts:36-39` już dziś przypisuje dom każdemu NPC automatycznie (`landmarks.homes[i % landmarks.homes.length]`) — v1 tego planu to typ `Place { id, type: 'home', position }` i drobny refaktor, żeby ten istniejący przydział przechodził przez formalny typ zamiast gołego `THREE.Vector3`. Bez widocznej zmiany w grze — czysto porządkujące.

**Stan implementacji (v1, 2026-08-07):** `done`, `verification needed`. `src/settlement/places.ts` (`Place`/`PlaceType`) — `createSettlement.ts` buduje `homePlaces: Place[]` z `landmarks.homes` (fallback na `landmarks.well` gdy osada jakimś trafem nie ma chat) i przekazuje `Place` zamiast gołego `Vector3` do `NpcAgent.create`/`NpcAgent` (konstruktor rozpakowuje `home.position` raz, wewnętrzne `this.home: THREE.Vector3` — geometria FSM/wander bez zmian). `npx tsc --noEmit`/`npm run lint`/`npm run build`/`npm run test` czyste. Brak widocznej zmiany w grze zgodnie z zamierzeniem — do potwierdzenia w przeglądarce, że NPC nadal poprawnie mają przypisane domy.

**Odłożone (nie w v1, zostają w planie jako przyszłość — wymagają `role` z `npc-character-depth.md`, który sam ma `role` tylko jako dane bez zachowania):**
- `Schedule Template` per rola, personalny harmonogram, traits modyfikujące harmonogram (§ Daily Schedule, Schedule Template, Traits wpływające na harmonogram).
- `workplace: Place` per rola (`Forest_A`, `Farm_2`...) — dziś `SettlementLandmarks` ma jeden wspólny well/garden/stockpile dla całej osady ([props.ts:5-9](../../src/settlement/props.ts)), nie ma per-rola lokacji pracy. To wymaga nowej generacji world contentu (nowe propsy/lokacje), nie tylko logiki — osobna decyzja o zakresie, gdy `role` z `npc-character-depth.md` zacznie mieć realne zachowanie.
- Integracja z FSM (generyczny `goTo(location) → execute(action)`) — dzisiejszy `Phase` w `NpcAgent.ts` jest zasobowo-specyficzny (`goWell/goGarden/goTree/goStock`), refaktor na generyczny system to osobny krok, robiony razem z workplace, nie osobno.
- `food`/`social` typy `Place` — bez konsumenta dopóki nie ma schedule.

Powód przycięcia: pełny zakres zależy od nierozstrzygniętego jeszcze zachowania `role` i wymaga nowej zawartości świata (dodatkowe lokacje per rola) — zbyt duży, nieprecyzyjny skok na raz. Wracamy do pełnego zakresu, gdy `role` z `npc-character-depth.md` wyląduje i będzie decyzja o kolejnych typach miejsc pracy.

## Decyzje (2026-08-09) — odmrożenie pełnego zakresu (v2)

`role` ma dziś realnych konsumentów poza samą daną (`src/settlement/families.ts` wymusza rolę per zasób — `RESOURCE_ROLE` dla miner/fisher-style outpostów, patrz [plan 032](./2026-08-08--032--natural-resources-economy.md)). Na tej podstawie ustalono z użytkownikiem odmrożenie pełnego zakresu tego planu. **Ten update to same decyzje/dokumentacja — implementacja jeszcze nie ruszyła**, kolejny krok to konkretny plan wdrożenia / kod.

- **Zakres:** pełny — `Schedule Template` per rola, `workplace: Place`, generyczna integracja z FSM. Traits-modyfikacja harmonogramu (`night_owl`/`hardworking`/`social`) **świadomie osobno, później** — najpierw jednolity schedule per rola dla wszystkich NPC z tą rolą, weryfikacja w przeglądarce, dopiero potem traits jako nakładka.

- **`workplace` — hybryda, nie jedna reguła dla wszystkich ról:**
  - `woodcutter` → istniejący landmark `SettlementLandmarks.trees` (bez nowej geometrii).
  - `farmer` → istniejący landmark `SettlementLandmarks.garden` (bez nowej geometrii).
  - `trader` → **nowy prop**: `crate.glb` + `barrel.glb` (rezerwa, już pobrane, `public/models/settlement/`, patrz [CREDITS.md](../assets/CREDITS.md)) jako stoisko/market stall, postawione koło clearing. Wymaga nowego pola w `SettlementLandmarks` (lub osobnej generacji w `props.ts`/`villageClearing.ts`) i podpięcia w `buildSettlementProps`.
  - `guard` → **na razie bez nowej geometrii**, reuse istniejącego landmarku (dokładny wybór — np. środek clearing / `well` jako centralny punkt patrolu — do ustalenia przy pisaniu kodu, nie blocker na etapie dokumentacji). `towerhouse.glb` (rezerwa) świadomie **nie** wchodzi w v2 — tylko trader dostaje nowy prop w tym kroku.

- **FSM: pełny refaktor na generyczny model**, nie nakładka nad obecnym `Phase`. `goTo(location) → execute(action) → return` zastępuje dzisiejsze zasobowo-specyficzne `goWell/goGarden/goTree/goStock` w `NpcAgent.ts`. To dotyka istniejącego, działającego kodu FSM na raz — planować jako osobny krok z uważną regresją (`pickNeed`, istniejące testy `src/ai/Needs.test.ts`, ręczna weryfikacja w przeglądarce: woda/jedzenie/drewno nadal działają tak jak dziś, HP/traits z `npc-character-depth.md` nadal się wpinają w `steerTo()`/phase timery).

- **Schedule ↔ zegar dnia/nocy: bezpośrednie skalowanie 24h → `timeOfDay`.** `timeOfDay` w `src/world/dayNight.ts` to 0-1 (0=północ, 0.5=południe) — godzina zegarowa mapuje się liniowo: `timeOfDay = hour / 24` (np. `07:00 → 0.2917`, `12:00 → 0.5`, `18:00 → 0.75`, `22:00 → 0.9167`). Prosty, dokładny mapping — harmonogram żyje w tych samych jednostkach co reszta gry (oświetlenie/mgła już czytają `timeOfDay`/`dayFactor` z tego samego stanu).

## Stan implementacji (v2 stage 1, 2026-08-09)

Dane/fundament — celowo bez integracji z FSM (to stage 2, osobny krok wyżej):

- `src/settlement/places.ts` — `PlaceType` rozszerzony o `'workplace' | 'food' | 'social'` (nadal tylko `workplace` ma realnego producenta); `workplaceFor(settlementId, role, landmarks, treeIndex): Place | null` — hybryda z decyzji wyżej: `woodcutter` → round-robin po `landmarks.trees`, `farmer` → `landmarks.garden`, `trader` → `landmarks.market` (nowe), `guard` → `landmarks.well`, `miner` → `landmarks.stockpile` (reuse, brak query API do złóż rudy), `fisher` → `landmarks.dock` gdy osada go ma, inaczej fallback na `landmarks.well` jak `guard`. Testy: `places.test.ts`.
- `src/settlement/props.ts` — nowe pole `SettlementLandmarks.market`, budowane bezwarunkowo w `buildSettlementProps` (jak well/garden/stockpile) z `crate.glb` + `barrel.glb` (rezerwa, `createCrate()` fallback jeśli GLB nie załaduje się).
- `src/ai/schedule.ts` (nowy) — `ScheduleTemplate`/`SCHEDULE_TEMPLATES` (jeden wzorzec na rolę: `woodcutter`/`farmer`/`miner`/`fisher`/`trader` — dzień; `guard` — nocna zmiana), `hourToTimeOfDay(hour)`, `activityAt(template, timeOfDay)` (cyklicznie rozwiązuje aktywność niezależnie od kolejności wpisów w tablicy — obsługuje `guard`'a przechodzącego przez północ). Testy: `schedule.test.ts`.
- `src/ai/NpcAgent.ts` — nowe pola `readonly workplace: Place | null` (z `workplaceFor`, przekazywane przez `createSettlement.ts`) i `readonly schedule: ScheduleTemplate` (`SCHEDULE_TEMPLATES[role]` — bez personalizacji traits, zgodnie z decyzją) + `getScheduledActivity(timeOfDay)` jako query-only helper. **Zero zmian w `phase`/`switch` FSM** — `goWell/goGarden/goTree/goStock`/`pickNeed` działają identycznie jak przed tym krokiem.
- `npx tsc --noEmit`/`npm run lint`/`npm run build`/`npm run test` czyste. Brak widocznej zmiany w istniejącym zachowaniu NPC (workplace/schedule to dziś martwe dane) — jedyna widoczna zmiana w grze to nowy prop (skrzynka+beczka) w każdej osadzie, do potwierdzenia w przeglądarce.

## Stan implementacji (v2 stage 2, 2026-08-09)

Generyczny FSM + realna konsumpcja `workplace`/`schedule`:

- `src/ai/NpcAgent.ts` — `Phase` skrócony: `goGarden/goHomeDrink/goStock/goTree/goWell` + `chop/deposit/drink/eat` zastąpione przez `goTo`/`execute`, parametryzowane nowym typem `PlannedAction` (`action`, `destination`, `duration`, `onComplete`, opcjonalny `next` — łańcuch, np. `chop` przy drzewie → `deposit` przy stockpile). `followPath`/`goSleep`/`sleep`/`wander`/`lookAtPlayer` bez zmian koncepcyjnych — to nie są akcje „idź gdzieś i zrób jedną rzecz”. `beginNeed()` (woda/jedzenie/drewno) przepisany na `startAction()` z **identycznymi** czasami/efektami co przed refaktorem (1.2/1.4/1.6/0.8 × `waitMultiplier`, te same redukcje need'ów) — zero zamierzonej zmiany zachowania dla wody/jedzenia/drewna.
- **Nowa `beginIdle(scheduledActivity)`** — gdy `pickNeed` zwróci `'idle'`: jeśli `schedule` mówi `work` i NPC ma `workplace`, idzie tam i wykonuje generyczną akcję `work` (`WORK_DURATION_RANGE` = 2-4s × `waitMultiplier`, bez efektu na needs) zamiast dawnego czysto losowego wander/dock-walk fallbacku. Needs (woda/jedzenie/drewno) nadal sprawdzane **first** w `choose` (`pickNeed`) — `work` tylko wypełnia to, co wcześniej było pustym „idle”, zgodnie z „Needs override” z diagramu przepływu decyzji.
- **Sleep gate przeniesiony z `isNight` (dusk/zegar nocy osady) na `schedule`** — `choose`: `scheduledActivity === 'sleep' && !night_owl` → `goSleep`; `goSleep`/`sleep` budzą się gdy `scheduledActivity !== 'sleep'`. Dla ról dziennych (sleep ~22:00-6:00) to podzbiór dawnego okna `isNight` (~18:00-6:00) — realna, zamierzona zmiana: NPC dziennych ról **nie śpi już natychmiast o zmierzchu (18:00), tylko chodzi/pracuje do swojej pory snu z `SCHEDULE_TEMPLATES`** (drobna, celowa różnica wobec „zero regresji”, część sensu tego kroku). `guard` (nocna zmiana, sleep 8:00-17:00) **śpi teraz w dzień i pracuje w nocy** — to jedyny sposób, w jaki nocna zmiana guarda była w ogóle widoczna, bo `isNight` sam w sobie usypiał wszystkich jednakowo.
- `timeOfDay` (zamiast wcześniejszego `isNight: boolean`) przewleczony co klatkę: `createApp.ts` (`dayNight.timeOfDay`) → `SettlementsManager.update` → `Settlement.update` → `NpcAgent.update`. `createSettlement.ts`'s `NPC_SLEEP_NIGHT_THRESHOLD` usunięty (już nieużywany do snu NPC) — `NIGHT_FIRE_THRESHOLD` (zapłon ogniska o zmierzchu) zostaje, teraz z własną wartością zamiast aliasu.
- Testy: istniejące `schedule.test.ts`/`places.test.ts` bez zmian (czysta logika, dalej zielone). `NpcAgent.ts` samo nie ma testów jednostkowych — wymaga DOM/THREE (`document.createElement`, sceny) i projekt świadomie nie testuje tej warstwy jednostkowo (patrz `CLAUDE.md`); regresja wody/jedzenia/drewna/HP/traits/chase-flee do zweryfikowania ręcznie w przeglądarce.
- `npx tsc --noEmit`/`npm run lint`/`npm run build`/`npm run test` czyste.

### Do przetestowania (http://localhost:5577/)

1. Regresja needs: obserwuj kilka NPC dłuższą chwilę — nadal chodzą pić do studni/domu, jeść do ogrodu, rąbać drewno i nosić je do stockpile, dokładnie jak przed zmianą (czasy/animacje/efekty na paskach need identyczne).
2. Nowe: NPC bez aktywnej potrzeby w godzinach pracy (wg roli — najłatwiej obserwować w dzień) idzie do swojego `workplace` zamiast błądzić losowo blisko domu — `farmer` przy ogrodzie, `woodcutter` przy drzewach, `trader` przy nowym stoisku (skrzynka+beczka), `guard`/`miner`/`fisher` przy studni/stockpile/doku.
3. Sen: większość NPC nadal zasypia wieczorem (ale teraz zgodnie z własnym `schedule`, nie natychmiast o zmierzchu — może chwilę dłużej chodzić po zmierzchu przed snem, to zamierzone). `guard` powinien spać w dzień i być aktywny (pracować przy swoim workplace) w nocy — najbardziej widoczna nowa różnica.
4. Sanity check reszty: HP/fatigue nadal spada podczas `goTo`/`execute` i regeneruje się podczas wander/sleep/followPath/lookAtPlayer; `lookAtPlayer` (podejście gracza) nadal przerywa `choose`/`followPath`/`goTo`/`wander`, nie `execute`.

**Cel:**  
Dodanie warstwy codziennego życia NPC. Każdy mieszkaniec otrzymuje elastyczny plan dnia, własne miejsca związane z życiem oraz możliwość modyfikowania zachowania przez Identity Model.

System nie zastępuje istniejącego FSM — jest warstwą planowania nad obecnym systemem zachowań.

---

# Przepływ decyzji NPC

Docelowy przepływ:

```
Role
 ↓
Schedule Template
 ↓
NPC Identity (traits + personality)
 ↓
Personal Schedule
 ↓
Needs override
 ↓
FSM execution
```

---

# Daily Schedule

Każdy NPC posiada indywidualny plan dnia.

Plan nie jest sztywnym kalendarzem — jest bazowym kierunkiem działania.

Przykład:

```
07:00 → work
12:00 → eat
13:00 → work
18:00 → home
22:00 → sleep
```

Potrzeby NPC mogą zmieniać plan:

```
hunger > threshold
↓
przerwij aktualną aktywność
↓
idź jeść
```

---

# Schedule Template

Na początku role definiują szablony dnia.

Przykład:

```
woodcutter:

06:00 wake
07:00 work
12:00 eat
13:00 work
18:00 home
22:00 sleep
```

```
farmer:

06:00 wake
07:00 farm
12:00 eat
13:00 farm
18:00 home
22:00 sleep
```

NPC nie posiada ręcznie zdefiniowanego kalendarza.

Personalny harmonogram powstaje na podstawie:

- roli,
- traits,
- personality.

---

# Traits wpływające na harmonogram

Traits modyfikują bazowy plan dnia.

Przykłady:

```
night_owl
→ przesuwa aktywność na późniejsze godziny

hardworking
→ mniej przerw, dłuższa praca

social
→ więcej czasu w miejscach społecznych
```

Traits nie zastępują roli.

---

# Integracja z FSM

Nie tworzymy drugiego systemu zachowania.

Schedule określa:

```
"co NPC powinien teraz robić"
```

FSM wykonuje:

```
goTo(location)
 ↓
execute action
 ↓
return
```

Przykład:

```
Schedule:
"praca"

FSM:
idź do miejsca pracy
wykonaj akcję
wróć do planu
```

---

# Place System

Dodajemy nowy typ świata:

```ts
Place {
  id
  type
  position
}
```

Minimalny typ:

```ts
type PlaceType =
  | "home"
  | "workplace"
  | "food"
  | "social"
```

Place reprezentuje miejsce, do którego NPC może kierować swoje aktywności.

---

# Rozdzielenie roli i miejsca

Role nie zawierają lokalizacji.

Rola:

```
woodcutter
farmer
guard
trader
```

opisuje:

- funkcję NPC,
- aktywności,
- możliwe zadania.

Miejsce jest osobnym stanem NPC.

Przykład:

```
NPC:

home:
House_5

role:
woodcutter

workplace:
Forest_A
```

Po zmianie roli:

```
woodcutter → farmer

home:
House_5

workplace:
Farm_2
```

Dom pozostaje.

---

# Place jako fundament

Docelowo:

```ts
Place {
  id
  type
  position
  capacity?
  activities?
}
```

Na początku używamy minimalnej wersji.

Rozszerzenia później:

- karczmy,
- warsztaty,
- farmy,
- miejsca społeczne,
- wiele NPC korzystających z jednego miejsca.

---

# Home Assignment

Dom NPC nie jest przypisywany ręcznie.

Podczas generowania świata osada automatycznie przydziela dostępne miejsca mieszkalne mieszkańcom.

Proces:

```
World Generation
↓
Generate Places (homes)
↓
Assign homes to NPCs
↓
Create NPC schedule
```

Na początku:

- każdy NPC otrzymuje jedno miejsce `home`,
- brak systemu przeprowadzek,
- brak budowania i zmiany mieszkań.

Przyszła rozbudowa (osobny plan):

- nowe domy,
- rozwój osady,
- zmiana miejsca zamieszkania,
- relacja NPC ↔ dom.

---

# Zakres pierwszego etapu

Dodajemy:

- system `Place`,
- automatyczne przypisanie domów podczas generowania świata,
- `Schedule Template` zależny od roli,
- generowanie osobistego harmonogramu NPC,
- modyfikację harmonogramu przez traits,
- integrację harmonogramu z istniejącym FSM.

Nie dodajemy jeszcze:

- przeprowadzek,
- budowania domów,
- ekonomii osady,
- pełnych relacji NPC,
- kariery i rozwoju zawodowego.

---

# Kierunek rozwoju

Docelowe zachowanie NPC:

```
Identity
   +
Role
   +
Places
   +
Schedule
   +
Needs
   ↓
FSM
   ↓
Daily life simulation
```

Celem jest stworzenie mieszkańców, którzy mają własne życie i rytm dnia, a nie tylko reagują na obecność gracza.