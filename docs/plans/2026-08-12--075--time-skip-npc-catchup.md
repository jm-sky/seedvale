# Plan: Time skip (odpoczynek) — NPC nie nadążają za przyspieszonym czasem

**Status:** `todo`
**Created:** 2026-08-12
**Priority:** 🟡 medium
**Effort:** M
**Depends on:** —

## Problem

Zgłoszenie: **odpoczynek przyspiesza zegar świata, ale NPC nadal poruszają się z tą samą prędkością co zwykle** — po przespaniu np. 8h w grze, NPC-e wyglądają tak, jakby czas dla nich w ogóle nie minął (wciąż idą tam, gdzie szły przed odpoczynkiem, zamiast być już np. w pracy albo w łóżku).

To zgodne z obecną, **świadomą** implementacją w `src/world/timeSkip.ts`: `createTimeSkip()` podbija tylko `dayNight.timeMultiplier` (zegar/niebo), a **nie** skaluje `dt` przekazywanego do reszty świata — komentarz w kodzie wprost mówi, że naiwne skalowanie `dt` wysłałoby NPC/faunę "off into the void" (fizyka ruchu/steerowanie nie jest zaprojektowane pod duże `dt`). W efekcie NPC nadal symuluje się w realnym tempie pod spodem, podczas gdy zegar w kilka sekund przeskakuje o kilka godzin — po zakończeniu skipu `NpcAgent.getScheduledActivity(timeOfDay)` widzi nowy harmonogram natychmiast (np. `sleep` zamiast `work`), ale FSM (`goTo`/`goSleep`/`steerTo`, `WALK_SPEED` w `NpcAgent.ts`) wciąż prowadzi NPC do celu w realnym czasie pieszo — więc NPC "goni" zegar zamiast być zsynchronizowany.

## Cel

Po zakończeniu `timeSkip` (`TimeSkipTickResult.justFinished`) NPC (i ewentualnie fauna) powinny być **spójne z nowym czasem świata** — bez potrzeby przyspieszania ich prędkości ruchu i bez ryzyka "wystrzelenia" z powodu dużego `dt`.

## Kierunek rozwiązania (do doprecyzowania przy implementacji)

Zamiast skalować `dt` (odrzucone już w `timeSkip.ts` — ryzyko fizyki ruchu), **domknąć stan NPC „na sztywno" w momencie `justFinished`**:

1. `gameLoop.ts` już konsumuje `timeSkip.tick(dt)` i `skip.justFinished` (linie ok. 222-227) — to naturalne miejsce na hook, np. `settlementsManager.resolveTimeSkip(newTimeOfDay)` wywoływane raz, gdy skip się kończy.
2. Dla każdego `NpcAgent`: przeliczyć `getScheduledActivity(newTimeOfDay)` i **teleportować** (bez `steerTo`) na pozycję/fazę odpowiadającą tej aktywności — analogicznie do tego, co FSM i tak by osiągnął, tylko bez przechodzenia przez `goTo`/`goSleep` klatka po klatce:
   - `sleep` → pozycja `this.home`, `phase = 'sleep'`.
   - `work` → pozycja workplace (jeśli `workplace` ustawiony), `phase` odpowiednia dla `work`/`execute`.
   - inne (`eat`/`home`/`wake`/brak) → zostawić `phase = 'choose'`, niech normalny `pickNeed`/`beginIdle` zdecyduje od nowej pozycji (prawdopodobnie `home`).
3. Rozważyć też domknięcie potrzeb (`Needs`/`StaminaState`) — `tickNeeds`/`drainStamina`/`restoreStamina` też liczą się w realnym `dt`, więc po 8h skipu głód/zmęczenie NPC nie odzwierciedla przespanych godzin. Do ustalenia: czy to w zakresie tego planu, czy osobno (odpoczynek gracza już przywraca staminę graczowi — sprawdzić czy NPC potrzebują analogicznego jednorazowego zastosowania „8h warte" zmiany do `needs`/`stamina` w tym samym hooku).
4. Fauna (`AnimalAgent.ts`) ma podobny FSM/`steerTo` — do rozstrzygnięcia, czy wchodzi w zakres v1, czy zostaje jako osobny follow-up (mniej widoczne niż NPC-e stojące/chodzące w tle wioski).

## Zakres v1

- Naprawić dla NPC (`SettlementsManager` / `NpcAgent`) — to jest realnie widoczny problem (gracz patrzy na wioskę po odpoczynku).
- Hook wpięty w `justFinished` z `TimeSkip.tick()`, bez zmiany kontraktu `timeSkip.ts` (multiplier-only approach zostaje, to nie jest błędne per se).

## Poza zakresem v1 (do rozważenia osobno)

- Fauna — jeśli po v1 nadal widocznie „nie nadąża", osobny follow-up analogiczny dla `AnimalAgent`.
- Ewentualna korekta needs/stamina o „przespane" godziny — jeśli okaże się grywalnie istotna, rozszerzyć zakres albo zrobić osobny plan.

## Kryterium sukcesu

Po zakończeniu odpoczynku (`onRest`/`onWait`, `createQuickActions.ts`) NPC-e w polu widzenia gracza są tam, gdzie **powinny być** wg nowego `timeOfDay` i swojego `schedule` (`schedule.ts`), a nie tam, gdzie zastał ich moment rozpoczęcia odpoczynku.
