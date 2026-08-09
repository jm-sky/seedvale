# NPC labels powinny przygasać, gdy gracz nie patrzy w ich stronę

**Status:** `verification needed` — zaimplementowane 2026-08-10: `src/ui/labelDistance.ts`'s `gazeOpacityFactor()` (nowa funkcja) mnoży dotychczasową opacity zależną od dystansu — 1 wewnątrz ~90°-stożka wokół kierunku patrzenia gracza, 0.5 poza nim. `NpcAgent.update()` przyjął `observerYaw`, przekazywany przez `Settlement.update`/`SettlementsManager.update` aż z `app/createApp.ts` (`mouseLook.state.yaw`). Wymaga weryfikacji w przeglądarce (spójrz wprost na NPC, potem odwróć się bokiem trzymając go blisko — etykieta powinna przygasnąć bez znikania).
**Created:** 2026-08-10
**Źródło:** zgłoszenie użytkownika ("Do rozważenia")

## Objaw / prośba

Etykiety NPC (`.npc-label`) mają dziś opacity zależną wyłącznie od dystansu (`labelOpacityForDistance`, `src/ui/labelDistance.ts`). Prośba: dodatkowo przygaszać etykietę do 50%, gdy gracz patrzy w innym kierunku niż NPC — stożek widzenia ok. 90° wokół kierunku, w którym patrzy gracz.

## Naprawa

1. `labelDistance.ts` dostaje `gazeOpacityFactor(dx, dz, observerYaw)` — ten sam wzorzec wektora „forward" co `interaction/findInteractionTarget.ts`'s `pickInGaze` (`forwardX = -sin(yaw)`, `forwardZ = -cos(yaw)`), zwraca `1` wewnątrz stożka (`dot >= cos(45°)`, czyli pełna szerokość stożka to 90°), `0.5` poza nim.
2. `NpcAgent.update()` mnoży wynik `labelOpacityForDistance(...)` przez `gazeOpacityFactor(...)` zamiast go zastępować — więc dystans dalej rządzi, a stożek widzenia tylko dodatkowo przyciemnia.
3. Wymagało dodania `observerYaw` do łańcucha `update()`: `app/createApp.ts` → `SettlementsManager.update` → `Settlement.update` → `NpcAgent.update`. Przy okazji tego samego przepisania sygnatury dodano też `nearbyNpcCount` z issue 010 — jedna zmiana sygnatury zamiast dwóch osobnych przejść przez ten sam łańcuch wywołań.

## Poza zakresem teraz

Etykiety zwierząt/przedmiotów/drogowskazów nie dostały tego samego przyciemnienia — prośba dotyczyła konkretnie NPC.
