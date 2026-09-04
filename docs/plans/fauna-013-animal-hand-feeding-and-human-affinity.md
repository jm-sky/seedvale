# Plan: Animal hand-feeding and human affinity

**Created:** 2026-09-04
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** fauna-010, fauna-011
**Domain:** `fauna`
**Subdomains:** `domestication`
**Tags:** `feeding` `interaction` `affinity`
**Roadmap:** -

## Cel

Dodać wspólną interakcję ręcznego karmienia zwierząt oraz lekką, deterministyczną relację zwierzę → konkretna osoba tam, gdzie zachowanie rzeczywiście jej potrzebuje.

Pierwszym pełnym konsumentem affinity jest pies. Inne obsługiwane zwierzęta mogą korzystać z tego samego hand-feeding mechanism bez konieczności tworzenia martwego relationship state.

Podstawowy flow:

```text
human actor has food
→ animal diet compatibility
→ hand-feed interaction
→ successful feed consumes item exactly once
→ shared AnimalLife hunger relief
→ affinity change when animal supports it
→ later social behaviour may use affinity
```

Nie tworzyć `feedDog()`, `DogAffinity` ani osobnego inventory/diet systemu dla tej funkcji.

## Założenia

Plan zakłada ukończenie:

### fauna-010

Dostępne są:

- declarative species diet,
- species metabolism,
- wspólny food/source model,
- diet compatibility i nutritional value.

Hand-feeding musi używać tego samego diet contractu co autonomiczne żywienie zwierzęcia. Nie utrzymywać osobnych list `autonomous food` i `player-feed food`.

### fauna-011

Dostępne są:

- dog jako domestic animal,
- household ownership,
- home behaviour,
- guard behaviour,
- social/stranger barking, które może później uwzględnić affinity.

## 1. Generic hand-feed interaction

Rozszerzyć istniejącą interakcję z `Interactable.kind === 'animal'` o możliwość karmienia kompatybilnym itemem.

Nie dodawać osobnego raycastu, selection system ani dog-specific interaction path.

Player interaction jest adapterem do domenowej operacji karmienia. Reguły diety, akceptacji jedzenia, hunger relief i affinity nie powinny należeć do UI ani `gameLoop`.

Domenowa operacja powinna być wystarczająco neutralna względem human actor, aby przyszły NPC action mógł użyć tej samej ścieżki bez duplikowania zasad.

Nie narzucać nazwy/API przed reconem kodu po `fauna-010`.

## 2. Wybór i walidacja jedzenia

Źródłem prawdy pozostaje species diet z `fauna-010`.

Przykłady:

```text
horse + hay       → valid
horse + carrot    → valid if configured
cow + hay         → valid
dog + meat        → valid
dog + hay         → invalid
```

Nie hard-code'ować list per gatunek w interaction/UI.

Jeżeli wiele itemów w inventory jest zgodnych z dietą, użyć najprostszego istniejącego mechanizmu wyboru, np. aktywnego/trzymanego itemu, jeżeli aktualny interaction model go udostępnia. W przeciwnym razie zastosować małą deterministyczną regułę.

Nie dodawać dużego food-selection modalu w V1.

## 3. Feed success invariant

Zachować invariant:

> Udane karmienie zużywa dokładnie jeden zaakceptowany item i aplikuje efekt dokładnie raz. Anulowane lub nieudane karmienie nie zużywa itemu i nie daje efektu.

Wykorzystać istniejący action/interaction transaction seam zamiast projektować osobny mechanizm commitowania wyłącznie dla karmienia.

Przed sukcesem revalidować tylko dane wymagane przez istniejący pipeline, m.in. żywe/dostępne zwierzę, kompatybilność i dostępność itemu.

## 4. Hunger relief

Karmienie korzysta ze wspólnego `AnimalLifeState`.

Efekt wynika z nutritional value/diet modelu `fauna-010`.

Ten sam item powinien mieć spójną wartość niezależnie od tego, czy zwierzę:

- znalazło źródło samo,
- zjadło z household feeding point,
- dostało jedzenie bezpośrednio od człowieka.

Nie ustawiać hunger bezpośrednio do zera i nie tworzyć osobnych wartości `feed relief` per interaction.

## 5. Zwierzę może odmówić jedzenia

Nie pozwalać farmić affinity przez karmienie całkowicie najedzonego zwierzęcia.

Preferować naturalną regułę opartą o istniejący hunger state:

```text
animal hungry enough
→ may accept compatible food

animal not hungry enough
→ refuses food
→ item remains
→ no hunger relief
→ no affinity gain
```

Użyć jednego małego `canAcceptFood`/równoważnego kryterium wynikającego ze wspólnego modelu potrzeb, zamiast nakładać kilka niezależnych cooldownów i diminishing-return systems.

## 6. Affinity tylko tam, gdzie jest używane

Feeding jest generyczne dla obsługiwanych animals.

Affinity nie musi być tworzone dla każdego zwierzęcia.

```text
generic hand-feeding → supported animals
affinity state       → persistent/domestic animals that use it
V1 behavioural user  → dog
```

Nie tworzyć martwych wpisów affinity dla krów, koni, wild fauna itd., jeżeli żadne ich zachowanie jeszcze tej informacji nie konsumuje.

Mechanizm powinien jednak pozwalać rozszerzyć affinity na kolejne persistent/domestic animals później bez przebudowy hand-feeding.

## 7. Semantyka affinity i familiarity

Affinity reprezentuje indywidualną pozytywną relację/zaufanie zwierzęcia do konkretnego human actor.

`familiar` / `trusted` są interpretacją affinity lub kontekstu, a nie osobnym równoległym systemem relacji.

Przykład:

```text
own household member
→ familiar by ownership context

player repeatedly feeds dog when hungry
→ affinity grows
→ player eventually treated as familiar/trusted
```

Nie materializować wpisów affinity dla wszystkich członków owning household, jeśli `ownerHouseId → Household.members` już dostarcza potrzebny kontekst.

## 8. Ownership ≠ affinity

Zachować twarde rozdzielenie:

```text
ownership
= do którego household należy zwierzę

affinity
= indywidualna relacja zwierzęcia do konkretnej osoby
```

Affinity nie może zmieniać ownership ani automatycznie czynić aktora chronionym przez guard behaviour.

W szczególności karmienie obcego psa nie może powodować, że zacznie on chronić gracza przed własnym household.

Guard priority z `fauna-011` pozostaje oparty o household/threat relevance.

## 9. Pies jako pierwszy behavioural consumer

Dog powinien jako pierwszy realnie wykorzystywać affinity.

### Feeding

```text
player feeds hungry dog compatible meat
→ item consumed
→ hunger relief
→ affinity to player increases
```

### Stranger/social barking

Affinity może zmniejszać stranger relevance wobec znanej osoby:

```text
unfamiliar human near home
→ dog may observe/bark

familiar/trusted human
→ reduced or no stranger bark
```

Nie wiązać jeszcze affinity z:

- guard priority,
- following player,
- commands,
- ownership transfer,
- combat loyalty.

## 10. Affinity gain

Udane, sensowne karmienie może dawać mały dodatni affinity gain.

Nie przyznawać affinity za:

- odrzucone jedzenie,
- przerwaną interakcję,
- niekompatybilny item,
- próbę karmienia najedzonego zwierzęcia.

Hunger acceptance jest podstawową ochroną przed spam farmingiem. Nie dodawać dodatkowego affinity cooldownu, jeśli nie jest potrzebny po testach.

Nie budować w tym planie pełnego negative-affinity/fear/grudge system.

Jeżeli obecny combat daje bardzo tani i naturalny hook na `human damages dog → affinity decreases`, można go wykorzystać tylko wtedy, gdy nie rozszerza scope'u i nie wymaga nowego memory systemu. Nie jest to requirement V1.

## 11. Human actor identity

Affinity musi używać stabilnej identity osoby, nie object reference ani transient array index.

Dla gracza użyć istniejącej trwałej identity reprezentacji, jeśli istnieje.

Dla przyszłego NPC feeding używać stabilnego NPC id.

Jeżeli obecna architektura nie posiada wspólnej human identity abstraction, nie tworzyć szerokiego actor-identity refactoru tylko dla tego planu. Zastosować najmniejszą reprezentację zgodną z obecnym persistence model i udokumentować granicę.

## 12. Sparse affinity storage

Nie utrzymywać macierzy:

```text
all animals × all humans
```

Affinity jest sparse i istnieje tylko dla znaczących indywidualnych relacji.

Tworzyć wpis dopiero po interakcji, która rzeczywiście zmienia affinity.

Nie inicjalizować wpisów dla unrelated NPCs ani wild fauna.

Ownership store i affinity store nie mogą duplikować tych samych informacji.

## 13. Persistence

Affinity psa/persistent affinity-enabled animal musi przetrwać save/load.

Gracz nie powinien po reloadzie stawać się ponownie obcym dla psa, z którym zbudował relację.

Zapisać sparse affinity w istniejącym authority dla persistent/domestic animal state lub najbliższym zgodnym ownership boundary.

Nie tworzyć `DogAffinitySaveData` ani nie rozszerzać przy okazji persistence całej wild fauna.

Transient feed action nie wymaga persistence.

## 14. Reakcja zwierzęcia i animacje

Karmienie powinno mieć widoczną reakcję zwierzęcia, gdy istniejące assety/animation mapping to umożliwiają.

Preferowany flow:

```text
human offers food
→ animal accepts
→ existing eat/interact animation
→ successful feed effect
```

Dla psa sprawdzić rzeczywiste clip names modeli Quaternius i wykorzystać odpowiedni istniejący clip, jeśli dostępny.

Dla innych gatunków użyć istniejącej eat animation, jeśli jest.

Brak dedykowanej animacji nie blokuje mechaniki.

Nie hard-code'ować clip names poza istniejącym species animation mapping.

## 15. UI / feedback

Animal interaction prompt powinien oferować karmienie tylko wtedy, gdy istnieje sensowny kompatybilny item i zwierzę może go przyjąć.

Po udanym karmieniu wykorzystać lekki istniejący feedback.

Nie dodawać:

- affinity bar w HUD,
- relationship panel,
- dużego feed inventory modal.

Affinity może być widoczne w debug tooling w V1.

## 16. Other domestic animals

Ten sam hand-feeding mechanism powinien działać bez species-specific interaction code dla innych gatunków objętych dietą `fauna-010`, np.:

```text
player feeds horse hay/carrot
player feeds cow hay
```

Nie tworzyć jednak affinity state tylko dlatego, że zwierzę można nakarmić.

Przyszłe plany mogą wykorzystać affinity/familiarity dla:

- easier leading,
- mounting acceptance,
- milking tolerance,
- reduced flee response,
- handling/breeding.

Te efekty są poza zakresem.

## 17. NPC feeding boundary

Pełne zachowanie:

```text
NPC notices hungry animal
→ obtains food
→ approaches animal
→ hand-feeds it
```

pozostaje poza zakresem.

Nie dodawać NPC feeding job ani caretaker profession.

Domenowa operacja karmienia powinna jednak pozwolić przyszłemu NPC action użyć tych samych zasad diety, acceptance i consumption zamiast tworzyć drugą ścieżkę.

## 18. Debugging / observability

Rozszerzyć istniejący fauna debug output tylko jeśli potrzebne o:

- hunger / can accept food,
- compatible offered food,
- affinity entries dla affinity-enabled animal,
- interpreted familiarity/trust,
- dla psa: ownership context obok affinity do obserwowanego human actor.

Debug powinien pozwalać odpowiedzieć:

> Dlaczego pies przyjął/odrzucił jedzenie i dlaczego traktuje tę osobę jako obcą albo znajomą?

Nie tworzyć osobnego relationship debug panelu, jeśli istniejący fauna inspector wystarcza.

## Testy

Dodać testy przede wszystkim dla domenowych invariantów:

- compatible food can feed animal,
- incompatible food is rejected,
- successful feed consumes exactly one item,
- cancelled/failed feed consumes nothing,
- hunger relief matches shared nutritional value,
- satiated animal refuses food and gives no affinity,
- successful dog feeding increases affinity to feeding human,
- affinity is per human identity,
- affinity does not replace/change household ownership,
- affinity does not automatically change guard priority,
- dog stranger/social response can distinguish unfamiliar and familiar/trusted human,
- sparse affinity survives save/load for dog/persistent affinity-enabled animal,
- no affinity entry is created for unrelated humans,
- hand-feeding another supported species does not require species-specific interaction code or unused affinity state.

## Manual verification

W przeglądarce sprawdzić co najmniej:

1. Gracz z kompatybilnym itemem może nakarmić głodne zwierzę.
2. Koń przyjmuje zgodne z dietą jedzenie.
3. Krowa przyjmuje zgodne z dietą jedzenie.
4. Pies przyjmuje zgodne z dietą mięso.
5. Pies odrzuca niezgodny item.
6. Najedzone zwierzę odmawia jedzenia i item pozostaje w inventory.
7. Udane karmienie zużywa dokładnie jeden item i zmniejsza hunger.
8. Przerwane/nieudane karmienie nie zużywa itemu.
9. Sensowne karmienie psa zwiększa jego affinity do gracza.
10. Pies z wysoką affinity traktuje gracza mniej jak obcego przy social/stranger barking.
11. Affinity nie zmienia owner household ani guard priority.
12. Save/load zachowuje indywidualną relację psa do gracza.
13. Karmienie innych zwierząt korzysta z tego samego diet/feeding mechanism.
14. Jeśli dostępna jest odpowiednia animacja, zwierzę wizualnie reaguje na przyjęcie jedzenia.

## Performance

Affinity storage musi być sparse.

Nie wykonywać per-frame lookupów affinity dla wszystkich aktorów.

Affinity query wykonywać tylko w zachowaniach, które faktycznie jej potrzebują, np. dog stranger/social evaluation i hand-feeding.

Nie dodawać globalnego relationship managera skanującego wszystkie animals.

Hand-feeding jest interakcją zdarzeniową i nie powinno dodawać nowego regularnego update loop.

## Poza zakresem

- petting/głaskanie,
- dog commands,
- follow-player companion mode,
- taming wild/stray animals,
- adoption/ownership transfer,
- affinity-based guarding,
- combat loyalty,
- grooming,
- toys/play,
- animal training skills,
- breeding bonus from affinity,
- mating preference,
- full negative affinity/fear/hostility memory,
- persistent grudges/trauma,
- animal personality,
- full NPC feeding jobs,
- animal caretaker profession,
- automatic NPC feeding schedules,
- affinity UI panel,
- naming pets,
- whistle/call commands.

## Dokumentacja / AI preflight

Dla nowych ważnych publicznych granic hand-feeding i affinity dodać JSDoc z `@domain fauna`.

Szczególnie jasno udokumentować:

```text
ownership ≠ affinity
familiarity = interpretation/context, not duplicate relationship state
diet compatibility ≠ interaction-specific whitelist
feeding domain rules ≠ player UI/interaction adapter
```

Affinity ma rozszerzać istniejące zachowanie persistent/domestic animals tylko tam, gdzie jest faktycznie konsumowane, a nie tworzyć równoległy globalny relationship system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**