# Plan: Zapalanie ognisk (gałęzie jako paliwo) + nocne szanse zapłonu w wiosce

**Status:** `verification needed` — punkty 1-3 (stan ognia, interakcja `[E]`, płomień) i renewable branch-spawn zaimplementowane, patrz „Stan implementacji" niżej. Punkt 4 (nocne 50% szans) **nie zaimplementowany** — zostaje `todo`.
**Created:** 2026-08-08

## Stan implementacji (2026-08-09)

Zaimplementowane: **punkty 1-3** (stan ognia, interakcja `[E]`, wizualny płomień) + dodatkowo renewable spawn gałęzi blisko drzew (żeby ognisko miało z czego się podtrzymywać — patrz niżej). **Punkt 4 (nocne 50% szans zapłonu) świadomie odłożony** — user poprosił konkretnie o te dwie rzeczy w tej turze implementacji, nie o cały plan.

- `src/settlement/VillageFire.ts` (nowy) — `createVillageFire(position, flame)`: `lit`/`fuelRemaining` w closure, `light()`/`addFuel()`/`update(dt)`, `FUEL_PER_BRANCH = 75s`.
- `src/settlement/props.ts`: nowa `createCampfireFlame()` (stożek emissive + `PointLight`, `visible=false` domyślnie — oddzielna od `createCampfire()`, która zostaje czysto dekoracyjna dla ognisk rozrzuconych po świecie z [world-elements-interactions](./2026-08-07--030--world-elements-interactions.md)). `SettlementLandmarks` += `campfire?: { position, flame }`, ustawiane tylko dla MD/LG.
- `src/settlement/createSettlement.ts`: `Settlement` += `fire?: VillageFire`, tickowane w `update(dt)`.
- `src/interaction/Interactable.ts` += wariant `campfire`; `resolveInteraction.ts` jawnie wyklucza `campfire` (obok `item`) ze swojego typu — obie potrzebują `Inventory`, więc obsługiwane bezpośrednio w `app/createApp.ts`, nie przez generyczny dialog.
- `app/createApp.ts`: `buildInteractables` dodaje wpis `campfire` dla każdej osady z `settlement.fire` (prompt zależny od stanu: „Zapal ognisko" / „Dołóż gałąź"); obsługa `[E]` konsumuje `branch` z `Inventory` (`inventory.remove('branch', 1)`), woła `fire.light()`/`fire.addFuel()`, pokazuje krótki komunikat przez istniejący `npcDialog.open('Ognisko', ...)`. **Żadnego nowego kodu pod mobile/desktop** — `[E]` (desktop) i przycisk dotykowy `E` (`createTouchControls.ts`) już dziś ustawiają ten sam `keyboard.state`/`consumeInteract()`, więc działa automatycznie na obu (zweryfikowane w kodzie, nie tylko założone).
- **Renewable branch spawn**, poprawione (2026-08-10) po zgłoszeniu, że mimo lasu wokół wioski gałęzi nie dało się znaleźć: pierwotna wersja stawiała **jeden** punkt spawnu gałęzi na całą osadę (losowe jedno drzewo z `landmarks.trees`, które dla dużej wioski ma kilkadziesiąt pozycji) — zbyt rzadkie, żeby na niego trafić spacerując. `src/items/createItemSpawners.ts` ma teraz osobną pulę punktów gałęzi: `BRANCH_SPAWN_POINTS_MIN/MAX` (3-8) skalowane liczbą drzew osady (`Math.ceil(trees.length / BRANCH_TREES_PER_POINT)`, `BRANCH_TREES_PER_POINT = 4`), każdy punkt przy innym (potasowanym deterministycznie) drzewie z `landmarks.trees`. `stone`/`shell` bez zmian (nadal 1 punkt, blisko centrum osady). World-generated gałęzie blisko drzew (`terrain/chunkItems.ts`) nadal **nie** respawnują (bez zmian, poza zakresem) — to jest osobne, dodatkowe, niezawodne źródło blisko wioski.
- **Gałąź z inspekcji drzewa** (2026-08-10, dodatkowe): interakcja `[E]` na drzewie (`Interactable` `kind: 'tree'`) ma teraz **25% szans** na dorzucenie gałęzi do ekwipunku, niezależnie od spawnerów wyżej — `TREE_BRANCH_CHANCE = 0.25` w `app/createApp.ts`, rzut przy każdej interakcji z drzewem, dopisywany do treści dialogu („Pod drzewem leży sucha gałąź.”) gdy trafi.
- **Wolnostojące ogniska budowane przez gracza** (2026-08-10, rozszerzenie zakresu — użytkownik chciał zapalać ognisko w dowolnym miejscu, nie tylko przy wiosce MD/LG): nowy `src/settlement/PlacedFires.ts` — analogicznie do `items/createDroppedItems.ts` ("pozycja nie wynika z seeda, więc pełny rekord musi przejść przez zapis"), zarządza listą `{id, x, z}` + zbudowaną wizualizacją (`createCampfire()` + `createCampfireFlame()`, reużyte 1:1 z `props.ts`) + stanem (`createVillageFire`, reużyty 1:1 mimo nazwy — funkcja była już generyczna, nie settlement-specific). Akcja „Zbuduj ognisko (2x gałąź, 2x kamień)" w menu pauzy (`ui/createPauseMenu.ts`, przycisk `data-build-campfire`, status-text jak przy Save) — koszt `CAMPFIRE_BRANCH_COST`/`CAMPFIRE_STONE_COST = 2` w `app/createApp.ts`, stawia ognisko w pozycji gracza w momencie kliknięcia (gra jest wtedy zapauzowana, więc pozycja jest stabilna). Zapalanie/dokładanie `[E]` działa bez zmian — to ten sam generyczny `campfire` `Interactable`/handler co dla ognisk wioski, `buildInteractables` po prostu dorzuca wpis per `PlacedFires.list()`. Stan zapłonu nie jest persystowany (tak jak ognisko wioski), ale **pozycja tak** — `SaveData` podniesione do **v4** (`saveData.ts`, `placedFires: SavePlacedFire[]`, migracja v1/v2/v3→v4 z pustą tablicą).
- **Quick Actions popup przy „E"** (2026-08-10, drugi punkt wejścia na „Zbuduj ognisko" — menu pauzy było zbyt wolne na akcję wykonywaną w trakcie gry): nowy `src/ui/createQuickActions.ts` — mały zakotwiczony popover (nie pełny modal jak pozostałe 4 popupy), bottom-right, ten sam handler `onBuildCampfire` co menu pauzy (wyciągnięty do współdzielonej `buildCampfire` w `app/createApp.ts`, zero duplikacji logiki — przycisk „Zbuduj ognisko" **zostaje** też w menu pauzy). Trigger: na touch nowy przycisk `⚡` w kolumnie `.seedvale-touch__buttons` (`src/input/createTouchControls.ts`, `TouchControlsHandlers += onQuickActions`), nad `G`; na desktopie (gdzie nie ma takiej kolumny) moduł sam renderuje mały stały przycisk w tym samym rogu. Popup uczestniczy w tym samym gatingu co pozostałe 4 (Escape zamyka, rejestrowany przed `pauseMenu`; `quickActions.isOpen()` dołączone do `anyModalOpen` i do gated update-blocku w `tick()`, blokuje ruch/interact gdy otwarty). CSS: `.seedvale-quick-actions*` w `index.html`.

Sanity check: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — czyste. **Wizualna weryfikacja w przeglądarce jeszcze nie zrobiona.**
**Scope:** rozszerza [world-elements-interactions](./2026-08-07--030--world-elements-interactions.md) (`branch`/gałąź jako już istniejący `ItemKind`, dekoracyjne ogniska w `chunkEnvironment.ts`) i [village-generation](./2026-08-08--031--village-generation.md) (ognisko wioski w `props.ts` dla MD/LG); reużywa `src/interaction/` (wzorzec `well`/`tree`) i `src/world/dayNight.ts`

## Skąd to się wzięło

Propozycje użytkownika po teście wiosek:
1. Dało się zapalić ognisko, jeśli gracz ma gałęzie (`branch`, już istniejący zbieralny `ItemKind` z [world-elements-interactions](./2026-08-07--030--world-elements-interactions.md)). Pali się przez określony czas, można dokładać kolejne gałęzie żeby przedłużyć. Po zgaśnięciu znika po dodatkowym czasie.
2. W nocy ognisko w wiosce bywa już zapalone (50% szans) — nie zawsze trzeba je zapalać samemu.

## Stan obecny

- Ognisko istnieje dziś w dwóch miejscach, oba **czysto dekoracyjne**:
  - `src/settlement/props.ts::createCampfire()` — ognisko wioski (dla rozmiaru MD/LG, patrz [village-generation](./2026-08-08--031--village-generation.md)), sztywny prop bez stanu.
  - `src/terrain/chunkEnvironment.ts` — rozrzucone po świecie „stare ogniska" (`EnvironmentKind === 'campfire'`), jawnie skomentowane jako „Purely decorative, not an `Interactable`" ([world-elements-interactions](./2026-08-07--030--world-elements-interactions.md)).
- `branch` (gałąź) już istnieje jako zbieralny `ItemKind` (`src/items/items.ts`), zbierany do `Inventory` — gotowe paliwo, nic nowego do zrobienia po stronie itemów.
- `src/interaction/Interactable.ts` ma dziś warianty `npc`/`animal`/`well`/`tree`/`spawner`/`item` — **brak** `campfire`.
- `src/world/dayNight.ts` śledzi `timeOfDay`/dzień-noc — punkt zaczepienia dla „50% szans przy zapadnięciu nocy".

## Zakres v1 (świadomie ograniczony do ogniska wioski — patrz „Poza zakresem")

Punkty 1-3 zaimplementowane (patrz „Stan implementacji" wyżej) — treść niżej to oryginalny szkic planu, zachowany jako zapis decyzji projektowych.

### 1. Stan ognia

```ts
// nowy plik, np. src/settlement/campfire.ts lub przy landmarks
type FireState = {
  lit: boolean
  fuelRemaining: number      // sekundy pozostałego spalania
  extinguishedAt: number | null  // world-time zgaśnięcia, do odliczania zniknięcia (poza zakresem v1 — patrz niżej)
}
```

- `BURN_TIME_PER_BRANCH` (np. 60-120s, do dostrojenia) — czas spalania jednej dołożonej gałęzi.
- Tick w `update(dt)`: jeśli `lit`, `fuelRemaining -= dt`; przy `<= 0` → `lit = false`.

### 2. Interakcja `[E]`

- `Interactable` += `{ kind: 'campfire', position, promptLabel, fire: FireState }`.
- `resolveInteraction.ts` += case `campfire`:
  - niezapalone + gracz ma ≥1 `branch` w `Inventory` → zużyj 1 gałąź, `lit = true`, `fuelRemaining = BURN_TIME_PER_BRANCH`, prompt „Zapal ognisko (gałąź)".
  - zapalone + gracz ma ≥1 `branch` → zużyj gałąź, `fuelRemaining += BURN_TIME_PER_BRANCH`, prompt „Dołóż gałąź".
  - niezapalone bez gałęzi / zapalone bez potrzeby dokładania → brak promptu albo neutralny komunikat (spójnie z tym, jak inne interakcje dziś gate'ują prompt warunkiem, patrz `well`/`tree`).

### 3. Wizualnie: płomień

- `createCampfire()` (`props.ts`) dostaje wariant „lit" — prosty efekt ognia spójny ze stylem reszty propsów (flat-shaded, bez systemu cząstek): mały stożek/sprite z materiałem `emissive` + `PointLight` o niskim zasięgu, włączane/wyłączane wraz z `fire.lit`. Szczegóły wizualne do dopracowania przy implementacji.

### 4. Nocne szanse zapłonu (tylko ognisko wioski) — nadal `todo`, nie zaimplementowane

- Przy przejściu dzień→noc (hook w `dayNight.ts`/`createApp.ts`, tam gdzie dziś śledzone jest `timeOfDay` przekraczające próg nocy) — dla każdej załadowanej osady z własnym ogniskiem (MD/LG): 50% szans, że `fire.lit = true` z pełnym paliwem, **bez zużywania gałęzi gracza** (wioska sama je podtrzymuje — fabularnie NPC-e dokładają). Losowane **przy każdym zapadnięciu nocy**, nie raz na zawsze — jeśli zgaśnie przed świtem, zostaje zgaszone do następnej nocy (chyba że gracz dołoży gałąź).
- Deterministyczność: seedowany rzut per (osada, „numer nocy") żeby przeładowanie/re-streaming osady nie zmieniało wyniku w trakcie tej samej nocy — dokładny mechanizm (np. `createSeededRandom(seed ^ settlementId ^ nightIndex)`) do ustalenia przy implementacji.

## Poza zakresem v1

- **Dekoracyjne ogniska rozrzucone po świecie** (`chunkEnvironment.ts`) — te są per-chunk, worker-generowane, strumieniowane (load/unload) — nadanie im stanu (zapalone/paliwo) wymaga dodatkowej pracy w `chunkManager.ts` (śledzenie stanu per placement, przetrwanie unload/reload albo świadoma decyzja że stan resetuje się przy wyładowaniu chunku — spójne z tym, że inny per-chunk stan też nie jest w pełni persystowany). Naturalne rozszerzenie **po** tym, jak ognisko wioski działa.
- Znikanie ogniska wioski po zgaśnięciu — to stały element infrastruktury osady (jak studnia), **nie znika**, tylko wraca do stanu niezapalonego, gotowy do ponownego zapalenia. „Znika po X czasu" z prośby użytkownika dotyczy raczej dekoracyjnych ognisk rozrzuconych po świecie (patrz punkt wyżej) — tam ma sens jako sposób na to, żeby świat nie zapełnił się trwale zgasłymi ogniskami.
- Persystencja stanu ognia w save — obecny `SaveData` nie zapisuje stanu NPC/osad w ogóle (patrz [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md)), więc ogień resetuje się po Continue, tak jak reszta stanu efemerycznego.
- Wpływ na questy/needs NPC-ów (np. NPC grzejący się przy ognisku) — czysto interakcyjna/kosmetyczna warstwa na razie.

## Weryfikacja

- **Do zrobienia przez użytkownika (`localhost:5577`):**
  - Znajdź osadę MD/LG (ma własne ognisko). W okolicy jej drzew (`landmarks.trees`) powinna co jakiś czas (≈45s po zebraniu) pojawiać się gałąź do zebrania — sprawdź na desktop i mobile że `[E]`/przycisk dotykowy ją podnosi.
  - Podejdź do ogniska z gałęzią, zapal `[E]` (desktop) i przyciskiem dotykowym `E` (mobile) — sprawdź oba. Sprawdź że płomień/światło się pojawia, gaśnie po ~75s, i że dokładanie gałęzi (`[E]` ponownie przy zapalonym ognisku) przedłuża palenie.
  - Bez gałęzi w ekwipunku — `[E]` przy ognisku pokazuje komunikat „Potrzebujesz gałęzi", nic nie zużywa.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — czyste (zrobione, patrz „Stan implementacji").
- Punkt 4 (nocne 50% szans) — osobna weryfikacja po jego implementacji.

## Powiązane

- [world-elements-interactions](./2026-08-07--030--world-elements-interactions.md) — `branch`/`ItemKind`, dekoracyjne ogniska (`chunkEnvironment.ts`)
- [village-generation](./2026-08-08--031--village-generation.md) — ognisko wioski (`props.ts`, MD/LG)
- `src/interaction/`, `src/world/dayNight.ts`
