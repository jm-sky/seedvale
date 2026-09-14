# Plan: Horse training progression, vendor and paddock

**Created:** 2026-09-14
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** settlements-009, settlements-012
**Domain:** `settlements`
**Type:** `feature`
**Roadmap:** -
**Model:** Opus, Sonnet

## Cel

Rozwinąć istniejący system koni tak, aby konkretny koń posiadał trwały stan wyszkolenia i mógł w przyszłości płynnie rozwijać się razem z graczem, a większe osady mogły posiadać wyspecjalizowanego sprzedawcę koni z fizycznym ogrodzonym wybiegiem.

Docelowo:

```text
horse AnimalAgent
+ persistent HorseTrainingState
→ effective mount behaviour
→ derived label: ordinary / trained / warhorse
```

oraz:

```text
eligible settlement
→ horse-specialized Merchant
→ planned fenced paddock
→ real live horses
→ player buys one concrete AnimalAgent
```

Nie tworzyć drugiego mount systemu, osobnej symulacji vendor horses ani abstrakcyjnych koni istniejących tylko w UI.

## Existing foundations

Aktualny kod posiada już:

- `AnimalKind = 'horse'`;
- `AnimalAgent` jako authoritative owner HP, stamina, position, ownership i stable animal id;
- `AnimalDef.mount` / `MountPointConfig` jako capability jazdy;
- player riding skill wpływający na jazdę;
- istniejący animal hunger/thirst/metabolism/scare flow;
- horse diet przyjmujący m.in. `hay`;
- `AnimalTrough` i istniejący animal water flow;
- settlement livestock z deterministic stable ids;
- `src/settlement/horseAcquisition.ts` i zakup konkretnego żywego horse entity;
- atomic world-entity purchase;
- horse naming po zmianie ownership.

Nie tworzyć `HorseAgent`, `WarHorseAgent`, `MountManager`, `HorseNeedsSystem`, `HorseVendorInventory` ani równoległego systemu handlu.

## 1. Horse training state

Dodać minimalny per-horse persistent state, np.:

```ts
type HorseTrainingState = {
  progress: number
}
```

Dokładny shape dopasować do istniejących conventions persistence. Użyć obiektu, nie nagiego `number`, aby później można było bez migracji API rozszerzyć training state.

Na tym etapie nie dodawać:

- horse potential,
- genetyki,
- ras,
- temperamentu,
- ukrytych bazowych predyspozycji.

## 2. Derived training tier

`ordinary`, `trained`, `warhorse` są derived labels, nie authoritative persisted state.

```text
low progress    → ordinary
medium progress → trained
high progress   → warhorse
```

Nie zapisywać równolegle `trainingProgress` i `trainingTier`, jeśli tier może być wyliczony.

`warhorse` oznacza w tym planie najwyższy poziom wyszkolenia, kontroli, kondycji i odporności na stres. Nie oznacza jeszcze mounted combat.

## 3. Smooth future progression

Architektura musi pozwalać później na:

```text
ordinary → trained → warhorse
```

dla tego samego konia bez:

- podmiany `AnimalAgent`,
- zmiany horse id,
- utraty imienia,
- resetu ownership,
- respawnu,
- zmiany species.

Training należy do konia, nie do właściciela, vendora ani settlement.

## 4. Training progression seam

Pełny gameplay treningu jest poza zakresem, ale dodać jeden kontrolowany mutation boundary dla przyszłych źródeł progresji, np. konceptualnie:

```text
addHorseTrainingProgress(...)
```

Przyszłe źródła mogą obejmować jazdę, podróże, sprint/stamina training, odporność na zagrożenia, ćwiczenia kontroli, NPC trainera lub quest reward.

Nie rozrzucać bezpośredniej mutacji training state po wielu subsystemach.

## 5. Effective mount modifiers

Training powinien rozszerzać istniejące mechanizmy:

```text
AnimalDef horse baseline
+ HorseTrainingState
+ PlayerSkills riding
→ effective mount behaviour
```

Może wpływać na istniejące integration points dla:

- riding speed,
- stamina efficiency/capacity,
- fear/panic resistance,
- forced dismount/throw resistance, jeśli aktualny flow to obsługuje,
- HP/max HP dla wysokiego training tier, jeżeli health model pozwala na czysty modifier.

Nie dodawać nowych mechanik tylko po to, aby tier miał więcej bonusów.

`ordinary` zachowuje obecny baseline. `trained` poprawia głównie kontrolę/stamina/scare. `warhorse` daje przede wszystkim survivability, stamina/control i fear resistance; nie powinien być po prostu dużo szybszym koniem.

## 6. Persistence

Training progress musi przetrwać save/load i zmianę właściciela.

Nie opierać canonical training state wyłącznie na seed, ponieważ późniejszy gameplay ma móc go zmieniać runtime.

Ownership transfer nie resetuje training.

## 7. Horse vendor

Większe settlements mogą posiadać wyspecjalizowanego sprzedawcę koni.

Preferowane po `settlements-012`:

```text
Role = trader
+ Merchant specialization = horses
```

Nie tworzyć osobnej profesji `horse_vendor`, jeśli istniejący Merchant specialization może wyrazić tę funkcję.

Merchant pozostaje normalnym NPC z household, schedule, needs, relationships i lifecycle.

## 8. Ownership boundaries

Twardy podział ownership:

```text
Settlement / VillagePlan → paddock layout and place
Fauna / AnimalAgent      → horse runtime state
Merchant NPC             → operator / seller assignment
Player acquisition       → changes horse ownership
```

Śmierć lub zmiana roli Merchanta nie może despawnować paddocku ani koni. Settlement może później przypisać innego operatora.

## 9. Horse-vendor availability by settlement scale

Początkowe targety dla całego horse-vendor/paddock setup:

```text
SM → 0%
MD → ~10%
LG → ~50%
XL → ~80%
```

To settlement-level outcome probability, nie probability per NPC ani per horse.

Actual staffing nadal musi respektować workforce/population. Size zwiększa eligibility/weight, nie tworzy pracownika z powietrza.

## 10. Horse paddock

Horse vendor posiada fizyczny paddock będący częścią `VillagePlan`.

Paddock zawiera:

```text
fence
+ explicit entrance/gate gap
+ horse area/home anchors
+ AnimalTrough
+ paddock haystack
+ vendor/work anchor
```

Paddock umieszczać raczej przy obrzeżu settlement, połączony z local path/open-space corridor, poza gęstym plaza. Nie musi być poza defensive perimeter.

Reuse existing planner/spacing; nie tworzyć drugiego occupancy systemu.

## 11. Fence and exit

W przeciwieństwie do otwartego pasture z `settlements-009`, vendor paddock jest funkcjonalnie ogrodzonym wybiegiem.

Musi posiadać jawne wyjście/przerwę w ogrodzeniu. Planner zna entrance position/corridor i nie umieszcza tam trough, haystack ani innych propsów.

Wyjście ma być uwzględnione również w horse movement/home logic. Sam wizualny gap nie wystarcza, jeśli roaming/pathing nadal prowadziłby przez płot albo uniemożliwiał wyprowadzenie konia.

Nie implementować pełnego gate-door simulation w v1.

## 12. Paddock capacity

Paddock posiada derived capacity z physical footprint.

Settlement size może sterować footprintem i initial target count, ale nie używać wyłącznie magicznej reguły `LG = N horses` bez capacity guardrail.

```text
paddock footprint → capacity
current vendor horses <= capacity
```

Availability setup i aktualna liczba koni są osobnymi pojęciami.

## 13. Real vendor horses

Każdy koń na wybiegu jest realnym `AnimalAgent` posiadającym normalne:

- id,
- HP,
- hunger,
- thirst,
- stamina,
- training state,
- ownership,
- world position.

Horse vendor nigdy nie sprzedaje abstrakcyjnego konia z katalogu.

Każdy offer row musi rozwiązywać się do konkretnego live `AnimalAgent` w momencie preview i ponownie przy commit.

## 14. Paddock haystack — nowy typ

Dodać osobny typ/variant stogu siana przeznaczony jako źródło pożywienia dla koni w paddocku.

Nie reuse'ować semantycznie obecnego stogu, jeżeli obecny stóg jest miejscem noclegu.

Nowy paddock haystack:

- jest fizycznym propem/food source w paddocku;
- **nie może służyć do spania ani noclegu**;
- jest rozpoznawany przez horse food targeting jako poprawne źródło pożywienia;
- w v1 może być **nieskończonym źródłem pożywienia**;
- nie udaje realnego `hay` inventory i nie wpływa na household/settlement economic stock.

To świadomy tymczasowy wyjątek. Musi zostać odnotowany w `docs/plans/LOOSE-ENDS.md` jako follow-up do zastąpienia realnym finite hay stock/consumption/replenishment.

Nie nazywać tego ogólnym `Haystack` w sposób, który przypadkiem odziedziczy sleep capability. Capability żywienia i capability noclegu muszą pozostać rozdzielone.

## 15. Water trough

Paddock posiada normalny `AnimalTrough` korzystający z istniejącego animal thirst flow.

Nie dodawać `infinite water` ani vendor-horse hydration exception.

Trough musi mieć normalny ownership/storage/replenishment seam zgodny z aktualnym systemem. Implementation recon ma ustalić istniejące authoritative water owner/API zamiast tworzyć nowy paddock-only water store.

Jeżeli trough jest pusty, koń zachowuje się zgodnie z istniejącym thirst/water-source logic.

## 16. Normal animal needs

Vendor horses pozostają zwykłymi zwierzętami i korzystają z istniejących:

- hunger,
- thirst,
- stamina,
- scare,
- food/water targeting.

Jedynym świadomym uproszczeniem v1 jest infinite paddock haystack opisany powyżej i zapisany jako loose end.

Nie tworzyć `PaddockNeedsSystem`.

## 17. Horse home / paddock association

Przed zakupem horse ma stabilny paddock/home/roaming association oparty o istniejący livestock mechanism.

Po zakupie ownership zmienia się natychmiast, ale koń nie musi teleportować się ani natychmiast tracić physical home position.

Preferowany flow:

```text
purchase
→ player becomes owner
→ horse removed from vendor sale pool
→ horse may remain physically in paddock
→ mount/lead/player movement takes it out
→ vendor paddock association is cleared when horse actually leaves / transitions to player-controlled home semantics
```

Nie pozwolić, aby nowy owner powodował natychmiastowe dziwne AI/teleportację.

## 18. Offer and acquisition

Rozszerzyć istniejący horse acquisition seam z pojedynczego merchant wagon horse do wyboru konkretnego live horse z vendor paddock.

Offer pokazuje derived tier/training presentation, ale authoritative source pozostaje horse entity.

Przy commit:

1. ponownie resolve horse;
2. sprawdzić, czy żyje i nadal jest vendor-sale eligible;
3. sprawdzić payment/capacity zgodnie z istniejącym purchase mechanism;
4. wykonać atomic purchase;
5. zmienić ownership tego samego `AnimalAgent`;
6. usunąć go z sale pool;
7. zachować id, HP, stamina, training i name.

Nie despawnować vendora horse i nie spawnować player copy.

## 19. Pricing

Cena konkretnego horse powinna uwzględniać training progress/derived tier przy zachowaniu istniejącego horse purchase mechanism.

```text
ordinary < trained < warhorse
```

Nie tworzyć `HorseEconomy` ani osobnej social pricing formula.

## 20. Initial training distribution

Initial vendor horses mogą zaczynać z różnym training progress.

Size wpływa na distribution, np.:

```text
MD → głównie ordinary, sporadycznie trained
LG → ordinary + trained, high-training rzadki
XL → trained częstsze, warhorse realnie osiągalny ale nadal premium
```

Nie generować tier bezpośrednio; generować initial training progress i derive label.

Targety `0/10/50/80%` dotyczą szansy setup/premium opportunity na poziomie settlement, nie 80% warhorse w XL.

## 21. Multi-merchant compatibility

Jeżeli `settlements-012` tworzy kilku Merchantów:

- jeden paddock ma jednego głównego horse-specialized operatora w v1;
- ten sam horse nie może być oferowany przez kilku NPC;
- specialization assignment jest deterministyczny.

Multiple horse vendors per settlement są poza zakresem.

## 22. Replenishment

V1 może wygenerować initial vendor horse population do capacity.

Po sprzedaży liczba koni spada. Nie respawnować nowego konia przy reopen UI ani natychmiast po zakupie.

Automatyczne replenishment/breeding/inter-settlement supply są poza zakresem. Przyszły mechanizm może uzupełniać ten sam paddock.

## 23. Planner ownership

`VillagePlan` powinien znać co najmniej:

- paddock footprint,
- fence segments,
- entrance/corridor,
- trough anchor,
- paddock-haystack anchor,
- vendor/work anchor,
- horse home/spawn anchors albo dane do ich stabilnego derivation.

Materializer może dobrać visual/model/LOD, ale nie może przesunąć gameplay-relevant propsów poza planned anchors.

## 24. Persistence and invariants

- training progress przeżywa save/load;
- horse ownership pozostaje authoritative;
- sprzedaż nie odtwarza konia w vendor pool po reloadzie;
- tier jest derived;
- merchant death nie usuwa paddocku/horses;
- UI nie pokazuje konia, którego nie można resolve do live `AnimalAgent`;
- ten sam horse nie występuje w dwóch aktywnych offerach;
- paddock haystack nie posiada sleep capability;
- paddock haystack infinite food jest tymczasowym loose end, nie modelem ekonomii.

## 25. Performance

Nie dodawać:

- `HorseVendorManager.tick()`;
- `HorseTrainingManager.tick()`;
- `PaddockNeedsTick()`;
- global horse scans per frame.

Training aktualizować tylko przy realnych training events. Vendor horse needs korzystają z istniejącego fauna update. Offer budować dla konkretnego vendora na żądanie.

## 26. Focused implementation recon

Przed codingiem zweryfikować aktualne symbole/call-sites dla:

- `src/fauna/AnimalAgent.ts`;
- `src/fauna/animalDefs.ts`;
- mount movement/riding actions;
- horse health/stamina;
- scare/fear;
- player mounted state;
- `src/settlement/horseAcquisition.ts`;
- `src/app/inventoryWiring.ts`;
- atomic world-entity purchase;
- `src/settlement/livestock.ts`;
- horse home/wander assignment;
- animal hunger/diet food-source APIs;
- existing haystack/sleep capability and its placement/materialization;
- `AnimalTrough` ownership/storage/replenishment;
- `VillagePlan` / village planner / spacing / paths;
- fencing primitives from `settlements-009`;
- profession staffing and merchant specialization from `settlements-012`.

Nazwy exact integration functions dopasować do aktualnego kodu, nie do planu.

Implementation should add JSDoc with `@domain settlements` to important new public architectural functions/classes when needed for preflight discovery.

## Tests

### Training

- horse posiada persistent training state;
- tier wynika z progress;
- ownership transfer nie resetuje progress;
- reload nie resetuje progress;
- ordinary zachowuje baseline;
- trained/warhorse poprawiają tylko istniejące supported capabilities;
- player riding skill nadal skaluje wynik;
- training nie mutuje globalnego `AnimalDef`.

### Paddock

- eligible settlement może dostać paddock;
- paddock ma fence oraz jawne wyjście;
- entrance corridor jest wolny;
- horse movement może korzystać z wyjścia;
- trough i haystack mieszczą się w planned footprint;
- paddock nie koliduje z buildings/roads/central props;
- capacity ogranicza liczbę vendor horses.

### Haystack / needs

- paddock haystack jest innym gameplay type/variant niż sleep haystack;
- nie można na nim nocować/spać;
- horse rozpoznaje go jako food source;
- w v1 wielokrotne karmienie nie wyczerpuje go;
- infinite feed nie mutuje household/settlement hay inventory;
- trough używa normalnego water flow;
- pusty trough nie daje fake hydration.

### Vendor/acquisition

- vendor offer wskazuje realnego live horse;
- dead/unavailable horse nie jest oferowany;
- jeden horse pojawia się w jednej ofercie;
- purchase transferuje istniejący `AnimalAgent`;
- horse znika z sale pool;
- training/HP/stamina/id pozostają;
- koń może fizycznie pozostać na paddocku do czasu wyprowadzenia;
- reload nie przywraca sprzedanego konia do oferty.

### Scale/determinism

- SM nie ma horse-vendor setup;
- MD ma go rzadko;
- LG wyraźnie częściej;
- XL często;
- higher-training horses są częstsze w większych settlements, ale warhorse pozostaje rzadki;
- ten sam world seed/settlement daje stabilny initial setup.

## Acceptance Criteria

- `horse` pozostaje jednym `AnimalKind`.
- Każdy relevant horse może posiadać persistent `HorseTrainingState`.
- `ordinary / trained / warhorse` są derived z progress.
- Ten sam koń może być później płynnie rozwijany bez wymiany entity.
- Horse vendor jest specialization istniejącego Merchant role.
- Settlement/VillagePlan posiada paddock, fauna posiada konie, Merchant jest operatorem.
- Vendor sprzedaje konkretne realne `AnimalAgent`.
- Paddock jest ogrodzony i posiada fizyczne wyjście.
- Paddock posiada normalny `AnimalTrough`.
- Paddock posiada nowy food-only haystack bez możliwości nocowania.
- Food-only haystack jest w v1 nieskończonym źródłem horse food i jest jawnie zapisany w `LOOSE-ENDS.md` jako tymczasowe uproszczenie.
- Vendor horses korzystają z normalnego hunger/thirst/fauna lifecycle.
- Purchase nie tworzy kopii horse.
- Training przeżywa ownership transfer i save/load.
- Brak nowego global/per-frame managera.

## Out of Scope

- pełny gameplay treningu konia;
- horse trainer profession;
- horse potential;
- genetics/breeds/temperament;
- mounted combat/trample/horse attacks;
- horse armor/saddles;
- breeding;
- dynamic horse market;
- inter-settlement horse trade;
- automatic paddock replenishment;
- multiple horse vendors per settlement;
- finite hay economy/replenishment dla paddock haystack;
- donkey training.

## Browser verification — User

Manualnie sprawdzić:

1. MD/LG/XL dostają horse-vendor setup zgodnie z targetami.
2. Paddock jest czytelnie ogrodzony i ma używalne wyjście.
3. Vendor horses stoją/poruszają się jako realne animals.
4. Paddock haystack karmi konie i nie oferuje noclegu.
5. Trough działa przez normalny animal water flow.
6. Vendor pokazuje konkretne konie stojące na wybiegu.
7. Zakupiony koń jest dokładnie tym samym zwierzęciem.
8. Po zakupie nie wraca do oferty, a może pozostać na wybiegu do czasu wyprowadzenia.
9. Training/tier pozostaje po save/load.
10. Warhorse przewyższa ordinary głównie wyszkoleniem, kontrolą, stamina/survivability i odpornością na strach, nie absurdalną prędkością.

> **Zrób git commit i push do main, rebase jeżeli trzeba**