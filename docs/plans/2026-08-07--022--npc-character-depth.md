# Plan: Głębsza charakteryzacja NPC (role/traits/Big Five personality/HP) + ekran „Mieszkańcy”

**Status:** `verification needed` — wszystkie sekcje (Character DB, role, Big Five, traits, wspólny `HealthState`, ekran Mieszkańcy) zaimplementowane i zielone na `tsc`/`lint`/`build`/`vitest`; browser regression fauny (`predator-prey-system.md`) i wizualna weryfikacja ekranu Mieszkańcy/traits/HP nadal do zrobienia przez użytkownika, patrz „Do przetestowania”. Przy okazji dodano `vitest` jako test runner projektu (nie było w oryginalnym zakresie planu) — `src/ai/dialogue.test.ts`, `src/ai/Needs.test.ts`, `src/shared/HealthState.test.ts`, `src/fauna/HealthState.test.ts`.
**Created:** 2026-08-07
**Scope:** Rozszerza [npc-interactions.md](./2026-08-07--011--npc-interactions.md) (personality już istnieje, tu idziemy głębiej); character DB wspomniana w [npc-labels.md](./2026-08-07--012--npc-labels.md) i „Następne” z `npc-interactions.md`; UI ekran nadbudowuje [game-ui-screens.md](./2026-08-07--005--game-ui-screens.md); **scala [npc-1-identity.md](./2026-08-07--019--npc-1-identity.md)** (ChatGPT draft, review + decyzja scalenia: 2026-08-07 — `role`/`traits`/Big Five wchodzą tutaj, tamten plik nie jest wdrażany osobno)

## Stan obecny

- `NpcAgent` ma dziś: `name` (z `NPC_NAMES`, 8 imion) i `personality` (z `NPC_PERSONALITIES`, 4 archetypy: `cheerful/calm/grumpy/curious`) — dwie **osobne** tablice indeksowane tym samym `treeIndex` w [NpcAgent.ts](../../src/ai/NpcAgent.ts).
- `personality` wpływa dziś na dwie rzeczy: `PAUSE_PARAMS` (jak reaguje na obecność gracza) i wybór puli linijek w `pickDialogueLine()` — patrz [dialogue.ts](../../src/ai/dialogue.ts). Nie wpływa na FSM/needs/prędkość.
- Brak jakiegokolwiek pojęcia zdrowia/energii/zdolności po stronie NPC. Fauna (`AnimalAgent`) ma już **zaimplementowany** (working tree, `verification needed`) system HP z realnym combat/damage — `src/fauna/HealthState.ts`, patrz [predator-prey-system.md](./2026-08-07--010--predator-prey-system.md). To już istniejący kod, nie hipoteza — patrz „Zależność” niżej.
- Brak jakiegokolwiek ekranu do przeglądania mieszkańców — jedyny wgląd to etykiety CSS2D nad głową (imię + potrzeba) i dialog jednego NPC na raz.
- `Settlement.npcs: readonly NpcAgent[]` już jest wyeksponowane z [createSettlement.ts](../../src/settlement/createSettlement.ts) — gotowa lista do wypełnienia UI.

## Decyzje (2026-08-07)

- **Jeden system HP w całej grze, nie dwa.** Pierwsza wersja tego planu proponowała osobny, niezależnie wynaleziony `EnergyState` tylko dla NPC, obok planowanego `HealthState` dla fauny w [predator-prey-system.md](./2026-08-07--010--predator-prey-system.md) — **odrzucone**, bo to rozjeżdża spójność app: dwa różne typy/pliki robiące konceptualnie to samo (liczba 0-100, pasek w UI, tick w czasie). Zamiast tego NPC **reużywa ten sam** `HealthState { maxHp, currentHp, dead }`, który staje się typem współdzielonym (patrz „Zależność” niżej), nie fauna-only.
- **Zero combat, ale ten sam pool.** NPC nie ginie i fauna go nie atakuje (decyzja bez zmian) — ale zmęczenie pracą **zmienia to samo pole `currentHp`**, co zrobiłby combat damage u fauny, tylko przez inny call site (`applyFatigue`/`rest` zamiast `takeDamage`). NPC-owy tick ma **dolny próg** (np. nigdy poniżej 15/100) — nie osiąga 0, więc `dead`/`onDeath()` nigdy się nie odpala dla NPC w v1. Gdyby kiedyś doszedł combat gracz/fauna→NPC, mechanizm już tam jest, zero refaktoru typu.
- **UI = in-game DOM ekran**, nie lil-gui — wzorzec `createPauseMenu.ts` (overlay, własny CSS), player-facing, nie tylko debug.

## Decyzje (2026-08-07, update — merge ChatGPT draftów po review)

- **Merge z `npc-1-identity.md`.** Ten draft (review: [npc-1-identity.md](./2026-08-07--019--npc-1-identity.md)) proponował równoległy `role`+`traits` model pokrywający tę samą przestrzeń („co czyni NPC innym”) co `CharacterDef`/`Ability` tutaj — ten sam błąd, jaki `EnergyState` robił dla HP (patrz decyzja wyżej). Zdecydowano scalić: `CharacterDef` niżej rośnie o `role` (dana, bez zachowania w v1) i `traits` (zastępuje dawne pojęcie `Ability` — jedna pula, nie dwie równoległe).
- **Personality → Big Five (OCEAN) zamiast prostego rozszerzenia enuma.** Wcześniejsza wersja tego planu (sekcja „Szersze osobowości” niżej) proponowała rozszerzyć `Personality` z 4 do 6-8 archetypów — prostsze, bo pasuje 1:1 do struktury `dialogue.ts` (`BANK` kluczowany dyskretnym enumem). Zdecydowano jednak pójść w kierunek z `npc-1-identity.md`: model wymiarowy Big Five. To większy nakład (patrz sekcja „2. Personality → Big Five” niżej — wymaga warstwy tłumaczącej wektor OCEAN na dyskretny dialogue-bucket, żeby nie przepisywać całego `BANK`), świadomie zaakceptowany koszt za ciągłe sygnały pod przyszłe systemy (traits, `npc-2` schedule).

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

1. **Character DB** — jedna struktura per NPC zamiast równoległych tablic (imię, [płeć — patrz uwaga w `npc-gender-models.md`], rola, traits, osobowość), żeby dodawanie nowych cech nie wymagało kolejnej tablicy indeksowanej tym samym `treeIndex`.
2. **Role** (z `npc-1-identity.md`: `woodcutter`/`farmer`/`guard`/`trader`) — pole opisujące funkcję NPC w społeczności. **Tylko dana w v1** — bez schedule/workplace/zachowania (to `npc-2-daily-routine-and-place.md`, przycięty do formalizacji `home`; per-rola workplace odłożone tam).
3. **Personality → Big Five (OCEAN)** — migracja z 4 dyskretnych archetypów (`cheerful/calm/grumpy/curious`) do wymiarowego modelu (`openness/conscientiousness/extraversion/agreeableness/neuroticism`, 0-1 każdy). Cel: mniej powtarzalne dialog/reakcje przy 3-5 NPC i ciągłe sygnały pod przyszłe systemy (traits, `npc-2` schedule) zamiast 4 sztywnych kubełków.
4. **Traits** (z `npc-1-identity.md`, zastępuje dawne pojęcie „Abilities”) — 1-2 lekkie, deterministyczne cechy per NPC z zamkniętej puli, które **realnie** modyfikują istniejące liczby (prędkość chodu, czas trwania `chop`/`drink`/`eat`, `PAUSE_PARAMS`) — nie nowy system, tylko modyfikatory nad tym co już jest.
5. **HP (współdzielony `HealthState`)** — `maxHp = 100`, spada podczas pracy (`chop/deposit/drink/eat/goX`), regeneruje się podczas `wander`/`idle`/`lookAtPlayer`, z dolnym progiem (nie schodzi do 0). Niskie `currentHp` → wolniejszy chód i/lub dłuższe `wait` w fazach pracy (widoczny efekt, nie tylko liczba w UI). Ten sam typ co fauna używa do combat — patrz „Zależność” wyżej.
6. **Ekran „Mieszkańcy”** — nowy in-game DOM overlay (`src/ui/createVillagersScreen.ts`), lista wszystkich `Settlement.npcs`: imię, [płeć], rola, osobowość, aktualna potrzeba, pasek HP, tag traits. Read-only na start.

## Zakres

### 1. Character DB

```ts
// src/ai/characters.ts (nowy)
export type Role = 'woodcutter' | 'farmer' | 'guard' | 'trader'
export type Trait =
  | 'fast_worker'
  | 'energetic'
  | 'night_owl'
  | 'sociable'
  // pula zamknięta, do doprecyzowania — patrz „3. Traits” niżej

export type CharacterDef = {
  name: string
  role: Role                       // z npc-1-identity.md — tylko dana w v1, patrz „Cel” pkt 2
  personality: BigFivePersonality  // patrz „2. Personality → Big Five” niżej
  traits: readonly Trait[]         // 1-2 per NPC, zastępuje dawne pojęcie „Ability”
  // gender?: 'male' | 'female' — dopisać tu, jeśli npc-gender-models.md
  //   jeszcze nie wylądował (patrz uwaga w tamtym planie)
}

export const CHARACTERS: readonly CharacterDef[] = [ /* 8 wpisów, jak dziś NPC_NAMES */ ]
```

`NpcAgent` konstruktor bierze `CHARACTERS[treeIndex % CHARACTERS.length]` zamiast dwóch osobnych lookupów. `NPC_NAMES` i `NPC_PERSONALITIES` w `NpcAgent.ts`/`dialogue.ts` zostają zastąpione/re-eksportowane z `characters.ts`, żeby nie rozjechać istniejących importów.

### 2. Personality → Big Five

```ts
// src/ai/dialogue.ts (rozszerzenie istniejącego typu)
export type BigFivePersonality = {
  openness: number          // 0-1
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
}
```

Migracja etapowa, zgodnie z `npc-1-identity.md`:

1. **Mapowanie zachowane jako punkt startowy** — dzisiejsze 4 archetypy (`cheerful/calm/grumpy/curious`) dostają swoje wartości OCEAN (np. `cheerful → { extraversion: 0.8, agreeableness: 0.7, neuroticism: 0.2, ... }` — dobrane tak, żeby zachowanie 8 dzisiejszych NPC się nie zmieniło).
2. **Warstwa tłumacząca do dialogue bucket, nie przebudowa `BANK`.** `BANK` w `dialogue.ts` zostaje tabelą kluczowaną dyskretnym archetypem (przebudowa całej tabeli linii na wymiarowy dobór tekstu to osobny, dużo większy projekt — poza zakresem v1). Nowa funkcja `nearestArchetype(p: BigFivePersonality): Personality` (najbliższy sąsiad w przestrzeni OCEAN wobec punktów z kroku 1) wybiera pulę linii z istniejącego `BANK`. Dialog w v1 nie staje się „bardziej Big Five” — tylko dane pod spodem są wymiarowe, mapping do UX zostaje dyskretny.
3. **`PAUSE_PARAMS` liczone bezpośrednio z surowych wymiarów, nie z bucketu.** W przeciwieństwie do dialogu, `triggerDistance`/`lookDurationRange`/`cooldownRange` da się policzyć wprost ze zmiennych ciągłych (np. `triggerDistance = lerp(2, 5, extraversion)`, szerokość `cooldownRange` skalowana `neuroticism`) — to jedyne miejsce, gdzie Big Five realnie zmienia zachowanie w sposób ciągły, nie tylko przez bucket.
4. **Traits nadal osobno, nie wynikają z OCEAN w v1** — patrz „3. Traits” niżej (mogłyby w przyszłości, nierozstrzygnięty kierunek z `npc-1-identity.md`).

Zaakceptowany koszt: więcej kodu niż proste rozszerzenie enuma (dodatkowy typ `BigFivePersonality`, funkcja `nearestArchetype`, formuły dla `PAUSE_PARAMS`) za niewielki widoczny efekt w v1 (dialog dalej wybiera z tych samych 4 kubełków linii) — wartość jest w ciągłych sygnałach pod przyszłe systemy.

### 3. Traits

Mała, zamknięta pula (przykład, do doprecyzowania) — zastępuje dawne pojęcie „Abilities” z tego planu i `traits` z `npc-1-identity.md` (jedna pula, nie dwie równoległe):

| Trait | Efekt |
|---------|-------|
| `fast_worker` | -20% czas `wait` w chop/deposit/drink/eat |
| `energetic` | wolniejszy spadek `currentHp` przy pracy, szybsza regeneracja |
| `night_owl` | mniejszy wpływ niskiego `currentHp` na prędkość (placeholder — dokładna mechanika do ustalenia) |
| `sociable` | większy `triggerDistance`/dłuższy `lookDurationRange` w `PAUSE_PARAMS` (nakłada się z personality — zdecydować czy mnoży czy nadpisuje) |

Assigned deterministycznie per `treeIndex` (jak dziś `personality`), część `CharacterDef` (1-2 traits per NPC, nie cała pula naraz).

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
- Voice/audio (→ [npc-reaction-sounds.md](./2026-08-07--014--npc-reaction-sounds.md)).
- Persystencja HP w save (obecny `SaveData` nie zapisuje stanu NPC w ogóle — HP startuje od `maxHp` po Continue, tak jak dziś `needs`).

## Szkic zmian (pliki)

```
src/shared/HealthState.ts     # nowy: HealthState + createHealthState (wydzielone z src/fauna/HealthState.ts) + applyFatigue/rest (nowe)
src/fauna/HealthState.ts      # refaktor: zostaje tylko MAX_HP/damageFor (fauna-specific), importuje typ ze shared
src/fauna/AnimalAgent.ts      # refaktor: import HealthState ze shared zamiast lokalnego pliku (linia 5) — sam takeDamage()/logika combat bez zmian
src/ai/characters.ts          # nowy: CharacterDef[] (name/role/personality/traits), zastępuje NPC_NAMES/NPC_PERSONALITIES jako źródło
src/ai/dialogue.ts            # + BigFivePersonality type, nearestArchetype(), PAUSE_PARAMS liczone z OCEAN (formuły), BANK bez zmian struktury
src/ai/NpcAgent.ts            # użycie CharacterDef, trait modifiers, HealthState (applyFatigue/rest) w update()/steerTo()
src/ui/createVillagersScreen.ts  # nowy: DOM overlay, lista NPC
src/ui/createPauseMenu.ts     # + przycisk otwierający ekran Mieszkańcy
```

## Done when

- [x] `CharacterDef`/`characters.ts` (name/role/personality/traits) zastępuje równoległe tablice, `NpcAgent` z niego korzysta (`src/ai/characters.ts`: `CHARACTERS`/`characterForIndex`/`genderForName`, zastępuje dawne `NPC_NAMES`/`NPC_GENDERS` z `NpcAgent.ts`, re-eksportowane stamtąd dla `QuestManager.ts`)
- [x] `role` (`woodcutter`/`farmer`/`guard`/`trader`) obecny jako dana w `CharacterDef` — bez zachowania w v1 (patrz `npc-2-daily-routine-and-place.md`)
- [x] `BigFivePersonality` (OCEAN) zastępuje dyskretny `Personality` jako źródło danych; `nearestArchetype()` mapuje na istniejący `BANK`/`PAUSE_PARAMS` (bucket) bez regresji w dialogu; `PAUSE_PARAMS` liczone formułą z surowych wymiarów (nie z bucketu) — patrz „2. Personality → Big Five” (`src/ai/dialogue.ts`: `personalityForIndex`/`nearestArchetype`/`pausePersonalityParams`; `NpcAgent.personality` teraz `BigFivePersonality`, cache'owane `dialogueArchetype`/`pauseParams` w konstruktorze; deterministyczny per-NPC jitter wokół archetype-anchora, sin-hash jak `terrainTintNoise` w `biomeColors.ts`)
- [x] 1-2 traits per NPC (zamiast dawnych „abilities”), każdy realnie zmienia liczbę w `NpcAgent` (nie tylko tag w UI) — `fast_worker` skraca `wait` w chop/deposit/drink/eat (×0.8), `energetic` zwalnia zużycie HP przy pracy i przyspiesza regenerację, `night_owl` łagodzi spadek prędkości przy niskim HP, `sociable` mnoży `triggerDistance`/`lookDurationRange` z `PAUSE_PARAMS` (×1.3/×1.2)
- [x] NPC korzysta ze **współdzielonego** `HealthState` (`src/shared/HealthState.ts`), nie osobnego typu — `currentHp` spada/regeneruje się widocznie (`applyFatigue`/`rest` w `update()`), wpływa na prędkość w `steerTo()` poniżej 30% HP, floor 15/100 — nigdy nie osiąga 0
- [x] Refaktor `src/fauna/HealthState.ts` nie zmienił zachowania fauny (statycznie: `tsc`/`lint`/`build`/vitest zielone, `AnimalAgent.ts` import niezmieniony — `fauna/HealthState.ts` teraz re-eksportuje `HealthState`/`createHealthState` z `shared/`, `MAX_HP`/`damageFor` zostały fauna-local; dodano `src/fauna/HealthState.test.ts` sanity-checking re-eksportu) — **browser regression z `predator-prey-system.md` (wilk/lis łapie sarnę/jelenia, respawn) nadal do zrobienia przez użytkownika**, patrz „Do przetestowania”
- [x] Ekran „Mieszkańcy” otwiera się (przycisk w pause menu), pokazuje wszystkich `Settlement.npcs` z aktualnymi danymi (`src/ui/createVillagersScreen.ts`, wzorzec `createQuestLog.ts`) — **wizualna weryfikacja w przeglądarce nadal do zrobienia przez użytkownika**
- [x] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` (vitest — nowość względem oryginalnego planu, patrz niżej)

## Do przetestowania (http://localhost:5577/)

1. Obserwuj 3-5 NPC dłuższą chwilę — reakcje na obecność gracza (`PAUSE_PARAMS`) powinny się różnić płynniej niż dziś (formuła z OCEAN, nie 4 sztywne kubełki); dialog dalej wybiera z tych samych 4 kubełków linii (`nearestArchetype`) — to nie powinno się zmienić.
2. Znajdź NPC z `fast_worker` (lub innym traitem) i porównaj tempo pracy z innym NPC — powinna być zauważalna różnica.
3. Obserwuj NPC długo pracującego (np. wielokrotne chop) — HP powinno spadać, a chód/praca zauważalnie zwolnić przy niskim poziomie (ale nie zejść do 0/śmierci); potem przy `wander`/idle — regeneracja.
4. Otwórz ekran „Mieszkańcy” z pause menu — lista pokazuje wszystkich NPC z aktualnym stanem (potrzeba, HP, osobowość).
5. Zamknij ekran (Esc/przycisk) — świat wraca do życia, jak przy pause menu.
6. Sanity check regresji: dialog pojedynczego NPC (`[E]`), pause menu, WASD/sprint/zoom — dalej działają.

## Następnie

- Persystencja stanu NPC (HP, quest progress) w save — dopiero gdy potrzeba realna (np. razem z questami)
- Klikalne wiersze w ekranie Mieszkańcy (ping/teleport)
- Rozważyć fauna→NPC combat (NPC przestaje być immunny) — teraz to tylko wiring na istniejącym `takeDamage()`, nie nowy system
