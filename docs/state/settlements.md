# Seedvale — Osady i NPC

**Purpose:** źródło prawdy dla generacji osad, gospodarstw domowych oraz ekonomii osady/gospodarstwa *jak jest zaimplementowane*.

**Nie jest:** indeksem planów ([plans/README.md](../plans/README.md)), katalogiem GLB ([assets/](../assets/README.md)), kontraktem renderu ([GRAPHICS.md](../architecture/GRAPHICS.md)), snapshotem całego codebase ([STATE.md](../STATE.md)), ani drugim dokumentem o życiu NPC — decyzje/potrzeby/strategie/praca/walka/relacje/dialog NPC są kanonicznie opisane w [npc.md](./npc.md); ten plik pokazuje tylko, gdzie osada hostuje NPC-a i jak jego praca dociera do gospodarstwa/ekonomii.

**Last verified:** 2026-09-06

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
| S7 | Autorytatywny stan NPC — wszystkie siedem pól (`health`/`stamina`/`vigor`/`needs`/`physicalInjury`/`helperAssignment`/`activePlan`) — jest persystowany w `SaveData.npcStates` (opcjonalne, sparse, od planu persistence-001). `phase`/`pendingAction`/pathfinding/`combatIntent`/noszony `Inventory` **nie** są — resetują się przy każdej rekonstrukcji, więc Continue nie przywraca pełnej symulacji *wykonania*. | zob. [npc.md](./npc.md#persistence), [persistence.md](./persistence.md) |
| S8 | Ruch NPC ma watchdog utknięcia — brak postępu pozycji eskaluje `repath` → `local escape` → `abandon` → (przy powtarzającym się utknięciu) emergency teleport. Cel w obcym dysku (dom, studnia, sterta drewna, wóz kupca) jest snapowany na obręcz od strony NPC (`destinationOnColliderRim`); rescue próbuje tylko punkty **na zewnątrz** zajętego collidera; teleport nie wraca na środek domu. Drenaż staminy zależy od tego, co NPC robi (chodzenie tanie, ciężka `execute` drogie), nie samej fazy. `stamina === 0` w `goTo`/`execute` → faza `exhausted` (odpoczynek w miejscu, ta sama akcja wznawia się po odzyskaniu progu). | `src/ai/npcMovementWatchdog.ts`, `src/ai/npcColliderRim.ts`; emergency teleport zawsze loguje `console.warn('[npc:rescue] emergency teleport', ...)` |
| S9 | Kolaps wigoru i **krytyczna** potrzeba (`pickNeed({ critical: true })`, progi wyraźnie wyżej niż zwykłe `pickNeed`) przerywają akcję już w locie (`goTo`/`execute`) — throttled check (~1 s) w `NpcAgent.update()`, tylko gdy `activeNeed === 'idle'` (akcja harmonogramowa, nie need-driven — unika przerzucania między potrzebami). Zwykła zmiana godziny nadal **nie** przerywa (plan 060 obowiązuje dalej). | `src/ai/NpcAgent.ts`'s `tickCriticalInterrupt`/`interruptCurrentAction`, `src/ai/Needs.ts`'s `pickNeed`'s `critical` option (plan [114](../plans/archive/2026-08-14--114--npc-critical-need-vigor-interrupt.md)) |

Multiplayer nie jest planowany teraz i nie projektujemy go tutaj. Ale S3/S7 pokazują, że ownership stanu (ekonomia osady, runtime NPC) jest już oddzielony od `Inventory` gracza i od save gracza — utrzymuj ten podział, żeby ewentualne przejście na server-authoritative symulację (mały świat, ~2–5 graczy) nie wymagało przepisania. Zob. [performance-and-workers.md](../architecture/performance-and-workers.md).

---

## Stan obecny

### Generator i wygląd

- Rodziny, domy, drogi lokalne i międzysiedliskowe, siting zależny od terenu.
- Siting i per-plot placement twardo odrzucają nakładanie na aktywny kanał rzeki (`findSettlementSite.ts`/`villagePlanner.ts`, `terrain/riverNetwork.ts`'s `footprintOverlapsRiver`) — pełny opis seamu (site clearance, per-plot reject, `pushOutOfRiver` fallback) jest w [water.md](./water.md)'s sekcji "Integracja rzek z resztą worldgenu", nie duplikowany tutaj.
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
- Stock przeżywa stream-out/in w rejestrze `SettlementsManager`; persystowany w `SaveData.settlementEconomies` (wymagane pole) i przenoszony przez in-session rebuild `WorldBundle` (`carriedEconomies`) — numer wersji schematu save'a zob. [persistence.md](./persistence.md), nie restatowany tutaj. `Household` (§Gospodarstwa) ma od planu 197 ten sam in-session carry-mechanizm i od planu persistence-001 jest też persystowany (`SaveData.households`, opcjonalne, sparse) — oba rejestry używają dziś tego samego wzorca `initial*`/`snapshot*`.
- `economy/localExchange.ts`'s `claimHouseholdSurplus`/`claimEconomySurplus` to wspólny, atomowy claim-seam pod każdym kierunkiem transferu (wioska↔gospodarstwo, gospodarstwo↔gospodarstwo, praca Tradera) — zawsze rewaliduje `surplus()` na żywo w momencie odbioru, nigdy nie ufa wcześniejszemu odczytowi z momentu decyzji. Konsumowany przez `ai/npcLogistics.ts` i `settlement/householdExchange.ts` (zob. [npc.md](./npc.md) po stronę decyzyjną).

### Gospodarstwa (plan 069)

- Jedna rodzina = jedno gospodarstwo = jeden dom (`household.ts`'s `householdIdFor(settlementId, familyIndex)`), 1:1 z `def.families`/`homePlaces` w `createSettlement.ts`. `HouseholdRegistry` żyje na `SettlementsManager` (jak `EconomyRegistry`) — stream-out/in reużywa te same gospodarstwa; persystowany w `SaveData.households` (opcjonalne, sparse) od planu persistence-001. Od planu `197` `HouseholdRegistry` ma też ten sam in-session carry-mechanizm co `EconomyRegistry` przez in-session rebuild `WorldBundle` (`snapshotHouseholds()`/`initialHouseholds`, mirror `carriedEconomies`) — stock gospodarstwa już nie resetuje się do świeżych wartości startowych przy zmianie ustawień terenu w tej samej sesji.
- Stock gospodarstwa: `food`/`wood` w `stock` (`EconomicStock`) plus osobny `water` (`WaterReserve`, plan 122) — wszystkie trzy z małym deterministycznym stanem startowym, `minimum`/`target`/`capacity` (1/3/5) zamiast planisty ekonomicznego. Od planu 178 gospodarstwo ma też `items` — generyczny `Inventory` (bez limitu wagi/rozmiaru, jak budynek a nie plecak) na dowolne dyskretne itemy (upolowane mięso/skóra, strzały, bandaże), których `stock`'s skalarny `EconomicStock` celowo nigdy nie reprezentował; przenosi się przez ten sam in-session rebuild carry co `stock`/`water` (`HouseholdSnapshot.items`).
- Głód: NPC je z zapasu gospodarstwa gdy jest (szybko, w domu); gdy brak — idzie do ogrodu, zbiera trochę jedzenia do gospodarstwa (limit pojemności, nadwyżka do `SettlementEconomy`) i od razu je z tego zapasu.
- Drewno: ścinka nadal woła istniejący `chop → deposit`, ale depozyt trafia najpierw do gospodarstwa drwala (limit pojemności), nadwyżka do `SettlementEconomy` — rozwój woodshed (`tryAdvanceDevelopment`) nadal liczy się od stocku osady, więc działa tak jak wcześniej, tylko wolniej, dopóki gospodarstwa się nie napełnią. Depozyt jest teraz warunkowany realnym sukcesem harvestu (plan 131) — jeśli `harvestWorldTreeFully` się nie powiedzie (np. drzewo ścięte przez kogoś innego między startem a końcem czopa), łańcuch `chop → deposit` nie mintuje drewna.
- Ruda (plan 131): rola `miner` w swoim harmonogramowym bloku `work` najpierw próbuje realnego wydobycia — `queryNearest`/`mine` na tym samym `ResourceDeposits`, którego używa gracz z kilofem (wstrzyknięte przez `SettlementMiningHooks`, budowane raz na `WorldBundle`, nie osobny rejestr). Yield trafia do małego, generycznego `Inventory` noszonego przez `NpcAgent` (ta sama klasa co ekwipunek gracza, teraz reużywalna), potem — po dojściu do stockpile'u — do `SettlementEconomy` jako `iron`/`coal`/`gold` (**nie** do `Household`). Brak załadowanego depozytu w zasięgu → NPC wraca do sprzed-131 pustego stania przy stockpile'u (profesja to preferencja, nie jedyny sposób działania). `ResourceDeposits.update()` dogrywa depozyty także wokół środków aktywnych osad, nie tylko gracza, żeby to działało bez gracza w pobliżu.
- Woda (plan 122): pragnienie NPC (`water` need) najpierw sprawdza zapas domowy (`household.water`) — pije w domu i zmniejsza zapas, tak jak jedzenie. Gdy zapasu brak, wraca do poprzedniego zachowania: studnia (kolejka `InteractionQueue`, jeśli osada ją ma) albo bezpośrednio `landmarks.well`. Osobna "duty" `waterDuty` (mirror `woodDuty`) rośnie w czasie i — gdy przekroczy próg (biasowany niedoborem `household.water.shortage()`) — wysyła NPC do studni (ta sama kolejka co pragnienie), a potem do domu z łańcuchem `drink → deposit` (jak `chop → deposit` dla drewna); `deposit.onComplete` dolewa `WATER_FETCH_AMOUNT` do `household.water`. Woda **nie** pojawia się w kontenerze automatycznie — zawsze przez realny `goTo`/`execute` NPC.
- `WaterBarrel` (dla domowników) i `AnimalTrough` (dla zwierząt domowych) to fizyczne, instancowane propsy w podwórku każdego domu (`buildSettlementProps`, `settlement-household-barrels`/`-troughs`) — prezentacja, autorytatywna ilość żyje wyłącznie w `household.water` (notatki 122 §5). Trough procedural-only (`createTrough`, brak GLB — `docs/assets/MODELS.md` M37); barrel reużywa istniejący `barrel.glb`/`createBarrel`.
- Zwierzęta domowe (livestock, `ownerHouseId`) — pierwszy realny konsument `ownerHouseId` (wcześniej bez konsumenta, plan 110). `AnimalAgent.findWaterTarget()` najpierw sprawdza koryto właściciela (`household.water`); dopiero gdy puste, wraca do dotychczasowego szukania brzegu (`findTroughTarget`/`shoreProbeHits`, plan 094). Dzika fauna nie ma `household` — zawsze idzie do brzegu, bez zmian. Pełna architektura livestock (persystencja, produkcja, dosiadanie) jest kanoniczna w [fauna.md](./fauna.md#settlementecosystem-interactions).
- Szczury: `settlement/rats.ts` jest fizycznie w tym katalogu, ale samo-otagowane `@domain fauna` — pełna architektura (target populacji z żywej formuły, tłumienie przez psy) jest kanoniczna w [fauna.md](./fauna.md#settlementecosystem-interactions). Tutaj ważne jest tylko, że szczury drenują realne jedzenie z `Household`/`SettlementEconomy` przez te same atomowe prymitywy co każdy inny konsument (`takeFood`/`withdrawFood`), reconciled co pół dnia gry — nie osobny mechanizm, i nie persystowane (zob. [persistence.md](./persistence.md)).
- Polowanie (plan 178): rola `hunter` (7. `Role`, losowana tak jak każda inna) w gałęzi `food` need'u (`beginNeed`) najpierw próbuje realnej wyprawy myśliwskiej — gdy gospodarstwo nie ma jedzenia na stanie, bounded/deterministyczny wybór celu wśród żywej fauny (`SettlementHuntingHooks.queryTarget`, preferowane gatunki zając/sarna/jeleń/dzik, 50% szansy pominięcia spawn pointu z dokładnie jednym żywym zwierzęciem, seedowany RNG) → istniejący NPC ranged `CombatIntent`/`beginCombat()` (plan 177) → po zabiciu (`CombatIntent.onKill`, nowe generyczne pole) knife-harvest (`fauna/animalHarvest.ts`'s `harvestAnimalIntoInventory`, ta sama funkcja co harvest gracza) → mięso/skóra do `carried`, potem `deposit`-em do `household.items`. Do 3 zabić na wyprawę (carry weight i tak zwykle limituje wcześniej), bez osobnego "expedition AI" — pętla to powtarzane wywołania `beginCombat()`. Hunter podczas bloku `work` zamiast stania przy studni (workplace = `landmarks.well`, jak `guard`) craftuje strzały z `household.stock`'s `wood` do `household.items`' `arrow` (`beginArrowCrafting`, cap na zapas). Świadomie nie zaimplementowane w 178: crafting łuków, most gospodarstwo→handel kupca, NPC-owe gotowanie/suszenie mięsa (patrz `docs/plans/LOOSE-ENDS.md`).
- Pozostałe profesje (plan settlements-npcs-002, `blacksmith` to 8. `Role`, losowana tak jak każda inna): **Farmer** podczas `work` szuka realnej dojrzałej/nadgniłej-z-plonem uprawy blisko `landmarks.garden` (`SettlementFoodSourceHooks.queryHarvestableCrop`, ten sam `harvest()` co przy głodzie) i deponuje faktyczny plon do gospodarstwa/osady; brak uprawy → sadzi (`findPlantSpot`/`plant`, deterministyczny pierścień offsetów + `evaluateGroundPlacement`) tylko jeśli gospodarstwo ma już nasiono — dziś praktycznie martwa gałąź, bo nic nie dostarcza nasion do gospodarstw (patrz `docs/plans/LOOSE-ENDS.md`); podlewania nie ma (`world/cropLifecycle.ts` nie ma stanu nawodnienia, patrz plan `settlements-npcs-001`, wciąż `planned`). **Fisher** rzuca wędkę przy realnym pomoście osady (`landmarks.dock`) tą samą deterministyczną regułą łowienia `(spot, attempt)` co gracz (`world/fishing.ts`, bez przynęty), rybę dostarcza do `household.items` (generyczny `depositCarriedItems`, współdzielony z dostawą myśliwego); brak pomostu → normalny idle stand, nigdy łowienie przy studni. **Guard** krąży po 3 stałych punktach patrolu (dom/studnia/rynek) zamiast stać w miejscu — wykrywanie zagrożenia/walka nie wymagały nowego kodu, bo istniejący `senseImmediateAnimalThreat`/`decideAnimalThreatResponse` już przerywa akcję każdego NPC niezależnie od roli. **Trader** przenosi realną nadwyżkę `food`/`wood` własnego gospodarstwa do `SettlementEconomy`, gdy osada ma odpowiadający niedobór — ograniczony, lokalny efekt ekonomiczny, nie pełny rynek (nie sięga po nadwyżki innych gospodarstw). **Blacksmith** ma prawdziwy warsztat (`landmarks.blacksmith` — kowadło + szlifierka, `public/models/parked/anvil.glb`/`workbench-grind.glb` wypromowane z parked) i szuka w `household.items` egzemplarza broni poniżej progu ostrości, żeby użyć istniejącego `sharpenWeapon()` — dziś praktycznie martwa gałąź, bo nic nie dostarcza osełek do gospodarstw.
- `pickNeed`'s `woodShortage`/`foodShortage`/`waterShortage` uwzględniają teraz też niedobór *własnego* gospodarstwa NPC, nie tylko niedobór osady.
- `?debug=1` dorzuca `hh f<food> w<wood> h2o<water>` do istniejącej linii diagnostycznej NPC.
- Świadomie nie zrobione (patrz plan 069 §33, 122 §6): ceny/pieniądze, handel, łańcuchy produkcyjne/rolnictwo, rezerwacje zasobów, fizyczny magazyn wioski (Village Storehouse — odłożony do przyszłego planu z realnym przepływem komunalnym).

### Własność ziemi (plan 129)

`settlement/landOwnership.ts` (`LandOwnershipRegistry`, sparse `Set<"settlementId:plotId">`) + `landPurchase.ts` (`purchaseLandPlot()` — walidowana transakcja: działka istnieje → nie jest jeszcze zajęta → dodatnia cena → stać gracza) tworzą prosty system własności ziemi, osobny od pięciu rejestrów `SettlementsManager` (Economy/Household/NpcState/NpcRelationships/Livestock) — żyje na poziomie kompozycji `app/`, nie na `SettlementsManager`. Persystowany jako płaski, top-level `SaveData.ownedLandPlots: string[]`, inny idiom niż `initial*`/`snapshot*` używany przez pozostałe rejestry tej domeny — stylowa asymetria, nie ryzyko poprawności (zob. [persistence.md](./persistence.md)).

### NPC (stan hostowany tutaj, architektura decyzyjna w npc.md)

Autorytatywny stan NPC (`health`/`stamina`/`vigor`/`needs`/`physicalInjury`/`helperAssignment`/`activePlan`) jest fizycznie hostowany w `src/settlement/` — `NpcStateRegistry` (`npcState.ts`) żyje na `SettlementsManager`, keyed po stabilnym `npc.id`, tym samym wzorcem co `HouseholdRegistry`/`EconomyRegistry`: stream-out/in i `WorldBundle` rebuild (`snapshotNpcStates()`/`initialNpcStates`) hydratują `NpcAgent` z tego samego stanu zamiast tworzyć świeży, więc śmierć (`health.dead`) przetrwa reload w tej samej sesji. Persystowane w `SaveData.npcStates` od planu persistence-001 (zob. S7 wyżej). To jedyne miejsce, gdzie osada "hostuje" NPC-a fizycznie — cała reszta architektury (needs/pressure/decyzje, harmonogram, movement watchdog, walka, dialog) jest kanonicznie opisana w [npc.md](./npc.md), nie tutaj.

Kupiec przy straganie: dialog v2 (ekran Vue) w osadzie domowej wystawia handel (dwie kolumny, kupno/sprzedaż/barter); strażnik może oddać miecz — to settlement-specific treść menu dialogu, nie zmiana architektury dialogu opisanej w [npc.md](./npc.md#relationships-social-and-dialogue).

### Social

Ognisko osady (`landmarks.campfire`) jest wystawione jako `Place` typu `social` (`places.ts`'s `socialPlaceFor`) — czysto generacyjny fakt osady, bez nowego landmarku/geometrii; osady bez ogniska (SM/OUTPOST) nie mają Social Place. Zachowanie społeczne NPC zbudowane na tym miejscu (wybór partnera, parowanie, symetryczny store relacji NPC↔NPC) jest w całości opisane w [npc.md](./npc.md#relationships-social-and-dialogue) — to treść behawioralna NPC, która akurat reużywa ten landmark osady, nie stan osady.

### Świadomie nie ma

- Pełny snapshot **wykonania** NPC w save — `phase`/`pendingAction`/pathfinding/`combatIntent`/noszony `Inventory` resetują się przy każdej rekonstrukcji (nie tylko save/load, także w tej samej sesji). Autorytatywny stan NPC i `Household` **są** dziś w `SaveData` (zob. S7, [npc.md](./npc.md#persistence), [persistence.md](./persistence.md)).
- Handel między osadami.
- Łańcuchy produkcyjne/rolnictwo, rezerwacje zasobów gospodarstwa, fizyczny budynek magazynu (069 §33, dalszy zakres to plan 071/przyszłe plany).

---

## Powiązane

- [npc.md](./npc.md) — architektura decyzji/potrzeb/harmonogramu/dialogu/relacji NPC, evaluation strony work contracts; ten dokument opisuje tylko, gdzie ich stan jest hostowany i jak dociera do gospodarstwa/ekonomii.
- [fauna.md](./fauna.md) — pełna architektura livestock i szczurów (ten dokument dokumentuje tylko settlement-side konsumpcję).
- [water.md](./water.md) — river placement rejection przy siting/plot placement (sekcja "Integracja rzek z resztą worldgenu").
- [persistence.md](./persistence.md) — pełna klasyfikacja persystencji (ten dokument stwierdza tylko fakt per-domenę, nie duplikuje taksonomii).
- [player-systems.md](../state/player-systems.md) — settlement lodging (`lodging.ts`/`lodgingResolver.ts`, fizycznie w `src/settlement/`, dokumentowane po stronie gracza) oraz Work Contracts (player jako employer).

## Entry points

```text
src/settlement/SettlementsManager.ts
src/settlement/createSettlement.ts
src/settlement/villagePlan.ts
src/settlement/household.ts
src/settlement/landOwnership.ts
src/settlement/landPurchase.ts
src/settlement/rats.ts
src/economy/
src/economy/localExchange.ts
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
