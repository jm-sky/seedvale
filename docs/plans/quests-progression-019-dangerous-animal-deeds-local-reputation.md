# Plan: Dangerous Animal Deeds & Local Reputation

**Created:** 2026-09-11
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~quests-progression-001~~, ~~quests-progression-002~~, fauna-022
**Domain:** `quests-progression`
**Subdomains:** `progression` `relationships` `rewards`
**Tags:** `reputation` `renown` `fauna` `combat` `social-consequences`
**Roadmap:** `quests-and-reputation.md`

> **Implementation order:** `fauna-022-animal-variants-and-exceptional-dangerous-animals.md` is implemented. Consume `AnimalAgent.dangerSignificance` (and `animalId` / `def.kind` / position) — do not invent a second variant table or an `alpha_wolf` kind.

## Cel

Rozszerzyć istniejący system lokalnej reputacji tak, aby znaczące zabicie przez gracza niebezpiecznego dzikiego zwierzęcia mogło zwiększyć `courage`, `competence` i `renown` w osadach, na które czyn realnie oddziałuje.

Rozwiązanie ma używać istniejących `ReputationManager`, `SocialConsequence`, ścieżek śmierci fauny oraz pozycji świata i osad. Nie tworzyć `HunterReputation`, globalnej sławy, nowego managera reputacji ani ogólnego event busa.

Plan `fauna-022` dodaje per-animal danger significance dla wyjątkowych wariantów, np. alpha wolf. Ten plan konsumuje już rozstrzygnięte znaczenie konkretnego osobnika zamiast zakładać, że każdy osobnik tego samego `AnimalKind` ma identyczną wartość społeczną.

## Założenie gameplayowe

Nie każda śmierć zwierzęcia jest społecznym czynem:

```text
player zabija niebezpieczne zwierzę
→ system potwierdza player kill i przechwytuje danger significance osobnika
→ resolver określa bazowe znaczenie gatunku + significance konkretnego killu
→ resolver określa ekspozycję wobec osad
→ powstaje 0..N już rozstrzygniętych SocialConsequence
→ ReputationManager aplikuje lokalne delty
```

Zwykłe polowanie pozostaje częścią świata, ale nie jest istotnym źródłem reputacji. Jeleń pozostaje jawnie w klasyfikacji jako przypadek zerowy, aby granica systemu była czytelna i testowalna.

## 1. Źródło zdarzenia i atrybucja zabójstwa

Obecny `onAnimalDeath(animalId)` raportuje każdą śmierć niezależnie od przyczyny i nie niesie pozycji, gatunku ani sprawcy. Nie wolno na jego podstawie przypisywać graczowi czynu.

Dodać narrow kontekst player-caused kill w istniejącej wspólnej ścieżce finalizacji obrażeń gracza, używanej przez melee i ranged. Kontekst powinien zawierać co najmniej:

```ts
type PlayerAnimalKillContext = {
  animalId: string
  animalKind: AnimalKind
  dangerSignificance: number
  position: { x: number; z: number }
}
```

`dangerSignificance` jest już fauna-owned: czytać `animal.dangerSignificance` w momencie śmierci (`1` dla zwykłego osobnika, `1.75` dla alpha wolf; questowy `markDangerous()` może podnieść do `2` przez ten sam resolver). `animal.variant` istnieje, ale quest/reputation domain nie powinien na nim branchować, jeżeli wystarczy ta liczba. Nie ma `alpha_wolf` w `AnimalKind`.

Pozycję skopiować w momencie śmierci. Resolver nie może później czytać pozycji gracza ani zależeć od pozostawania runtime `AnimalAgent` w świecie.

Nie zmieniać ogólnego `onAnimalDeath` w player-kill event: nadal obsługuje questy, zgony od NPC/fauny i inne istniejące konsekwencje śmierci.

## 2. Quest ownership i brak podwójnego naliczania

Istniejące questy potrafią przyznać social consequence za rezultat związany z konkretnym zwierzęciem. Jeden kill nie może równocześnie dostać generic animal-deed reward i późniejszej nagrody społecznej z questa.

Rozszerzyć wynik istniejącej obsługi player-kill/`animal_died` o narrow informację ownership, np. semantyczny odpowiednik:

```ts
type AnimalDeathQuestOutcome = {
  dialogue?: DialogueOverride
  socialOutcomeClaimed: boolean
}
```

`socialOutcomeClaimed` oznacza, że dopasowany aktywny quest posiada własny social outcome za ten kill lub jego późniejsze zaraportowanie. Wtedy generic deed jest suppressowany, nawet jeśli questowa konsekwencja zostanie zastosowana dopiero przy oddaniu zadania.

Guardrails:

- nie hardkodować quest IDs,
- animal-deed resolver nie importuje `QuestManager`,
- `ReputationManager` nie zna questów ani fauny,
- nie opierać suppression wyłącznie na tym, czy consequence została już zastosowana w tej samej klatce.

## 3. Resolver czynu

Dodać mały, czysty resolver domenowy, który przyjmuje player-kill context, pozycje kandydackich osad i wynik ekspozycji, a zwraca zero lub więcej `SocialConsequence`.

Odpowiedzialności resolvera:

1. odczytać bazowe znaczenie gatunku,
2. odrzucić gatunek o zerowym znaczeniu,
3. zastosować `dangerSignificance` konkretnego osobnika do niezerowego species baseline,
4. policzyć dystans od miejsca zdarzenia do każdej osady,
5. rozstrzygnąć podstawę ekspozycji społecznej,
6. zastosować płynne attenuation,
7. zaokrąglić końcowe delty deterministycznie,
8. zwrócić tylko niezerowe consequences.

Resolver nie mutuje managerów i nie przechowuje stanu.

`dangerSignificance` nie może zamienić harmless species w źródło renomy: jeżeli species baseline wynosi zero, wynik pozostaje zero niezależnie od wariantu.

## 4. Klasyfikacja gatunków i significance wariantu

Użyć jawnej, wyczerpującej konfiguracji species baseline:

| Gatunek | competence | courage | renown | Znaczenie |
|---|---:|---:|---:|---|
| deer | 0 | 0 | 0 | zwykła zwierzyna; jawny przypadek zerowy |
| fox | +1 | 0 | +1 | małe lokalne znaczenie |
| wolf | +2 | +2 | +2 | niebezpieczny drapieżnik |
| bear | +4 | +5 | +5 | znaczące zagrożenie |

Pozostałe nieszkodliwe lub gospodarskie gatunki nie dają generic reward. Nie interpretować braku wpisu jako automatycznej nagrody.

Species baseline jest następnie skalowany przez `dangerSignificance` z fauna-owned kill context. V1 musi co najmniej zachować relację:

```text
bear > alpha wolf > normal wolf > fox > deer = harmless wildlife = 0
```

Dokładne wartości po przemnożeniu i zaokrągleniu są tunables. Dla `dangerSignificance = 1` wynik musi odpowiadać bazowym wartościom tabeli.

Nie dodawać `alpha` ani innych fauna variants do tej konfiguracji — `quests-progression` nie powinno utrzymywać drugiej listy wariantów.

## 5. Zasięg wpływu i podstawa wiedzy

Przyjąć:

```ts
MAX_ANIMAL_DEED_INFLUENCE_DISTANCE = 3000
FULL_ANIMAL_DEED_EFFECT_DISTANCE = 500
```

3 km jest maksymalnym zasięgiem, w którym czyn może wpłynąć na osadę, nie uniwersalnym „promieniem wiedzy”. Sam dystans nie może omijać kontraktu `SocialConsequence`, który wymaga realnego zdarzenia i rozstrzygniętej podstawy wiedzy społecznej.

V1 ma użyć małego, jawnego i deterministycznego animal-deed exposure resolvera. Nie rozszerzać `socialExposure.ts` w ogólny system plotek i nie symulować przekazywania informacji NPC po NPC. Resolver powinien uwzględniać co najmniej położenie zdarzenia względem osady; istniejący, jednoznaczny kontekst problemu/questa może stanowić silniejszą podstawę ekspozycji.

Jeżeli podczas implementation notes recon nie da się wskazać uczciwej podstawy wiedzy poza samym dystansem, plan wymaga ograniczenia V1 do zdarzeń widocznych/lokalnych lub już powiązanych z osadą — nie wolno maskować braku wiedzy nazwą `influence`.

## 6. Płynne attenuation

Nie używać trzech skokowych stref. Dodać dwie czyste funkcje:

```ts
reputationFactor(distance): number
renownFactor(distance): number
```

Oczekiwany przebieg:

- `0..500 m`: oba czynniki `1.0`,
- `500..1500 m`: oba płynnie maleją, przy czym renown wolniej,
- `1500..3000 m`: reputation wynosi `0`; renown płynnie maleje do `0`,
- `>3000 m`: oba wynoszą `0`.

Funkcje muszą być ciągłe na granicach i clampowane do `0..1`. Konkretna interpolacja i punkty pośrednie mają być stałymi testowalnymi, nie magic numbers w integracji runtime.

Po significance i attenuation zastosować jedno jawne, deterministyczne zaokrąglenie. Nie generować consequence, jeśli wszystkie końcowe delty wynoszą zero.

## 7. Osady i streaming

Jedno zdarzenie może wygenerować różne consequences dla wielu osad. Obliczenia zawsze używają pozycji zdarzenia.

Promień 3 km znacząco przekracza zwykły loaded area. Nie ograniczać działania do `SettlementsManager.getLoaded()`, jeżeli spowodowałoby to zależność reputacji od kamery/streamingu. Użyć istniejących authoritative settlement definitions/positions dostępnych niezależnie od runtime osady; jeżeli takiego lookupu nie ma, implementation notes muszą wskazać najmniejsze rozszerzenie istniejącego ownera danych osad zamiast tworzenia równoległego indeksu.

Rezultat dla tego samego świata, zdarzenia i stanu questów nie może zależeć od tego, które chunki są aktualnie załadowane.

## 8. Kontekst realnego problemu osady

Jeżeli istniejący system jednoznacznie wiąże konkretne zwierzę z problemem osady lub questem, może zapewnić pełniejszą podstawę wiedzy albo odległościowy override. Quest z własnym social outcome pozostaje jednak authoritative i suppressuje generic deed.

Nie tworzyć w tym planie nowego systemu settlement problems. Zostawić narrow extension point dla przyszłych world-driven threats.

## 9. Brak diminishing returns w V1

V1 nie dodaje cooldownów, period buckets, liczników killów ani nowego persisted state. Koszt persistence byłby nieproporcjonalny bez potwierdzonego problemu gameplayowego.

Istniejące clampy `ReputationManager` nadal obowiązują. Po browser verification ocenić, czy wartości bazowe wymagają obniżenia lub czy farming rzeczywiście uzasadnia osobny follow-up plan.

## 10. Ownership i integracja

Zachować podział:

```text
fauna
→ owns per-animal danger significance

combat/player damage path
→ potwierdza player kill i przechwytuje kontekst + significance

QuestManager seam
→ mówi, czy social outcome tego killu jest quest-owned

animal-deed exposure + consequence resolver
→ rozstrzyga species baseline, significance, wiedzę i lokalne delty

composition root
→ aplikuje zwrócone SocialConsequence

ReputationManager
→ pozostaje jedynym ownerem reputation + renown
```

Nie dodawać zależności `ReputationManager → fauna/combat/quests/world` ani `animal deed resolver → QuestManager`.

## 11. UI

Nie dodawać `Hunter Reputation`, osobnego HUD ani popupu. Istniejący Character Screen ma pokazywać zmienione wartości przez aktualną ścieżkę odświeżania social consequence.

Można wykorzystać istniejący feedback/toast, jeżeli nie wymaga nowego systemu i nie konkuruje z questowym komunikatem śmierci.

## 12. Performance

Mechanizm jest event-driven i uruchamia się tylko po potwierdzonym player kill kwalifikującego się gatunku.

Nie dodawać:

- update loop,
- polling fauny lub osad,
- skanu per frame,
- workerów,
- nowego spatial index tylko dla sporadycznych killów.

Jednorazowa iteracja po authoritative settlement definitions jest akceptowalna przy obecnej skali.

## 13. Testy

Dodać targeted tests dla:

### Atrybucja, gatunki i warianty

- player kill normalnego wilka tworzy consequence z baseline significance,
- player kill alpha wolf tworzy większy consequence niż normalny wolf przy tej samej ekspozycji/dystansie,
- alpha nadal klasyfikowany jest jako `AnimalKind = wolf`, bez osobnego wpisu w species table,
- NPC/predator/environment death nie tworzy player reputation,
- jeleń daje dokładnie `0/0/0`, także gdyby otrzymał significance > 1,
- fox < wolf < alpha wolf < bear,
- livestock i pozostała harmless wildlife nie dają generic reward.

### Dystans i attenuation

- dystans `0`, `500`, `1500`, `3000` oraz wartości tuż po obu stronach granic,
- ciągłość i clamp obu funkcji,
- po `1500 m` zanika dimension reputation, ale może pozostać renown,
- powyżej `3000 m` brak consequence,
- deterministic rounding nie tworzy zerowych consequences.

### Quest overlap

- quest-owned social outcome suppressuje generic deed także dla alpha wolf,
- quest bez własnego social outcome nie suppressuje generic deed,
- consequence przyznawana przy późniejszym raporcie nie powoduje wcześniejszego generic reward,
- brak hardkodowania konkretnego questa w resolverze.

### Wiele osad i streaming

- jeden kill daje różne wyniki osadom w różnych odległościach,
- osada poza loaded runtime nadal jest oceniana,
- wynik nie zmienia się po stream-out/stream-in.

### Existing contracts

- wartości respektują clampy `ReputationManager`,
- istniejące quest objectives nadal reagują na `animal_died` dokładnie raz,
- melee i ranged korzystają z tej samej atrybucji player kill,
- save/load reputacji działa bez zmiany schema i bez nowego persisted state.

## 14. Non-goals

Plan nie obejmuje:

- młodego poszukiwacza przygód ani companions,
- NPC recruitment i nowych NPC goals,
- globalnej reputacji lub nowego typu `hunter`,
- pełnej symulacji świadków i plotek,
- diminishing returns i historii killów,
- trophies, achievements i bounty,
- generowania questów z polowań,
- nowego settlement-problem subsystemu,
- reputacji za zwykłe polowanie na jelenie,
- definiowania lub spawnowania wariantów zwierząt — ownership pozostaje w `fauna-022`.

## 15. Dokumentacja i verification

Przed implementacją użyć faktycznego fauna-owned API z `fauna-022`: `AnimalAgent.dangerSignificance`, `AnimalAgent.variant`, `outgoingDamageFor` / `outgoingDamageVsHuman` nie są potrzebne w reputation domain. Nie tworzyć drugiej tabeli wariantów.

Po implementacji zaktualizować tylko dokumenty opisujące faktycznie zmieniony stan. Ważnym publicznym/architektonicznym funkcjom dodać użyteczny JSDoc i `@domain quests-progression` tam, gdzie pomaga preflight discovery.

Automatycznie:

- targeted unit tests,
- relevant existing quest/fauna/reputation tests,
- `pnpm typecheck`,
- build/lint zgodnie z aktualnymi scripts.

Manual browser verification wykonuje User:

1. zabić jelenia blisko osady — brak zmiany,
2. zabić zwykłego wilka blisko osady — wzrost lokalnych wartości,
3. zabić alpha wolf w analogicznym kontekście — większy efekt niż za zwykłego wilka,
4. zabić niedźwiedzia — większy efekt niż za alpha wolf,
5. sprawdzić zdarzenia w dalszych odległościach,
6. sprawdzić quest-owned kill — brak double reward,
7. sprawdzić wynik przy streamingu i po save/load.

> **Zrób git commit i push do main, rebase jeżeli trzeba**