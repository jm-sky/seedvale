# Seedvale — Osady i NPC

**Purpose:** źródło prawdy dla generacji osad i życia NPC *jak jest zaimplementowane*.

**Nie jest:** indeksem planów ([plans/README.md](./plans/README.md)), katalogiem GLB ([assets/](./assets/README.md)), kontraktem renderu ([GRAPHICS.md](./GRAPHICS.md)), ani snapshotem całego codebase ([STATE.md](./STATE.md)).

**Last verified:** 2026-08-14

Gdy ten plik rozjeżdża się z kodem — **wygrywa kod**, potem aktualizujemy ten dokument.

Historia zakresu: zarchiwizowane plany [047](./plans/archive/2026-08-09--047--village-generation-overhaul.md), [071](./plans/archive/2026-08-11--071--local-economy-and-settlement-development.md), [060](./plans/archive/2026-08-11--060--npc-schedule-actions-and-trait-overlays.md), [076](./plans/archive/2026-08-12--076--village-generator-polish.md), [077](./plans/archive/2026-08-12--077--village-gardens-scale.md), [079](./plans/archive/2026-08-12--079--interaction-queue-well-drink.md), [092](./plans/archive/2026-08-13--092--npc-stamina-and-daily-vigor.md). Household (plan [069](./plans/2026-08-11--069--npc-household-resources.md)) jest zaimplementowany, bez weryfikacji w przeglądarce — zob. §Gospodarstwa poniżej.

---

## Standing decisions

| ID | Decyzja | Skutek |
|----|---------|--------|
| S1 | Generacja jest **plan-first**: jeden `VillagePlan` na osadę (tożsamość → strefy/działki/budynki/landmarki/ścieżki/wejścia), potem projekcja na `SettlementDef` runtime. | `settlementPlanCache` karmi `SettlementsManager` i `RoadNetwork` |
| S2 | Komórki otwartego oceanu są **pomijane** (bez mokrego fallbacku). Osada domowa poszerza poszukiwanie, gdy spawn jest mokry. | issue [029](./issues/2026-08-13--029--village-in-open-ocean.md) |
| S3 | `SettlementEconomy` to **hurtowy stock osady** (`wood` / `food` / `water`), nie `Inventory` gracza i nie ekwipunek NPC. `Household` (plan 069) to osobna, mniejsza warstwa pod nią — jedna rodzina = jedno gospodarstwo, `food`/`wood` tylko (bez `water`) — reużywa `EconomicStock`, nie duplikuje jej. | `src/economy/`, `src/settlement/household.ts` |
| S4 | Picie ze studni idzie przez wspólny per-osada `InteractionQueue` (FIFO, jedna obsługa naraz). Picie w domu omija kolejkę. | ten sam typ kolejki jest do ponownego użycia przy ogrodzie/straganie |
| S5 | Dzienny rytm = szablon roli + overlay cech (`effectiveScheduleFor`). Pilne potrzeby wygrywają w `choose()`. | brak social Place — overlay `sociable` nie ma producenta |
| S6 | `VigorState` ≠ `StaminaState`. Wigor to budżet dnia; zwykły odpoczynek odnawia tylko staminę. Collapse → istniejący `goSleep`/`sleep`. | fauna nie używa wigoru |
| S7 | Runtime NPC (needs, AI, vigor) **nie** jest w save. Continue nie przywraca pełnej symulacji. | vigor startuje pełny przy spawnie |
| S8 | Ruch NPC ma watchdog utknięcia — brak postępu pozycji eskaluje `repath` → `local escape` → `abandon` → (przy powtarzającym się utknięciu) emergency teleport. Cel w obcym dysku (dom, studnia) jest snapowany na obręcz od strony NPC (`destinationOnColliderRim`); rescue próbuje tylko punkty **na zewnątrz** zajętego collidera; teleport nie wraca na środek domu. Drenaż staminy zależy od tego, co NPC robi (chodzenie tanie, ciężka `execute` drogie), nie samej fazy. `stamina === 0` w `goTo`/`execute` → faza `exhausted` (odpoczynek w miejscu, ta sama akcja wznawia się po odzyskaniu progu). | `src/ai/npcMovementWatchdog.ts`, `src/ai/npcColliderRim.ts`; emergency teleport zawsze loguje `console.warn('[npc:rescue] emergency teleport', ...)` |

Multiplayer nie jest planowany teraz i nie projektujemy go tutaj. Ale S3/S7 pokazują, że ownership stanu (ekonomia osady, runtime NPC) jest już oddzielony od `Inventory` gracza i od save gracza — utrzymuj ten podział, żeby ewentualne przejście na server-authoritative symulację (mały świat, ~2–5 graczy) nie wymagało przepisania. Zob. [performance-and-workers.md](./architecture/performance-and-workers.md).

---

## Stan obecny

### Generator i wygląd

- Rodziny, domy, drogi lokalne i międzysiedliskowe, siting zależny od terenu.
- Domy: `HouseBuilder` składa chatki 4×4 / 6×4 i średnie domy 6×6 / 8×6 (dachówki MegaKit, native scale) w `buildSettlementProps`; warianty i wielkość zależą od rozmiaru osady. `TEST_HOUSE_01` (4×2) zostaje jako test. Collidery/`Place`/households bez zmian. Legacy `HOUSE_CATALOG` (`hut_*.glb`) — fallback i Asset Browser.
- Ogrody skalują się z liczbą domów (S/M/L); środki grządek poza dyskiem placu. Osady z `foodSourceType === 'field'` stawiają pole przy landmarku `field`.
- Zużyte lokalne drogi, clearing placu, yaw/pady domów, tablica przy studni, palisada tylko inland.
- Drogi między osadami wchodzą przez `entranceToward`; lokalne korytarze z `VillagePlan.paths`. Drogowskazy: `yawToward`.
- GLB z proceduralnym fallbackiem: studnia, stos drewna, ogrody/crops, pole, kaktus/trzcina w środowisku chunka (nie w generatorze osady).

### Streaming

- `HOME_RADIUS` (56) jest niezależny od załadowanego terenu — osada i fauna zachowują się tak samo, gdy gracz jest daleko.
- Stream osad: `loadRadius` 300 / `unloadRadius` 420 (`worldBundle.ts`).
- Budowa propsów oddaje klatki (`frameYield`) żeby nie zatykać głównego wątku przy dociągnięciu wioski.

### Ekonomia

- Każda załadowana osada ma `SettlementEconomy`: cele popytu, niedobór/nadwyżka.
- Drwal: ścinka → depozyt na stosie. Drugi, mniejszy stos (woodshed) jest płatny raz z nadwyżki drewna.
- Farmer / rybak / górnik wołają wspólny production hook — **puste wyjścia**, wciąż plan 071 (069 nie dodaje łańcuchów produkcyjnych).
- Stock przeżywa stream-out/in w rejestrze `SettlementsManager`; nie jest w `SaveData`.

### Gospodarstwa (plan 069)

- Jedna rodzina = jedno gospodarstwo = jeden dom (`household.ts`'s `householdIdFor(settlementId, familyIndex)`), 1:1 z `def.families`/`homePlaces` w `createSettlement.ts`. `HouseholdRegistry` żyje na `SettlementsManager` (jak `EconomyRegistry`) — stream-out/in reużywa te same gospodarstwa; nie jest w `SaveData`.
- Stock gospodarstwa: `food`/`wood` (nie `water` — picie zostaje przy istniejącym źródle/studni, notatki 069 §9), z małym deterministycznym stanem startowym, `minimum`/`target`/`capacity` (1/3/5) zamiast planisty ekonomicznego.
- Głód: NPC je z zapasu gospodarstwa gdy jest (szybko, w domu); gdy brak — idzie do ogrodu, zbiera trochę jedzenia do gospodarstwa (limit pojemności, nadwyżka do `SettlementEconomy`) i od razu je z tego zapasu.
- Drewno: ścinka nadal woła istniejący `chop → deposit`, ale depozyt trafia najpierw do gospodarstwa drwala (limit pojemności), nadwyżka do `SettlementEconomy` — rozwój woodshed (`tryAdvanceDevelopment`) nadal liczy się od stocku osady, więc działa tak jak wcześniej, tylko wolniej, dopóki gospodarstwa się nie napełnią.
- `pickNeed`'s `woodShortage`/`foodShortage` uwzględniają teraz też niedobór *własnego* gospodarstwa NPC, nie tylko niedobór osady.
- `?debug=1` dorzuca `hh f<food> w<wood>` do istniejącej linii diagnostycznej NPC.
- Świadomie nie zrobione (patrz plan 069 §33): ceny/pieniądze, handel, łańcuchy produkcyjne/rolnictwo, rezerwacje zasobów, fizyczny magazyn, `Household` w `SaveData`.

### NPC

- Needs + FSM + osobowość/cechy/Big Five; HP przez `HealthState`, wysiłek przez `StaminaState`.
- Harmonogram: `eat` / `home` / `wake` / `work` / `sleep` przez istniejący FSM. `night_owl` przesuwa dzień; `fast_worker` wydłuża pracę.
- Kupiec pomija `woodDuty` (zostaje przy straganie).
- Ciężka `work`/`chop` drenuje wigor; sen (grafik albo forced) go przywraca.
- Stamina: chodzenie (`goTo`) drenuje mało, lekka `execute` (drink/eat/deposit) prawie nic, ciężka `execute` (chop/work) drenuje pełną stawką. Wyczerpanie w trakcie ruchu/pracy → faza `exhausted` (bez utraty `pendingAction`), wznowienie po odzyskaniu progu staminy.
- Watchdog utknięcia obserwuje `goTo`/`followPath`/`wander`/`goSleep`; brak realnego postępu pozycji eskaluje rescue (repath → local escape → abandon), emergency teleport tylko przy powtarzającym się utknięciu (`src/ai/npcMovementWatchdog.ts`). Cel w rdzeniu obcego dysku (dom / studnia) leży na obręczy od zewnątrz (`src/ai/npcColliderRim.ts`, plan [108](./plans/2026-08-14--108--npc-stuck-at-house-locomotion.md)); probe rescue nie akceptuje wnętrza zajętego collidera; `moving` tylko przy realnym przesunięciu x/z. Playtest w przeglądarce — `verification needed`.
- `?debug=1` dorzuca do etykiety NPC linię diagnostyczną (faza, akcja, dystans, stamina, stan watchdoga).
- Dialog v2 = ekran Vue. W osadzie domowej: handel u kupca; strażnik może oddać miecz.

### Świadomie nie ma

- Social Place (typ istnieje, brak producenta).
- Pełny snapshot NPC w save (household — plan 069 — również nie jest w `SaveData`, patrz §Gospodarstwa).
- Handel między osadami.
- Łańcuchy produkcyjne/rolnictwo, rezerwacje zasobów gospodarstwa, fizyczny budynek magazynu (069 §33, dalszy zakres to plan 071/przyszłe plany).

---

## Entry points

```text
src/settlement/SettlementsManager.ts
src/settlement/createSettlement.ts
src/settlement/villagePlan.ts
src/settlement/household.ts
src/economy/
src/ai/NpcAgent.ts
src/ai/Needs.ts
src/ai/schedule.ts
src/ai/npcMovementWatchdog.ts
src/ai/npcColliderRim.ts
src/shared/VigorState.ts
src/shared/StaminaState.ts
```

`HOME_RADIUS` i promienie streamu: `src/app/worldBundle.ts`.
