# Plan: Inventory and item-use UX coherence

**Created:** 2026-09-10
**Status:** `verification needed` 🔍 — implemented, `tsc`/`vue-tsc`/lint/build/test all green. Browser/manual verification not performed (see implementation notes' Manual verification checklist).
**Type:** polish
**Priority:** high · **Effort:** L
**Depends on:** items-player-022, ~~ui-input-015~~
**Domain:** `items-player`
**Subdomains:** `inventory` `items` `interaction`
**Tags:** `inventory` `equipment` `quantity` `transfer` `capabilities` `hud` `ux`
**Roadmap:** -

## Goal

Domknąć findings z `docs/reviews/ux/2026-09-10--items-inventory-equipment-ux-review.md` na aktualnym `main`, bez tworzenia nowego inventory/equipment/action systemu.

Docelowy model UX:

```text
Inventory = pełny obraz tego, co gracz posiada i co może z tym zrobić
Quick Actions = skróty do częstych czynności
HeldTool = jedyny rzeczywisty stan przedmiotu trzymanego w ręce
Primary melee/ranged = zapamiętane skróty do szybkiego equipu
ITEM_CATALOG.capabilities = źródło prawdy o zastosowaniach przedmiotu
InteractionView = źródło prezentacji aktualnych world actions
```

Plan ma poprawić presentation i ergonomię istniejących mechanizmów, nie zmieniać ownershipu symulacji.

## Recon / reconciliation z aktualnym `main`

### Już rozwiązane lub poza scope

- `items-player-022` wdrożył grupowanie blisko leżących identycznych dropped items na poziomie interakcji. Nie scalać authoritative `DroppedItem` records i nie implementować tego ponownie.
- `ui-input-015` wdrożył structured `InteractionView`, deterministic gaze ranking, hysteresis i shared desktop/touch action presentation. Ten plan ma użyć tego seamu zamiast tworzyć drugi model world prompts.
- Camp composite interaction, camp inspection/repair, house entrance marker, placement rotation hints i standing-torch lifecycle należą do `items-player-022`.
- Inventory thumbnails pozostają celowo poza scope — zostają obecne ikony kategorii.
- Wędka trzymana w ręce celowo przejmuje interakcje nad wodą; gracz odkłada ją, jeśli chce pić/napełniać pojemnik.

### Nadal ważne

1. `tent` nadal jest instance-backed, ale `buildInventoryGroups()` nie ma buildera dla tentów, więc posiadany spakowany namiot może nie pojawić się na ekranie inventory.
2. `InventoryScreenItemDetails.vue` nie pokazuje `ITEM_CATALOG[kind].capabilities`.
3. `InventoryInstanceRow.conditionPercent` przeciąża znaczenie procentu: durability/condition/fill; UI nie zawsze mówi, co `%` oznacza.
4. `InventoryState.onEquip` przyjmuje tylko `ItemKind`, mimo że instance rows posiadają konkretne `id`; przy kilku broniach o różnym stanie nie ma jednoznacznego `Weź` konkretnej instancji.
5. `dropItemStack()` nadal wyrzuca cały stos; brak player-facing wyboru ilości.
6. `ContainerScreen.vue` nadal ma stałe `W skrzyni` / `Skrzynia jest pusta`, a corpse path używa tego samego ekranu; deposit przy zwłokach jest dopiero odrzucany po kliknięciu.
7. Transfer count-items nadal działa whole-stack per klik, mimo że app-layer callbacks już przyjmują `amount`.
8. Inventory actions nadal mogą być widoczne mimo z góry znanej blokady (np. freshness/book/liquid state) i kończyć się dopiero toastem.
9. Quick Actions i Inventory mają różne entry points dla placeable items; Inventory nie powinno być niepełne tylko dlatego, że istnieje skrót w Quick Actions.
10. `constructionMaterials.ts` już liczy `inventory + nearby dropped items`, ale player-facing quote nie pokazuje breakdownu `przy sobie / w pobliżu / wymagane`.
11. HUD ma tylko ogólne `ui.hud.held`; ranged weapon nie pokazuje stale aktualnej liczby amunicji.
12. Per-shot `Zostało N strzał` jest zbędne, jeśli ammo jest widoczne na HUD.
13. Player-facing copy nadal ma kilka drobnych niespójności (`bukłak` vs ogólny pojemnik, fuel copy, `[mixed usage]`, legacy waterskin migration descriptions).

## Product decisions

### Inventory coverage

Każdy fizycznie posiadany przedmiot ma być widoczny w `[I]`, również instance-backed placeables takie jak namiot.

Inventory ma być pełnym entry pointem dla normalnych posiadanych itemów. Quick Actions pozostają szybszym skrótem, nie jedyną drogą użycia przedmiotu.

### Hand vs bag

Nie wprowadzać zasady „wszystko trzeba najpierw wziąć do ręki”.

- czynności bezpośrednio wykonywane narzędziem mogą nadal wymagać `HeldTool`, jeśli tak działa obecna mechanika,
- Quick Actions celowo mogą używać odpowiednich capabilities/items z inventory,
- utilities już projektowane jako bag-gated (np. część repair/fire flows) pozostają bag-gated,
- nie tworzyć nowego equipment systemu ani auto-equip policy globalnie.

Dla world interaction brak specjalistycznego narzędzia zwykle **ukrywa akcję**. Wyjątkiem są podstawowe/intuitive actions, które warto graczowi ujawnić. Jeśli capability/tool jest spełnione, ale brakuje surowców, akcja pozostaje widoczna i disabled z konkretnym `reasonLabel`.

### Capabilities

Inventory details pokazuje player-facing zastosowania pochodzące z `ITEM_CATALOG[kind].capabilities`.

Nie duplikować capability table. Współdzielić labels z istniejącą prezentacją merchant/filter/need labels tam, gdzie semantyka jest zgodna.

Dopuszczalne jest oznaczenie konkretnego capability jako ukrytego z powodów discovery, ale nie wprowadzać ogólnej drugiej listy „public capabilities”. Jeśli obecny katalog nie ma takiej potrzeby, v1 pokazuje wszystkie gameplay-relevant capabilities.

### Primary weapons

Primary melee/ranged to wyłącznie skróty do szybkiego equipu. Nie są slotami equipment.

UI ma komunikować jeden rzeczywisty stan `w ręce`, a primary selection jako `Skrót`/zapamiętany wybór.

### Percent semantics

`%` jest poprawną prezentacją, ale zawsze musi mieć znaczenie:

- `Stan N%` — ogólny condition/durability,
- `Ostrość N%` — sharpness,
- `Napełnienie N%` — liquid fill,
- inne przyszłe metry mają dostać jawny meter kind + label.

Nie pokazywać anonimowego procentu dla instance state.

### Quantity interaction

`Wyrzuć` dla count > 1 otwiera dialog `Ile wyrzucić?` z wyborem `1..N`.

Ten sam reusable quantity selector wykorzystać dla stack transferów w `ContainerScreen` zamiast budować osobny UI per przypadek.

Dla transferu dodać także szybką akcję `Weź wszystko` po stronie źródła. Musi szanować capacity i transferować legalną ilość bez utraty freshness/instance identity.

### Pickup feedback

Po podniesieniu count-item toast powinien komunikować delta i nowy stan, np.:

```text
Gałąź +1 · Masz: 5
Kamień +4 · Masz: 12
```

Grouped pickup korzysta z obecnego `items-player-022`; ten plan tylko poprawia feedback po faktycznie zebranej ilości.

### Item action availability inside Inventory

Dla przedmiotu, który gracz już posiada i którego zastosowanie jest oczywiste, nie ukrywać akcji tylko dlatego, że jest chwilowo niemożliwa.

Przykłady:

- `Zjedz — zepsute`,
- `Wypij — pusty`,
- `Czytaj — zbyt trudna / znana wiedza`.

Presentation ma używać tych samych read-only reguł co execution; execution nadal revaliduje live state.

## Scope

### 1. Complete `InventoryGroupView` for instance-backed items

Rozszerzyć `inventoryView.ts`, aby każdy `INSTANCE_BACKED_KINDS` miał reprezentację w inventory.

Nie dodawać kolejnych ad-hoc builderów bez potrzeby. Preferować mały wspólny model instance meter/condition, który obsłuży co najmniej:

- trap condition,
- weapon durability + sharpness,
- liquid fill,
- tent condition.

Proponowany kierunek presentation contract:

```ts
type ItemMeterKind = 'condition' | 'durability' | 'sharpness' | 'fill'
```

Dokładny kształt może być prostszy, ale Vue nie może zgadywać znaczenia `conditionPercent` z `ItemKind`.

Acceptance:

- spakowany namiot jest widoczny w Inventory,
- condition/fill/sharpness mają poprawne labels,
- mixed state ma polski opis typu `różne stany`, nie `[mixed usage]`.

### 2. Item details: capabilities and coherent equipment presentation

W `InventoryScreenItemDetails.vue` pokazać gameplay-relevant capabilities z `ITEM_CATALOG`.

Dodatkowo:

- zachować ikony kategorii zamiast thumbnails,
- primary weapon prezentować jako skrót, nie equipment slot,
- `Weź` konkretnej instance row ma przekazać `instanceId`, gdy kind jest instance-backed/holdable,
- HUD/presentation ma jasno rozróżniać `w ręce` od `skrót podstawowej broni`.

Nie tworzyć `EquipmentManager`, worn slots ani paper-doll.

### 3. Inventory action view / preflight

Dodać mały derived item-use presentation contract przy istniejącym items/inventory layer, np.:

```ts
type ItemUseView = {
  id: string
  label: string
  enabled: boolean
  reasonLabel: string
}
```

Ma on jedynie opisywać akcje już istniejące w app/domain layer.

Użyć go dla co najmniej:

- consume,
- read book,
- placeable item entry points,
- equip/unequip,
- drop.

Nie przenosić mutation do Vue i nie tworzyć globalnego action registry.

### 4. Inventory and Quick Actions entry-point consistency

Normalne placeable items posiadane przez gracza mają oferować odpowiedni verb również w Inventory, delegując do istniejącego placement/Quick Actions handlera.

V1 obejmuje istniejące inventory-owned placeables, w szczególności:

- tent,
- chest,
- traps,
- wooden torch, jeśli obecny placement pipeline traktuje ją jako inventory-owned placeable.

Nie dodawać „use axe on tree” do Inventory — contextual world use nadal należy do world interaction.

### 5. Shared quantity selector for drop and count transfers

Dodać jeden reusable quantity dialog/control dla operacji `1..N`.

Użyć go w:

- Inventory `Wyrzuć`,
- container/corpse `Weź`,
- chest `Włóż`.

App-layer APIs mają przyjmować explicit amount. `dropItemStack()` należy zastąpić/rozszerzyć operacją amount-aware bez utraty:

- food freshness batches,
- instance identity,
- held-tool sync,
- inventory capacity accounting,
- dropped-item provenance.

Dla pojedynczej sztuki można wykonać akcję bez dodatkowego dialogu.

### 6. Container/corpse mode and `Weź wszystko`

Rozszerzyć existing container-screen session presentation o kontekst, bez tworzenia osobnego corpse screen.

Container mode:

- poprawne column labels,
- `Weź`, `Włóż`,
- quantity selection dla count stacks,
- `Weź wszystko`.

Corpse mode:

- player-facing label typu `Łup` / `Przy zwłokach`, nie `W skrzyni`,
- brak deposit controls zamiast kliknięcia kończącego się error toastem,
- `Weź`, quantity selection i `Weź wszystko`.

`Weź wszystko` ma transferować tylko tyle, ile legalnie mieści się w inventory, pozostawiając resztę w źródle. Dla instances zachować identity; dla food zachować freshness.

### 7. Construction-material breakdown

Rozszerzyć read-only query przy `constructionMaterials.ts`, aby z tej samej reguły co `hasMaterial()` można było uzyskać per requirement:

```text
required
inInventory
nearbyWorld
availableTotal
missing
```

Nie tworzyć drugiego material inventory.

Player-facing construction/repair quote ma móc pokazać np.:

```text
Belki: 4/7 — przy sobie 2 · w pobliżu 2
```

Mutation nadal używa `consumeMaterial()` i revaliduje live state.

### 8. Pickup delta feedback

Po successful pickup zwykłych/grouped count items pokazywać `+N · Masz: total`.

Nie zmieniać authoritative dropped-item grouping ani persistence z `items-player-022`.

Nie spamować tym samym formatem dla itemów, których identity/condition wymaga innego feedbacku; scope to przede wszystkim count-stack resources.

### 9. Ranged ammo presentation

Gdy `HeldTool` jest ranged weapon:

- HUD pokazuje held weapon + aktualną liczbę kompatybilnej amunicji,
- Inventory details pokazuje ammo kind(s) i current count(s),
- usunąć per-shot `Zostało N strzał` toast,
- hit/miss/other combat feedback pozostaje bez zmian.

Ammo count ma być derived z istniejącego inventory i ranged catalog definition, bez nowego combat state.

### 10. Copy cleanup

W ramach zmienianych powierzchni poprawić:

- legacy waterskin migration text z player-facing descriptions,
- `Napełnij bukłak` tam, gdzie akcja obsługuje także inne pojemniki → neutralny verb/label,
- fuel wording (`zapalić` vs `dołożyć`) zgodnie z faktyczną akcją,
- English `[mixed usage]`,
- held/primary vocabulary zgodnie z ustaloną semantyką.

Nie robić repository-wide copy rewrite.

## Architecture decisions / guardrails

- `Inventory` nadal jest ownerem counts/instances/freshness/capacity.
- `HeldTool` nadal jest jednym slotem ręki.
- `PrimaryWeaponSelection` nadal jest zapamiętanym skrótem, nie equipment state.
- `ITEM_CATALOG.capabilities` pozostaje jedynym źródłem gameplay capabilities.
- `buildInventoryGroups()` pozostaje canonical inventory presentation seam.
- `InteractionView` z `ui-input-015` pozostaje canonical world-interaction presentation seam.
- `constructionMaterials.ts` pozostaje canonical inventory + nearby-drops resolverem.
- `ContainerScreen` pozostaje shared screenem dla chest/corpse transferów.
- Quick Actions nie dostają kopii gameplay rules; delegują do istniejących handlers/preflight.
- Nie tworzyć `EquipmentManager`, `LootManager`, drugiego inventory, action registry ani material inventory.
- Query/presentation nie może mutować stanu; execution revaliduje live state.
- Dodać JSDoc / `@domain items-player` dla nowych ważnych publicznych presentation/query helperów, jeśli poprawi preflight discovery.

## Likely files

Core items/presentation:

- `src/items/inventoryView.ts`
- `src/items/itemCatalog.ts`
- `src/items/itemInstances.ts`
- `src/items/HeldTool.ts`
- `src/items/primaryWeapons.ts`
- `src/items/constructionMaterials.ts`
- `src/items/items.ts` tylko dla player-facing legacy descriptions, jeśli nadal tam są

App wiring/actions:

- `src/app/inventoryWiring.ts`
- `src/app/actions/containerActions.ts`
- relevant placement/rest/trap action handlers reused by Inventory entry points
- pickup dispatch path in `src/app/gameLoop.ts` / `src/app/interactables.ts` only where feedback is currently emitted
- ranged attack feedback call site only to remove remaining-ammo toast

Vue/UI:

- `src/ui-vue/store.ts`
- `src/ui-vue/screens/InventoryScreenItemList.vue`
- `src/ui-vue/screens/InventoryScreenItemDetails.vue`
- `src/ui-vue/screens/ContainerScreen.vue`
- `src/ui-vue/screens/HudScreen.vue`
- one shared quantity dialog/component near existing overlay/UI primitives

Do not touch unrelated simulation systems merely to standardize naming.

## Implementation order

1. Extend `inventoryView` with explicit meter semantics and complete instance-backed coverage, including tent.
2. Add shared player-facing capability labels/read model and expose capabilities in inventory details.
3. Make equip instance-aware and clarify held vs primary shortcut presentation.
4. Add item-use derived availability for consume/read/place/equip/drop; reuse existing execution callbacks.
5. Wire Inventory placeable verbs to existing placement handlers.
6. Add shared quantity selector; make drop amount-aware.
7. Extend container session view with source mode/labels, quantity transfers and `Weź wszystko`.
8. Add construction material breakdown query and surface it in existing quote/inspection UI.
9. Add pickup delta/total feedback for count resources.
10. Add ranged ammo to HUD/details and remove per-shot remaining toast.
11. Clean touched copy/legacy strings.
12. Add targeted automated tests and update docs/implementation notes as required.

## Tests

Automated coverage should include at least:

- packed tent appears in `buildInventoryGroups`,
- trap/weapon/liquid/tent meters expose correct semantic labels/kinds,
- no instance-backed kind with owned instances silently disappears,
- capability list derives from `ITEM_CATALOG`,
- `Weź` can target a specific weapon instance,
- primary shortcut still equips the selected weapon and does not create second equipment state,
- spoiled food / empty liquid / unreadable-or-known book yield correct disabled item-use view,
- drop `N` removes exactly N and preserves freshness/instances for remaining/dropped records,
- quantity selector bounds `1..available`,
- chest count transfer of N preserves counts/freshness,
- corpse mode exposes no deposit action,
- `Weź wszystko` respects weight/size capacity and leaves unaccepted remainder,
- instance `Weź wszystko` preserves IDs,
- construction material breakdown equals `inventory + nearbyDropped` used by `hasMaterial`,
- grouped pickup feedback reports actual collected delta and resulting total,
- ranged HUD ammo count tracks inventory mutations,
- firing no longer emits remaining-ammo toast,
- world interaction behavior from `ui-input-015` is not regressed.

## Manual verification

User verifies in browser; AI does not run browser verification.

High-value scenarios:

1. Buy/pack a tent → `[I]` shows it with correct `Stan N%` and `Rozstaw`.
2. Two same-kind weapons with different state → choose a specific instance with `Weź`; primary shortcut still acts only as shortcut.
3. Check axe/shovel/sewing kit details → capabilities are visible and understandable.
4. Waterskin/bucket/trap/weapon/tent → every `%` has explicit meaning.
5. Have 12 branches → `Wyrzuć` → choose 4 → 8 remain, 4 appear in world.
6. Chest with 20 stones → take selected amount; use `Weź wszystko`; verify capacity-limited remainder.
7. NPC corpse → no `Włóż`; correct loot labels; `Weź wszystko` works.
8. Spoiled food, empty container, too-hard/known book → disabled action with reason before click.
9. Construction site with resources split between bag and nearby ground → breakdown matches successful work consumption.
10. Pick up one and grouped branches/stones → toast shows `+N · Masz: total`.
11. Hold bow → HUD shows ammo count; shoot several times → count updates, no per-shot `Zostało N strzał` toast.
12. Hold fishing rod at water → current fishing interaction remains unchanged; drinking/filling still requires putting rod away.

## Non-goals

- thumbnails or rendered item previews,
- worn armor/clothing/equipment slots,
- global auto-equip policy,
- redesign of combat controls,
- redesign of Quick Actions navigation,
- new loot/inventory/container architecture,
- persistence changes unless required to preserve already-existing instance/freshness semantics,
- changing fishing-vs-water interaction behavior,
- reimplementing dropped-item grouping from `items-player-022`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
