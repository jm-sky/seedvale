# Plan: Zapalanie ognisk (gałęzie jako paliwo) + nocne szanse zapłonu w wiosce

**Status:** `todo`
**Created:** 2026-08-08
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

### 4. Nocne szanse zapłonu (tylko ognisko wioski)

- Przy przejściu dzień→noc (hook w `dayNight.ts`/`createApp.ts`, tam gdzie dziś śledzone jest `timeOfDay` przekraczające próg nocy) — dla każdej załadowanej osady z własnym ogniskiem (MD/LG): 50% szans, że `fire.lit = true` z pełnym paliwem, **bez zużywania gałęzi gracza** (wioska sama je podtrzymuje — fabularnie NPC-e dokładają). Losowane **przy każdym zapadnięciu nocy**, nie raz na zawsze — jeśli zgaśnie przed świtem, zostaje zgaszone do następnej nocy (chyba że gracz dołoży gałąź).
- Deterministyczność: seedowany rzut per (osada, „numer nocy") żeby przeładowanie/re-streaming osady nie zmieniało wyniku w trakcie tej samej nocy — dokładny mechanizm (np. `createSeededRandom(seed ^ settlementId ^ nightIndex)`) do ustalenia przy implementacji.

## Poza zakresem v1

- **Dekoracyjne ogniska rozrzucone po świecie** (`chunkEnvironment.ts`) — te są per-chunk, worker-generowane, strumieniowane (load/unload) — nadanie im stanu (zapalone/paliwo) wymaga dodatkowej pracy w `chunkManager.ts` (śledzenie stanu per placement, przetrwanie unload/reload albo świadoma decyzja że stan resetuje się przy wyładowaniu chunku — spójne z tym, że inny per-chunk stan też nie jest w pełni persystowany). Naturalne rozszerzenie **po** tym, jak ognisko wioski działa.
- Znikanie ogniska wioski po zgaśnięciu — to stały element infrastruktury osady (jak studnia), **nie znika**, tylko wraca do stanu niezapalonego, gotowy do ponownego zapalenia. „Znika po X czasu" z prośby użytkownika dotyczy raczej dekoracyjnych ognisk rozrzuconych po świecie (patrz punkt wyżej) — tam ma sens jako sposób na to, żeby świat nie zapełnił się trwale zgasłymi ogniskami.
- Persystencja stanu ognia w save — obecny `SaveData` nie zapisuje stanu NPC/osad w ogóle (patrz [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md)), więc ogień resetuje się po Continue, tak jak reszta stanu efemerycznego.
- Wpływ na questy/needs NPC-ów (np. NPC grzejący się przy ognisku) — czysto interakcyjna/kosmetyczna warstwa na razie.

## Weryfikacja

- Zbierz gałąź (`[G]`/zbieranie z `world-elements-interactions`), podejdź do ogniska wioski MD/LG, zapal `[E]`, sprawdź że się pali i gaśnie po czasie; dołóż gałąź żeby przedłużyć.
- Poczekaj na noc kilka razy (różne osady/seedy) — ognisko czasem już zapalone, czasem nie (z grubsza 50/50 w wielu próbach).
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.

## Powiązane

- [world-elements-interactions](./2026-08-07--030--world-elements-interactions.md) — `branch`/`ItemKind`, dekoracyjne ogniska (`chunkEnvironment.ts`)
- [village-generation](./2026-08-08--031--village-generation.md) — ognisko wioski (`props.ts`, MD/LG)
- `src/interaction/`, `src/world/dayNight.ts`
