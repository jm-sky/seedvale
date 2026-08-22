# Seedvale — Osady i NPC

**Purpose:** źródło prawdy dla generacji osad i życia NPC *jak jest zaimplementowane*.

**Nie jest:** indeksem planów ([plans/README.md](./plans/README.md)), katalogiem GLB ([assets/](./assets/README.md)), kontraktem renderu ([GRAPHICS.md](./architecture/GRAPHICS.md)), ani snapshotem całego codebase ([STATE.md](./STATE.md)).

**Last verified:** 2026-08-14

Gdy ten plik rozjeżdża się z kodem — **wygrywa kod**, potem aktualizujemy ten dokument.

Historia zakresu: zarchiwizowane plany [047](./plans/archive/2026-08-09--047--village-generation-overhaul.md), [071](./plans/archive/2026-08-11--071--local-economy-and-settlement-development.md), [060](./plans/archive/2026-08-11--060--npc-schedule-actions-and-trait-overlays.md), [076](./plans/archive/2026-08-12--076--village-generator-polish.md), [077](./plans/archive/2026-08-12--077--village-gardens-scale.md), [079](./plans/archive/2026-08-12--079--interaction-queue-well-drink.md), [092](./plans/archive/2026-08-13--092--npc-stamina-and-daily-vigor.md). Household (plan [069](./plans/2026-08-11--069--npc-household-resources.md)) jest zaimplementowany, bez weryfikacji w przeglądarce — zob. §Gospodarstwa poniżej. Household water logistics (plan [122](./plans/2026-08-15--122--natural-resource-gathering-and-water-distribution.md)) — well → NPC carrying → `WaterBarrel`/`AnimalTrough` — jest zaimplementowany, bez weryfikacji w przeglądarce.

---

## Standing decisions

| ID | Decyzja | Skutek |
|----|---------|--------|
| S1 | Generacja jest **plan-first**: jeden `VillagePlan` na osadę (tożsamość → strefy/działki/budynki/landmarki/ścieżki/wejścia), potem projekcja na `SettlementDef` runtime. | `settlementPlanCache` karmi `SettlementsManager` i `RoadNetwork` |
| S2 | Komórki otwartego oceanu są **pomijane** (bez mokrego fallbacku). Osada domowa poszerza poszukiwanie, gdy spawn jest mokry. | issue [029](./issues/2026-08-13--029--village-in-open-ocean.md) |
| S3 | `SettlementEconomy` to **hurtowy stock osady** (`wood` / `food` / `water` / `iron` / `coal` / `gold` jako `EconomicKind`, ale `water` tu bez producenta/konsumenta — inertny stat z planu 071; `iron`/`coal`/`gold` — plan 131 — mają stock ale bez `SettlementDemand` celu, więc `shortage`/`hasShortage` zawsze 0 dla nich), nie `Inventory` gracza i nie ekwipunek NPC. `Household` (plan 069) to osobna, mniejsza warstwa pod nią — jedna rodzina = jedno gospodarstwo, `stock` (`EconomicStock`) obejmuje tylko `food`/`wood` (`HouseholdResourceKind` jest od planu 131 **niezależnym** literałem `'food' | 'wood'`, nie pochodną `EconomicKind`, żeby ruda nie trafiała do gospodarstwa automatycznie). Woda gospodarstwa (plan 122) to osobny, mniejszy `WaterReserve` (`household.water`) — świadomie **nie** `EconomicKind`/`EconomicStock` (notatki 122 §4: brak produkcji/handlu wodą), jedno źródło prawdy dla `WaterBarrel` (NPC) i `AnimalTrough` (zwierzęta domowe). | `src/economy/`, `src/settlement/household.ts` |
| S4 | Picie ze studni idzie przez wspólny per-osada `InteractionQueue` (FIFO, jedna obsługa naraz). Picie w domu omija kolejkę. | ten sam typ kolejki jest do ponownego użycia przy ogrodzie/straganie |
| S5 | Dzienny rytm = szablon roli + overlay cech (`effectiveScheduleFor`). Pilne potrzeby wygrywają w `choose()`. | brak social Place — overlay `sociable` nie ma producenta |
| S6 | `VigorState` ≠ `StaminaState`. Wigor to budżet dnia; zwykły odpoczynek odnawia tylko staminę. Collapse → istniejący `goSleep`/`sleep`. | fauna nie używa wigoru |
| S7 | Runtime NPC (needs, AI, vigor) **nie** jest w save. Continue nie przywraca pełnej symulacji. | vigor startuje pełny przy spawnie |
| S8 | Ruch NPC ma watchdog utknięcia — brak postępu pozycji eskaluje `repath` → `local escape` → `abandon` → (przy powtarzającym się utknięciu) emergency teleport. Cel w obcym dysku (dom, studnia, sterta drewna, wóz kupca) jest snapowany na obręcz od strony NPC (`destinationOnColliderRim`); rescue próbuje tylko punkty **na zewnątrz** zajętego collidera; teleport nie wraca na środek domu. Drenaż staminy zależy od tego, co NPC robi (chodzenie tanie, ciężka `execute` drogie), nie samej fazy. `stamina === 0` w `goTo`/`execute` → faza `exhausted` (odpoczynek w miejscu, ta sama akcja wznawia się po odzyskaniu progu). | `src/ai/npcMovementWatchdog.ts`, `src/ai/npcColliderRim.ts`; emergency teleport zawsze loguje `console.warn('[npc:rescue] emergency teleport', ...)` |
| S9 | Kolaps wigoru i **krytyczna** potrzeba (`pickNeed({ critical: true })`, progi wyraźnie wyżej niż zwykłe `pickNeed`) przerywają akcję już w locie (`goTo`/`execute`) — throttled check (~1 s) w `NpcAgent.update()`, tylko gdy `activeNeed === 'idle'` (akcja harmonogramowa, nie need-driven — unika przerzucania między potrzebami). Zwykła zmiana godziny nadal **nie** przerywa (plan 060 obowiązuje dalej). | `src/ai/NpcAgent.ts`'s `tickCriticalInterrupt`/`interruptCurrentAction`, `src/ai/Needs.ts`'s `pickNeed`'s `critical` option (plan [114](./plans/archive/2026-08-14--114--npc-critical-need-vigor-interrupt.md)) |

Multiplayer nie jest planowany teraz i nie projektujemy go tutaj. Ale S3/S7 pokazują, że ownership stanu (ekonomia osady, runtime NPC) jest już oddzielony od `Inventory` gracza i od save gracza — utrzymuj ten podział, żeby ewentualne przejście na server-authoritative symulację (mały świat, ~2–5 graczy) nie wymagało przepisania. Zob. [performance-and-workers.md](./architecture/performance-and-workers.md).

---

## Stan obecny

### Generator i wygląd

- Rodziny, domy, drogi lokalne i międzysiedliskowe, siting zależny od terenu.
- Domy: `HouseBuilder` składa chatki 4×4 / 6×4 i średnie domy 6×6 / 8×6 (dachówki MegaKit, native scale, ×1.1) w `buildSettlementProps`; warianty mieszają tynk, kratownicę i cegłę, część z kominem. Wielkość zależy od rozmiaru osady. `TEST_HOUSE_01` (4×2) zostaje jako test. Collidery/`Place`/households bez zmian. Legacy `HOUSE_CATALOG` (`hut_*.glb`) — fallback i Asset Browser.
- Ogrody skalują się z liczbą domów (S/M/L); środki grządek poza dyskiem placu. Osady z `foodSourceType === 'field'` stawiają pole przy landmarku `field`.
- Zużyte lokalne drogi, clearing placu, yaw/pady domów, tablica przy studni, palisada tylko inland.
- Drogi między osadami wchodzą przez `entranceToward`; lokalne korytarze z `VillagePlan.paths`. Drogowskazy: `yawToward`.
- GLB z proceduralnym fallbackiem: studnia, stos drewna, ogrody/crops, pole, kaktus/trzcina w środowisku chunka (nie w generatorze osady).
- Collidery osady (`ColliderRegistry`, plan 097, issue [036](./issues/2026-08-19--036--settlement-prop-colliders.md)): studnia, ściany/drzwi domów, sterta drewna (i druga gdy LG/XL), wóz+koń kupca, ognisko wioskowe. Palisada/beczki/siano/skrzynia magazynu — bez collidersów.

### Streaming

- `HOME_RADIUS` (56) jest niezależny od załadowanego terenu — osada i fauna zachowują się tak samo, gdy gracz jest daleko.
- Stream osad: `loadRadius` 300 / `unloadRadius` 420 (`worldBundle.ts`).
- Budowa propsów oddaje klatki (`frameYield`) żeby nie zatykać głównego wątku przy dociągnięciu wioski.

### Ekonomia

- Każda załadowana osada ma `SettlementEconomy`: cele popytu, niedobór/nadwyżka.
- Drwal: ścinka → depozyt na stosie. Drugi, mniejszy stos (woodshed) jest płatny raz z nadwyżki drewna.
- Farmer / rybak / górnik wołają wspólny production hook — **puste wyjścia**, wciąż plan 071 (069 nie dodaje łańcuchów produkcyjnych).
- Stock przeżywa stream-out/in w rejestrze `SettlementsManager`; persystowany w `SaveData.settlementEconomies` od save v12, i przenoszony przez in-session rebuild `WorldBundle` (`carriedEconomies`). W przeciwieństwie do `Household` (§Gospodarstwa) — patrz tam.

### Gospodarstwa (plan 069)

- Jedna rodzina = jedno gospodarstwo = jeden dom (`household.ts`'s `householdIdFor(settlementId, familyIndex)`), 1:1 z `def.families`/`homePlaces` w `createSettlement.ts`. `HouseholdRegistry` żyje na `SettlementsManager` (jak `EconomyRegistry`) — stream-out/in reużywa te same gospodarstwa; nie jest w `SaveData`. Od planu `197` `HouseholdRegistry` ma też ten sam carry-mechanizm co `EconomyRegistry` przez in-session rebuild `WorldBundle` (`snapshotHouseholds()`/`initialHouseholds`, mirror `carriedEconomies`) — stock gospodarstwa już nie resetuje się do świeżych wartości startowych przy zmianie ustawień terenu w tej samej sesji.
- Stock gospodarstwa: `food`/`wood` w `stock` (`EconomicStock`) plus osobny `water` (`WaterReserve`, plan 122) — wszystkie trzy z małym deterministycznym stanem startowym, `minimum`/`target`/`capacity` (1/3/5) zamiast planisty ekonomicznego.
- Głód: NPC je z zapasu gospodarstwa gdy jest (szybko, w domu); gdy brak — idzie do ogrodu, zbiera trochę jedzenia do gospodarstwa (limit pojemności, nadwyżka do `SettlementEconomy`) i od razu je z tego zapasu.
- Drewno: ścinka nadal woła istniejący `chop → deposit`, ale depozyt trafia najpierw do gospodarstwa drwala (limit pojemności), nadwyżka do `SettlementEconomy` — rozwój woodshed (`tryAdvanceDevelopment`) nadal liczy się od stocku osady, więc działa tak jak wcześniej, tylko wolniej, dopóki gospodarstwa się nie napełnią. Depozyt jest teraz warunkowany realnym sukcesem harvestu (plan 131) — jeśli `harvestWorldTreeFully` się nie powiedzie (np. drzewo ścięte przez kogoś innego między startem a końcem czopa), łańcuch `chop → deposit` nie mintuje drewna.
- Ruda (plan 131): rola `miner` w swoim harmonogramowym bloku `work` najpierw próbuje realnego wydobycia — `queryNearest`/`mine` na tym samym `ResourceDeposits`, którego używa gracz z kilofem (wstrzyknięte przez `SettlementMiningHooks`, budowane raz na `WorldBundle`, nie osobny rejestr). Yield trafia do małego, generycznego `Inventory` noszonego przez `NpcAgent` (ta sama klasa co ekwipunek gracza, teraz reużywalna), potem — po dojściu do stockpile'u — do `SettlementEconomy` jako `iron`/`coal`/`gold` (**nie** do `Household`). Brak załadowanego depozytu w zasięgu → NPC wraca do sprzed-131 pustego stania przy stockpile'u (profesja to preferencja, nie jedyny sposób działania). `ResourceDeposits.update()` dogrywa depozyty także wokół środków aktywnych osad, nie tylko gracza, żeby to działało bez gracza w pobliżu.
- Woda (plan 122): pragnienie NPC (`water` need) najpierw sprawdza zapas domowy (`household.water`) — pije w domu i zmniejsza zapas, tak jak jedzenie. Gdy zapasu brak, wraca do poprzedniego zachowania: studnia (kolejka `InteractionQueue`, jeśli osada ją ma) albo bezpośrednio `landmarks.well`. Osobna "duty" `waterDuty` (mirror `woodDuty`) rośnie w czasie i — gdy przekroczy próg (biasowany niedoborem `household.water.shortage()`) — wysyła NPC do studni (ta sama kolejka co pragnienie), a potem do domu z łańcuchem `drink → deposit` (jak `chop → deposit` dla drewna); `deposit.onComplete` dolewa `WATER_FETCH_AMOUNT` do `household.water`. Woda **nie** pojawia się w kontenerze automatycznie — zawsze przez realny `goTo`/`execute` NPC.
- `WaterBarrel` (dla domowników) i `AnimalTrough` (dla zwierząt domowych) to fizyczne, instancowane propsy w podwórku każdego domu (`buildSettlementProps`, `settlement-household-barrels`/`-troughs`) — prezentacja, autorytatywna ilość żyje wyłącznie w `household.water` (notatki 122 §5). Trough procedural-only (`createTrough`, brak GLB — `docs/assets/MODELS.md` M37); barrel reużywa istniejący `barrel.glb`/`createBarrel`.
- Zwierzęta domowe (livestock, `ownerHouseId`) — pierwszy realny konsument `ownerHouseId` (wcześniej bez konsumenta, plan 110). `AnimalAgent.findWaterTarget()` najpierw sprawdza koryto właściciela (`household.water`); dopiero gdy puste, wraca do dotychczasowego szukania brzegu (`findTroughTarget`/`shoreProbeHits`, plan 094). Dzika fauna nie ma `household` — zawsze idzie do brzegu, bez zmian.
- `pickNeed`'s `woodShortage`/`foodShortage`/`waterShortage` uwzględniają teraz też niedobór *własnego* gospodarstwa NPC, nie tylko niedobór osady.
- `?debug=1` dorzuca `hh f<food> w<wood> h2o<water>` do istniejącej linii diagnostycznej NPC.
- Świadomie nie zrobione (patrz plan 069 §33, 122 §6): ceny/pieniądze, handel, łańcuchy produkcyjne/rolnictwo, rezerwacje zasobów, fizyczny magazyn wioski (Village Storehouse — odłożony do przyszłego planu z realnym przepływem komunalnym), `Household`/`household.water` w `SaveData` (streaming persistence przez `HouseholdRegistry` na `SettlementsManager` — nie to samo co pełny zapis gry).

### NPC

- Needs + FSM + osobowość/cechy/Big Five; HP przez `HealthState`, wysiłek przez `StaminaState`.
- Autorytatywny stan NPC (HP/`needs`/stamina/wigor — plan `197`) żyje w `NpcStateRegistry` na `SettlementsManager` (`src/settlement/npcState.ts`), keyed po stabilnym `npc.id` (`${settlementId}:npc:${i}`) — ten sam wzorzec co `HouseholdRegistry`/`EconomyRegistry`. `NpcAgent` trzyma bezpośrednie referencje do tych obiektów zamiast własnej kopii, więc dispose/recreate `NpcAgent`-a (settlement unload/reload, `WorldBundle` rebuild przez `snapshotNpcStates()`/`initialNpcStates`) hydratuje z tego samego stanu zamiast tworzyć świeży. Śmierć (`health.dead`) jest więc autorytatywna i przetrwa reload w tej samej sesji — martwy NPC nie "ożywa" przy powrocie do osady. `phase`/`pendingAction`/pathfinding/`combatIntent`/noszony `Inventory` (`carried`, ruda) zostają świadomie transient — resetują się przy każdej rekonstrukcji.
- Harmonogram: `eat` / `home` / `wake` / `work` / `sleep` przez istniejący FSM. `night_owl` przesuwa dzień; `fast_worker` wydłuża pracę. Kolaps wigoru i krytyczna potrzeba przerywają akcję już w locie (plan 114); zwykła zmiana godziny nadal nie przerywa.
- Kupiec pomija `woodDuty` (zostaje przy straganie).
- Ciężka `work`/`chop` drenuje wigor; sen (grafik albo forced) go przywraca.
- Stamina: chodzenie (`goTo`) drenuje mało, lekka `execute` (drink/eat/deposit) prawie nic, ciężka `execute` (chop/work) drenuje pełną stawką. Wyczerpanie w trakcie ruchu/pracy → faza `exhausted` (bez utraty `pendingAction`), wznowienie po odzyskaniu progu staminy.
- Watchdog utknięcia obserwuje `goTo`/`followPath`/`wander`/`goSleep`; brak realnego postępu pozycji eskaluje rescue (repath → local escape → abandon), emergency teleport tylko przy powtarzającym się utknięciu (`src/ai/npcMovementWatchdog.ts`). Cel w rdzeniu obcego dysku (dom / studnia) leży na obręczy od zewnątrz (`src/ai/npcColliderRim.ts`, plan [108](./plans/archive/2026-08-14--108--npc-stuck-at-house-locomotion.md)); probe rescue nie akceptuje wnętrza zajętego collidera; `moving` tylko przy realnym przesunięciu x/z. Playtest w przeglądarce — `verification needed`.
- `?debug=1` dorzuca do etykiety NPC linię diagnostyczną (faza, akcja, dystans, stamina, stan watchdoga).
- Dialog v2 = ekran Vue. W osadzie domowej: handel u kupca (dwie kolumny, kupno/sprzedaż/barter); strażnik może oddać miecz.

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
