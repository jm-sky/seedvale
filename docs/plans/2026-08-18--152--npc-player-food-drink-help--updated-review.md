# Plan: NPC pomoc graczowi w jedzeniu i piciu — updated review

**Created:** 2026-08-19
**Status:** `reviewed` 🔎
**Priority:** medium · **Effort:** S
**Depends on:** ~~069~~ ~~122~~ ~~156~~ 165
**Related:** 167

## Decyzja

**UPDATE**

Plan 152 nadal powinien istnieć jako osobny mechanizm, ale wymaga istotnego zawężenia i aktualizacji architektury.

Nie należy scalać go z Planem 167. Oba mechanizmy rozwiązują różne sytuacje:

```text
152 — natychmiastowa, konwersacyjna pomoc NPC
     gracz prosi → NPC decyduje → przekazuje carried consumable

167 — autonomiczna pomoc / dostawa zasobów
     NPC ma goal/pressure → pozyskuje zasób → transportuje → player storage
```

Granica jest zdrowa, ale w oryginalnym Planie 152 zbyt mocno zakładano, że NPC posiadają normalnie carried food/water. Aktualny model pokazuje, że `NpcAgent.inventory` jest przede wszystkim **tymczasowym carrierem**, a nie zwykłym magazynem osobistym NPC. Plan 156 jest już `done` i ustanowił generyczny transport, ale food nadal trafia normalnie bezpośrednio do `Household.stock`, a water pozostaje osobnym `Household.water`.

Plan 167 dodatkowo wprowadza osobny kierunek: NPC może autonomicznie dostarczać zasoby do player `Container`. Nie powinien jednak zastępować małej interakcji „podaj mi coś do jedzenia/picia”.

---

## 1. Aktualny stan repozytorium

`docs/STATE.md` jest zweryfikowany na **2026-08-19**. Aktualny kod potwierdza:

- `PlayerNeeds` jest właścicielem playerowych `hunger`/`thirst` i udostępnia `eatFood()` oraz `drinkWater()` jako operacje domenowe;
- `Inventory` jest generycznym carrierem, posiadającym zarówno count-based items, jak i item instances, z limitem wagowym;
- `NpcAgent` korzysta z `Inventory` jako tymczasowego carried state;
- `Household` jest właścicielem `food`/`wood` stock, natomiast water jest osobnym `WaterReserve`;
- relacje NPC↔player i globalny standing nadal należą do `QuestManager` i są przekazywane do NPC przez `PlayerSocialLookup`;
- `reactionChance.ts` jest istniejącym wspólnym modelem relation + standing + personality/traits;
- NPC dialogue v2 jest już istniejącym UI/flow w `NpcDialogueMenu.vue`.

Wniosek: ownership zaproponowany w Planie 152 nadal jest właściwy, ale model źródła zasobu wymaga korekty.

---

## 2. Najważniejsza zmiana: `NpcAgent.inventory` nie jest magazynem NPC

Aktualne `Inventory` opisuje się jako generyczny item carrier. Komentarz implementacyjny wyraźnie wskazuje, że inventory NPC jest używane jako krótkotrwały stan pomiędzy pozyskaniem zasobu a jego dostarczeniem.

Plan 156 dodatkowo potwierdza rozdział:

```text
Household / Settlement
    ↓
authoritative stock

NpcAgent
    ↓
temporary carrying only
```

Food jest szczególnie istotne: obecny przepływ household logistics zbiera food bezpośrednio do `Household.stock`, a nie do zwykłego carried inventory NPC.

Dlatego Plan 152 nie może zakładać:

```text
NPC posiada food → może zaoferować food
```

jako normalnego, powszechnego stanu świata.

Może natomiast działać dla NPC, który **faktycznie posiada odpowiedni carried item** — np. NPC aktualnie transportującego jedzenie lub wyposażonego w portable water item.

Nie należy tworzyć dla 152 mechanizmu wyposażania NPC w jedzenie/wodę.

---

## 3. Relacja z Planem 167

### Nie jest to ten sam mechanizm

Plan 167 opisuje autonomicznego Helper/Supplier:

```text
NPC decision
 → resource source
 → gather
 → carry
 → player Container
 → return to normal life
```

Plan 152 opisuje interakcję synchroniczną:

```text
player dialogue
 → request
 → social decision
 → immediate transfer
```

167 nie powinien zostać użyty jako implementacja kliknięcia „daj mi jedzenie”. Wymuszałoby to niepotrzebnie:

- assignment/helper role,
- target `Container`,
- action chain,
- movement,
- resource gathering,
- persistence assignment.

152 powinien pozostać małą funkcją interakcji NPC.

### Wspólne mechanizmy

Oba plany powinny współdzielić:

- `Inventory` jako rzeczywisty carried state;
- `PlayerNeeds` jako owner potrzeb gracza;
- `ITEM_CATALOG` jako źródło semantyki consumable;
- istniejące relation/standing lookup;
- istniejący dialogue/interactions flow;
- istniejące zasady atomicznego transferu itemów.

Nie tworzyć wspólnego `HelperManager` ani `NpcHelpManager` tylko dlatego, że oba plany używają słowa „pomoc”.

### Zależność od 167

**167 nie powinien być twardą zależnością wykonawczą 152.**

Może być zależnością koncepcyjną / planistyczną: implementacja 152 musi respektować ownership i transport model ustanowiony przez 156 oraz nie konkurować z 167 o autonomiczną dostawę.

Jeżeli 167 zostanie zaimplementowany wcześniej, 152 powinien konsumować jego istniejące carried/resource semantics, ale nie musi czekać na system Helper.

---

## 4. Plan 156 — status zmienił znaczenie zależności

Plan 156 jest już oznaczony jako `done` po playteście 2026-08-18.

Jego implementacja potwierdza generyczny transport:

```text
source → NPC carrying → destination
```

dla wood/water/ore oraz istniejące household/settlement storage ownership.

Food nadal jest wyjątkiem: normalnie trafia bezpośrednio do `Household.stock`.

Dlatego 156 nie jest już planem, który trzeba wykonać przed 152. Jest fundamentem, który należy respektować.

W zaktualizowanym metadata należy oznaczyć `156` jako zrealizowaną zależność, a nie aktywny prerequisite.

---

## 5. Plan 165 — nowa rzeczywista zależność dla PlayerNeeds

Plan 165 jest obecnie `planned`, ale zmienia kontrakt potrzeb gracza:

- Hunger pozostaje bieżącym poziomem najedzenia;
- Thirst pozostaje bieżącym poziomem nawodnienia;
- mają dojść `StarvationDuration` / `DehydrationDuration`;
- konsekwencje długotrwałego głodu/pragnienia mają zostać oddzielone od samego poziomu `0`;
- `PlayerNeeds` ma pozostać właścicielem tych stanów.

Dla 152 oznacza to:

```text
NPC assistance
    ↓
PlayerNeeds.eatFood()/drinkWater()
    ↓
existing need state + future starvation/dehydration duration handling
```

152 nie powinien sam resetować ani modyfikować `StarvationDuration` / `DehydrationDuration`.

Dlatego **165 należy dodać jako rzeczywistą zależność planistyczną**, jeśli 152 będzie implementowany po zmianie modelu potrzeb. Nie trzeba natomiast tworzyć zależności runtime od konkretnego planu — kod powinien zależeć od aktualnego `PlayerNeeds` API.

---

## 6. Ownership po aktualizacji

### PlayerNeeds

Owner:

```text
src/player/PlayerNeeds.ts
```

Odpowiada za:

- hunger;
- thirst;
- `eatFood()`;
- `drinkWater()`;
- przyszłe konsekwencje długotrwałego głodu/pragnienia.

152 może wywołać istniejącą operację, ale nie może bezpośrednio mutować pól potrzeb.

### Player Inventory

Owner:

```text
src/items/Inventory.ts
```

Jeżeli V1 nadal przekazuje food jako item, item powinien przejść przez istniejący inventory API.

### NPC Inventory

Owner:

```text
NpcAgent.inventory
```

To jest **carried/temporary state**, nie osobisty magazyn NPC.

### Household

Owner:

```text
Household.stock
Household.water
```

Household pozostaje źródłem rodzinnych zapasów, ale nie może być konwersacyjnie teleportowany do gracza przez 152.

### Relations / standing

Owner:

```text
QuestManager
```

152 tylko odczytuje dane przez istniejący lookup/hook. Nie kopiuje relation ani standing do NPC/dialogue state.

### Player Storage

Owner:

```text
Container / player storage model z planu 164
```

Nie należy wprowadzać player storage do 152. To jest domena 167.

---

## 7. Woda wymaga szczególnej korekty

Aktualny `Household.water` jest `WaterReserve`, a nie `Inventory` item.

Plan 152 nadal powinien odrzucać:

```text
Household.water → PlayerNeeds.thirst
```

jako specjalny transfer.

V1 może przekazać wodę tylko wtedy, gdy NPC rzeczywiście posiada portable water item zgodny z aktualnym item/consumable model.

Jednocześnie trzeba potwierdzić aktualny consume path dla portable water. Jeżeli `resultKind` oznacza np. zamianę pełnego waterskina na pusty, 152 musi użyć dokładnie tej samej semantyki co normalne picie gracza.

Nie duplikować logiki `resultKind`.

---

## 8. Food assistance — zakres V1

Zakres V1 powinien zostać zdefiniowany jako:

```text
NPC ma rzeczywisty carried food item
        ↓
player prosi
        ↓
social decision
        ↓
NPC przekazuje jeden item
        ↓
player inventory otrzymuje item
```

Nie:

```text
Household.stock
   ↓
NPC magicznie bierze food
   ↓
player
```

oraz nie:

```text
NPC gather food for player
```

To drugie należy do 167.

Ważne: jeśli zwykli NPC w aktualnej symulacji prawie nigdy nie mają carried food, nie należy tworzyć dla 152 specjalnego provisioning path. Wtedy browser/debug verification musi korzystać z rzeczywistego NPC z carried itemem albo odpowiednio wyposażonego test fixture, zgodnie z polityką repozytorium.

---

## 9. Social decision

Istniejący `reactionChance.ts` nadal jest dobrym źródłem wspólnej filozofii:

```text
relationLevel
+ standing
+ openness/extraversion
+ traits
```

Ale `computeReactionChance()` jest probabilistycznym modelem reakcji, a nie gotowym deterministycznym „tak/nie”.

152 powinien:

1. korzystać z tego samego `PlayerSocialLookup`;
2. preferować osobistą relację nad globalnym standingiem;
3. używać personality/traits jako modyfikatorów;
4. respektować istniejącą konwencję RNG/determinism;
5. nie tworzyć nowego utility AI ani nowej reputacji.

Warunki zasobowe pozostają poza social score:

```text
social willingness
    AND
carried resource
    AND
NPC own-needs guard
    AND
player-side transfer preconditions
```

---

## 10. NPC own-needs guard

Ten element pozostaje sensowny, ale nie powinien tworzyć nowego systemu rezerwacji.

Minimalny V1:

```text
NPC has one relevant carried consumable
    ↓
existing critical own need says it is required
    ↓
NPC does not give it away
```

Jeżeli aktualny model NPC nie pozwala wiarygodnie stwierdzić, że konkretny carried item jest potrzebny NPC, nie należy budować nowego reserve ledger tylko dla 152.

---

## 11. Dialogue integration

`NpcDialogueMenu.vue` już ma rozszerzalny typ tematów i istniejące akcje (`help`, handel, prośba o miecz).

Nie należy jednak rozszerzać `QuestDialogOverride` o food/water tylko dlatego, że istnieje tam obecny `helpResult`.

Lepsza granica:

```text
NpcDialogueMenu
  ├── existing quest/help topics
  ├── request food
  └── request water
          ↓
      small assistance callback
```

Nie tworzyć drugiego menu/interakcji.

Akcje powinny być częścią istniejącego NPC dialogue v2, ale resolver pomocy powinien pozostać domenowo niezależny od `QuestManager`.

---

## 12. Inventory transfer

Obecne `Inventory` wspiera count-based items przez:

```text
has()
count()
canAdd()
add()
remove()
```

i posiada osobne item instances.

Dla food/water w 152 nie należy zakładać item-instance semantics, jeżeli aktualny consumable jest count-based.

Transfer musi być atomowy:

```text
NPC has item
↓
player can receive / consume according to existing path
↓
NPC remove
↓
player add or existing consume operation
```

Nie usuwać itemu NPC przed potwierdzeniem wszystkich warunków.

Dla water, jeśli pomoc oznacza natychmiastowe wypicie, trzeba użyć istniejącego consume path i zachować `resultKind` semantics. Nie implementować drugiego waterskin lifecycle.

---

## 13. Persistence

Nie dodawać nowej persystencji.

152 nie tworzy assignment, target storage ani nowego player/NPC relationship state.

Konsekwencja transferu ma być zapisana tylko wtedy, gdy aktualne `Inventory` / PlayerNeeds / NPC carrying persistence już to obsługuje.

To szczególnie ważne po 156: `NpcAgent.inventory` jest temporary carrying state, więc 152 nie powinien traktować go jak trwałego NPC backpacka.

---

## 14. Performance

Brak zmian względem pierwotnego kierunku:

- zero per-frame scanów;
- zero globalnego wyszukiwania helpera;
- resolver uruchamiany przy otwarciu/wyborze akcji;
- lokalna operacja na małym inventory i social lookup.

Nie korzystać z 167 action cycle tylko po to, aby zrealizować natychmiastową prośbę.

---

## 15. Zakres V1 po aktualizacji

### Pozostaje

- prośba o jedzenie w istniejącym dialogue v2;
- prośba o picie w istniejącym dialogue v2;
- decyzja społeczna NPC;
- rzeczywisty carried item jako źródło;
- istniejące PlayerNeeds;
- istniejące Inventory;
- odmowa jako normalny rezultat;
- brak handlu/długu/cen;
- brak teleportu i autonomicznego fetchowania z domu.

### Usunąć / zmienić

- założenie, że `NpcAgent.inventory` jest zwykłym osobistym magazynem NPC;
- sugestię, że 156 jest nadal niezrealizowaną zależnością;
- traktowanie 167 jako potencjalnego następcy tej funkcji;
- wszelkie player-storage/helper assignment z zakresu 152;
- bezpośrednie założenie, że food będzie dostępny u zwykłych NPC.

### Poza zakresem pozostaje

- autonomiczne dostarczanie jedzenia/wody do player storage — 167;
- gathering dla gracza — 167;
- `Container` / player storage — 164/167;
- household-to-player transfer;
- teleport NPC do domu;
- Companion;
- osobny Helper AI;
- nowe relation/reputation storage;
- LLM decisions.

---

## 16. Zaktualizowane zależności

### Zrealizowane fundamenty

- **069** — istniejący household/resource ownership i relacje/interakcje są już obecnym fundamentem; nie traktować jako plan do wykonania od nowa.
- **122** — water/household model jest obecny.
- **156** — `done`; generyczny NPC transport/storage jest już zaimplementowany.

### Rzeczywista zależność planistyczna

- **165** — należy uwzględnić aktualny/przyszły model PlayerNeeds, szczególnie `eatFood()` / `drinkWater()` oraz długotrwałe starvation/dehydration state.

### Powiązany, ale nie wymagany

- **167** — należy sprawdzić przed implementacją jako aktualny system sąsiedni, ale nie powinien być twardą zależnością. Jego odpowiedzialność to autonomiczna dostawa do player storage, nie natychmiastowe przekazanie itemu podczas rozmowy.

### Dodatkowo

- **164** nie jest zależnością 152, dopóki 152 pozostaje bezpośrednim NPC → player inventory/needs transferem. Staje się zależnością dopiero po ewentualnej zmianie zakresu na player storage.

---

## 17. Zaktualizowane kryteria akceptacji V1

- [ ] Istniejący NPC może otrzymać opcję poproszenia o jedzenie przez dialogue v2.
- [ ] Istniejący NPC może otrzymać opcję poproszenia o picie przez dialogue v2.
- [ ] Resolver sprawdza aktualny PlayerNeeds przed transferem.
- [ ] NPC może pomóc tylko z faktycznie carried resource.
- [ ] Household.stock nie jest używany jako conversation-time fallback.
- [ ] Household.water nie jest używany jako conversation-time fallback.
- [ ] Decyzja używa istniejącego relation/standing/social lookup.
- [ ] NPC nie oddaje krytycznego własnego carried resource, jeśli istniejący stan pozwala to określić.
- [ ] Food transfer respektuje istniejące Inventory API i capacity.
- [ ] Water transfer respektuje istniejący consumable/resultKind path.
- [ ] PlayerNeeds jest modyfikowane wyłącznie przez istniejące operacje domenowe.
- [ ] Nie powstaje drugi inventory, relation, reputation, household storage ani interaction system.
- [ ] 167 nie jest uruchamiany jako ukryty helper/action system dla pojedynczej prośby.
- [ ] Brak dodatkowej pracy per frame.
- [ ] Testy obejmują brak itemu, odmowę, transfer i powtórną prośbę po zużyciu zasobu.

---

## 18. Weryfikacja przed implementacją

Przed kodowaniem należy potwierdzić tylko:

1. dokładny callback/extension point w `NpcDialogueMenu.vue` / `ui-vue/store.ts` dla nowych akcji;
2. aktualny player consume path dla food i portable water;
3. czy istnieje realny runtime path, dzięki któremu zwykły NPC może posiadać carried food/water.

Jeżeli punkt 3 jest negatywny, **nie rozszerzać 152 o provisioning NPC**. W takim przypadku feature pozostaje poprawny architektonicznie, ale V1 będzie wymagał test fixture / specjalnie wyposażonego NPC do demonstracji, dopóki istniejący logistics/transport nie dostarczy takich carried items naturalnie.

---

## Podsumowanie

Plan 152 nie został przejęty przez Plan 167.

Powinien pozostać osobnym, małym mechanizmem **social immediate assistance**. Plan 167 odpowiada za **autonomiczną resource delivery**. Oba mogą korzystać z tych samych podstawowych mechanizmów, ale nie powinny dzielić jednego „help managera”.

Najważniejsza korekta to odejście od założenia, że `NpcAgent.inventory` jest osobistym magazynem NPC. Po Planie 156 inventory NPC jest przede wszystkim temporary carrying state, a food/water mają nadal authoritative ownership w household/resource systems.

Plan 165 należy uwzględnić jako aktualną zależność PlayerNeeds. Plan 156 należy traktować jako ukończony fundament, a 167 jako sąsiedni plan bez twardej zależności.

**Decyzja końcowa: `update`**

> **Zrób git commit i push do main, rebase jeżeli trzeba**
