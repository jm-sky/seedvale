# Plan: Głębsza charakteryzacja NPC (osobowość/abilities/HP) + ekran „Mieszkańcy”

**Status:** `planned`
**Created:** 2026-08-07
**Scope:** Rozszerza [npc-interactions.md](./2026-08-07--npc-interactions.md) (personality już istnieje, tu idziemy głębiej); character DB wspomniana w [npc-labels.md](./2026-08-07--npc-labels.md) i „Następne” z `npc-interactions.md`; UI ekran nadbudowuje [game-ui-screens.md](./2026-08-07--game-ui-screens.md)

## Stan obecny

- `NpcAgent` ma dziś: `name` (z `NPC_NAMES`, 8 imion) i `personality` (z `NPC_PERSONALITIES`, 4 archetypy: `cheerful/calm/grumpy/curious`) — dwie **osobne** tablice indeksowane tym samym `treeIndex` w [NpcAgent.ts](../../src/ai/NpcAgent.ts).
- `personality` wpływa dziś na dwie rzeczy: `PAUSE_PARAMS` (jak reaguje na obecność gracza) i wybór puli linijek w `pickDialogueLine()` — patrz [dialogue.ts](../../src/ai/dialogue.ts). Nie wpływa na FSM/needs/prędkość.
- Brak jakiegokolwiek pojęcia zdrowia/energii/zdolności po stronie NPC. Fauna (`AnimalAgent`) ma już **zaimplementowany** (working tree, `verification needed`) system HP z realnym combat/damage — `src/fauna/HealthState.ts`, patrz [predator-prey-system.md](./2026-08-07--predator-prey-system.md). To już istniejący kod, nie hipoteza — patrz „Zależność” niżej.
- Brak jakiegokolwiek ekranu do przeglądania mieszkańców — jedyny wgląd to etykiety CSS2D nad głową (imię + potrzeba) i dialog jednego NPC na raz.
- `Settlement.npcs: readonly NpcAgent[]` już jest wyeksponowane z [createSettlement.ts](../../src/settlement/createSettlement.ts) — gotowa lista do wypełnienia UI.

## Decyzje (2026-08-07)

- **Jeden system HP w całej grze, nie dwa.** Pierwsza wersja tego planu proponowała osobny, niezależnie wynaleziony `EnergyState` tylko dla NPC, obok planowanego `HealthState` dla fauny w [predator-prey-system.md](./2026-08-07--predator-prey-system.md) — **odrzucone**, bo to rozjeżdża spójność app: dwa różne typy/pliki robiące konceptualnie to samo (liczba 0-100, pasek w UI, tick w czasie). Zamiast tego NPC **reużywa ten sam** `HealthState { maxHp, currentHp, dead }`, który staje się typem współdzielonym (patrz „Zależność” niżej), nie fauna-only.
- **Zero combat, ale ten sam pool.** NPC nie ginie i fauna go nie atakuje (decyzja bez zmian) — ale zmęczenie pracą **zmienia to samo pole `currentHp`**, co zrobiłby combat damage u fauny, tylko przez inny call site (`applyFatigue`/`rest` zamiast `takeDamage`). NPC-owy tick ma **dolny próg** (np. nigdy poniżej 15/100) — nie osiąga 0, więc `dead`/`onDeath()` nigdy się nie odpala dla NPC w v1. Gdyby kiedyś doszedł combat gracz/fauna→NPC, mechanizm już tam jest, zero refaktoru typu.
- **UI = in-game DOM ekran**, nie lil-gui — wzorzec `createPauseMenu.ts` (overlay, własny CSS), player-facing, nie tylko debug.

## Zależność: współdzielony `HealthState` — wymaga refaktoru istniejącego kodu, nie tylko nowego pliku

`src/fauna/HealthState.ts` **już istnieje w kodzie** (zaimplementowane przez `predator-prey-system.md`, working tree, `verification needed`):

```ts
export type HealthState = { maxHp: number; currentHp: number; dead: boolean }  // generyczne
export function createHealthState(maxHp: number): HealthState { ... }          // generyczne
export const MAX_HP: Record<AnimalKind, number> = { ... }                      // fauna-specific
export function damageFor(predator: AnimalKind, prey: AnimalKind): number { ... } // fauna-specific
```

Typ i `createHealthState()` są generyczne, ale cały plik importuje `AnimalKind` z `./AnimalAgent` — więc `src/ai/NpcAgent.ts` nie może po prostu zaimportować stąd bez ciągnięcia zależności `ai → fauna` (zła kierunkowość). **Ten plan obejmuje mały refaktor** istniejącego, już działającego kodu fauny: wydzielić `HealthState`/`createHealthState` do nowego `src/shared/HealthState.ts`, zostawić `MAX_HP`/`damageFor` (fauna-specific) w `src/fauna/HealthState.ts`, który importuje typ ze `shared`. `AnimalAgent.ts` (import w linii 5 dziś: `createHealthState, damageFor, type HealthState, MAX_HP` z `./HealthState`) trzeba zaktualizować na dwa importy. To dotyka już zaimplementowanego, przetestowanego kodu fauny — rób ostrożnie, uruchom ponownie testy z `predator-prey-system.md` po refaktorze, żeby upewnić się, że nic się nie zepsuło.

## Cel

1. **Character DB** — jedna struktura per NPC zamiast równoległych tablic (imię, [płeć — patrz uwaga w `npc-gender-models.md`], osobowość, abilities), żeby dodawanie nowych cech nie wymagało kolejnej tablicy indeksowanej tym samym `treeIndex`.
2. **Szersze spektrum osobowości** — więcej niż 4 archetypy, żeby dialog/reakcje mniej się powtarzały przy 3-5 NPC.
3. **Abilities** — 2-4 lekkie, deterministyczne cechy per NPC, które **realnie** modyfikują istniejące liczby (prędkość chodu, czas trwania `chop`/`drink`/`eat`, `PAUSE_PARAMS`) — nie nowy system, tylko modyfikatory nad tym co już jest.
4. **HP (współdzielony `HealthState`)** — `maxHp = 100`, spada podczas pracy (`chop/deposit/drink/eat/goX`), regeneruje się podczas `wander`/`idle`/`lookAtPlayer`, z dolnym progiem (nie schodzi do 0). Niskie `currentHp` → wolniejszy chód i/lub dłuższe `wait` w fazach pracy (widoczny efekt, nie tylko liczba w UI). Ten sam typ co fauna używa do combat — patrz „Zależność” wyżej.
5. **Ekran „Mieszkańcy”** — nowy in-game DOM overlay (`src/ui/createVillagersScreen.ts`), lista wszystkich `Settlement.npcs`: imię, [płeć], osobowość, aktualna potrzeba, pasek HP, tag zdolności. Read-only na start.

## Zakres

### 1. Character DB

```ts
// src/ai/characters.ts (nowy)
export type CharacterDef = {
  name: string
  personality: Personality
  ability: Ability
  // gender?: 'male' | 'female' — dopisać tu, jeśli npc-gender-models.md
  //   jeszcze nie wylądował (patrz uwaga w tamtym planie)
}

export const CHARACTERS: readonly CharacterDef[] = [ /* 8 wpisów, jak dziś NPC_NAMES */ ]
```

`NpcAgent` konstruktor bierze `CHARACTERS[treeIndex % CHARACTERS.length]` zamiast dwóch osobnych lookupów. `NPC_NAMES` i `NPC_PERSONALITIES` w `NpcAgent.ts`/`dialogue.ts` zostają zastąpione/re-eksportowane z `characters.ts`, żeby nie rozjechać istniejących importów.

### 2. Szersze osobowości

Rozszerzyć `Personality` z 4 do ~6-8 wartości (np. dodać `shy`, `proud`, `friendly`, `stoic` — do doprecyzowania). Każda nowa wartość potrzebuje:
- wpisu w `PAUSE_PARAMS`
- kompletu linijek w `BANK` (`dialogue.ts`) dla wszystkich 4 needs × 2 buckets — **albo** polegać na fallbacku `NEUTRAL` na start i dopisywać linijki iteracyjnie (matrix nie musi być pełna od razu, tak jak dziś).

### 3. Abilities

Mała, zamknięta pula (przykład, do doprecyzowania):

| Ability | Efekt |
|---------|-------|
| `fast_worker` | -20% czas `wait` w chop/deposit/drink/eat |
| `energetic` | wolniejszy spadek `currentHp` przy pracy, szybsza regeneracja |
| `night_owl` | mniejszy wpływ niskiego `currentHp` na prędkość (placeholder — dokładna mechanika do ustalenia) |
| `sociable` | większy `triggerDistance`/dłuższy `lookDurationRange` w `PAUSE_PARAMS` (nakłada się z personality — zdecydować czy mnoży czy nadpisuje) |

Assigned deterministycznie per `treeIndex` (jak dziś `personality`), część `CharacterDef`.

### 4. HP (współdzielony typ, nie nowy system)

```ts
// src/shared/HealthState.ts (wydzielone z istniejącego src/fauna/HealthState.ts, patrz „Zależność” wyżej)
export type HealthState = { maxHp: number; currentHp: number; dead: boolean }
export function createHealthState(maxHp: number): HealthState  // przeniesione bez zmian
export function applyFatigue(health: HealthState, amount: number, floor: number): void  // nowe, dla NPC
export function rest(health: HealthState, amount: number): void                          // nowe, dla NPC
// takeDamage() zostaje w AnimalAgent.ts (fauna-specific logika combat, już zaimplementowana);
// NpcAgent w v1 nigdy jej nie woła, tylko applyFatigue()/rest()
```

- Tick: `applyFatigue()` podczas faz pracy (`chop/deposit/drink/eat/goGarden/goStock/goTree/goWell`), `rest()` podczas `wander/lookAtPlayer` — stawki do wytuningowania w przeglądarce. `applyFatigue()` respektuje dolny próg (np. 15/100) — nigdy nie ustawia `dead`.
- Efekt: `WALK_SPEED` i/lub `wait` w fazach pracy skalowane funkcją `currentHp/maxHp` (np. poniżej 30% → wolniej). Trzeba przejrzeć `steerTo()`/phase timery w `NpcAgent.ts`, żeby wpiąć mnożnik bez rozjechania istniejącej logiki `pickNeed`.
- **Nie** wpływa na śmierć/despawn w v1 — nic nie woła `takeDamage()` na NPC (fauna→NPC combat pozostaje poza zakresem, jak w `predator-prey-system.md`), ale typ jest ten sam, więc dodanie tego później to wiring, nie przeprojektowanie.

### 5. Ekran „Mieszkańcy”

- Nowy plik `src/ui/createVillagersScreen.ts`, wzorzec `createPauseMenu.ts` (DOM overlay, `root.hidden` toggle, własny CSS).
- Otwierany: przycisk w pause menu (obok „Toggle debug panel”) — spójne z istniejącym wzorcem, albo osobny hotkey (do ustalenia, uważać na konflikt z `KeyE`=interact i innymi bindami w `Keyboard.ts`).
- Zawartość: tabela/lista `Settlement.npcs` — subskrypcja do live update (imię, potrzeba, HP bar) albo statyczny snapshot odświeżany przy każdym otwarciu — prostszy start to drugie.
- Zatrzymuje tick świata jak pause menu / NPC dialog (spójność z resztą overlayów).
- Poza v1: klikalność wiersza (np. ping na minimapie, teleport kamery) — nice-to-have, nie blocker.

## Poza zakresem v1

- Combat/damage/śmierć NPC (nikt nie woła `takeDamage()` na NPC — fauna→NPC combat to osobna decyzja, poza tym planem i poza `predator-prey-system.md` w ich obecnych zakresach).
- Inventory/przedmioty niesione przez NPC.
- Edytowalne UI (zmiana osobowości/imienia z poziomu ekranu) — read-only na start.
- Voice/audio (→ [npc-reaction-sounds.md](./2026-08-07--npc-reaction-sounds.md)).
- Persystencja HP w save (obecny `SaveData` nie zapisuje stanu NPC w ogóle — HP startuje od `maxHp` po Continue, tak jak dziś `needs`).

## Szkic zmian (pliki)

```
src/shared/HealthState.ts     # nowy: HealthState + createHealthState (wydzielone z src/fauna/HealthState.ts) + applyFatigue/rest (nowe)
src/fauna/HealthState.ts      # refaktor: zostaje tylko MAX_HP/damageFor (fauna-specific), importuje typ ze shared
src/fauna/AnimalAgent.ts      # refaktor: import HealthState ze shared zamiast lokalnego pliku (linia 5) — sam takeDamage()/logika combat bez zmian
src/ai/characters.ts          # nowy: CharacterDef[], zastępuje NPC_NAMES/NPC_PERSONALITIES jako źródło
src/ai/dialogue.ts            # + nowe Personality values, PAUSE_PARAMS wpisy, BANK linijki (iteracyjnie)
src/ai/NpcAgent.ts            # użycie CharacterDef, ability modifiers, HealthState (applyFatigue/rest) w update()/steerTo()
src/ui/createVillagersScreen.ts  # nowy: DOM overlay, lista NPC
src/ui/createPauseMenu.ts     # + przycisk otwierający ekran Mieszkańcy
```

## Done when

- [ ] `CharacterDef`/`characters.ts` zastępuje równoległe tablice, `NpcAgent` z niego korzysta
- [ ] Co najmniej 6 archetypów osobowości, każdy ma `PAUSE_PARAMS` (dialog linie mogą fallbackować na `NEUTRAL` częściowo)
- [ ] 2-4 abilities, każdy realnie zmienia liczbę w `NpcAgent` (nie tylko tag w UI)
- [ ] NPC korzysta ze **współdzielonego** `HealthState` (`src/shared/HealthState.ts`), nie osobnego typu — `currentHp` spada/regeneruje się widocznie, wpływa na prędkość/czas pracy przy niskim poziomie, nigdy nie osiąga 0
- [ ] Refaktor `src/fauna/HealthState.ts`/`AnimalAgent.ts` nie zmienił zachowania fauny — regresja: powtórz test z `predator-prey-system.md` (wilk/lis łapie sarnę/jelenia, respawn działa)
- [ ] Ekran „Mieszkańcy” otwiera się (przycisk w pause menu), pokazuje wszystkich `Settlement.npcs` z aktualnymi danymi
- [ ] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

## Do przetestowania (http://localhost:5577/)

1. Obserwuj 3-5 NPC dłuższą chwilę — dialog/reakcje powinny być bardziej zróżnicowane niż dziś (więcej archetypów).
2. Znajdź NPC z `fast_worker` (lub inną ability) i porównaj tempo pracy z innym NPC — powinna być zauważalna różnica.
3. Obserwuj NPC długo pracującego (np. wielokrotne chop) — HP powinno spadać, a chód/praca zauważalnie zwolnić przy niskim poziomie (ale nie zejść do 0/śmierci); potem przy `wander`/idle — regeneracja.
4. Otwórz ekran „Mieszkańcy” z pause menu — lista pokazuje wszystkich NPC z aktualnym stanem (potrzeba, HP, osobowość).
5. Zamknij ekran (Esc/przycisk) — świat wraca do życia, jak przy pause menu.
6. Sanity check regresji: dialog pojedynczego NPC (`[E]`), pause menu, WASD/sprint/zoom — dalej działają.

## Następnie

- Persystencja stanu NPC (HP, quest progress) w save — dopiero gdy potrzeba realna (np. razem z questami)
- Klikalne wiersze w ekranie Mieszkańcy (ping/teleport)
- Rozważyć fauna→NPC combat (NPC przestaje być immunny) — teraz to tylko wiring na istniejącym `takeDamage()`, nie nowy system
