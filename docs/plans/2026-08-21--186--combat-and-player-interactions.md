# Plan: Combat i interakcje gracza

**Created:** 2026-08-21
**Status:** `planned` 📋
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

- [ ] Podczas `draw` desktopowa mysz pozwala zmieniać kierunek celowania, zamiast jedynie obracać kamerę.
- [ ] Wprowadzić jedno źródło `aim direction` dla gracza; rozszerzyć istniejący mechanizm `aimYaw` / `attackYaw`, zamiast dodawać `bowYaw`.
- [ ] Kierunek wizualny postaci/łuku i kierunek użyty przez `resolveRangedDirection()` muszą pochodzić z tego samego stanu.
- [ ] Zmiana yaw kamery podczas draw nie może zmieniać wcześniej ustalonego kierunku ataku w sposób powodujący rozjazd.
- [ ] Zachować istniejący touch `attackYaw` i dopasować desktop do tego samego modelu.
- [ ] Dodać istniejący HUD/UI reticle widoczny podczas celowania.
- [ ] Zachować deterministyczne odchylenie accuracy z `rangedAttack.ts` — reticle nie zmienia mechaniki celności.

### 2. Chybiona strzała

- [ ] Po zakończeniu lotu poza trafieniem strzała pozostaje w świecie jako zwykły podnoszalny item.
- [ ] Wykorzystać istniejące projectile/world-item/inventory/interactions.
- [ ] Nie tworzyć osobnego arrow-pickup systemu.
- [ ] Uwzględnić poprawne zakończenie lotu i cleanup projectile, aby strzała nie była symulowana bez końca.

### 3. Długie aktywności

- [ ] Jedna interakcja uruchamia całą wymaganą aktywność, np. 2 godziny świata, zamiast wymagać ponownego startu.
- [ ] Oprzeć działanie na istniejącym `BusyAction`.
- [ ] `Esc` anuluje aktywność przez istniejący mechanizm cancel.
- [ ] Istotne warunki uniemożliwiające pracę (stamina/siła, głód, obrażenia i istniejące blokady) przerywają aktywność.
- [ ] Zachować już wykonaną część progresu tam, gdzie obecny model progresu ją posiada; nie wprowadzać równoległego modelu progresu.
- [ ] Nie zmieniać semantyki krótkich `BusyAction`, jeśli nie jest to konieczne dla długich aktywności.

### 4. Plecak i przeciążenie

- [ ] Plecak zwiększa istniejący `Inventory.maxWeight` gracza; bez drugiego systemu capacity.
- [ ] Ustalić w istniejącym katalogu przedmiotów/rejestracji, jak plecak jest reprezentowany i gdzie właściciel gracza wylicza limit.
- [ ] Sprawdzić i wykorzystać istniejące ograniczenie wagi oraz gabarite bez duplikowania `canAdd()`.
- [ ] Jeżeli przeciążenie nie jest obecnie kompletne, rozszerzyć istniejący model tak, aby wpływało na stamina i prędkość ruchu.
- [ ] Jeżeli którykolwiek z tych efektów już istnieje, tylko podłączyć go do wspólnego stanu przeciążenia.

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

- [ ] `tsc` / build / testy.
- [ ] Combat: draw → aim → release → projectile ma spójny kierunek.
- [ ] Desktop mouse: aim podczas draw, zmiana kamery, reticle.
- [ ] Touch: istniejący model `attackYaw` nadal działa.
- [ ] Chybiona strzała kończy lot i można ją podnieść przez istniejącą interakcję.
- [ ] Długa aktywność trwa jeden ciągły okres, `Esc` ją przerywa, a istotne warunki ją anulują.
- [ ] Plecak zwiększa limit; przeciążenie poprawnie wpływa na istniejące stamina/movement.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
