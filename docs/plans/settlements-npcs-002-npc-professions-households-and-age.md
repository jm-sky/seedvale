# Plan: NPC Professions, Households & Age Activity

**Created:** 2026-08-24
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** 178 ~~069~~ ~~184~~ ~~185~~
**Domain:** `settlements-npcs`
**Tags:** [economy, items-player, npc, households]

## 1. Cel

Wprowadzić spójny model profesji NPC, ich związku z gospodarstwem domowym, wieku oraz generowania obsady profesji w osadach.

Zakładamy, że **plan 178 — Hunter Profession & Household zostanie wcześniej zrealizowany** i jego implementacja jest punktem odniesienia. Nie projektować drugiego modelu Hunter/Household.

Recon potwierdził, że obecny kod już ma większość fundamentów: `Role`, per-role `Schedule`, `NpcAgent` z `PlannedAction`/FSM, `Household`, settlement economy, inventory oraz item capabilities. Implementacja ma je rozszerzyć, a nie tworzyć równoległy system.

## 2. Najważniejsze ustalenia z codebase reconnaissance

### NPC role model

`src/ai/characters.ts` definiuje obecnie:

```text
woodcutter
farmer
guard
trader
miner
fisher
```

`CharacterDef.role` jest już częścią danych NPC. `trader` jest obecnie rolą zarezerwowaną dla domowego Kupca (`Kasia`), a losowe rodziny wybierają spośród `woodcutter`, `farmer`, `guard`, `miner`, `fisher`.

Nie tworzyć drugiego typu `Profession` niezależnego od `Role`. Najpierw rozszerzyć istniejący `Role` o brakujące profesje, w tym `hunter` zgodnie z założeniem, że plan 178 jest wykonany.

### Schedule

`src/ai/schedule.ts` już posiada per-role `SCHEDULE_TEMPLATES` oraz:

- `activityAt()`;
- `nextBoundary()`;
- `effectiveScheduleFor()`;
- trait overlays `fast_worker`, `night_owl`, `sociable`.

Obecne role mają już harmonogramy. `guard` ma już nocną zmianę:

```text
17 wake
18 work
00 eat
01 work
06 home
08 sleep
```

To jest zgodne z docelowym nocnym patrolem Guarda. Nie tworzyć nowego schedulera. Trzeba rozszerzyć istniejący `work` intent o właściwe akcje profesji oraz dopracować dzienny odpoczynek Guarda.

`social` jest już częścią typu schedule, ale w aktualnym runtime brak Social Place assignment; `social` może fallbackować do `home`. Plan 151 pozostaje osobnym zakresem.

### Actions / simulation

`NpcAgent` używa wspólnego `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `InteractionQueue` i własnego adaptera NPC.

Aktualne `ActionId` obejmują m.in.:

```text
chop
deposit
drink
eat
mine
work
```

`NpcAgent` ma już genericzny przepływ `goTo → execute`, a `work` jest istniejącym punktem integracji z profesją. Nie tworzyć osobnego profession-action FSM.

### Existing work/economy paths

Kod `NpcAgent` już importuje m.in.:

- `commitRoleWork()`;
- `commitWoodcutterDeposit()`;
- `WOODCUTTING_PRODUCTION`;
- `SettlementEconomy`;
- mining hooks;
- settlement food-source hooks;
- forest hooks.

To oznacza, że Woodcutter i Miner nie powinny dostać nowych równoległych systemów produkcji. Nowe profesje powinny zostać podłączone do istniejącego `work`/economy path.

### Household / economy

`Household` (`src/settlement/household.ts`) jest warstwą pomiędzy NPC carrying a `SettlementEconomy`. `SettlementEconomy` jest trwałym stockiem osady; Household jest obecnie utrzymywany podczas in-session `WorldBundle` rebuild, ale nie jest jeszcze zapisany w SaveData.

Plan 069 jest istniejącym fundamentem zasobów gospodarstw. Nie tworzyć nowego magazynu profesji.

### Inventory / items

`Inventory` jest współdzielonym mechanizmem dla player/NPC. `NpcAgent.carried` jest obecnie małym inventory do krótkiego przenoszenia zasobów, z limitem około 5 kg. Nie tworzyć drugiego inventory ani osobnego equipment managera.

`src/items/itemCatalog.ts` jest źródłem prawdy dla gameplay metadata. `ItemCapability` obejmuje obecnie:

```text
wood_chopping
meat_harvesting
branch_trimming
soil_digging
rock_mining
fire_starting
fishing
```

`melee`, `ranged`, `defense` pozostają osobnymi konfiguracjami itemów, a nie stringami `ItemCapability`.

`src/items/HeldTool.ts` i `heldToolVisual.ts` obsługują held-item model. Nie tworzyć osobnego systemu narzędzi profesji.

### Existing profession tools

`docs/items/CATALOG.md` potwierdza obecne narzędzia:

```text
shovel       → soil_digging
axe          → wood_chopping + melee
pickaxe      → rock_mining
fishing_rod  → fishing
pitchfork    → melee
sickle       → melee
```

`pitchfork` i `sickle` już istnieją jako holdable village tools. `sickle` jest naturalnym istniejącym narzędziem rolniczym, ale wymaganie tego planu pozostaje: **dodać osobną kosę (`scythe`) jako tool + weapon**, jeżeli codebase nie ma jej jeszcze pod inną nazwą.

Weapon maintenance obejmuje już `axe`, `pitchfork`, `sickle` i miecze; `shovel`/`pickaxe` są wyłączone z maintenance. Dla nowej kosy trzeba świadomie zdecydować, czy dołącza do istniejącego `WEAPON_MAINTENANCE_KINDS` — nie zakładać tego automatycznie.

## 3. Profesje v1

### Farmer

Główna działalność gospodarstwa:

- uprawa pól i ogrodów,
- sadzenie,
- podlewanie,
- pielęgnacja upraw,
- zbieranie plonów,
- opieka nad zwierzętami gospodarstwa.

Farmer i jego żona wspólnie zajmują się rolnictwem i zwierzętami. `Herder` nie jest osobną profesją.

W implementacji należy wykorzystać istniejące `CropLifecycle`, planting/garden/maintenance oraz household/resource mechanisms. Nie zakładać nowych czynności rolniczych, których codebase jeszcze nie posiada.

### Woodcutter

- ścinanie drzew,
- pozyskiwanie drewna.

Wykorzystać istniejące `TreeLifecycle` / `treeHarvest` oraz `commitWoodcutterDeposit()` / `WOODCUTTING_PRODUCTION`.

### Fisher

- łowienie ryb.

Istnieje już `world/fishing.ts`, `fishing_rod` i capability `fishing`. Fishing nie ma osobnych agentów ryb; jest to istniejący world interaction. Profesja ma więc uruchamiać istniejącą aktywność, nie tworzyć nowy fishing system.

### Trader

- prowadzenie handlu w osadzie,
- przebywanie głównie przy istniejącym miejscu handlu / centrum osady,
- pomoc innym NPC, gdy nie ma klientów.

Obecny `trader` jest specjalnym/reserved NPC. Istnieje `tradeCatalog.ts` i Merchant/Home-Trader screen. Nie tworzyć nowej ekonomii handlu.

### Guard

- patrolowanie osady,
- reagowanie na zagrożenia,
- walka i obrona,
- pomaganie innym NPC,
- zapalanie ognisk,
- zapalanie pochodni,
- nocny patrol z pochodnią.

Obecny schedule Guarda już jest nocną zmianą. Plan powinien wykorzystać go zamiast tworzyć specjalny scheduler.

Docelowy rytm:

```text
dzień
→ sleep/rest/home/private life
→ ewentualna pomoc

wieczór
→ przygotowanie oświetlenia

noc
→ patrol + pochodnia + obrona
```

Mechanizm lokalnego `HelpCall` zostaje poza zakresem tego planu.

### Miner

Na obecnym etapie:

- kopanie / wydobywanie surowców ze złóż.

Istnieją już `SettlementMiningHooks`, `depositMining` i `mine` action. Nie rozszerzać teraz o kopanie studni/równanie terenu — to przyszły zakres istniejących mechanizmów terrain modification.

### Blacksmith

Docelowo:

- ostrzenie mieczy / broni,
- wytwarzanie metalowych przedmiotów,
- sprzedaż metalowych przedmiotów,
- skup rud i węgla,
- zapotrzebowanie gospodarstwa na drewno i wodę.

Recon wykazał, że **pełny system produkcji Blacksmitha nie jest obecnie gotowy**. Nie wolno więc udawać, że istnieje. Ten plan ma przede wszystkim przygotować profesję/household i podłączyć ją do istniejącego inventory/economy/item framework; konkretna produkcja metalowych przedmiotów może wymagać osobnego planu, jeśli brakuje forge/recipe/production primitives.

### Healer / Herbalist

Osobny przyszły plan:

- zioła,
- jagody,
- grzyby,
- inne naturalne zasoby,
- opatrunki,
- proste lekarstwa / leczenie.

Nie implementować tutaj nowych mechanizmów zbierania i leczenia.

### Hunter

Zakres zgodnie z planem `2026-08-20--178--hunter-profession-and-household.md`.

Zakładamy jego realizację przed tym planem. Hunter ma korzystać z istniejących NPC Combat, fauna, inventory, household, storage, cooking i economy. Nie tworzyć drugiego modelu Hunter/Household.

## 4. Profesja jako główny wkład NPC

Profesja określa główny zawodowy wkład NPC/gospodarstwa, ale nie jest whitelistą aktywności.

```text
state + needs + pressures + age + traits + personality
+ profession + household + relationships
        ↓
     decision
        ↓
     strategy
        ↓
      PlannedAction
        ↓
 world / household / economy changes
```

Wykorzystać istniejący `NpcAgent` decision/work/action flow. Nie tworzyć `ProfessionAI`, `ProfessionScheduler` ani równoległego FSM.

NPC może poza pracą:

- odpoczywać,
- spacerować,
- spotykać innych,
- korzystać z Social Places, gdy plan 151 będzie dostępny,
- łowić ryby,
- pomagać innym.

## 5. Gospodarstwo i wspólna praca

Profesja może być wykonywana przez gospodarstwo, niekoniecznie wyłącznie przez właściciela profesji.

```text
profession
   ↓
household
   ├─ adult professional
   ├─ spouse
   └─ children
        ↓
 shared work / resources
```

Przykład: Farmer i jego żona wspólnie zajmują się polem i zwierzętami. Blacksmith może otrzymywać drewno/wodę od rodziny lub z istniejącego obiegu zasobów. Nie tworzyć osobnych „profession storages”.

## 6. Wiek a intensywność pracy

`FamilyMember.age` jest już pierwszoklasową daną wieku (`0..100`) w `src/settlement/families.ts`. Obecne generowanie ma:

```text
adult: 18–70
child: 0–17
```

Nie trzeba tworzyć nowego systemu age.

Docelowa warstwa pracy:

### Małe dzieci

- tylko zabawa, chodzenie, obserwowanie,
- 0% pracy.

### Duże dzieci

- nadal dużo zabawy,
- pomagają rodzicom,
- około **25–50% czasu pracy rodzica**,
- pomoc ograniczona do istniejących, bezpiecznych czynności danej profesji.

Nie tworzyć osobnego „child profession AI”; ograniczenie powinno działać na istniejącym schedule/decision/action flow.

### Dorośli

- normalna profesja,
- ~100% udziału.

### Starzy

- prawie normalna profesja,
- ~80–100% orientacyjnego udziału,
- więcej odpoczynku, spacerów i łowienia ryb.

### Bardzo starzy

- głównie chodzenie, spokojne aktywności i łowienie,
- tylko lekka/okazjonalna pomoc.

Dokładne progi „małe/duże/stary/bardzo stary” trzeba wyprowadzić z istniejącego age modelu po recon, zamiast tworzyć arbitralne równoległe enumy.

## 7. Dziedziczenie profesji

Dziecko może przejąć profesję rodzica.

`families.ts` już tworzy rodziny i ma `FamilyMember.character.role`, więc implementacja powinna rozszerzyć istniejące family generation.

Do ustalenia podczas implementacji:

- co robi dziecko przy rodzicach o różnych profesjach,
- czy wybiera jedną z profesji rodziców deterministycznie,
- jak działa brak odpowiedniej profesji rodzica,
- jak profesja pozostaje po osiągnięciu dorosłości.

Nie tworzyć niezależnego systemu genealogii/profession inheritance.

## 8. Generowanie profesji i wielkość osady

Recon potwierdził obecne rozmiary:

```text
OUTPOST → 1 rodzina
SM      → 1–3 rodziny
MD      → 3–5 rodzin
LG      → 5–7 rodzin
XL      → 7–9 rodzin
```

To jest **rodziny**, nie bezpośrednio liczba NPC. Obecne `SOLO_CHANCE` i `COUPLE_WITH_CHILD_CHANCE` dodatkowo wpływają na populację.

Obecny `characterForSeed()` losuje role z zamkniętego `RANDOM_ROLES`, a `generateFamilies()` może wymuszać role wynikające z istotnych zasobów (`RESOURCE_ROLE`). Obecnie `trader` jest reserved.

To oznacza, że obecny generator nie gwarantuje jeszcze kompletnego zestawu profesji. Implementacja powinna przejść z czystego losowania do **minimalnych wymagań obsady**, ale zachować istniejący deterministyczny generation model.

Docelowo:

```text
village size
    ↓
population capacity
    ↓
minimum profession requirements
    ↓
environment/resource modifiers
    ↓
families + NPC roles
```

Nie każda profesja musi występować w każdej osadzie.

Przykładowe zależności środowiskowe:

```text
woda / jezioro → Fisher
las             → Woodcutter
złoża            → Miner
Hunter           → zgodnie z planem 178 + fauna/environment
większa osada    → Trader / Blacksmith / więcej specjalistów
```

Dolne limity `SM`/`MD` mogą wymagać podniesienia, jeżeli minimalny zestaw profesji nie mieści się w obecnej populacji. **Nie zmieniać liczb w ciemno** — najpierw policzyć realną populację generowanych rodzin i zaproponować minima.

## 9. Redundancja profesji

Model powinien rozróżniać:

- minimalną obsadę,
- docelową liczbę,
- dodatkowe zapotrzebowanie.

Nie zakładać „1 NPC = 1 profesja”. Przykładowo Farmer może występować wielokrotnie, a Trader/Blacksmith znacznie rzadziej.

W przyszłości brak profesji może stać się problemem/pressure osady, ale nie tworzyć tego mechanizmu w tym planie.

## 10. Przedmioty profesji

### Kosa (`scythe`)

Dodać nowy normalny item tylko po potwierdzeniu, że nie istnieje już pod inną nazwą.

Kosa ma być:

- kategorią `tool`,
- kategorią `weapon`,
- holdable,
- capability rolniczą dopasowaną do rzeczywistej operacji, **bez dodawania capability tylko po to, aby mieć etykietę `farmer`**,
- istniejącą konfiguracją `melee`,
- podłączona do istniejącego NPC/player combat resolvera przez `ITEM_CATALOG[kind].melee`.

Jeżeli zbieranie plonów obecnie nie wymaga narzędzia, nie należy tworzyć sztucznego gate'a tylko dla kosy. Najpierw wskazać konkretną istniejącą akcję, którą kosa ma wykonywać.

Kosa powinna zostać sprawdzona względem istniejącego weapon maintenance (`sharpness`/`durability`). Nie implementować osobnej durability kosy.

### Inne narzędzia

Recon pokazał, że podstawowe narzędzia już istnieją: axe, shovel, pickaxe, fishing_rod, sickle, pitchfork, wooden_torch, firestarter.

Dlatego nie dodawać automatycznie nowych itemów dla każdej profesji. Najpierw mapować istniejące itemy do konkretnych działań.

## 11. Profesja a ekonomia

Wykorzystać istniejący przepływ:

```text
world resources
    ↓
NPC PlannedAction / work
    ↓
Household
    ↓
consumption / storage / surplus
    ↓
SettlementEconomy / trade
```

Nie tworzyć osobnej ekonomii profesji.

Dla Woodcuttera i Minera wykorzystać istniejące production/resource hooks. Dla Fishera wykorzystać istniejące fishing. Dla Huntera — model 178. Dla Blacksmitha najpierw ustalić, które elementy produkcji już istnieją.

## 12. Implementacja — kolejność

### Phase 0 — reconnaissance completed

Potwierdzone punkty wejścia:

- `src/ai/characters.ts` — `Role`, `CharacterDef`, role generation;
- `src/ai/schedule.ts` — role schedules + overlays;
- `src/ai/NpcAgent.ts` — FSM, `PlannedAction`, work actions, carried Inventory;
- `src/settlement/families.ts` — family/age/role generation;
- `src/settlement/household.ts` — household stock;
- `src/economy/` — settlement economy;
- `src/items/Inventory.ts` — shared inventory;
- `src/items/itemCatalog.ts` — item capabilities/combat configs;
- `src/items/HeldTool.ts` — held tool ownership;
- `src/items/weaponMaintenance.ts` — weapon sharpness/durability;
- `src/terrain/depositMining.ts` / mining hooks — Miner;
- `src/world/treeLifecycle.ts` / `treeHarvest.ts` — Woodcutter;
- `src/world/fishing.ts` — Fisher;
- `src/world/plantedCrops.ts` / `CropLifecycle` and garden systems — Farmer;
- `src/items/tradeCatalog.ts` — Trader;
- `src/ai/npcCombat.ts` / role weapon loading — combat integration.

### Phase 1 — role/profession model

- rozszerzyć istniejący `Role`, nie tworzyć `Profession` parallel type;
- dodać `hunter` zgodnie z założeniem realizacji 178;
- dodać `blacksmith` i `healer/herbalist` jako role tylko wtedy, gdy planowana implementacja potrzebuje ich już na runtime; jeżeli Healer pozostaje odroczony, nie wprowadzać pustej aktywnej profesji;
- rozdzielić reserved-role generation od random role generation bez łamania quest-critical reserved NPCs.

### Phase 2 — profession schedules/actions

Rozszerzyć `SCHEDULE_TEMPLATES` i istniejący `work` decision path.

Nie tworzyć nowych schedulerów.

- Farmer → istniejące cultivation/animal actions;
- Woodcutter → istniejące chop/wood production;
- Fisher → existing fishing action/path;
- Miner → existing mine action;
- Trader → existing merchant/workplace behaviour;
- Guard → existing combat + fire/torch actions, nocny schedule;
- Blacksmith → tylko istniejące produkcyjne primitives, resztę oznaczyć jako zależność/osobny plan;
- Hunter → zgodnie z 178.

### Phase 3 — household participation + age

- rozszerzyć istniejący household/member model;
- zastosować age-based work intensity w decyzji o `work`, zamiast mnożyć osobne schedule templates;
- duże dzieci: około 25–50% pracy rodzica;
- starzy: ~80–100%, ale większa częstotliwość rest/leisure/fishing;
- bardzo starzy: lekka pomoc + leisure/fishing;
- zachować potrzeby/interruptions istniejącego NPC FSM.

### Phase 4 — profession generation

- rozszerzyć `generateFamilies()` / role generation;
- zachować deterministic seeded generation;
- wprowadzić minimalne profession requirements per village size;
- uwzględnić `RESOURCE_ROLE`/terrain resources;
- policzyć realną populację rodzin przed ustaleniem nowych dolnych limitów;
- nie łamać reserved NPCs i istniejących quest assumptions.

### Phase 5 — items

- dodać `scythe` do `ItemKind`/`ITEM_DEFS`/`ITEM_CATALOG` oraz odpowiednich katalogów/spawnerów tylko po potwierdzeniu braku istniejącego odpowiednika;
- ustawić `tool + weapon`, holdable i `melee`;
- dobrać capability do realnej operacji rolniczej;
- rozważyć istniejący weapon maintenance, bez nowego durability systemu;
- nie dodawać innych nowych itemów bez konkretnej istniejącej akcji, która ich potrzebuje.

## 13. Poza zakresem

- `HelpCall` / lokalne wezwanie pomocy dla Guard;
- pełny Healer / Herbalist;
- produkcja metalowych przedmiotów Blacksmitha, jeśli wymaga nowych forge/recipe/production primitives — osobny plan po recon;
- Miner → studnie/równanie terenu;
- pełny Social Places — plan 151;
- nowa ekonomia / storage / inventory;
- osobny profession AI/scheduler/FSM;
- LLM-driven simulation;
- przebudowa Huntera poza integracją wynikającą z 178.

## 14. Verification

### Automated

- testy role/profession mapping;
- deterministic profession generation;
- minimal profession coverage per village size;
- age → work intensity;
- profession inheritance;
- item catalog/capability/melee mapping dla kosy;
- istniejące work/action/economy tests;
- typecheck;
- lint;
- build;
- pełny test suite.

### Browser/gameplay

Sprawdzić świeży świat z małą, średnią i dużą osadą:

1. wymagane profesje są generowane;
2. nie występuje nadmierne skupienie jednej profesji;
3. Farmer i household pracują razem;
4. duże dzieci pomagają przez ograniczoną część czasu;
5. dorośli pracują normalnie;
6. starzy częściej odpoczywają/spacerują/łowią;
7. bardzo starzy wykonują tylko lekką pomoc;
8. Woodcutter realnie pozyskuje drewno;
9. Fisher realnie łowi;
10. Miner realnie kopie;
11. Trader pozostaje przy handlu;
12. Guard ma aktywną nocną zmianę i światło/pochodnię zgodnie z implementacją;
13. kosa jest poprawnie wyposażana/używana jako tool + weapon;
14. Blacksmith nie odwołuje się do nieistniejącej produkcji;
15. Hunter działa zgodnie z 178.

Nie uznawać zachowania Three.js/gameplay za zweryfikowane bez browser playtestu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
