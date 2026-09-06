# Plan: Sheep wool cycle and shepherd

**Created:** 2026-08-29  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** L  
**Depends on:** npc-006, fauna-012, fauna-016, settlements-npcs-014  
**Domain:** `fauna`  
**Subdomains:** `domestication`  
**Tags:** `settlements-npcs` `items-player` `work` `economy`  
**Roadmap:** `textiles-and-herbal-medicine`

## Cel

Pierwszy etap tekstyliów: rzeczywista produkcja wełny przez istniejące owce oraz pasterz jako normalny uczestnik NPC work simulation.

Zakres:

- wspólny kalendarz 48 dni/rok i 12 dni/sezon,
- 24-dniowy cykl wzrostu wełny,
- 4 wool na strzyżenie, czyli nominalnie 2 strzyżenia / 8 wool na rok,
- normalny item `wool` i narzędzie z capability `shearing`,
- shepherd jako `Role` korzystający z istniejącego schedule/work arbitration,
- fizyczne strzyżenie własnych owiec,
- opieka nad stadem oparta o aktualne fauna roaming/threat/navigation mechanisms,
- dostarczenie wełny do istniejącego household goods flow.

Nie tworzyć osobnych systemów dla wełny, pasterza, pastwisk, pathfindingu ani ochrony stada.

## Aktualny fundament architektoniczny

Plan powstał przed kilkoma późniejszymi zmianami. Implementacja ma traktować **aktualny kod** jako źródło prawdy i korzystać z nowych fundamentów zamiast realizować starsze uproszczenia planu.

### Fauna

Owca jest normalnym `AnimalAgent` z istniejącym:

- `ownerHouseId` / household ownership,
- livestock production,
- species configuration,
- herd/local movement,
- threat/flee/combat arbitration,
- shared navigation/pathfinding,
- habitat/roaming/trip behaviour.

`fauna-012` rozwinęła semantic threat perception, a `fauna-016` species-specific roaming i celowe trips. Shepherd nie może omijać tych mechanizmów przez ręczne przesuwanie owiec lub równoległy herding FSM.

### NPC work

`NpcAgent` ma normalny schedule, decision/arbitration, `PlannedAction`, movement/navigation, profession work i carried inventory. Work Contracts są osobnym, authoritative mechanizmem dla jawnych zobowiązań pracownik–pracodawca.

Codzienna opieka pasterza nad własnym household livestock **nie jest WorkContract**. Shepherd pozostaje zwykłą profesją/schedule work. Nie tworzyć automatycznych kontraktów na strzyżenie własnych owiec.

### Economy / goods

Aktualny obieg dóbr rozróżnia realne `Household.items`, carried inventory, settlement storage i kwalifikujące się local circulating goods. `settlements-npcs-014` nie oznacza, że każdy item automatycznie trafia do `SettlementEconomy`.

W tym planie authoritative destination dla świeżo wyprodukowanej wełny to przede wszystkim:

```text
sheep
→ shepherd carried inventory
→ owner Household.items
```

Jeżeli aktualna klasyfikacja local circulating goods pozwala bezpiecznie włączyć `wool` jako surowiec produkcyjny, zrobić to przez ten wspólny mechanizm. Nie dodawać `EconomicKind.wool`, `WoolStorage`, specjalnego settlement stock ani teleportowanego transferu tylko po to, aby domknąć ten plan.

## 1. Kalendarz

Aktualny świat nadal używa krótszego sezonu. Zmiana jest globalna, nie sheep-local.

Docelowo:

```text
1 rok     = 48 dni
1 sezon   = 12 dni
4 sezony  = 48 dni
```

Przed zmianą prześledzić aktualne użycia `DAYS_PER_SEASON`, `getSeason()`, `getSeasonProgress()` oraz hard-coded założenia długości sezonu/roku w weather, climate, fauna i testach.

Nie tworzyć osobnego kalendarza dla wool cycle. Zachować pure/absolute-world-time semantics i poprawność przy time skip.

## 2. Wool cycle

Rozszerzyć istniejący wzorzec `livestockProduction.ts`, ale zachować osobny anchor od milk/egg production.

Minimalny stan owcy:

```ts
woolReadyAtDays: number | null
```

Parametry:

```text
WOOL_GROWTH_DAYS = 24
WOOL_YIELD = 4
```

Semantyka:

- pierwszy anchor jest deterministycznie staggerowany zgodnie z istniejącym livestock production pattern,
- `nowDays >= woolReadyAtDays` oznacza gotowość,
- gotowość nie wygasa,
- po udanym strzyżeniu `woolReadyAtDays = nowDays + 24`,
- brak per-frame decrement i catch-up replay,
- milk production anchor pozostaje niezależny.

Nie implementować wpływu rasy, wieku, zdrowia, żywienia ani sezonu.

## 3. Wool i shears

Dodać `wool` jako zwykły stackowalny `ItemKind`, bez durability i `ItemInstance`.

Dodać narzędzie do strzyżenia przez istniejący item catalog/capability model. Preferowana capability: `shearing`.

NPC sprawdza capability, nie konkretny `ItemKind`. Shears muszą być rzeczywiście dostępne pasterzowi przez istniejący NPC loadout/provisioning seam; samo dodanie capability do katalogu nie wystarcza.

Nie tworzyć `ShearsSystem` ani specjalnego inventory.

## 4. Shepherd role i assignment

Dodać `shepherd` do istniejącego `Role` i exhaustive role-owned konfiguracji, w tym schedule.

Shepherd assignment musi być **livestock-aware**. Nie dodawać `shepherd` bezwarunkowo do random role pool, bo tworzyłoby to pasterzy bez owiec oraz sheep households bez opiekuna.

Preferować najmniejszy istniejący settlement/family role-assignment seam, który widzi household/livestock composition. Assignment powinien być deterministyczny.

Nie tworzyć nowego `Profession` ani drugiego staffing systemu. Jeżeli aktualny staffing code ma już właściwy hook, rozszerzyć go.

## 5. Shepherd work arbitration

Shepherd work jest normalną pracą profesji i musi współistnieć z aktualną NPC arbitration:

```text
critical needs / threat / higher priority interruption
→ normal NPC arbitration
→ shepherd work opportunity
```

W ramach shepherd work priorytet:

```text
owned sheep under immediate relevant threat
→ ready owned sheep / shearing
→ deposit carried wool
→ flock care / grazing presence
→ generic work fallback
```

Nie tworzyć permanentnego shepherd mode. Akcje mają być bounded, interruptible i wybierane na istniejących decision/action boundaries, nie co frame.

Work Contracts nie przejmują tej rutyny. Jeżeli w przyszłości gracz zatrudni pasterza przez contract system, kontrakt powinien być osobnym źródłem zobowiązania korzystającym z tych samych działań, a nie drugim shepherd implementation; to pozostaje poza zakresem.

## 6. Owned flock selection

Shepherd działa tylko na sheep należących do właściwego household.

Wykorzystać istniejące ownership (`ownerHouseId` / household relation) i bounded settlement-local lookup. Nie skanować całej fauny świata.

Wybór celu:

- deterministyczny,
- stabilny przez czas akcji,
- preferuje owcę wymagającą konkretnej pracy,
- po przerwaniu ponownie przechodzi przez normalną arbitration.

## 7. Shearing jako transakcja PlannedAction

Flow:

```text
select owned ready sheep
→ validate tool + carry capacity
→ normal goTo/navigation
→ execute
→ live revalidation
→ add exactly 4 wool
→ advance wool anchor
→ later deposit
```

Na completion ponownie sprawdzić:

- sheep żyje,
- nadal należy do właściwego household,
- nadal jest wool-ready,
- shepherd nadal ma `shearing` capability,
- carried inventory może przyjąć pełny yield.

Dopiero po sukcesie utworzyć wool i przesunąć anchor. Interrupt/path failure nie może produkować ani kasować wełny.

## 8. Navigation i interaction destination

Wszystkie dojścia pasterza do sheep/home/storage/punktu pracy korzystają z **shared NPC/animal Navigation** z `npc-006` oraz istniejącego watchdog/repath lifecycle.

Nie implementować bezpośredniego ruchu po linii prostej jako shepherd-specific fallback i nie tworzyć drugiego pathfindera.

Sheep może się poruszać podczas podejścia. Zachować target identity, a repath wykonywać przez istniejące reguły dla moving target / blocked path; repath nie oznacza ponownego wyboru innej owcy.

## 9. Wypas i flock care po fauna-016

Starsza wersja planu zakładała wybór osobnego `pasture point` i ręczne zawracanie oddalonej owcy. Po `fauna-016` należy tego nie traktować jako nowego movement subsystem.

MVP:

- sheep zachowują własne species/local roaming behaviour i `home`,
- shepherd podczas work pozostaje w pobliżu owned flock / sensownego local work area,
- shepherd może podejść do odseparowanej owned sheep jako bounded work action,
- nie teleportuje ani nie steruje bezpośrednio pozycją owcy,
- nie nadpisuje aktywnego flee/threat/trip behaviour owcy,
- nie resetuje animal `home`/trip state tylko dlatego, że trwa shepherd work.

Jeżeli potrzebne jest rzeczywiste kierowanie owcy z powrotem, dodać jedynie mały bodziec/intent przez istniejący fauna decision seam. Nie implementować `return toward flock` jako bezpośredniego movement override.

Nie tworzyć `Pasture` entity w tym planie.

## 10. Threat/flee i ochrona stada

Ochrona ma wykorzystywać aktualne combat/threat ownership i semantic perception z `fauna-012`.

Najbardziej wiarygodnym triggerem jest aktualne/świeże zagrożenie skierowane na owned sheep, np. predator attack/committed threat, a nie sama obecność drapieżnika gdzieś w osadzie.

Flow:

```text
existing combat/threat state or semantic stimulus
→ shepherd-owned-flock relevance
→ normal NPC decision/interrupt
→ existing NPC combat/navigation
```

Nie tworzyć `ShepherdCombatAI`, drugiego threat registry ani callbacku predator→shepherd. Flee owcy pozostaje własnością `AnimalAgent`; shepherd nie może wyłączać lub zastępować animal flee.

Jeżeli NPC threat perception nadal nie konsumuje potrzebnej read-only informacji z fauna threat state, dodać najmniejszy reusable bridge/query. Nie kopiować combat target state do shepherd.

## 11. Delivery i economy integration

Po strzyżeniu wool jest realnym itemem w carried inventory. Następnie shepherd wykonuje fizyczny deposit przez istniejący household/storage action flow.

Minimalny wymagany rezultat:

```text
4 wool
→ NpcAgent.carried
→ physical return/deposit
→ owner Household.items
```

Wool nie jest food i nie może używać food-only deposit/acquisition semantics.

Jeżeli `wool` zostanie zakwalifikowane jako local circulating production good, dalszy przepływ do settlement storage ma korzystać z istniejącego LocalGoodsFlow/physical transport. Ten plan nie ma tworzyć specjalnej automatycznej ścieżki `Household.items → SettlementEconomy`.

Plan `settlements-npcs-006-wool-to-material.md` powinien później konsumować ten sam realny stock zamiast tworzyć abstrakcyjne wool units.

## 12. Time skip, off-screen i persistence

Wool readiness jest absolute-time state:

```text
readyAt = 24
now = 30
→ ready
```

Nie replayować pominiętych dni ani kolejnych nieodebranych strzyżeń. Owca gotowa od dawna nadal reprezentuje jeden aktualny fleece/yield, nie automatycznie wiele zaległych zbiorów.

Zachować aktualny kontrakt persistence fauny. Jeżeli runtime `AnimalAgent` nadal nie jest pełnym persistent snapshotem, nie dodawać partial persistence tylko dla wool. Wool ma być zgodne z istniejącym livestock production lifecycle.

## 13. Performance i determinism

- brak globalnego `every shepherd × every sheep` per frame,
- owned-flock lookup bounded i wykonywany w work/decision cadence,
- threat relevance wykorzystuje istniejące bounded/recent threat information,
- navigation request-based, nie per frame,
- brak shepherd-driven ciągłego rescoringu habitat/roaming,
- deterministyczne assignment, target selection i initial wool staggering,
- zachować możliwość przyszłej hybrid/off-screen simulation.

## 14. Testy

### Calendar / wool

- 12-day season boundaries i 48-day year,
- wool before/at/after 24 days,
- deterministic initial staggering,
- reset tylko po udanym shearing,
- long time skip daje jeden ready fleece, nie wielokrotny catch-up yield,
- milk/egg production bez regresji.

### Assignment / ownership

- sheep household może deterministycznie otrzymać shepherd zgodnie z aktualnym staffing seam,
- shepherd bez owned sheep nie jest tworzony przez bezwarunkowy random assignment,
- shepherd targetuje tylko owned sheep.

### Action / tool / inventory

- brak `shearing` capability blokuje akcję,
- capacity failure nie zmienia wool state,
- interruption/path failure nie tworzy wool,
- live revalidation chroni przed duplicate yield,
- sukces daje dokładnie 4 wool i przesuwa anchor.

### Fauna integration

- shepherd work nie nadpisuje sheep flee,
- active animal trip/threat state nie jest resetowany przez flock care,
- moving sheep zachowuje target identity podczas NPC repath,
- owned sheep threat może wejść do normalnego NPC protection/combat decision,
- unrelated animal threat jest ignorowany.

### Economy

- wool trafia do realnego `Household.items`,
- ilość jest zachowana przez carried/deposit flow,
- wool nie używa food-only path,
- ewentualny local circulation korzysta ze wspólnego goods flow.

## 15. Manual verification

Manual verification wykonuje użytkownik w przeglądarce.

Sprawdzić co najmniej:

1. Settlement z sheep otrzymuje sensownego shepherd przez livestock-aware assignment.
2. Shepherd wykonuje normalny schedule i może zostać przerwany przez potrzeby/zagrożenie.
3. Sheep nadal korzystają z własnego roaming/flee behaviour.
4. Shepherd podchodzi do moving sheep przez shared navigation bez teleportacji i shepherd-specific pathingu.
5. Ready sheep jest ostrzyżona dokładnie raz i daje 4 wool.
6. Wool trafia fizycznie do household inventory.
7. Po 24 dniach sheep ponownie staje się ready; time skip działa bez replay.
8. Milk production tej samej sheep nadal działa niezależnie.
9. Predator atakujący owned sheep może wywołać sensowną reakcję shepherd, a odległe/nieistotne zagrożenie nie.
10. Kilka sheep/shepherds nie powoduje widocznego pathfinding/threat scan spam.

## 16. Kryteria ukończenia

- [ ] wspólny kalendarz działa w modelu 48 dni/rok, 12 dni/sezon bez regresji weather/climate,
- [ ] sheep ma niezależny 24-dniowy wool cycle,
- [ ] shearing daje dokładnie 4 wool i resetuje tylko wool anchor,
- [ ] istnieją `wool`, shears i capability `shearing`,
- [ ] shepherd jest normalnym `Role` z livestock-aware assignment i schedule,
- [ ] shepherd korzysta z normalnej NPC work arbitration i `PlannedAction`,
- [ ] shared Navigation obsługuje dojście/repath,
- [ ] flock care nie omija fauna roaming/trip/flee ownership,
- [ ] ochrona stada korzysta z istniejącego threat/combat information flow,
- [ ] wool trafia do realnego household goods flow bez wool-specific economy,
- [ ] time skip/off-screen nie wymaga catch-up replay,
- [ ] automated checks przechodzą,
- [ ] browser/gameplay verification przechodzi.

## Poza zakresem

- yarn, spinning, weaving i wool cloth,
- flax, bandages, herbs, clay/pottery,
- sheep breeds i wool quality,
- age/health/nutrition/season effects on wool,
- visual wool growth,
- breeding,
- dedicated Pasture entity/system,
- advanced herding / flock commands,
- shepherd-specific combat AI,
- osobny fauna/NPC pathfinder,
- pełna fauna runtime persistence,
- automatyczne Work Contracts dla shepherd routine,
- persistent shepherd wages/household payroll.

## Następny etap

`settlements-npcs-006-wool-to-material.md` może budować na realnym stocku:

```text
wool
→ yarn
→ wool cloth
```

Nie implementować przetwarzania w tym planie.

## Implementation guidance

Aktualizować `docs/plans/implementation-notes/fauna-004-sheep-wool-and-shepherd-implementation-notes.md` zgodnie z aktualnym codebase. Dla nowych ważnych publicznych granic dodać JSDoc tam, gdzie poprawia discovery; sugerowany `@domain fauna` / `@domain npc` zgodnie z ownership.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
