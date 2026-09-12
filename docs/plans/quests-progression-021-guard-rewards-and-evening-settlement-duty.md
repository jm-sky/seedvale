# Plan: Guard Rewards and Evening Settlement Duty

**Created:** 2026-09-12
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~fauna-022~~, ~~quests-progression-019~~
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `progression` `rewards` `relationships`
**Tags:** `guard` `alpha-wolf` `renown` `settlement-lighting` `world-time`
**Roadmap:** `quests-and-reputation.md`

## Cel

Przebudować progresję związaną ze Strażnikiem tak, aby nagrody wynikały z realnych zasług gracza i stanu świata:

- usunąć banalne przyznawanie `long_sword` po `woda-dla-marka` albo bardzo niskiej relacji,
- dodać mały jednorazowy prezent Strażnika po zdobyciu zaufania lub podstawowej renomy,
- przyznawać miecz za wysoką renomę osady albo player-caused kill alpha wolf,
- zachować obie drogi jako niezależnie rozpoznawalne osiągnięcia,
- dodać jednorazowe wieczorne zadanie Strażnika polegające na ręcznym zapaleniu rzeczywistych świateł osady,
- oprzeć ofertę zadania na canonical world time,
- rozszerzyć istniejące settlement lighting i player interaction zamiast tworzyć quest-only pochodnie lub osobny lighting manager.

Plan rozszerza istniejące `QuestDef` / `QuestManager`, `ReputationManager`, fauna-owned variants, player-caused animal-kill integration, persistence, `DayNightState`, settlement-owned `VillageTorch` / `VillageFire` oraz istniejący interaction flow.

Nie tworzyć osobnego Guard Quest Engine, Guard Reputation, TorchManager ani drugiego źródła stanu świateł.

> **Split complete:** Guard scope został wydzielony z planu 020. Aktualny plan Huntera to `quests-progression-020-hunter-profession-quests-and-wildlife-help.md`; 021 jest jedynym ownerem Guard rewards / evening-duty scope.

## 1. Zweryfikowany stan obecny

### Guard sword legacy

`src/items/guardSword.ts::askGuardForSword()` obecnie pozwala na prezent miecza, gdy:

```text
woda-dla-marka complete
OR relation >= 1
```

`src/app/inventoryWiring.ts` obsługuje tę interakcję i korzysta z persisted `worldFlags.guardSwordGifted`.

To historyczne powiązanie ma zostać usunięte. `woda-dla-marka` nie może tworzyć entitlement do broni.

### Alpha wolf

`fauna-022` dostarcza fauna-owned per-animal variants. Alpha pozostaje `AnimalKind === 'wolf'`; nie istnieje osobny `alpha_wolf` species kind.

`quests-progression-019` dostarcza istniejący player-caused dangerous-animal deed → settlement reputation/renown seam. Ten plan ma rozszerzyć istniejącą integrację o trwały fakt alpha-wolf deed potrzebny do reward recognition, a nie tworzyć osobny animal death pipeline.

### Settlement lighting

Canonical village torches są dziś night-auto:

- `src/settlement/houseLighting.ts::VillageTorch` ma `setLit()` i runtime lit state, ale nie wystawia `isLit()`,
- `src/settlement/settlementNightCycle.ts::createSettlementNightCycle()` zapala wszystkie village torches automatycznie po przekroczeniu `NIGHT_FIRE_THRESHOLD` i gasi je o świcie,
- canonical village torches nie są obecnie normalnym player-interactable obiektem,
- `VillageFire` ma rzeczywisty settlement-owned `isLit()` / `light()` lifecycle.

Player-built standing torches mają już istniejący interaction/ignition precedent (`standingTorch`, `fire_starting`, interaction view + app dispatch). Canonical village torches powinny reuse'ować ten sam ogólny sposób sprawdzania player capability / wykonywania interakcji tam, gdzie kontrakty pasują, zamiast dodawać quest-specific ignition.

## 2. Jednorazowy lekki prezent Strażnika

Usunąć stare zachowanie:

```text
woda-dla-marka complete OR relation >= 1
→ long_sword
```

Zastąpić je lekkim jednorazowym gestem:

```text
friendly relation OR settlement renown >= 6
→ 2 × wooden_torch
```

V1:

- giver: deterministycznie wybrany dorosły NPC z `role === 'guard'`, preferencyjnie home-settlement guard,
- identity przez stable `NpcId`,
- relation threshold: obecne `friendly`,
- alternatywnie local settlement renown `>= 6`,
- reward: `2 × wooden_torch`,
- reward one-shot dla konkretnego stable guard NPC,
- brak związku z `woda-dla-marka`.

Preferować istniejący dialogue/topic seam. Jeżeli po zmianie `guardSword.ts` przestaje opisywać rzeczywistą odpowiedzialność modułu, zastąpić go małym semantycznym guard-reward resolverem zamiast rozszerzać sword-specific API.

Resolver może rozstrzygać `wooden_torch`, `long_sword`, coin substitute albo brak nagrody, ale nie może być ownerem Inventory, ReputationManager, QuestManager ani fauna state.

## 3. Long sword jako uznanie zasług

Strażnik może rozpoznać dwa niezależne osiągnięcia gracza.

### 3.1 Wysoka renoma osady

Warunek V1:

```text
home settlement renown >= 12
```

Nie dodawać licznika ukończonych questów. Authoritative źródłem jest `ReputationManager.getRenown(settlementId)`.

Po spełnieniu warunku Strażnik może w dialogu uznać zasługi gracza i rozstrzygnąć reward route.

### 3.2 Zabicie alpha wolf

Druga droga wymaga:

```text
player-caused kill
AND AnimalKind === 'wolf'
AND fauna variant === 'alpha'
```

Nie kwalifikują się:

- zwykły wilk,
- zwykły wilk oznaczony questowym `dangerous`,
- alpha zabita przez NPC,
- alpha zabita przez inne zwierzę,
- environmental death.

Nie rozpoznawać alpha po modelu, skali, nazwie, samym `dangerSignificance` ani thresholdzie HP/damage. Questowy `dangerous` trait może współistnieć z variantami, więc recognition musi czytać fauna-owned variant identity.

Fakt ma zostać ustawiony w istniejącym player-caused animal-kill integration seam obok animal-deed resolution. Fauna nie może mutować Guard reward state.

## 4. Dwie drogi, jeden miecz

Renown route i alpha route są niezależnie claimable, ale fizyczny `long_sword` jest główną nagrodą tylko raz.

Przykład:

```text
renown >= 12
→ long_sword
→ renown route claimed
→ sword reward consumed

później player zabija alpha wolf
→ alpha recognition
→ coin substitute = tradeValue('long_sword')
→ alpha route claimed
```

Analogicznie w odwrotnej kolejności.

Jeżeli gracz już posiada `long_sword` z innego źródła przed pierwszym claimem Guard reward, nie ignorować osiągnięcia i nie tworzyć drugiego miecza. Pierwszy claim rozstrzygnąć jako coin substitute, oznaczyć route jako claimed oraz sword reward jako consumed/substituted.

Coin substitute musi używać:

```ts
tradeValue('long_sword')
```

Nie używać literalnej ceny, merchant `sellPrice()` ani relacyjnego modifiera handlowego. To replacement reward, nie transakcja handlowa.

## 5. Persistence i one-shot semantics

Obecne pojedyncze `guardSwordGifted: boolean` nie wystarcza do reprezentowania dwóch niezależnych dróg oraz lekkiego torch gift.

Rozdzielić dwa rodzaje trwałych faktów:

1. **player/world deed fact** — gracz faktycznie zabił alpha wolf i deed może zostać rozpoznany później,
2. **per-Guard claim state** — co konkretny stable Guard NPC już podarował / rozpoznał.

Minimalny semantyczny state powinien reprezentować co najmniej:

```text
alpha-wolf deed earned

per stable guard NpcId:
- torch gift claimed
- sword reward consumed/substituted
- renown route claimed
- alpha route claimed
```

Nie dodawać managera tylko dla tych flag. Dopasować shape do istniejącego save/progression modelu i stable `NpcId` conventions.

### Legacy migration

Dla starego save:

```text
guardSwordGifted === true
```

oznacza co najmniej:

```text
sword reward already consumed
```

Nie inferować z tego automatycznie renown route, alpha route ani torch gift. Stary completion `woda-dla-marka` nigdy nie może po migracji tworzyć nowego entitlement.

## 6. Wieczorne zadanie Strażnika

Dodać osobny, lekki, jednorazowy quest profesyjny. Nie jest warunkiem miecza i nie daje `long_sword`.

Gameplay:

```text
wieczorem Strażnik prosi o przygotowanie osady na noc
→ gracz ręcznie zapala wymagane canonical village torches
→ gracz zapala settlement campfire
→ wszystkie wymagane światła są rzeczywiście lit
→ gracz raportuje wykonanie Strażnikowi
```

Materializować quest tylko dla settlement/Guard contextu, który faktycznie posiada:

- co najmniej jedną canonical village torch,
- `VillageFire`,
- stabilną tożsamość wymaganych świateł.

Nie udawać brakującego campfire ani nie automatycznie redukować questa do campfire-only. Jeżeli target settlement nie spełnia kontraktu, ta konkretna oferta nie powinna powstać.

Reward V1:

- mała dodatnia relacja ze Strażnikiem,
- mała `benevolence` / `trust` lub niewielka lokalna renoma,
- opcjonalnie niewielki coin reward,
- bez `long_sword`.

Successful outcome jest one-shot dla tego stable guard NPC. Jeżeli zwykły quest outcome wystarcza do lifetime gating, nie duplikować tego dodatkowym `eveningLightsDone` flagiem.

## 7. World-time offer window

Quest ma być oferowany tylko wieczorem. Nie używać real-time timeoutów, `setTimeout()` ani czasu ściennego.

Authoritative czas:

```ts
DayNightState.timeOfDay
DayNightState.elapsedDays
```

V1:

- każdego dnia wyznaczyć deterministic start godzinnego world-time window w późnym popołudniu / wieczorem,
- start może różnić się pomiędzy dniami,
- deterministic key powinien korzystać z istniejącego seeded-RNG convention i co najmniej: world seed + stable guard `NpcId` + `floor(elapsedDays)`.

Okno dotyczy wyłącznie **zaoferowania** questa. Po przyjęciu quest nie wygasa, nie failuje po godzinie i nie potrzebuje persisted deadline.

Aktualne `QuestAvailability` nie zna world time. Dodać najmniejszy reusable read-only seam potrzebny do dynamicznej availability, np. lookup zwracający `{ timeOfDay, elapsedDays }` albo równoważny predicate w composition root.

Nie wstrzykiwać całego mutable `DayNightState` do `QuestDef` i nie materializować definicji raz na boot z zamrożonym numerem dnia.

## 8. Canonical village torches — rozszerzenie settlement lighting

Przed dodaniem quest objective rozszerzyć istniejący lighting contract.

### 8.1 Stable torch identity

Każda canonical village torch potrzebuje stabilnego id wynikającego z:

```text
settlement identity + stable torch slot / plan identity
```

Nie używać jako trwałej identity `Object3D.uuid`, mesh identity ani indeksu aktualnie załadowanej tablicy.

### 8.2 Read-only lit state

Rozszerzyć `VillageTorch` o read-only:

```ts
isLit(): boolean
```

`setLit()` pozostaje settlement-owned mutation. Quest tylko obserwuje stan.

### 8.3 Player interaction

Canonical torch ma dostać normalną player interaction, np. `[E] Zapal pochodnię`.

Reuse istniejący player-built `standingTorch` ignition precedent:

- interaction discovery/view,
- `fire_starting` capability gate,
- app-level action dispatch,
- brak quest-specific inventory/tool check.

Nie tworzyć `questLightTorch()` ani drugiego systemu ignition.

Canonical torch pozostaje normalnym elementem świata i może być ręcznie zapalana również poza tym questem.

## 9. Konflikt z dusk automation

Poza aktywnym objective zachować obecne zachowanie bez regresji:

```text
dusk → canonical village torches auto-light
dawn → canonical village torches extinguish
```

Podczas aktywnego evening-light objective automatyczny dusk ignition wymaganych pochodni target settlement musi być suppressed, aby quest nie ukończył się sam.

Nie importować `QuestManager` do settlement lighting. Preferować quest-neutral policy seam, semantycznie np.:

```ts
shouldAutoLightTorch(torchId): boolean
```

Wymagania:

- default zachowuje dzisiejsze auto-light,
- suppression dotyczy tylko wymaganych torch ids w target settlement,
- inne settlements działają normalnie,
- dawn extinction nadal działa,
- manual ignition nadal działa,
- completion / invalidation / rebuild usuwa suppression,
- save/load odtwarza suppression z authoritative active quest state zamiast persistować osobny lighting flag.

## 10. Objective: settlement lights

Dopiero po realnym manual-lighting seam dodać questowy world-state objective, semantycznie np.:

```ts
{
  type: 'light_settlement_fires'
  settlementId: string
  torchIds: readonly string[]
  requireCampfire: true
}
```

Dokładna nazwa typu może zostać dopasowana do obecnego vocabulary.

Completion wymaga:

```text
każda wymagana canonical torch isLit()
AND
VillageFire.isLit()
```

Quest:

- nie zapala światła,
- nie mintuje ani nie duplikuje lit state,
- nie utrzymuje własnej authoritative tablicy zapalonych pochodni,
- tylko czyta settlement-owned state.

Po spełnieniu warunku przechodzi normalnie do `ready_to_report` i wymaga explicit raportu do Strażnika.

## 11. Giver, materialization i dialogue

Nie hardkodować imienia Strażnika.

Guard content ma korzystać z:

```text
role === 'guard' + stable NpcId
```

Preferować istniejący settlement opportunity/materialization flow i istniejące role-based NPC data. Nie dodawać role lookup do `QuestManager` ani drugiego rejestru profesyjnych NPC.

Ta sama stable Guard identity ma wiązać:

- lightweight torch gift,
- renown recognition,
- alpha recognition,
- evening quest.

Korzystać z obecnego multiple-quest-per-NPC dialogue contractu. Strażnik może mieć równocześnie normalny dialogue, quest offer/reminder/report i claimable recognition. UI nie może interpretować quest id, objective type ani progression rules; samo otwarcie dialogu nie przyznaje nagrody ani nie progressuje questa.

## 12. Ownership

```text
fauna
→ owns animal kind + variant

player combat / app integration
→ identifies player-caused kill
→ records qualifying alpha deed

reputation
→ owns settlement reputation / renown

guard reward resolver
→ pure eligibility / reward decision

persistence
→ owns deed + per-Guard claim facts

settlement lighting
→ owns VillageTorch / VillageFire lit state
→ owns dusk/dawn automation

world time
→ owns timeOfDay / elapsedDays

quests
→ owns evening quest lifecycle
→ observes settlement lighting
→ owns completion/report state

app composition
→ wires systems
→ derives runtime dusk-auto-light suppression from active quest state
```

Nie przenosić ownershipu pomiędzy tymi systemami dla wygody questa.

## 13. Non-goals

Nie implementować w tym planie:

- pełnych patroli Strażnika,
- zmian combat AI Strażnika,
- nowych rodzajów broni,
- durability miecza,
- proceduralnego guard quest engine,
- settlement emergency system,
- ogólnego harmonogramu quest deadlines,
- osobnego Guard Reputation,
- osobnego TorchManager,
- persistent manual state każdej village torch pomiędzy dniami, jeśli obecny settlement lifecycle tego nie wymaga,
- zmian do Hunter profession chain z `quests-progression-020`.

## 14. Testy automatyczne

### Guard rewards

- `woda-dla-marka` nie daje już miecza,
- `relation >= 1` nie daje miecza,
- `friendly` albo renown `>= 6` umożliwia jednorazowe `2 × wooden_torch`,
- renown `< 12` nie daje sword recognition,
- renown `>= 12` daje claimable recognition,
- zwykły wolf kill nie zapisuje alpha deed,
- quest-marked dangerous normal wolf nie liczy się jako alpha,
- alpha zabita przez NPC / fauna / environment nie liczy się,
- player-caused alpha kill zapisuje deed,
- pierwsza claimowana sword route daje dokładnie jeden `long_sword`, jeśli gracz go nie ma,
- jeśli gracz już ma `long_sword`, pierwszy claim daje coin substitute zamiast duplikatu,
- druga route daje dokładnie `tradeValue('long_sword')` coins,
- każda route jest claimable maksymalnie raz per stable guard NPC,
- legacy `guardSwordGifted` nie pozwala ponownie otrzymać sword reward.

### Evening quest / lighting

- bez aktywnego questa dusk nadal auto-lightuje village torches,
- dawn nadal je gasi,
- aktywny objective suppressuje auto-light tylko wymaganych target torches,
- inne settlements działają bez zmian,
- manual interaction zapala settlement-owned torch przez normalny capability/action path,
- quest nie progressuje przez samo wejście w wieczór,
- wszystkie wymagane torches + campfire → `ready_to_report`,
- brak jednego wymaganego światła blokuje completion,
- report kończy quest,
- successful quest nie jest ponownie oferowany temu samemu guardowi,
- time skip crossing offer window daje ten sam availability result co normalny clock progression,
- save/load aktywnego questa odtwarza suppression z quest state.

## 15. Manual verification

Użytkownik weryfikuje w przeglądarce:

1. Ukończyć `woda-dla-marka` → Strażnik nie daje miecza.
2. Zdobyć `friendly` albo renown 6 → Strażnik daje 2 × `wooden_torch` tylko raz.
3. Zdobyć renown 12 → odebrać pierwszy sword reward.
4. Zabić alpha wolf jako gracz → wrócić do Strażnika → drugie uznanie daje coin substitute.
5. Powtórzyć w odwrotnej kolejności: alpha najpierw, renown później.
6. Sprawdzić przypadek, gdy gracz już posiada `long_sword` przed pierwszym claimem.
7. Wieczorem znaleźć ofertę zadania.
8. Po przyjęciu sprawdzić, że wymagane target village torches nie zapalają się same o zmierzchu.
9. Ręcznie zapalić pochodnie i campfire.
10. Wrócić do Strażnika i ukończyć quest.
11. Kolejnego dnia quest nie powinien być ponownie dostępny dla tego NPC.
12. Bez aktywnego questa dusk/dawn lighting musi zachowywać dotychczasowe zachowanie.

## 16. Dokumentacja i implementation notes

Przed implementacją przygotować:

`docs/plans/implementation-notes/quests-progression-021-guard-rewards-and-evening-settlement-duty-implementation-notes.md`

Nie robić pełnego recon od zera: przenieść i ponownie zweryfikować Guard-specific ustalenia z wcześniejszych implementation notes planu 020, szczególnie aktualne call-sites dla guard reward, alpha player-kill integration, save flags, settlement lighting, interaction dispatch i world-time availability.

Po implementacji zaktualizować odpowiednie current-state docs:

- `docs/state/quests.md`,
- settlement / lighting state docs,
- persistence state docs, jeżeli zmienia się save shape,
- fauna docs tylko jeśli publiczny player-kill / variant seam faktycznie zostanie rozszerzony.

Dla ważnych nowych publicznych/architektonicznych kontraktów dodać zwięzłe JSDoc z odpowiednim `@domain`, szczególnie dla:

- guard reward resolver,
- alpha-deed integration seam,
- canonical torch identity/state,
- auto-light policy,
- world-time quest availability.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
