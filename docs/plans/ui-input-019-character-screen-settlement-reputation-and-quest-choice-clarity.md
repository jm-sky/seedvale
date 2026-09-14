# Plan: Character Screen settlement reputation and quest choice clarity

**Created:** 2026-09-15
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~quests-progression-001~~, ~~world-012~~
**Domain:** `ui-input`  
**Type:** `feature`  
**Model:** Composer, Sonnet
**Roadmap:** -  

## Goal

Rozszerzyć Character Screen tak, aby reputacja była prezentowana dla jednej wybranej osady naraz, z możliwością łatwego przełączenia na inną znaną osadę, oraz dopracować czytelność questowych wyborów, gdy ich społeczne konsekwencje są istotne, ale z obecnego tekstu nie wynikają wystarczająco jasno.

Docelowo:

- Character Screen pokazuje jedną osadę na raz,
- domyślnie wybiera osadę, w której gracz aktualnie przebywa, a poza osadą ostatnio odwiedzoną/ostatnio aktywną,
- użytkownik może wybrać inną znaną osadę przez dropdown/combo z wyszukiwaniem,
- lista opiera się na istniejącej wiedzy gracza o świecie, nie na nowym równoległym rejestrze,
- reputacja nadal pozostaje authoritative w `ReputationManager`,
- quest choice text powinien komunikować charakter decyzji wystarczająco jasno, bez obowiązkowego ujawniania surowych wartości typu `Uczciwość -1`.

## Current behaviour / problems

### Character Screen

Obecny `CharacterScreen.vue` renderuje pojedyncze `ui.characterScreen.reputation`:

- `settlementName`,
- 5 wymiarów reputacji,
- `renown`.

Snapshot jest odświeżany na żądanie. W `createApp.ts` wybierana jest najbliższa załadowana osada i tylko jej standing trafia do UI.

To nie pozwala sprawdzić reputacji w innych poznanych osadach.

### Reputation ownership

`ReputationManager` już prawidłowo przechowuje standing per `settlementId` i udostępnia:

- `getReputation(settlementId)`,
- `getRenown(settlementId)`.

Nie przenosić listy osad ani UI selection do `ReputationManager`.

### Known settlements

`LocationKnowledge` jest istniejącym ownerem wiedzy gracza o konkretnych `WorldLocation`s i ma `list()`. Fizyczne odwiedzenie obcej wioski przechodzi przez istniejący proximity discovery flow.

Lista osad w Character Screen powinna korzystać z istniejących location/catalog identities i `LocationKnowledge`, a nie ze wszystkich wygenerowanych settlement definitions ani z osobnego `knownSettlements[]`.

### Quest choice clarity

Przykład „Podejrzany transport”:

- `keep_quiet` brzmi jak neutralna dyskrecja, ale daje m.in. `integrity: -1`, `trust: +1`,
- `report_it` daje m.in. `integrity: +4`, `courage: +2`.

Konsekwencje same w sobie są sensowne, ale tekst opcji nie komunikuje wystarczająco jasno różnicy pomiędzy świadomym kryciem niejasnego układu a ujawnieniem sprawy.

## Architecture

### Character reputation view model

UI nadal powinno dostawać gotowy presentation snapshot. Vue nie ma odpytywać `ReputationManager` bezpośrednio.

Rozszerzyć obecny model `CharacterReputationView` do struktury, która rozdziela:

- listę selectable known settlements,
- aktualnie wybrany `settlementId`,
- presentation standing dla tej osady.

Nie trzeba wysyłać standingów wszystkich osad jednocześnie. Przy zmianie selection można pobrać standing dla wybranego settlement id z istniejącego `ReputationManager`.

### Default settlement selection

Preferowana kolejność:

1. aktualna osada, jeśli gracz faktycznie znajduje się w/bezpośrednio przy jej obszarze,
2. ostatnio odwiedzona/ostatnio aktywna znana osada,
3. home settlement jako bezpieczny fallback, jeśli jest znany,
4. pierwsza znana osada deterministycznie,
5. brak widoku reputacji tylko wtedy, gdy naprawdę nie ma żadnej znanej osady.

Nie używać „nearest generated settlement anywhere” jako substytutu ostatnio odwiedzonej osady.

Jeżeli projekt nie posiada jeszcze jawnego persisted `lastVisitedSettlementId`, najpierw sprawdzić istniejące world/navigation/location state. Jeżeli brak authoritative historii wizyt, dodać minimalny UI/world-state seam aktualizowany przy potwierdzonym wejściu/odwiedzeniu wioski. Nie wyprowadzać „last visited” ze sparse `ReputationManager` entries.

### Known settlement source

Budować selectable listę przez przecięcie:

```text
WorldLocation catalog settlements/villages
∩ LocationKnowledge known entries
```

Używać stabilnego settlement/location identity i rzeczywistej nazwy osady.

Jeżeli location id i settlement id nie są tym samym kluczem, rozwiązać mapowanie w composition/world layer, nie w Vue.

Nie pokazywać nieodkrytych osad tylko dlatego, że istnieją w world generation albo mają neutralny wpis reputacji.

### Selector UX

Sekcja `Reputacja` nadal pokazuje jeden standing.

Nad standingiem dodać selector:

- zwykły dropdown, jeśli liczba znanych osad jest mała,
- searchable combo jeżeli istniejący komponent/composable już wspiera taki wzorzec lub lista może rosnąć.

Preferować jeden komponent z filtrowaniem po nazwie; bez ciężkiej biblioteki/dependency tylko dla tego pola.

Zmiana wyboru ma być natychmiastowa i nie zmieniać świata ani active settlement state.

### Refresh lifecycle

Obecny reputation snapshot jest pushowany na żądanie przy otwarciu ekranu i po social consequence. Zachować ten model zamiast aktualizacji co frame.

Po social consequence:

- jeżeli zmieniła się aktualnie wybrana osada, odświeżyć standing na ekranie,
- lista znanych osad nie musi być odbudowywana, jeśli discovery się nie zmieniło,
- po odkryciu nowej osady powinna pojawić się w selectorze przy kolejnym otwarciu/odświeżeniu discovery-aware snapshotu.

### Quest choice clarity

Nie budować generycznego systemu pokazującego wszystkie future consequences przy przycisku.

Dla istniejących authored/generated choice definitions:

- tekst `playerLine`, `npcLine`, `description`, `reminderLine` powinien wystarczająco jasno komunikować intencję wyboru,
- szczególnie gdy outcome ma asymetryczny wpływ na `integrity`, `trust`, `courage`, relacje lub inne społeczne wymiary,
- mechanika nadal może pozostać ukryta liczbowo.

Najpierw przejrzeć obecne `talk_to_npc_choice` / branching quest content i poprawić tylko przypadki, gdzie narracja realnie maskuje charakter decyzji.

## Relevant files

### Character Screen / UI state

- `src/ui-vue/screens/CharacterScreen.vue`
  - reputation section,
  - settlement selector/search UX.
- `src/ui-vue/store.ts`
  - `CharacterReputationView`,
  - `characterScreen.reputation`,
  - `setCharacterReputation()` lub następca,
  - selection callback/state if needed.
- `src/ui-vue/mount.ts`
  - exported UI bridge if a new setter/callback is introduced.
- `src/ui/createHud.ts`
  - HUD/UI bridge for Character Screen reputation.

### Composition / reputation source

- `src/app/createApp.ts`
  - current Character Screen reputation refresh,
  - current nearest-settlement selection,
  - wiring `ReputationManager`, settlement/world location data and UI callback.
- `src/reputation/ReputationManager.ts`
  - read-only source of standing; API extension only if required for efficient reads, not UI selection ownership.

### Known settlements / world knowledge

- `src/world/locations/locationKnowledge.ts`
  - `LocationKnowledge.list()` / `has()`.
- `src/world/locations/locationProximityDiscovery.ts`
  - confirmed foreign village visits.
- world location catalog / settlement-location binding used by `createApp.ts` and world map.

### Quest content clarity

- `src/quests/opportunities/rpgQuestMaterialization.ts`
  - `materializeSuspiciousTransport()` and other RPG matrix choices.
- `src/quests/quests.ts`
  - authored `talk_to_npc_choice` content.
- contextual quest builders containing choice outcomes, only where recon identifies unclear intent.

## Implementation stages

1. **Settlement reputation presentation contract**
   - add stable settlement id to presentation entries,
   - expose selectable known settlements + selected standing,
   - keep `ReputationManager` ownership unchanged.

2. **Known settlement resolution**
   - derive list from `LocationKnowledge` + world location/settlement catalog,
   - exclude unknown settlements,
   - resolve names and settlement ids outside Vue.

3. **Default/last settlement selection**
   - current settlement wins,
   - otherwise last visited/active known settlement,
   - deterministic fallback.

4. **Character Screen selector**
   - dropdown/searchable combo,
   - one standing shown at once,
   - selection persists while screen is open and ideally across reopen within the session unless current-settlement precedence intentionally resets it.

5. **Refresh hooks**
   - screen open,
   - social consequence affecting selected settlement,
   - discovery/visit changes as needed,
   - no per-frame reputation allocations.

6. **Quest choice wording audit/fixes**
   - start with „Podejrzany transport”,
   - inspect other choices with meaningful social consequences,
   - improve authored text only where intent is misleading/ambiguous.

## Verification

Automated/UI-level where practical:

- known home settlement appears in selector,
- physically discovered foreign settlement appears,
- undiscovered settlement does not appear,
- selection uses stable id even when names could theoretically collide,
- current settlement is selected when Character Screen opens there,
- outside settlements the last visited/active known settlement is selected,
- changing selection changes only presentation and does not mutate world/reputation state,
- reputation values come from `ReputationManager.getReputation()` / `getRenown()` for the selected id,
- social consequence updates the selected view when relevant,
- neutral known settlement renders zero values normally,
- selector handles several settlements and search/filter without exposing unknown entries.

Manual browser verification — User:

1. Open Character Screen in home village — home reputation is selected.
2. Visit another village, open Character Screen — that village is selected.
3. Leave settlement area and reopen — last visited village remains the default.
4. Use selector/search to switch back to home and another known village.
5. Unknown settlements are absent.
6. Complete a quest affecting one settlement and confirm its values after selection.
7. „Podejrzany transport” choices are narratively distinguishable as concealment vs disclosure before choosing.

## Non-goals

- global average reputation,
- merging reputation between settlements,
- showing every generated but unknown settlement,
- moving reputation ownership into Vue,
- per-frame Character Screen reputation refresh,
- new world-location registry,
- numeric consequence preview for every dialogue option,
- generic moral alignment system,
- redesign of the whole Character Screen.

## Guardrails

- `ReputationManager` remains sole owner of settlement standing.
- `LocationKnowledge` remains sole owner of known-location knowledge.
- Character Screen is presentation/selection only.
- Unknown world data must not leak through the selector.
- Use stable ids; names are presentation only.
- Reuse existing screen-open/social-consequence refresh lifecycle.
- Avoid allocations/work every frame while Character Screen is closed.
- Quest choice clarity is authored-content improvement, not a second consequence engine.
- Add/update JSDoc for new public presentation contracts/helpers with `@domain ui-input` where useful for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**