# Plan: Combat i interakcje gracza

**Created:** 2026-08-21
**Status:** `verification needed` 🔍 — implemented 2026-08-21, see [implementation notes](./2026-08-21--186--combat-and-player-interactions-implementation-notes.md)
**Priority:** high · **Effort:** L
**Depends on:** none
**domain:** `items-player`
**tags:** `[ui-input, quests-progression]`

## Cel

Domknąć kilka powiązanych problemów gracza bez tworzenia równoległych systemów: spójne celowanie z łuku, odzyskiwanie chybionych strzał, długie aktywności oraz pojemność/przeciążenie ekwipunku.

## Reconnaissance

Istniejące mechanizmy, które należy rozszerzyć:

- `src/combat/rangedLifecycle.ts` — wspólny `draw → release → recovery`; nie zmieniać bez potrzeby.
- `src/player/playerRanged.ts` — player-only stamina gating i `manualRelease`.
- `src/combat/rangedAttack.ts` — `resolveRangedDirection(aimYaw, accuracy, deviationRoll)` jest właściwym miejscem dla rzeczywistego kierunku pocisku.
- `src/input/MouseLook.ts` — obecnie desktopowy LMB zapisuje wspólne `interact`; podczas draw potrzebne będzie rozdzielenie sterowania aim od samego looku bez osobnego `bowYaw`.
- `src/app/gameLoop.ts` — właściciel obecnego ammo lookup/consumption, projectile spawning i części interakcji; zmiany powinny być minimalne.
- `src/app/busyAction.ts` — istniejący timer aktywności z `start`, `tick`, `cancel`, progress i `onCancel`; należy go wykorzystać, a nie tworzyć nowy long-action system.
- `src/items/Inventory.ts` — istnieją wspólne `maxWeight`, `maxSize`, `canAdd()`, `totalWeight()` i `totalSize()`. Komentarz w kodzie wskazuje wprost przyszłe różnicowanie `maxWeight` przez plecak.
- `docs/plans/LOOSE-ENDS.md` — istnieje już problem rozjazdu wizualnego kierunku ataku i yaw kamery dla melee; rozwiązanie celowania ranged powinno używać tego samego pojęcia kierunku ataku i nie tworzyć `bowYaw`.

## Zakres

### 1. Łuk — kierunek celowania

- [x] Podczas `draw` desktopowa mysz pozwala zmieniać kierunek celowania, zamiast jedynie obracać kamerę.
- [x] Wprowadzić jedno źródło `aim direction` dla gracza; rozszerzyć istniejący mechanizm `aimYaw` / `attackYaw`, zamiast dodawać `bowYaw` — nowy `resolveRangedAimYaw()` (`player/playerCombat.ts`) generalizuje istniejące pojęcie (soft-lock → `yawToward`, inaczej live mouse yaw), bez osobnego `bowYaw` pola.
- [x] Kierunek wizualny postaci/łuku i kierunek użyty przez `resolveRangedDirection()` muszą pochodzić z tego samego stanu — oba czytają `resolveRangedAimYaw()` co klatkę (`PlayerController.faceAimYaw()` dla wizualnego facing).
- [x] Zmiana yaw kamery podczas draw nie może zmieniać wcześniej ustalonego kierunku ataku w sposób powodujący rozjazd — kierunek jest liczony na bieżąco z tego samego źródła co facing, nie "późno podmieniany" przy release.
- [x] Zachować istniejący touch `attackYaw` i dopasować desktop do tego samego modelu — touch melee `attackYaw` niezmieniony; ranged aim to osobny, już wspólny (desktop+touch przez `mouseLook.state.yaw`/soft-lock) mechanizm.
- [x] Dodać istniejący HUD/UI reticle widoczny podczas celowania — reticle nie istniał w kodzie; dodany minimalny Vue overlay (`HudScreen.vue`, `hud.setAiming()`), widoczny tylko w `playerRanged.state() === 'draw'`.
- [x] Zachować deterministyczne odchylenie accuracy z `rangedAttack.ts` — reticle nie zmienia mechaniki celności (nie dotknięto `rangedAccuracy`/`rangedDeviationRoll`/`resolveRangedDirection`).

### 2. Chybiona strzała

- [x] Po zakończeniu lotu poza trafieniem strzała pozostaje w świecie jako zwykły podnoszalny item.
- [x] Wykorzystać istniejące projectile/world-item/inventory/interactions — `bundle.droppedItems.drop(ammoKind, x, z)`.
- [x] Nie tworzyć osobnego arrow-pickup systemu.
- [x] Uwzględnić poprawne zakończenie lotu i cleanup projectile, aby strzała nie była symulowana bez końca — niezmieniona istniejąca `maxDistance`/`advanceProjectile` logika, drop następuje dokładnie raz przy `expired && !hit`.

### 3. Długie aktywności

- [x] Jedna interakcja uruchamia całą wymaganą aktywność, np. 2 godziny świata, zamiast wymagać ponownego startu — już prawda dla istniejącego rest/wait (`TimeSkip`), zweryfikowane w kodzie, nie zmienione.
- [x] Oprzeć działanie na istniejącym `BusyAction` — bez zmian; `busyAction.ts` pozostaje krótkim real-time kanałem, `TimeSkip` osobno dla postępu czasu świata (implementation notes §9).
- [x] `Esc` anuluje aktywność przez istniejący mechanizm cancel — już działało (`App.vue` → `abortRest`/`abortBusy`), niezmienione.
- [x] Istotne warunki uniemożliwiające pracę (stamina/siła, głód, obrażenia i istniejące blokady) przerywają aktywność — **rzeczywista luka znaleziona i domknięta**: obrażenia (walka ze zwierzęciem, głód/pragnienie) podczas aktywnego `rest`/`wait`/`busy` teraz przerywają go przez nowy `RestActions.interruptRestForDamage()` + istniejący `abortBusy()` (wywoływane z jedynego wspólnego punktu obrażeń gracza, `applyPlayerDamage`'s `onCombatHit`).
- [x] Zachować już wykonaną część progresu tam, gdzie obecny model progresu ją posiada; nie wprowadzać równoległego modelu progresu — wymuszone przerwanie woła te same `TimeSkip.cancel()`/`BusyAction.cancel()`, więc np. częściowy `workProgress` studni jest zaliczany dokładnie jak przy Esc.
- [x] Nie zmieniać semantyki krótkich `BusyAction`, jeśli nie jest to konieczne dla długich aktywności — `busyAction.ts` niezmieniony.

### 4. Plecak i przeciążenie

- [x] Plecak zwiększa istniejący `Inventory.maxWeight` gracza; bez drugiego systemu capacity — `maxWeight` jest teraz getterem (`baseMaxWeight` + suma `carryCapacityBonus` po trzymanych itemach).
- [x] Ustalić w istniejącym katalogu przedmiotów/rejestracji, jak plecak jest reprezentowany i gdzie właściciel gracza wylicza limit — nowy zwykły `ItemKind: 'backpack'` (Kupiec stock), `ItemCatalogEntry.carryCapacityBonus` (+15 kg), liczony w `Inventory.maxWeight`.
- [x] Sprawdzić i wykorzystać istniejące ograniczenie wagi oraz gabarite bez duplikowania `canAdd()` — `canAdd()`/`hasWeightRoom()` niezmienione, tylko czytają nowy `maxWeight` getter.
- [x] Jeżeli przeciążenie nie jest obecnie kompletne, rozszerzyć istniejący model tak, aby wpływało na stamina i prędkość ruchu — **już kompletne** dla ruchu (`playerEncumbrance.ts`/`PlayerController.setEncumbrance()`, potwierdzone w kodzie, implementation notes §14); nic do dopisania.
- [x] Jeżeli którykolwiek z tych efektów już istnieje, tylko podłączyć go do wspólnego stanu przeciążenia — nowy `maxWeight` automatycznie zasila istniejący `computeEncumbrance()` bez żadnej zmiany w `gameLoop.ts`'s wiring.

## Poza zakresem

- Nowy system walki/ranged combat.
- Nowy system pickupów.
- Nowy system aktywności niezależny od `BusyAction`.
- Drugi system inventory/capacity.
- Przebudowa `rangedLifecycle.ts` lub `rangedAttack.ts` bez konkretnej potrzeby.
- Niezwiązane refaktory `gameLoop.ts`.

## Implementacja

1. Zweryfikować dokładne punkty wejścia input/aim, projectile completion, `BusyAction` oraz player inventory w aktualnym kodzie.
2. Naprawić przepływ aim: input → aim direction → visual facing/bow → projectile direction.
3. Dodać world persistence chybionej strzały przez istniejący mechanizm itemów/interakcji.
4. Uzupełnić długie aktywności przez `BusyAction` i istniejące warunki przerwania.
5. Podłączyć plecak do istniejącego `maxWeight` oraz uporządkować overload → stamina/movement tylko jeśli brakujący mechanizm rzeczywiście nie istnieje.
6. Dodać/uzupełnić testy jednostkowe dla kierunku ranged, lifecycle aktywności i capacity/overload tam, gdzie logika jest testowalna bez przeglądarki.

## Weryfikacja

- [x] `tsc` / build / testy — `npx tsc --noEmit`, `npx vue-tsc --noEmit`, `pnpm lint:fix`, `pnpm run build`, `npx vitest run` (172 files / 1488 testów) wszystkie zielone.
- [ ] Combat: draw → aim → release → projectile ma spójny kierunek. *(browser — użytkownik testuje ręcznie)*
- [ ] Desktop mouse: aim podczas draw, zmiana kamery, reticle. *(browser)*
- [ ] Touch: istniejący model `attackYaw` nadal działa. *(browser)*
- [ ] Chybiona strzała kończy lot i można ją podnieść przez istniejącą interakcję. *(browser)*
- [ ] Długa aktywność trwa jeden ciągły okres, `Esc` ją przerywa, a istotne warunki ją anulują. *(browser)*
- [ ] Plecak zwiększa limit; przeciążenie poprawnie wpływa na istniejące stamina/movement. *(browser)*

> **Zrób git commit i push do main, rebase jeżeli trzeba**
