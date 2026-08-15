---
domain: items-player
tags: [fauna]
---

# Plan: Universal Melee Combat — forgiving targeting & gap close

**Created:** 2026-08-15  
**Status:** `verification needed` 🔍 — zaimplementowane, techniczna weryfikacja zielona (tsc/lint/test/build); brak testu w przeglądarce  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~123~~

## Cel

Combat ma być mniej zręcznościowy i bardziej wybaczający błędy gracza. Gracz wskazuje zwierzę i inicjuje atak, a system pomaga z target acquisition i niewielkim pokonaniem dystansu.

Nie tworzymy auto-combatu ani chase AI.

## Zakres

### 1. Forgiving target acquisition

Rozszerzyć obecne wyszukiwanie celu:

- większy `GAZE_RANGE`,
- cone **90°**,
- preferować zwierzę:
  1. najbliższe centrum kierunku patrzenia,
  2. następnie bliższe,
  3. z preferencją dla celu trafianego w poprzednich `N` atakach.
- target powinien być stabilny przez serię ataków, ale wygasać po śmierci, oddaleniu lub utracie sensownej widoczności.

Nie wprowadzać osobnego systemu targetowania — wykorzystać istniejące `Interactable` / `pickInGaze`.

### 2. Attack range vs target acquisition

Rozdzielić:

- **target acquisition range** — większy,
- **weapon hit range** — pozostaje zależny od `ITEM_CATALOG`.

Nie zwiększać sztucznie zasięgu broni.

### 3. Gap close

Jeżeli wybrany target jest poza aktualnym `melee.range`:

**Stamina wystarcza:**
- wykonać krótki lunge/skok w kierunku celu,
- kosztować stamina,
- maksymalny dystans gap-close ograniczyć do rozsądnej wartości,
- nie teleportować gracza.

**Stamina niewystarcza:**
- automatycznie przesunąć gracza **maksymalnie 1 metr w stronę celu**,
- następnie wykonać normalny zamach, jeśli target znalazł się w zasięgu,
- jeśli nadal jest za daleko — nie wykonywać trafienia; gracz musi podejść sam.

Automatyczne podejście nigdy nie przekracza **1 m na pojedynczy atak**.

### 4. Facing

Podczas gap-close/ataku można delikatnie skierować gracza w stronę wybranego celu, żeby uniknąć wymagania perfekcyjnego ustawienia kamery.

Nie dodawać pełnego auto-aim ani automatycznego śledzenia celu.

### 5. Combat state machine

Rozszerzyć istniejący state machine z planu 123 zamiast tworzyć drugi mechanizm:

`requestAttack`
→ target acquisition
→ optional gap close
→ `windUp`
→ `hitWindow`
→ `resolveMeleeHits`
→ `recovery`

Damage pozostaje deterministyczny i korzysta z obecnego `ITEM_CATALOG`.

## Pliki / systemy

Prawdopodobnie:

- `src/player/playerMelee.ts` — target/gap-close state,
- `src/app/gameLoop.ts` — integracja targetu i ruchu,
- `src/app/interactables.ts` / `pickInGaze` — szersze target acquisition,
- `src/items/itemCatalog.ts` — tylko jeśli potrzebne będą nowe parametry melee.

Unikać zmian w animal combat (`faunaCombat.ts`) poza koniecznymi interfejsami.

## Parametry do strojenia

Wyprowadzić jako jawne stałe/config:

- target acquisition radius,
- target cone = **90°**,
- remembered targets = `N`,
- max lunge distance,
- lunge stamina cost,
- fallback auto-approach = **1.0 m**.

Nie hardkodować tych wartości w kilku miejscach.

## Poza zakresem

- combo system,
- block/parry,
- lock-on UI,
- automatyczne śledzenie zwierząt,
- pełny auto-chase,
- zmiany damage/HP,
- AI zwierząt,
- multiplayer combat.

## Weryfikacja

1. Testy jednostkowe target selection.
2. Testy:
   - target centralny vs boczny,
   - pamięć poprzedniego targetu,
   - target poza melee range,
   - wystarczająca stamina → lunge,
   - niewystarczająca stamina → maks. 1 m,
   - nadal za daleko → brak hitu.
3. Browser verification:
   - wilk,
   - sarna,
   - kilka zwierząt obok siebie,
   - atakowanie tego samego celu seriami,
   - brak staminy,
   - cel poza zasięgiem.
4. Sprawdzić, czy normalny ruch gracza, stamina i istniejący combat nie zostały zaburzone.

## Implementation notes

Zaimplementowane bez osobnego pliku implementation-notes (effort S):

- `player/playerMelee.ts`: `pickCombatTarget()` (dot → dystans → pamięć, z tolerancjami tak, by słabsze kryteria realnie miały szansę zadziałać), `requestAttack()` rozszerzony o gap-close (przyjmuje teraz pozycję gracza/celu, zwraca `{ started, moveX, moveZ }` zamiast `boolean`), `recentTargetIds()`/`rememberHit()` (FIFO N=`COMBAT_TARGET_MEMORY`=3). Nowe stałe: `COMBAT_TARGET_MEMORY`, `MAX_LUNGE_DISTANCE`=3, `LUNGE_STAMINA_COST`=15, `FALLBACK_APPROACH_DISTANCE`=1.
- `app/interactables.ts`: `COMBAT_TARGET_RANGE`=7 (> `GAZE_RANGE`=5), `COMBAT_TARGET_CONE_DOT`=`cos(45°)` (pełny stożek 90°), `buildCombatTarget()` — trzeci fallback po `pickInGaze()` i `buildDigTarget()` (kolejność: precyzyjny gaze > kopanie łopatą/kilofem > forgiving combat), zwraca istniejący `Interactable{kind:'animal'}` więc `gameLoop.ts`'s `[E]`-branch dla ataku jest niezmieniony.
- `player/PlayerController.ts`: `faceToward()` (natychmiastowy obrót modelu w stronę celu, nie rusza yaw kamery/hit-testu) i `gapClose()` (przesunięcie z `resolvePosition`/kolizjami, jak w `update()`).
- `app/gameLoop.ts`: `target = pickInGaze() ?? buildDigTarget() ?? buildCombatTarget()`; po udanym `requestAttack()` wywołuje `player.faceToward()` + `player.gapClose()`; `rememberHit()` wołane dla każdego trafionego id w `resolveMeleeHits`.
- `faunaCombat.ts` nietknięty.
- Testy jednostkowe: `playerMelee.test.ts` rozszerzony o `pickCombatTarget` (centralny vs boczny, bliższy, pamięć, martwe/za daleko/poza stożkiem) i gap-close (bez ruchu w zasięgu, lunge, cap lunge, fallback ≤1 m bez dodatkowego kosztu staminy, wciąż za daleko → brak trafienia). Przy pisaniu testu na remis dot/dystans znaleziony i naprawiony realny bug: sentinel `Infinity` dla "nie w pamięci" dawał `Infinity - Infinity = NaN` w komparatorze sortowania przy dwóch niezapamiętanych remisujących kandydatach — zamieniony na skończony sentinel (`recentTargetIds.length`).
- `npx tsc --noEmit` / `npm run lint` / `npm run build` / `npm run test` (817 testów) zielone. Brak testu w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
