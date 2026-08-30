# Seedvale — Osady i NPC

**Purpose:** źródło prawdy dla generacji osad i życia NPC *jak jest zaimplementowane*.

**Nie jest:** indeksem planów ([plans/README.md](../plans/README.md)), katalogiem GLB ([assets/](../assets/README.md)), kontraktem renderu ([GRAPHICS.md](../architecture/GRAPHICS.md)), ani snapshotem całego codebase ([STATE.md](../STATE.md)).

**Last verified:** 2026-08-25

Gdy ten plik rozjeżdża się z kodem — **wygrywa kod**, potem aktualizujemy ten dokument.

Historia zakresu: zarchiwizowane plany [047](../plans/archive/2026-08-09--047--village-generation-overhaul.md), [071](../plans/archive/2026-08-11--071--local-economy-and-settlement-development.md), [060](../plans/archive/2026-08-11--060--npc-schedule-actions-and-trait-overlays.md), [076](../plans/archive/2026-08-12--076--village-generator-polish.md), [077](../plans/archive/2026-08-12--077--village-gardens-scale.md), [079](../plans/archive/2026-08-12--079--interaction-queue-well-drink.md), [092](../plans/archive/2026-08-13--092--npc-stamina-and-daily-vigor.md). Household (plan [069](../plans/archive/2026-08-11--069--npc-household-resources.md)) jest zaimplementowany, bez weryfikacji w przeglądarce — zob. §Gospodarstwa poniżej. Household water logistics (plan [122](../plans/archive/2026-08-15--122--natural-resource-gathering-and-water-distribution.md)) — well → NPC carrying → `WaterBarrel`/`AnimalTrough` — jest zaimplementowany, bez weryfikacji w przeglądarce.

---

## Standing decisions

| ID | Decyzja | Skutek |
|----|---------|--------|
| S1 | Generacja jest **plan-first**: jeden `VillagePlan` na osadę (tożsamość → strefy/działki/budynki/landmarki/ścieżki/wejścia), potem projekcja na `SettlementDef` runtime. | `settlementPlanCache` karmi `SettlementsManager` i `RoadNetwork` |
| S2 | Komórki otwartego oceanu są **pomijane** (bez mokrego fallbacku). Osada domowa poszerza poszukiwanie, gdy spawn jest mokry. | issue [029](../issues/2026-08-13--029--village-in-open-ocean.md) |
| S3 | `SettlementEconomy` to **hurtowy stock osady** (`wood` / `water` / `iron` / `coal` / `gold` jako `EconomicKind` w `EconomicStock`, `water` tu bez producenta/konsumenta — inertny stat z planu 071; `iron`/`coal`/`gold` — plan 131 — mają stock ale bez `SettlementDemand` celu, więc `shortage`/`hasShortage` zawsze 0 dla nich), nie `Inventory` gracza i nie ekwipunek NPC. Od planu settlements-npcs-008 `food` **nie** jest już w `EconomicStock` — `SettlementEconomy.items` to osobny, unbounded `Inventory` konkretnych `ItemKind` (ten sam mechanizm co `Household.items`); `query`/`shortage`/`surplus`/`hasShortage`/`hasSurplus('food')` liczą sumę tych pozycji na bieżąco (`items/foodItems.ts`'s `foodItemCount`), `add`/`remove('food', …)` są no-opem — mutacja idzie przez `depositFood`/`withdrawFood`. `Household` (plan 069) to osobna, mniejsza warstwa pod nią — jedna rodzina = jedno gospodarstwo, `stock` (`EconomicStock`) obejmuje od planu settlements-npcs-008 już tylko `wood` (`HouseholdResourceKind` zostaje `'food' | 'wood'` literałem dla istniejących call site'ów wymiany/potrzeb, ale `food` deleguje do `household.items` zamiast `stock`; `has`/`shortage`/`shouldAcquire`/`surplus('food')` liczą z `items`, `depositFood`/`takeFood`/`foodCount` to nowe wejścia mutacji/odczytu). Woda gospodarstwa (plan 122) to osobny, mniejszy `WaterReserve` (`household.water`) — świadomie **nie** `EconomicKind`/`EconomicStock` (notatki 122 §4: brak produkcji/handlu wodą), jedno źródło prawdy dla `WaterBarrel` (NPC) i `AnimalTrough` (zwierzęta domowe). | `src/economy/`, `src/settlement/household.ts`, `src/items/foodItems.ts` |
| S4 | Picie ze studni idzie przez wspólny per-osada `InteractionQueue` (FIFO, jedna obsługa naraz). Picie w domu omija kolejkę. | ten sam typ kolejki jest do ponownego użycia przy ogrodzie/straganie |
| S5 | Dzienny rytm = szablon roli + overlay cech (`effectiveScheduleFor`). Pilne potrzeby wygrywają w `choose()`. | od planu 151: overlay `sociable` ma producenta — ognisko osady (§Social poniżej) |
| S6 | `VigorState` ≠ `StaminaState`. Wigor to budżet dnia; zwykły odpoczynek odnawia tylko staminę. Collapse → istniejący `goSleep`/`sleep`. | fauna nie używa wigoru |
| S7 | Runtime NPC (needs, AI, vigor) **nie** jest w save. Continue nie przywraca pełnej symulacji. | vigor startuje pełny przy spawnie |
| S8 | Ruch NPC ma watchdog utknięcia — brak postępu pozycji eskaluje `repath` → `local escape` → `abandon` → (przy powtarzającym się utknięciu) emergency teleport. Cel w obcym dysku (dom, studnia, sterta drewna, wóz kupca) jest snapowany na obręcz od strony NPC (`destinationOnColliderRim`); rescue próbuje tylko punkty **na zewnątrz** zajętego collidera; teleport nie wraca na środek domu. Drenaż staminy zależy od tego, co NPC robi (chodzenie tanie, ciężka `execute` drogie), nie samej fazy. `stamina === 0` w `goTo`/`execute` → faza `exhausted` (odpoczynek w miejscu, ta sama akcja wznawia się po odzyskaniu progu). | `src/ai/npcMovementWatchdog.ts`, `src/ai/npcColliderRim.ts`; emergency teleport zawsze loguje `console.warn('[npc:rescue] emergency teleport', ...)` |
| S9 | Kolaps wigoru i **krytyczna** potrzeba (`pickNeed({ critical: true })`, progi wyraźnie wyżej niż zwykłe `pickNeed`) przerywają akcję już w locie (`goTo`/`execute`) — throttled check (~1 s) w `NpcAgent.update()`, tylko gdy `activeNeed === 'idle'` (akcja harmonogramowa, nie need-driven — unika przerzucania między potrzebami). Zwykła zmiana godziny nadal **nie** przerywa (plan 060 obowiązuje dalej). | `src/ai/NpcAgent.ts`'s `tickCriticalInterrupt`/`interruptCurrentAction`, `src/ai/Needs.ts`'s `pickNeed`'s `critical` option (plan [114](../plans/archive/2026-08-14--114--npc-critical-need-vigor-interrupt.md)) |

Multiplayer nie jest planowany teraz i nie projektujemy go tutaj. Ale S3/S7 pokazują, że ownership stanu (ekonomia osady, runtime NPC) jest już oddzielony od `Inventory` gracza i od save gracza — utrzymuj ten podział, żeby ewentualne przejście na server-authoritative symulację (mały świat, ~2–5 graczy) nie wymagało przepisania. Zob. [performance-and-workers.md](../architecture/performance-and-workers.md).

---

## Stan obecny

### Generator i wygląd

- Rodziny, domy, drogi lokalne i międzysiedliskowe, siting zależny od terenu.
- Domy: `HouseBuilder` składa chatki 4×4 / 6×4 i średnie domy 6×6 / 8×6 (dachówki MegaKit, native scale ×1, `HOUSE_ASSEMBLY_SCALE`) w `buildSettlementProps`; warianty mieszają tynk, kratownicę i cegłę, część z kominem. Wielkość zależy od rozmiaru osady. `TEST_HOUSE_01` (4×2) zostaje jako test. Collidery/`Place`/households bez zmian. Legacy `HOUSE_CATALOG` (`hut_*.glb`) — fallback i Asset Browser.
- Ogrody skalują się z liczbą domów (S/M/L); środki grządek poza dyskiem placu. Osady z `foodSourceType === 'field'` stawiają pole przy landmarku `field`.
- Household yard (plan settlements-npcs-011): `settlement/householdYard.ts`'s `householdYardRadius()` to jedna, czysto geometryczna definicja promienia potrzebnego wokół domu (rzeczywisty `footprintRadius` z katalogu + offset najdalszego yard propa, magazynu gospodarstwa) — `props.ts`'s `houseYardPlacements()` (beczka/koryto/magazyn) i `villagePlanner.ts`'s `HOUSE_PLOT_RADIUS` (rezerwacja spacing/site-selection) są wobec niej zweryfikowane (`householdYard.test.ts`), a nie duplikowane. Ten sam plan naprawił `pickPlot()`'s deterministyczny fallback — wcześniej tylko role `'house'` przechodziła przez ring-search sprawdzający spacing w fallbacku, każda inna rola (ogród, stockpile, market, ...) trafiała od razu na bezwarunkowe umiejscowienie, co realnie potrafiło posadzić ogród na yardzie domu przy gęściej upakowanych osadach (zmierzone i potwierdzone dla MD/LG przed fixem). Rozmiary `VILLAGE_SIZE_CONFIG` (SM/MD/LG/XL) zostały zmierzone na wielu seedach i mają już wystarczający margines — nie zmienione.
- Zużyte lokalne drogi, clearing placu, yaw/pady domów, tablica przy studni, palisada tylko inland.
- Drogi między osadami wchodzą przez `entranceToward`; lokalne korytarze z `VillagePlan.paths`. Drogowskazy: `yawToward`.
- GLB z proceduralnym fallbackiem: studnia, stos drewna, ogrody/crops, pole, kaktus/trzcina w środowisku chunka (nie w generatorze osady).
- Collidery osady (`ColliderRegistry`, plan 097, issue [036](../issues/2026-08-19--036--settlement-prop-colliders.md)): studnia, ściany/drzwi domów, sterta drewna (i druga gdy LG/XL), wóz+koń kupca, ognisko wioskowe. Palisada/beczki/siano/skrzynia magazynu — bez collidersów.

### Streaming

- `HOME_RADIUS` (56) jest niezależny od załadowanego terenu — osada i fauna zachowują się tak samo, gdy gracz jest daleko.
- Stream osad: `loadRadius` 300 / `unloadRadius` 420 (`worldBundle.ts`).
- Budowa propsów oddaje klatki (`frameYield`) żeby nie zatykać głównego wątku przy dociągnięciu wioski.

### Ekonomia

- Każda załadowana osada ma `SettlementEconomy`: cele popytu, niedobór/nadwyżka.
- Drwal: ścinka → depozyt na stosie. Drugi, mniejszy stos (woodshed) jest płatny raz z nadwyżki drewna.
- Farmer / rybak / górnik / guard / trader / blacksmith mają dziś realną pracę (plan settlements-npcs-002, patrz niżej) zamiast pustego production hooka — ten ostatni (`commitRoleWork`) zostaje jedynie jako fallback, gdy profesja nie znajdzie realnego celu (np. brak dojrzałej uprawy, brak niedoboru do wyrównania).
- Stock przeżywa stream-out/in w rejestrze `SettlementsManager`; persystowany w `SaveData.settlementEconomies` (od save v12, dziś część jednokontraktowego v1 — plan 201), i przenoszony przez in-session rebuild `WorldBundle` (`carriedEconomies`). `Household` (§Gospodarstwa) ma od planu 197 ten sam in-session carry-mechanizm; jedyna pozostała różnica to `SaveData` — `Household` tam nadal nie jest.

### Gospodarstwa (plan 069)

- Jedna rodzina = jedno gospodarstwo = jeden dom (`household.ts`'s `householdIdFor(settlementId, familyIndex)`), 1:1 z `def.families`/`homePlaces` w `createSettlement.ts`. `HouseholdRegistry` żyje na `SettlementsManager` (jak `EconomyRegistry`) — stream-out/in reużywa te same gospodarstwa; nie jest w `SaveData`. Od planu `197` `HouseholdRegistry` ma też ten sam carry-mechanizm co `EconomyRegistry` przez in-session rebuild `WorldBundle` (`snapshotHouseholds()`/`initialHouseholds`, mirror `carriedEconomies`) — stock gospodarstwa już nie resetuje się do świeżych wartości startowych przy zmianie ustawień terenu w tej samej sesji.
- Stock gospodarstwa: `food`/`wood` w `stock` (`EconomicStock`) plus osobny `water` (`WaterReserve`, plan 122) — wszystkie trzy z małym deterministycznym stanem startowym, `minimum`/`target`/`capacity` (1/3/5) zamiast planisty ekonomicznego. Od planu 178 gospodarstwo ma też `items` — generyczny `Inventory` (bez limitu wagi/rozmiaru, jak budynek a nie plecak) na dowolne dyskretne itemy (upolowane mięso/skóra, strzały, bandaże), których `stock`'s skalarny `EconomicStock` celowo nigdy nie reprezentował; przenosi się przez ten sam in-session rebuild carry co `stock`/`water` (`HouseholdSnapshot.items`).
- Głód: NPC je z zapasu gospodarstwa gdy jest (szybko, w domu); gdy brak — idzie do ogrodu, zbiera trochę jedzenia do gospodarstwa (limit pojemności, nadwyżka do `SettlementEconomy`) i od razu je z tego zapasu.
- Drewno: ścinka nadal woła istniejący `chop → deposit`, ale depozyt trafia najpierw do gospodarstwa drwala (limit pojemności), nadwyżka do `SettlementEconomy` — rozwój woodshed (`tryAdvanceDevelopment`) nadal liczy się od stocku osady, więc działa tak jak wcześniej, tylko wolniej, dopóki gospodarstwa się nie napełnią. Depozyt jest teraz warunkowany realnym sukcesem harvestu (plan 131) — jeśli `harvestWorldTreeFully` się nie powiedzie (np. drzewo ścięte przez kogoś innego między startem a końcem czopa), łańcuch `chop → deposit` nie mintuje drewna.
- Ruda (plan 131): rola `miner` w swoim harmonogramowym bloku `work` najpierw próbuje realnego wydobycia — `queryNearest`/`mine` na tym samym `ResourceDeposits`, którego używa gracz z kilofem (wstrzyknięte przez `SettlementMiningHooks`, budowane raz na `WorldBundle`, nie osobny rejestr). Yield trafia do małego, generycznego `Inventory` noszonego przez `NpcAgent` (ta sama klasa co ekwipunek gracza, teraz reużywalna), potem — po dojściu do stockpile'u — do `SettlementEconomy` jako `iron`/`coal`/`gold` (**nie** do `Household`). Brak załadowanego depozytu w zasięgu → NPC wraca do sprzed-131 pustego stania przy stockpile'u (profesja to preferencja, nie jedyny sposób działania). `ResourceDeposits.update()` dogrywa depozyty także wokół środków aktywnych osad, nie tylko gracza, żeby to działało bez gracza w pobliżu.
- Woda (plan 122): pragnienie NPC (`water` need) najpierw sprawdza zapas domowy (`household.water`) — pije w domu i zmniejsza zapas, tak jak jedzenie. Gdy zapasu brak, wraca do poprzedniego zachowania: studnia (kolejka `InteractionQueue`, jeśli osada ją ma) albo bezpośrednio `landmarks.well`. Osobna "duty" `waterDuty` (mirror `woodDuty`) rośnie w czasie i — gdy przekroczy próg (biasowany niedoborem `household.water.shortage()`) — wysyła NPC do studni (ta sama kolejka co pragnienie), a potem do domu z łańcuchem `drink → deposit` (jak `chop → deposit` dla drewna); `deposit.onComplete` dolewa `WATER_FETCH_AMOUNT` do `household.water`. Woda **nie** pojawia się w kontenerze automatycznie — zawsze przez realny `goTo`/`execute` NPC.
- `WaterBarrel` (dla domowników) i `AnimalTrough` (dla zwierząt domowych) to fizyczne, instancowane propsy w podwórku każdego domu (`buildSettlementProps`, `settlement-household-barrels`/`-troughs`) — prezentacja, autorytatywna ilość żyje wyłącznie w `household.water` (notatki 122 §5). Trough procedural-only (`createTrough`, brak GLB — `docs/assets/MODELS.md` M37); barrel reużywa istniejący `barrel.glb`/`createBarrel`.
- Zwierzęta domowe (livestock, `ownerHouseId`) — pierwszy realny konsument `ownerHouseId` (wcześniej bez konsumenta, plan 110). `AnimalAgent.findWaterTarget()` najpierw sprawdza koryto właściciela (`household.water`); dopiero gdy puste, wraca do dotychczasowego szukania brzegu (`findTroughTarget`/`shoreProbeHits`, plan 094). Dzika fauna nie ma `household` — zawsze idzie do brzegu, bez zmian.
- Polowanie (plan 178): rola `hunter` (7. `Role`, losowana tak jak każda inna) w gałęzi `food` need'u (`beginNeed`) najpierw próbuje realnej wyprawy myśliwskiej — gdy gospodarstwo nie ma jedzenia na stanie, bounded/deterministyczny wybór celu wśród żywej fauny (`SettlementHuntingHooks.queryTarget`, preferowane gatunki zając/sarna/jeleń/dzik, 50% szansy pominięcia spawn pointu z dokładnie jednym żywym zwierzęciem, seedowany RNG) → istniejący NPC ranged `CombatIntent`/`beginCombat()` (plan 177) → po zabiciu (`CombatIntent.onKill`, nowe generyczne pole) knife-harvest (`fauna/animalHarvest.ts`'s `harvestAnimalIntoInventory`, ta sama funkcja co harvest gracza) → mięso/skóra do `carried`, potem `deposit`-em do `household.items`. Do 3 zabić na wyprawę (carry weight i tak zwykle limituje wcześniej), bez osobnego "expedition AI" — pętla to powtarzane wywołania `beginCombat()`. Hunter podczas bloku `work` zamiast stania przy studni (workplace = `landmarks.well`, jak `guard`) craftuje strzały z `household.stock`'s `wood` do `household.items`' `arrow` (`beginArrowCrafting`, cap na zapas). Świadomie nie zaimplementowane w 178: crafting łuków, most gospodarstwo→handel kupca, NPC-owe gotowanie/suszenie mięsa (patrz `docs/plans/LOOSE-ENDS.md`).
- Pozostałe profesje (plan settlements-npcs-002, `blacksmith` to 8. `Role`, losowana tak jak każda inna): **Farmer** podczas `work` szuka realnej dojrzałej/nadgniłej-z-plonem uprawy blisko `landmarks.garden` (`SettlementFoodSourceHooks.queryHarvestableCrop`, ten sam `harvest()` co przy głodzie) i deponuje faktyczny plon do gospodarstwa/osady; brak uprawy → sadzi (`findPlantSpot`/`plant`, deterministyczny pierścień offsetów + `evaluateGroundPlacement`) tylko jeśli gospodarstwo ma już nasiono — dziś praktycznie martwa gałąź, bo nic nie dostarcza nasion do gospodarstw (patrz `docs/plans/LOOSE-ENDS.md`); podlewania nie ma (`world/cropLifecycle.ts` nie ma stanu nawodnienia, patrz plan `settlements-npcs-001`, wciąż `planned`). **Fisher** rzuca wędkę przy realnym pomoście osady (`landmarks.dock`) tą samą deterministyczną regułą łowienia `(spot, attempt)` co gracz (`world/fishing.ts`, bez przynęty), rybę dostarcza do `household.items` (generyczny `depositCarriedItems`, współdzielony z dostawą myśliwego); brak pomostu → normalny idle stand, nigdy łowienie przy studni. **Guard** krąży po 3 stałych punktach patrolu (dom/studnia/rynek) zamiast stać w miejscu — wykrywanie zagrożenia/walka nie wymagały nowego kodu, bo istniejący `senseImmediateAnimalThreat`/`decideAnimalThreatResponse` już przerywa akcję każdego NPC niezależnie od roli. **Trader** przenosi realną nadwyżkę `food`/`wood` własnego gospodarstwa do `SettlementEconomy`, gdy osada ma odpowiadający niedobór — ograniczony, lokalny efekt ekonomiczny, nie pełny rynek (nie sięga po nadwyżki innych gospodarstw). **Blacksmith** ma prawdziwy warsztat (`landmarks.blacksmith` — kowadło + szlifierka, `public/models/parked/anvil.glb`/`workbench-grind.glb` wypromowane z parked) i szuka w `household.items` egzemplarza broni poniżej progu ostrości, żeby użyć istniejącego `sharpenWeapon()` — dziś praktycznie martwa gałąź, bo nic nie dostarcza osełek do gospodarstw.
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
- Watchdog utknięcia obserwuje `goTo`/`followPath`/`wander`/`goSleep`; brak realnego postępu pozycji eskaluje rescue (repath → local escape → abandon), emergency teleport tylko przy powtarzającym się utknięciu (`src/ai/npcMovementWatchdog.ts`). Cel w rdzeniu obcego dysku (dom / studnia) leży na obręczy od zewnątrz (`src/ai/npcColliderRim.ts`, plan [108](../plans/archive/2026-08-14--108--npc-stuck-at-house-locomotion.md)); probe rescue nie akceptuje wnętrza zajętego collidera; `moving` tylko przy realnym przesunięciu x/z. Playtest w przeglądarce — `verification needed`.
- `?debug=1` dorzuca do etykiety NPC linię diagnostyczną (faza, akcja, dystans, stamina, stan watchdoga).
- Dialog v2 = ekran Vue. W osadzie domowej: handel u kupca (dwie kolumny, kupno/sprzedaż/barter); strażnik może oddać miecz.

### Social (plan 151)

- Każde ognisko osady (`landmarks.campfire`, istniało od dawna) jest teraz `Place` typu `social` (`places.ts`'s `socialPlaceFor`) — bez nowego generatora, bez klonowania płomienia/wizualu. NPC dostaje wyłącznie ognisko **własnej** osady; osady bez ogniska (SM/OUTPOST) nie mają Social Place, więc `sociable` po staremu zostaje przy `home`.
- Istniejący `ScheduleActivity: 'social'` i `effectiveScheduleFor(..., { hasSocialPlace })` (od dawna w kodzie, wcześniej bez producenta — zob. S5) teraz dostają realny `hasSocialPlace = socialPlace != null`, liczony raz przy konstrukcji `NpcAgent`, nie co klatkę.
- `NpcAgent.beginIdle()`'s `social` branch reużywa istniejącą parę `goTo`/`execute` (`kind: 'social'` — jednorazowe "osiądź przy ognisku", potem zwykłe `wanderNear` jak przy `eat`/`home`) — bez nowej fazy FSM.
- Partner: `NpcAgent.socialCandidate()` (throttled przez `nextSocialAttemptSim`, częstotliwość skalowana `extraversion` — tylko częstotliwość próby, nie wybór partnera) + czysta `findConversationPartner` (`ai/socialBehaviour.ts`) — to samo ognisko + dostępny + nie ja, deterministyczny tie-break (najniższe id), bez rankingu personality/traits/role/relacji.
- Parowanie: `advanceSocialPairing` (`ai/socialBehaviour.ts`) woła settlement's own `agents` w istniejącej `Settlement.update()` pętli (bez globalnego rejestru) — atomowa rezerwacja obu uczestników w jednym przebiegu, jeden wygenerowany czas rozmowy (2-5 minut czasu świata → realne sekundy przez `gameHoursToRealSeconds`, ten sam dla obu stron), jeden closure z wynikiem (`applyOutcomeOnce`, bezpieczny na podwójne wywołanie).
- `conversation` to nowy `ActionId`, wykonywany przez każdego uczestnika osobno przez zwykły `goTo`/`execute` (mapuje się na istniejący `CurrentActivityKind: 'talking'`, ten sam co gracz-facing `lookAtPlayer`). Przerwanie w locie (krytyczna potrzeba/kolaps wigoru/śmierć/utknięcie) zwalnia partnera przez `releaseConversationPartner()` — bez naliczenia relacji.
- Relacja NPC↔NPC: nowy, generyczny, symetryczny store `settlement/npcRelationships.ts` (`createNpcRelationships`), osobny od `QuestManager`'s relacji gracz↔NPC (inne kluczowanie: para NPC vs jedno imię względem gracza). Jeden egzemplarz na `SettlementsManager`, wątkowany do `createSettlement` tak jak `households`/`economies` — przetrwa stream-out/in osady w tej samej sesji; **nie** jest jeszcze w `SaveData` (ten sam, świadomie otwarty gap co `Household`).
- Świadomie nie ma: inne Social Places poza ogniskiem, ognisko innej osady, rozmowy grupowe, inne typy interakcji poza `conversation`, ranking partnera po personality/traits/role/relacji/rodzinie/zainteresowaniach/pamięci, nowe wpisy memory z rozmowy.

### Świadomie nie ma

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
src/ai/socialBehaviour.ts
src/ai/npcMovementWatchdog.ts
src/ai/npcColliderRim.ts
src/settlement/npcRelationships.ts
src/shared/VigorState.ts
src/shared/StaminaState.ts
```

`HOME_RADIUS` i promienie streamu: `src/app/worldBundle.ts`.
