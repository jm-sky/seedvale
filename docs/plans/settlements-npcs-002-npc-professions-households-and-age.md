# Plan: NPC Professions, Households & Age Activity

**Created:** 2026-08-24
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** 178 ~~069~~ ~~184~~ ~~185~~
**Domain:** `settlements-npcs`

## 1. Cel

Wprowadzić spójny model profesji NPC, ich związku z gospodarstwem domowym, wieku oraz generowania obsady profesji w osadach.

Zakładamy, że **plan 178 — Hunter Profession & Household zostanie wcześniej zrealizowany** i jest punktem odniesienia. Nie tworzyć drugiego modelu Hunter/Household.

Recon potwierdził istniejące fundamenty: `Role`, per-role `Schedule`, `NpcAgent` z `PlannedAction`/FSM, `Household`, settlement economy, inventory, item capabilities oraz weapon maintenance. Implementacja ma je rozszerzyć, a nie tworzyć równoległe systemy.

## 2. Codebase reconnaissance

### Role

`src/ai/characters.ts` posiada obecnie role `woodcutter`, `farmer`, `guard`, `trader`, `miner`, `fisher`. `CharacterDef.role` jest istniejącą daną NPC. Nie tworzyć osobnego typu `Profession`; rozszerzyć istniejący model `Role`.

### Schedule

`src/ai/schedule.ts` posiada `SCHEDULE_TEMPLATES`, `activityAt()`, `nextBoundary()` i `effectiveScheduleFor()` oraz trait overlays. Guard ma już nocną zmianę. Nie tworzyć nowego schedulera. Profesje mają być realizowane przez istniejący `work` intent/action flow.

`social` istnieje w schedule, ale Social Place assignment pozostaje osobnym zakresem planu 151.

### Actions

`NpcAgent` korzysta z `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `InteractionQueue` i wspólnego `goTo → execute`. Istnieją m.in. `chop`, `deposit`, `mine`, `work`. Nie tworzyć osobnego profession FSM.

### Resources / economy

Istnieją ścieżki `commitRoleWork()`, `commitWoodcutterDeposit()`, `WOODCUTTING_PRODUCTION`, mining hooks, settlement economy, food-source hooks i forest hooks. Wykorzystać je zamiast tworzyć równoległą produkcję.

`Household` jest warstwą pomiędzy NPC carrying a `SettlementEconomy`. Nie tworzyć osobnych profession storages.

### Inventory / items

`Inventory` jest wspólnym mechanizmem player/NPC. `NpcAgent.carried` służy do krótkiego przenoszenia.

`src/items/itemCatalog.ts` jest źródłem prawdy dla item metadata. Istnieją capability m.in. `wood_chopping`, `meat_harvesting`, `branch_trimming`, `soil_digging`, `rock_mining`, `fire_starting`, `fishing`; `melee`, `ranged`, `defense` są osobnymi konfiguracjami.

Istnieją m.in.:

```text
shovel       → soil_digging
axe          → wood_chopping + melee
pickaxe      → rock_mining
fishing_rod  → fishing
pitchfork    → melee
sickle       → melee
```

Nie dodawać ponownie istniejących narzędzi.

### Weapon maintenance

Weapon maintenance jest **już zaimplementowane** w `src/items/weaponMaintenance.ts`.

Istnieją:
- per-instance `sharpness` i `durability`,
- zużywanie po trafieniu,
- `getSharpnessDamageModifier()`,
- `sharpenWeapon()`,
- sharpening przez `whetstone`,
- atomowe zużycie whetstone,
- migracja starszych stackowanych broni.

Nie tworzyć nowego systemu maintenance/durability/sharpness.

### Workplace / props

Recon nie wykazał gotowego generycznego `WorkplaceSystem` ani interaktywnego `sharpening station / grindstone`.

Dlatego Blacksmith dostaje **konkretne stanowisko — kamień szlifierski / grindstone — przy swoim domu**, bez tworzenia przedwcześnie ogólnego frameworka workplace.

Docelowo:

```text
Blacksmith household
        ↓
house + assigned grindstone
        ↓
NPC idzie do stanowiska
        ↓
sharpenWeapon(..., 'whetstone')
```

Jeśli kolejne profesje będą potrzebowały podobnych stanowisk, dopiero wtedy rozważyć wspólną abstrakcję.

## 3. Profesje v1

### Farmer

- uprawa pól i ogrodów,
- sadzenie,
- podlewanie,
- pielęgnacja upraw,
- zbieranie plonów,
- opieka nad zwierzętami gospodarstwa.

Farmer i jego żona wspólnie zajmują się uprawą i zwierzętami. `Herder` nie jest osobną profesją. Wykorzystać istniejące crop/garden/animal mechanisms; nie wymyślać nowych czynności.

### Woodcutter

- ścinanie drzew,
- pozyskiwanie drewna.

Wykorzystać istniejące tree lifecycle/harvest oraz production/deposit hooks.

### Fisher

- łowienie ryb.

Wykorzystać istniejący `world/fishing.ts`, `fishing_rod` i capability `fishing`. Nie tworzyć nowego fishing system.

### Trader

- prowadzenie handlu w osadzie,
- głównie przebywanie przy miejscu handlu / centrum osady,
- pomoc innym NPC, gdy nie ma klientów.

Wykorzystać istniejący merchant/trade flow i `tradeCatalog`. Nie tworzyć nowej ekonomii handlu.

### Guard

- patrolowanie osady,
- reagowanie na zagrożenia,
- walka i obrona,
- pomaganie innym NPC,
- zapalanie ognisk,
- zapalanie pochodni,
- nocny patrol z pochodnią.

Wykorzystać istniejący nocny schedule Guarda. `HelpCall` jest poza zakresem.

Docelowy rytm:

```text
dzień
→ odpoczynek / życie prywatne / pomoc

wieczór
→ przygotowanie oświetlenia

noc
→ patrol + pochodnia + obrona
```

### Miner

- kopanie / wydobywanie surowców ze złóż.

Wykorzystać istniejące `mine` action i mining hooks. Kopanie studni oraz równanie terenu pozostają przyszłym zakresem.

### Blacksmith

- ostrzenie mieczy / broni,
- wytwarzanie metalowych przedmiotów,
- sprzedaż metalowych przedmiotów,
- skup rud i węgla,
- zapotrzebowanie gospodarstwa na drewno i wodę.

#### Ostrzenie

Weapon maintenance jest gotowe. Blacksmith ma korzystać z istniejącego `sharpenWeapon()` oraz `whetstone`.

Przy domu Blacksmitha powinien znajdować się **kamień szlifierski / grindstone**. Ostrzenie jest akcją wykonywaną przy tym stanowisku.

Nie tworzyć nowego sharpening/maintenance system.

#### Produkcja

Recon nie potwierdził kompletnego forge/recipe/metal-production systemu. Nie udawać, że istnieje. Jeżeli obecne primitives nie wystarczą do produkcji metalowych przedmiotów, wydzielić ją do osobnego planu.

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

Zakres zgodnie z `2026-08-20--178--hunter-profession-and-household.md`. Zakładamy realizację 178 przed tym planem. Nie tworzyć drugiego modelu Hunter/Household.

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

Poza pracą NPC może odpoczywać, spacerować, spotykać innych, korzystać z Social Places po planie 151, łowić ryby i pomagać innym.

## 5. Gospodarstwo i wspólna praca

Profesja może być wykonywana przez gospodarstwo, nie tylko przez właściciela profesji.

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

Farmer i jego żona wspólnie zajmują się polem i zwierzętami. Blacksmith może otrzymywać drewno/wodę od rodziny lub z istniejącego obiegu zasobów.

## 6. Wiek a intensywność pracy

`FamilyMember.age` już istnieje. Nie tworzyć nowego systemu age.

### Małe dzieci
- tylko zabawa, chodzenie, obserwowanie,
- 0% pracy.

### Duże dzieci
- nadal dużo zabawy,
- pomagają rodzicom,
- około **25–50% czasu pracy rodzica**,
- pomoc ograniczona do istniejących i bezpiecznych czynności danej profesji.

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

Dokładne progi wieku należy wyprowadzić z istniejącego age modelu.

## 7. Dziedziczenie profesji

Dziecko może przejąć profesję rodzica. Wykorzystać istniejący `families.ts` i `FamilyMember.character.role`.

Do ustalenia podczas implementacji:
- profesja przy rodzicach o różnych profesjach,
- deterministyczny wybór profesji,
- zachowanie profesji po osiągnięciu dorosłości.

Nie tworzyć niezależnego systemu genealogii/profession inheritance.

## 8. Generowanie profesji i wielkość osady

Obecne rozmiary:

```text
OUTPOST → 1 rodzina
SM      → 1–3 rodziny
MD      → 3–5 rodzin
LG      → 5–7 rodzin
XL      → 7–9 rodzin
```

Obecny generator losuje role i może wymuszać role wynikające z istotnych zasobów. Nie gwarantuje kompletnego zestawu profesji.

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

```text
woda / jezioro → Fisher
las             → Woodcutter
złoża           → Miner
większa osada   → Trader / Blacksmith / więcej specjalistów
```

Dolne limity SM/MD mogą wymagać podniesienia. Najpierw policzyć realną populację rodzin, potem ustalić minima.

## 9. Redundancja profesji

Rozróżnić:
- minimalną obsadę,
- docelową liczbę,
- dodatkowe zapotrzebowanie.

Nie zakładać `1 NPC = 1 profesja`. Brak profesji może w przyszłości stać się problemem/pressure osady, ale nie implementować tego teraz.

## 10. Przedmioty profesji

### Kosa (`scythe`)

Dodać nowy item tylko po potwierdzeniu, że nie istnieje już pod inną nazwą.

Kosa ma być:
- `tool`,
- `weapon`,
- holdable,
- podłączona do istniejącej konfiguracji `melee`,
- wyposażona w capability tylko wtedy, gdy istniejąca akcja rolnicza rzeczywiście jej potrzebuje.

Jeżeli kosa ma być objęta maintenance, dodać ją do istniejącego `WEAPON_MAINTENANCE_KIND_LIST` i używać istniejącego `sharpenWeapon()`/`whetstone`.

Nie tworzyć osobnego durability system.

## 11. Ekonomia

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

## 12. Implementacja — kolejność

### Phase 0 — reconnaissance

Recon wykonany dla role, schedule, actions, households, economy, inventory, item catalog, weapon maintenance, mining, trees, fishing i profession flows.

### Phase 1 — role/profession model

- rozszerzyć istniejący `Role`,
- zintegrować `hunter` zgodnie z 178,
- dodać aktywne profesje wymagane przez implementację,
- nie tworzyć parallel profession model.

### Phase 2 — profession schedules/actions

Rozszerzyć istniejący `SCHEDULE_TEMPLATES` i `work` decision path:
- Farmer → istniejące cultivation/animal actions;
- Woodcutter → istniejące chop/wood production;
- Fisher → existing fishing path;
- Miner → existing mine path;
- Trader → existing merchant/work flow;
- Guard → existing combat + lighting actions, nocny schedule;
- Blacksmith → existing sharpening + grindstone workplace; produkcja metalu tylko jeśli istniejące primitives pozwalają;
- Hunter → zgodnie z 178.

### Phase 3 — household participation + age

- rozszerzyć istniejący household/member model;
- zastosować age-based work intensity w istniejącym decision/schedule flow;
- duże dzieci: 25–50%;
- starzy: ~80–100%, więcej rest/leisure/fishing;
- bardzo starzy: lekka pomoc + leisure/fishing.

### Phase 4 — profession generation

- rozszerzyć family/role generation;
- zachować deterministic seeded generation;
- wprowadzić minimalne profession requirements per village size;
- uwzględnić environment/resource modifiers;
- policzyć realną populację rodzin przed zmianą dolnych limitów;
- nie łamać reserved NPCs.

### Phase 5 — items & Blacksmith workplace

- dodać `scythe` tylko jeśli brak odpowiednika;
- ustawić `tool + weapon`, holdable i istniejące `melee`;
- capability tylko dla realnej akcji;
- opcjonalnie dołączyć kosę do istniejącego maintenance setu;
- dodać prosty **grindstone/sharpening station przy domu Blacksmitha**;
- podłączyć akcję ostrzenia do istniejącego `sharpenWeapon()` i `whetstone`;
- nie tworzyć generalnego WorkplaceSystem, dopóki kolejna profesja go realnie nie potrzebuje.

## 13. Poza zakresem

- `HelpCall` / lokalne wezwanie pomocy;
- pełny Healer / Herbalist;
- pełna produkcja metalowych przedmiotów Blacksmitha, jeśli wymaga nowych forge/recipe/production primitives;
- Miner → studnie/równanie terenu;
- pełny Social Places — plan 151;
- nowa ekonomia / storage / inventory;
- osobny profession AI/scheduler/FSM;
- LLM-driven simulation;
- przebudowa Huntera poza integracją wynikającą z 178.

## 14. Verification

### Automated

- role/profession mapping;
- deterministic profession generation;
- minimum profession coverage per village size;
- age → work intensity;
- profession inheritance;
- item catalog/capability/melee mapping dla kosy;
- weapon maintenance integration;
- Blacksmith sharpening uses existing `whetstone` correctly;
- existing work/action/economy tests;
- typecheck;
- lint;
- build;
- full test suite.

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
13. Blacksmith korzysta z grindstone i istniejącego weapon maintenance;
14. kosa jest poprawnie wyposażana/używana jako tool + weapon;
15. Blacksmith nie odwołuje się do nieistniejącej produkcji;
16. Hunter działa zgodnie z 178.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
