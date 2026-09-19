# Plan: Poisoned meat predator bait

**Created:** 2026-09-19
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** S
**Depends on:** ~~items-player-002~~, ~~settlements-npcs-007~~, fauna-023
**Domain:** `items-player`
**Subdomains:** `items` `interaction`
**Tags:** `poison` `bait` `fauna`
**Roadmap:** -
**Model:** Sonnet, Composer

## Cel

Pozwolić graczowi wykorzystać istniejące `poisonous_herb` do przygotowania jednego rodzaju zatrutego mięsa, które korzysta z istniejącego dropped-food attraction/consumption fauny i po zjedzeniu zadaje bezpośrednie obrażenia HP.

Docelowy V1:

```text
poisonous_herb + compatible raw meat
→ poisoned_meat
→ normalny world drop
→ istniejący fauna attraction
→ zwierzę podchodzi
→ jednorazowy deterministic detection roll
→ wykrycie: odrzucenie / brak konsumpcji
→ niewykrycie: consume + hunger relief + poison HP damage
→ istniejący animal death/corpse lifecycle
```

Mechanizm ma być małym rozszerzeniem istniejących systemów. Nie tworzyć osobnego poison AI, bait managera, animal-condition frameworku ani general-purpose craftingu.

## Stan obecny

Recon aktualnego `main` potwierdza:

- `poisonous_herb` już istnieje jako `ItemKind`, world collectible i zasób zbierany przez Herbalist;
- `fauna-023` jest zaimplementowany i ma status `verification needed`: dropped food jest wystawiane jako attraction source, zwierzę podchodzi, rewaliduje i atomowo konsumuje world item;
- `AnimalDef.diet` / `dietAcceptsItem()` są authority dla zgodności jedzenia z gatunkiem;
- bear ma już item diet obejmującą mięso i może reagować na dropped meat;
- `AnimalAgent.takeDamage()` prowadzi do istniejącego `HealthState` i normalnego collapse/death/corpse lifecycle;
- gracz/NPC mają osobny `TemporaryConditionsState`, ale fauna nie ma analogicznego ogólnego animal-condition systemu;
- brak ogólnego player-craftingu, który należałoby rozszerzyć; `campfireCooking` i settlement production są wyspecjalizowanymi mechanizmami;
- `Inventory.removeWithFreshness()` / `addWithFreshness()` oraz `FoodBatch.sourceSpecies` pozwalają zachować freshness/provenance podczas transformacji jedzenia.

## 1. Jeden nowy item: `poisoned_meat`

Dodać jeden `ItemKind`:

```text
poisoned_meat
```

Nie tworzyć wariantów `poisoned_deer_meat`, `poisoned_beef` itd.

`poisoned_meat` ma:

- zachowywać kategorię/bait semantics mięsa potrzebną fauna attraction;
- być perishable i korzystać z istniejącego freshness lifecycle;
- być normalnym stack-backed itemem możliwym do dropnięcia przez istniejący `DroppedItems`;
- zachowywać wejściowy `FoodBatch.sourceSpecies`, aby pochodzenie mięsa nie znikało;
- nie być zwykłą player-consumable opcją `Zjedz` w V1.

Osobny `ItemKind` jest świadomą decyzją: obecny `Inventory` agreguje i wybiera stacki po `ItemKind`. Samo pole poison na `FoodBatch` mieszałoby czyste i zatrute porcje tego samego kind i utrudniało deterministyczny wybór właściwej porcji do dropu/transferu.

## 2. Compatible raw meat

Akcja zatruwania ma akceptować wszystkie obecne surowe mięsa zgodne z meat semantics, a nie tylko generic `raw_meat`.

Nie utrzymywać nowej ręcznej listy, jeśli można wyprowadzić eligibility z istniejącego item metadata / meat-bait contract. Oczekiwane obecne wejścia obejmują m.in.:

- `raw_meat`,
- `deer_meat`,
- `wolf_meat`,
- `boar_meat`,
- `rabbit_meat`,
- `beef`.

Processed meat (`roasted_meat`, `dried_meat`) i fish są poza V1.

## 3. Przygotowanie bez nowego craftingu

Dodać małą items-domain operację transformacji, np. `poisonMeat(...)`, zamiast frameworku receptur.

Semantyka:

```text
1 × poisonous_herb
+ 1 × eligible raw meat
→ 1 × poisoned_meat
```

Operacja musi:

1. wybrać deterministycznie jedną eligible porcję mięsa;
2. sprawdzić oba inputy i output capacity przed mutacją;
3. pobrać mięso przez freshness-aware path;
4. zachować dokładny `FoodBatch` / effective age / `sourceSpecies`;
5. usunąć dokładnie 1 `poisonous_herb`;
6. dodać dokładnie 1 `poisoned_meat`;
7. być all-or-nothing.

Nie resetować freshness przez zwykłe `remove()` + `add()`.

Player UI ma wystawić tę operację przez istniejący Quick Actions/action-contract mechanism. Dostępność w UI jest tylko projekcją; wykonanie musi ponownie sprawdzić live inventory.

## 4. Attraction i consumption — reuse `fauna-023`

Nie tworzyć osobnego poisoned-bait source.

`poisoned_meat` ma wejść w istniejący pipeline:

```text
DroppedItems
→ AnimalAttractionSource
→ droppedFoodAttractionSource()
→ dietAcceptsItem()
→ AnimalAgent pursuit
→ arrival/revalidation
→ atomic dropped-item consume
```

Zwierzęta reagują zgodnie z obecnym `AnimalDef.diet`. Nie dodawać runtime wyjątków `kind === 'bear'`, `kind === 'wolf'` itd.

## 5. Detection roll

Bezpośrednio przed finalną konsumpcją `poisoned_meat` wykonać jeden deterministic detection roll.

Początkowy tuning:

```ts
POISONED_MEAT_DETECTION_CHANCE = 0.10
```

Detection success:

- mięso nie jest konsumowane;
- zwierzę nie dostaje hunger relief;
- nie dostaje damage;
- source pozostaje w świecie;
- zwierzę ignoruje ten konkretny source przez bounded transient cooldown, aby nie rerollować co tick.

Roll ma być stabilny dla jednego animal/source consume encounter. Nie używać frame-dependent `Math.random()`.

Reuse wzorca deterministic event roll z istniejących poisoning/population-protection mechanizmów zamiast tworzyć losowość zależną od FPS.

## 6. Efekt V1: bezpośredni HP damage

Nie tworzyć animal poisoning condition ani DOT.

Po niewykrytej, udanej konsumpcji:

1. world item znika przez istniejący atomic consume path;
2. normalny hunger relief zostaje zastosowany;
3. zwierzę otrzymuje jednorazowy poison HP damage przez fauna-owned damage/death path.

Wartość obrażeń ma być jedną stałą tuningu dobraną względem aktualnych HP bear/wolf/fox. Punkt startowy może wynosić około 35 HP, ale implementacja powinna zweryfikować aktualne `MAX_HP` i dobrać wartość tak, aby zdrowy niedźwiedź nie był automatycznie one-shotowany.

Po zejściu HP do 0 reuse:

```text
AnimalAgent damage
→ HealthState dead
→ collapse
→ corpse
→ normal harvest/scavenging
```

Nie tworzyć osobnego poison death source/lifecycle, o ile istniejący owner API nie wymaga tylko małego rozszerzenia source enum dla diagnostyki.

## 7. Persistence

Nie dodawać osobnego poison state.

Persistence ma wynikać z istniejącego item modelu:

- carried `poisoned_meat` jest zwykłym `ItemKind`;
- jego freshness/provenance korzysta z istniejących `FoodBatch`;
- dropped `poisoned_meat` korzysta z istniejącego `SaveDroppedItem.kind + foodBatch`;
- detection ignore/cooldown pozostaje transient i nie jest persistowany.

## 8. Scope V1

W zakresie:

- istniejące `poisonous_herb`;
- jeden `poisoned_meat`;
- wszystkie surowe meat-bait kinds;
- player action przygotowania;
- normalny drop;
- istniejący attraction/consume;
- 10% detection;
- direct HP damage;
- normalna śmierć/zwłoki.

Poza zakresem:

- animal diseases / `TemporaryConditionsState` dla fauny;
- damage over time;
- antidotes/resistance;
- poison potency/quality;
- wiele trucizn;
- alchemy/crafting framework;
- poison skill;
- NPC przygotowujący trucizny;
- zatrucie playera/NPC;
- poisoned arrows/weapons;
- zatrucie wody;
- trap-specific poison mechanics.

## 9. Testy

Dodać focused tests pokrywające co najmniej:

1. eligible raw meat + `poisonous_herb` → dokładnie 1 `poisoned_meat`;
2. brak jednego inputu lub capacity → brak częściowej mutacji;
3. processed meat/fish nie kwalifikują się;
4. freshness/effective age i `sourceSpecies` przechodzą do output `FoodBatch`;
5. `poisoned_meat` jest meat attraction source;
6. bear/wolf/fox akceptują go zgodnie z istniejącym diet contract; niekompatybilny herbivore odrzuca;
7. detection success → brak consume/relief/damage + bounded ignore;
8. detection failure → atomic consume + relief + dokładnie jeden damage;
9. detection jest deterministyczne dla encounter;
10. lethal damage uruchamia istniejący animal death lifecycle, bez drugiej ścieżki śmierci.

## Verification

User wykonuje manualną weryfikację w przeglądarce:

1. zebrać `poisonous_herb`;
2. zdobyć dowolne obsługiwane surowe mięso;
3. użyć akcji `Zatruj mięso`;
4. wyrzucić `poisoned_meat` w pobliżu niedźwiedzia;
5. potwierdzić normalne zainteresowanie i podejście;
6. przy niewykryciu potwierdzić konsumpcję i spadek HP;
7. przy detection potwierdzić pozostawienie mięsa i brak natychmiastowego rerollowania;
8. potwierdzić, że lethal poison kończy się zwykłymi zwłokami.

AI agent nie wykonuje browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
